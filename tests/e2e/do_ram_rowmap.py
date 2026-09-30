"""Đo RAM và thời gian của `POST /api/ws/:ws/sheets/:sheet/rowmap` (OCR cục bộ).

Cần khi CHỌN MÁY CHỦ để deploy: máy 512MB từng bị 502 vì hết RAM (commit aa71757).
Chạy lại script này trên đúng máy/Python định deploy rồi so với bảng ở
docs/KE_HOACH_NANG_CAP_WEB.md mục 9.

- $0: dùng sổ mẫu, KHÔNG gọi Gemini.
- Mỗi chế độ khởi động một uvicorn MỚI trên thư mục dữ liệu tạm (không đụng `.data`).
- RSS lấy từ psutil. Trên Windows `rss` = working set, `peak_wset` = đỉnh working set.
  Trên Linux chỉ có `rss` nên "đỉnh" là đỉnh lấy mẫu mỗi 10ms (có thể thấp hơn đỉnh thật).

Chế độ:
    on    RapidOCR + Tesseract (mặc định của bản deploy)
    tess  chỉ Tesseract (giả lập máy không cài RapidOCR)
    off   TSUCHO_LOCAL_OCR=0 (tắt hẳn OCR cục bộ)

Ví dụ (thư mục gốc repo):
    python tests/e2e/do_ram_rowmap.py on tess off
    python tests/e2e/do_ram_rowmap.py --server-python .venv/Scripts/python.exe on

Cần thêm (chỉ để chạy script này, không thuộc requirements.txt): pip install psutil httpx
"""

import argparse
import json
import os
import shutil
import subprocess
import sys
import tempfile
import threading
import time
from pathlib import Path

import httpx
import psutil

ROOT = Path(__file__).resolve().parents[2]
MB = 1024 * 1024


def rss_mb(p: psutil.Process) -> float:
    return p.memory_info().rss / MB


class Peak:
    """Lấy mẫu RSS (tiến trình chính, và cả nó cộng tiến trình con như Tesseract) mỗi 10ms."""

    def __init__(self, p: psutil.Process):
        self.p, self.main, self.family, self._stop = p, 0.0, 0.0, threading.Event()
        self._thread = threading.Thread(target=self._run, daemon=True)

    def _run(self):
        while not self._stop.is_set():
            try:
                main = rss_mb(self.p)
                kids = sum(c.memory_info().rss for c in self.p.children(recursive=True)) / MB
                self.main, self.family = max(self.main, main), max(self.family, main + kids)
            except psutil.Error:
                pass
            time.sleep(0.01)

    def __enter__(self):
        self._thread.start()
        return self

    def __exit__(self, *exc):
        self._stop.set()
        self._thread.join()


def measure(mode: str, server_python: str, port: int) -> dict:
    tmp = tempfile.mkdtemp(prefix="tsucho-ram-")
    env = {**os.environ, "TSUCHO_DATA_DIR": tmp, "PYTHONUNBUFFERED": "1", "PYTHONIOENCODING": "utf-8",
           "TSUCHO_LOCAL_OCR": "0" if mode == "off" else "1"}
    if mode == "tess":
        fake = Path(tmp) / "fake"            # module giả: import RapidOCR là ImportError
        fake.mkdir()
        (fake / "rapidocr_onnxruntime.py").write_text("raise ImportError('gia lap: khong cai RapidOCR')\n")
        env["PYTHONPATH"] = str(fake)
    version = subprocess.run(
        [server_python, "-W", "ignore", "-c",
         "import sys, importlib.metadata as m; print(sys.version.split()[0], 'rapidocr', m.version('rapidocr_onnxruntime'))"],
        capture_output=True, text=True).stdout.strip()
    log = open(Path(tmp) / "uvicorn.log", "w")
    proc = subprocess.Popen([server_python, "-W", "ignore", "-m", "uvicorn", "api.main:app", "--port", str(port)],
                            cwd=ROOT, env=env, stdout=log, stderr=subprocess.STDOUT)
    out: dict = {"mode": mode, "python": version}
    try:
        base = f"http://127.0.0.1:{port}"
        for _ in range(240):
            try:
                if httpx.get(base + "/api/health", timeout=2).status_code == 200:
                    break
            except httpx.HTTPError:
                time.sleep(0.25)
        else:
            raise RuntimeError("máy chủ không lên; xem " + str(Path(tmp) / "uvicorn.log"))

        # python.exe của venv trên Windows chỉ là bộ khởi chạy ~5MB; máy chủ thật là tiến trình con.
        p = psutil.Process(proc.pid)
        kids = p.children(recursive=True)
        if kids:
            p = max(kids, key=lambda x: x.memory_info().rss)
        out["rss_khoi_dong_mb"] = round(rss_mb(p))

        c = httpx.Client(base_url=base, timeout=180)
        assert c.post("/api/auth/register", json={"email": "ram@test.local", "password": "matkhau123"}).status_code == 200
        ws = c.post("/api/ws").json()["id"]
        data = c.post(f"/api/ws/{ws}/sample").json()
        sheets = data["sheets"]
        out["rss_sau_them_so_mau_mb"] = round(rss_mb(p))

        def call(sheet: dict) -> dict:
            rows = [{k: t.get(k) for k in ("balance", "amount_in", "amount_out", "is_note")}
                    for b in data["results"][sheet["id"]]["blocks"] for t in b["rows"]]
            with Peak(p) as peak:
                t0 = time.perf_counter()
                r = c.post(f"/api/ws/{ws}/sheets/{sheet['id']}/rowmap",
                           json={"image_revision": sheet["sha256"], "rows": rows})
                seconds = time.perf_counter() - t0
            r.raise_for_status()
            j = r.json()
            methods = [b.get("method") for b in j["bands"]]
            return {"giay": round(seconds, 2), "ocr_status": j.get("ocr_status"),
                    "dong_khop_noi_dung": f"{methods.count('content')}/{len(methods)}",
                    "rss_dinh_mb": round(peak.main), "rss_dinh_ca_tien_trinh_con_mb": round(peak.family),
                    "rss_sau_mb": round(rss_mb(p))}

        out["lan1_mat_so_1"] = call(sheets[0])        # lần đầu: nạp model
        out["lan2_mat_so_1_lai"] = call(sheets[0])    # cùng ảnh: kết quả đọc đã cache
        out["lan3_mat_so_2"] = call(sheets[1])        # ảnh khác, máy đã ấm
        mem = p.memory_info()
        out["dinh_working_set_ca_phien_mb"] = round(getattr(mem, "peak_wset", 0) / MB) or None   # chỉ Windows
        return out
    finally:
        proc.terminate()
        try:
            proc.wait(15)
        except subprocess.TimeoutExpired:
            proc.kill()
        log.close()
        shutil.rmtree(tmp, ignore_errors=True)


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("modes", nargs="*", default=["on"], choices=["on", "tess", "off"])
    ap.add_argument("--server-python", default=sys.executable, help="python chạy uvicorn (mặc định: python hiện tại)")
    ap.add_argument("--port", type=int, default=8766)
    args = ap.parse_args()
    # abspath (KHÔNG resolve): resolve sẽ đi theo symlink của venv và mất site-packages
    python = os.path.abspath(args.server_python)
    for m in args.modes:
        print(json.dumps(measure(m, python, args.port), ensure_ascii=False, indent=2), flush=True)
