# -*- coding: utf-8 -*-
"""E2E "khói": bấm thử app bằng trình duyệt THẬT với sổ mẫu ($0, không gọi Gemini).

Vì sao có: frontend không có test tự động, nên lỗi kiểu "phím Ctrl+Z chết âm thầm"
(commit 025d8dc) chỉ bị bắt khi người dùng tự bấm. Script này bấm thay.

KHÔNG đặt tên test_*.py: pytest không được tự chạy nó (cần build web trước và cần
Chromium của Playwright).

Chạy (thư mục gốc repo):
    cd web && npm run build && cd ..
    python tests/e2e/smoke.py            # hoặc thêm --build để tự build trước

Cần (không thuộc requirements.txt):  pip install playwright openpyxl httpx
                                     python -m playwright install chromium

Cách hoạt động: khởi động `uvicorn api.main:app` trên cổng riêng (mặc định 8765) với
TSUCHO_DATA_DIR là thư mục tạm — KHÔNG đụng `.data` thật — FastAPI phục vụ luôn
`web/out`. Xong thì dừng server và xoá thư mục tạm. Mã thoát 0 = mọi bước đạt.

Kịch bản (chữ giao diện cố định tiếng Việt qua localStorage["tsucho.lang"]):
  1 đăng ký e2e@test.local · 2 bấm「Bỏ qua」hướng dẫn · 3「Thử với sổ mẫu」→ bảng có dòng
  4 sửa 1 ô 残高 thành số sai → bộ đếm "Còn N dòng" tăng → Ctrl+Z → về như cũ
  5 hộp Xuất file → tải .xlsx → mở bằng openpyxl thấy sheet + dòng dữ liệu
  6 F5 → kết quả còn nguyên (và server đã lưu bản sau Ctrl+Z)
  7 tải PDF 4 trang cố ý đặt sai chiều → thanh tiến độ hiện, máy tự xoay đúng cả 4 trang
    (cần bộ đọc chữ cục bộ RapidOCR; thiếu thì bước này báo SKIP)
"""
from __future__ import annotations

import argparse
import io
import os
import re
import shutil
import socket
import subprocess
import sys
import tempfile
import time
from pathlib import Path
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parents[2]
WEB = ROOT / "web"

EMAIL = "e2e@test.local"
PASSWORD = "matkhau-e2e-123"

# Chữ giao diện tiếng Việt (web/src/lib/dict.ts, khối `vi`). Đổi chữ ở đó thì sửa ở đây.
VI = {
    "toSignUp": "Chưa có tài khoản? Đăng ký",   # authToUp
    "skipTour": "Bỏ qua",                        # tour.skip
    "trySample": "Thử với sổ mẫu",               # trySample
    "allChecked": "Đã soát hết",                 # allChecked
    "download": "Xuất file tải về",              # expDownload
}
BADGE_LEFT = re.compile(r"^Còn (\d+) dòng cần soát$")   # badLeft(n)

# Sổ mẫu mặt 1 (api/sample.py _SHEET_A): dòng thứ 4 (chỉ số 3) là ヨキンキ, 残高 2,108,211
EDIT_ROW = 3
WRONG_BALANCE = "999"
SAMPLE_BALANCES = (22061, 751475)   # số dư đầu mặt 1 và số dư cuối mặt 2 — phải có trong file Excel
SAMPLE_SHEET_NAME = "サンプル通帳 1"   # tên mặt sổ mẫu thứ nhất (api/sample.py)


# ── tiện ích ──────────────────────────────────────────────────────────

def wait_until(fn, what: str, timeout: float = 10.0):
    """Đợi `fn()` trả giá trị đúng (truthy). Nuốt lỗi tạm thời khi đang đợi giao diện vẽ."""
    end, last = time.time() + timeout, None
    while time.time() < end:
        try:
            last = fn()
            if last:
                return last
        except Exception as e:  # noqa: BLE001 — phần tử chưa có, trang đang chuyển...
            last = e
        time.sleep(0.1)
    raise AssertionError(f"quá {timeout:.0f}s mà chưa thấy: {what} (lần cuối: {last!r})")


def stale_reason() -> str | None:
    """`web/out` cũ hơn mã nguồn thì E2E đang thử BẢN CŨ và sẽ báo xanh giả."""
    built = WEB / "out" / "index.html"
    if not built.is_file():
        return "chưa có web/out — chạy: cd web && npm run build"
    files = [p for p in (WEB / "src").rglob("*") if p.is_file() and not p.name.endswith(".test.ts")]
    files += [p for p in (WEB / "public").rglob("*") if p.is_file()]
    files += [WEB / n for n in ("next.config.ts", "postcss.config.mjs") if (WEB / n).is_file()]
    newest = max(files, key=lambda p: p.stat().st_mtime)
    if newest.stat().st_mtime > built.stat().st_mtime + 1:
        return f"{newest.relative_to(ROOT)} mới hơn bản build — chạy lại: cd web && npm run build (hoặc thêm --build)"
    return None


def port_is_free(port: int) -> bool:
    with socket.socket() as s:
        return s.connect_ex(("127.0.0.1", port)) != 0


def need_review(pg) -> int:
    """Số trên bộ đếm「Còn N dòng cần soát」; 0 nếu「Đã soát hết」; -1 nếu chưa thấy bộ đếm."""
    for text in pg.locator("span.tnum").all_inner_texts():
        text = text.strip()
        if text == VI["allChecked"]:
            return 0
        m = BADGE_LEFT.match(text)
        if m:
            return int(m.group(1))
    return -1


def balance_cell(pg, row: int = EDIT_ROW):
    """Ô 残高 của dòng `row`: ba ô tiền trong một dòng theo thứ tự 出金, 入金, 残高."""
    return pg.locator("tr[data-row]").nth(row).locator("input[data-money]").nth(2)


def server_balance(pg, base: str, row: int = EDIT_ROW):
    """Số dư của dòng `row` (mặt sổ đầu tiên) theo SERVER — để biết autosave đã ghi chưa."""
    ws_id = pg.request.get(f"{base}/api/ws").json()["workspaces"][0]["id"]
    data = pg.request.get(f"{base}/api/ws/{ws_id}").json()
    first = data["sheets"][0]["id"]
    return data["results"][first]["blocks"][0]["rows"][row]["balance"]


class Skip(Exception):
    """Bước không chạy được vì thiếu điều kiện môi trường (không phải lỗi của app)."""


def make_rotated_pdf(path: Path) -> list[int]:
    """PDF 4 trang giả sổ ngân hàng, mỗi trang cố ý đặt SAI chiều. Trả về góc xoay CW mà máy
    phải áp để từng trang đứng lại: [0, 90, 180, 270]."""
    import fitz
    from PIL import Image, ImageDraw, ImageFont

    font = ImageFont.load_default(size=30)
    doc = fitz.open()
    need = [0, 90, 180, 270]
    for n, k in enumerate(need):
        img = Image.new("RGB", (1200, 900), "white")
        d = ImageDraw.Draw(img)
        for i in range(16):
            y = 60 + i * 50
            d.text((60, y), f"07-04-{11 + i:02d}  R  TRANSFER {n}{i + 1}", fill="black", font=font)
            d.text((760, y), f"{(i + 3 + n) * 12345:,}", fill="black", font=font)
            d.text((1000, y), f"{(i + 9 + n) * 98765:,}", fill="black", font=font)
        # cần xoay k độ CW mới đứng ⇒ đang bị xoay ngược lại k độ
        lech = img.rotate(k, expand=True) if k else img          # PIL: dương = ngược chiều kim đồng hồ
        buf = io.BytesIO()
        lech.save(buf, "PNG")
        page = doc.new_page(width=lech.width * 72 / 200, height=lech.height * 72 / 200)   # 200 DPI như app
        page.insert_image(page.rect, stream=buf.getvalue())
    doc.save(path)
    doc.close()
    return need


# ── các bước ──────────────────────────────────────────────────────────

def step_register(pg, base: str, ctx: dict) -> str:
    pg.goto(f"{base}/login/")
    pg.get_by_role("button", name=VI["toSignUp"]).click()
    pg.fill("#email", EMAIL)
    pg.fill("#password", PASSWORD)
    pg.click("button[type=submit]")
    pg.locator('[data-tour="drop"]').wait_for(timeout=15000)      # bàn làm việc đã hiện
    return f"đã đăng ký {EMAIL} và vào bàn làm việc"


def step_skip_tour(pg, base: str, ctx: dict) -> str:
    pg.get_by_role("button", name=VI["skipTour"]).click(timeout=10000)
    pg.locator("[role=dialog][aria-labelledby=tour-title]").wait_for(state="detached", timeout=5000)
    return "hướng dẫn 7 bước đã đóng"


def step_sample(pg, base: str, ctx: dict) -> str:
    pg.locator("button", has_text=VI["trySample"]).click()
    pg.locator("tr[data-row]").first.wait_for(timeout=15000)
    n = pg.locator("tr[data-row]").count()
    assert n >= 10, f"bảng chỉ có {n} dòng (sổ mẫu mặt 1 có 12)"
    ctx["rows"] = n
    return f"bảng có {n} dòng"


def step_edit_undo(pg, base: str, ctx: dict) -> str:
    wait_until(lambda: need_review(pg) >= 0, "bộ đếm cần soát")
    before = need_review(pg)
    orig = balance_cell(pg).input_value()
    assert orig, f"dòng {EDIT_ROW} không có số dư để sửa — sổ mẫu đã đổi?"
    ctx["orig_balance"] = orig

    cell = balance_cell(pg)
    cell.click()
    cell.press("Control+a")
    cell.type(WRONG_BALANCE)
    cell.press("Enter")                                            # Enter = rời ô = ghi giá trị
    after = wait_until(lambda: (n := need_review(pg)) > before and n, "bộ đếm tăng sau khi sửa sai số dư")
    assert balance_cell(pg).input_value() == WRONG_BALANCE, "ô không giữ số vừa gõ"

    pg.keyboard.press("Control+z")
    wait_until(lambda: need_review(pg) == before, f"bộ đếm về {before} sau Ctrl+Z")
    wait_until(lambda: balance_cell(pg).input_value() == orig, f"ô 残高 trở lại {orig} sau Ctrl+Z")
    return f"bộ đếm {before} → {after} → {before}; ô {orig} → {WRONG_BALANCE} → {orig}"


def step_export(pg, base: str, ctx: dict) -> str:
    pg.locator('[data-tour="export"]').click()
    dialog = pg.locator("[role=dialog][aria-labelledby=exp-title]")
    dialog.wait_for(timeout=5000)
    with pg.expect_download(timeout=30000) as info:
        dialog.get_by_role("button", name=VI["download"]).click()
    download = info.value
    assert download.suggested_filename.endswith(".xlsx"), f"tên file lạ: {download.suggested_filename}"
    saved = Path(ctx["tmp"]) / "xuat.xlsx"
    download.save_as(saved)

    from openpyxl import load_workbook

    wb = load_workbook(saved, data_only=True)
    assert wb.sheetnames, "file Excel không có sheet nào"
    values = {c.value for ws in wb for row in ws.iter_rows() for c in row if c.value is not None}
    thieu = [v for v in SAMPLE_BALANCES if v not in values]
    assert not thieu, f"thiếu số dư của sổ mẫu trong file: {thieu}"
    dong = max(ws.max_row for ws in wb)
    assert dong > 12, f"file chỉ có {dong} dòng"
    return f"{download.suggested_filename}: {len(wb.sheetnames)} sheet, tối đa {dong} dòng"


def step_reload(pg, base: str, ctx: dict) -> str:
    want = int(ctx["orig_balance"].replace(",", ""))
    # Sau Ctrl+Z, autosave còn phải ghi bản đã hoàn tác lên server (chờ ~0.8s + request)
    wait_until(lambda: server_balance(pg, base) == want, f"server lưu lại số dư {want} sau Ctrl+Z", timeout=15)
    pg.reload()
    # Sau F5 chưa mặt sổ nào được chọn (khung phải nhắc "Bấm một mặt sổ ở cột trái") —
    # kết quả nằm trong kho, chỉ hiện ra khi bấm vào một mặt sổ.
    pg.get_by_text(SAMPLE_SHEET_NAME).first.click(timeout=15000)
    try:
        pg.locator("tr[data-row]").first.wait_for(timeout=15000)
    except Exception:  # noqa: BLE001
        raise AssertionError("F5 xong, bấm vào mặt sổ mà bảng kết quả vẫn trống")
    n = pg.locator("tr[data-row]").count()
    assert n == ctx["rows"], f"trước F5 có {ctx['rows']} dòng, sau F5 có {n}"
    assert balance_cell(pg).input_value() == ctx["orig_balance"], "ô 残高 sau F5 khác trước"
    return f"sau F5 vẫn {n} dòng, ô 残高 = {ctx['orig_balance']}"


def step_upload_rotated_pdf(pg, base: str, ctx: dict) -> str:
    pdf = Path(ctx["tmp"]) / "sai-chieu.pdf"
    need = make_rotated_pdf(pdf)
    # Ghi lại việc khối tiến độ có từng xuất hiện không (nó có thể chỉ hiện vài trăm ms)
    pg.evaluate("""() => { window.__saw = false;
        new MutationObserver(() => { if (document.querySelector('[data-import-progress]')) window.__saw = true; })
          .observe(document.body, {childList: true, subtree: true}); }""")
    pg.locator("input[type=file]").set_input_files(str(pdf))

    ws_id = pg.request.get(f"{base}/api/ws").json()["workspaces"][0]["id"]

    def mine():
        sheets = pg.request.get(f"{base}/api/ws/{ws_id}/sheets").json()["sheets"]
        return [s for s in sheets if s["origin"] == "sai-chieu.pdf"]

    wait_until(lambda: len(mine()) == len(need), "4 thẻ mặt sổ của PDF vừa tải", timeout=10)
    wait_until(lambda: all(s["status"] in ("ready", "failed") for s in mine()), "xử lý nền xong", timeout=90)
    sheets = mine()
    assert all(s["status"] == "ready" for s in sheets), [s["status"] + ":" + s["error"] for s in sheets]
    assert pg.evaluate("window.__saw"), "khối tiến độ nhập file không hề hiện ra"
    if not any(s["auto"] and s["auto"]["checked"] for s in sheets):
        raise Skip("máy chủ không có bộ đọc chữ cục bộ (RapidOCR) nên không kiểm được hướng")
    got = [int(s["rotation"]) for s in sheets]
    assert got == need, f"cần xoay {need} nhưng máy đã xoay {got}"
    pg.get_by_text("Đã tự xoay").first.wait_for(timeout=5000)           # nhãn ✨ trên thẻ mặt sổ
    return f"4 trang sai chiều → máy tự xoay {got}; khối tiến độ đã hiện"


STEPS = [
    ("1. Đăng ký tài khoản", step_register),
    ("2. Bỏ qua hướng dẫn", step_skip_tour),
    ("3. Thử với sổ mẫu", step_sample),
    ("4. Sửa 残高 sai → bộ đếm tăng → Ctrl+Z", step_edit_undo),
    ("5. Xuất Excel", step_export),
    ("6. F5 vẫn còn kết quả", step_reload),
    ("7. Tải PDF sai chiều → tự xoay đúng", step_upload_rotated_pdf),
]
# Bước 1–3 dựng chỗ đứng cho các bước sau: hỏng thì dừng luôn, chạy tiếp chỉ ra lỗi dây chuyền.
NEED_ALL = 3


# ── chạy ──────────────────────────────────────────────────────────────

def run(base: str, tmp: Path, headed: bool) -> int:
    from playwright.sync_api import sync_playwright

    ctx: dict = {"tmp": str(tmp)}
    ok = 0
    page_errors: list[str] = []
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=not headed)
        context = browser.new_context(locale="vi-VN", viewport={"width": 1440, "height": 900}, accept_downloads=True)
        # Chữ giao diện cố định tiếng Việt, không phụ thuộc trình duyệt
        context.add_init_script("try { localStorage.setItem('tsucho.lang', 'vi'); } catch (e) {}")
        pg = context.new_page()
        pg.set_default_timeout(10000)
        pg.on("dialog", lambda d: d.accept())               # hộp thoại "rời trang?" nếu còn nợ lưu
        pg.on("pageerror", lambda e: page_errors.append(str(e)))

        for i, (title, fn) in enumerate(STEPS):
            t0 = time.time()
            try:
                detail = fn(pg, base, ctx)
                ok += 1
                print(f"[PASS] {title} ({time.time() - t0:.1f}s) — {detail}", flush=True)
            except Skip as e:
                ok += 1
                print(f"[SKIP] {title} — {e}", flush=True)
            except Exception as e:  # noqa: BLE001
                msg = str(e).strip().splitlines()[0] if str(e).strip() else type(e).__name__
                print(f"[FAIL] {title} ({time.time() - t0:.1f}s) — {msg}", flush=True)
                shot = Path(tempfile.gettempdir()) / f"tsucho-e2e-fail-{i + 1}.png"
                try:
                    pg.screenshot(path=str(shot))
                    print(f"       ảnh chụp lúc lỗi: {shot}", flush=True)
                except Exception:  # noqa: BLE001
                    pass
                if i < NEED_ALL:
                    print("       (bước nền tảng hỏng — dừng, các bước sau không còn ý nghĩa)", flush=True)
                    break
        browser.close()

    if page_errors:
        print(f"[WARN] {len(page_errors)} lỗi JavaScript chưa bắt trong trình duyệt:", flush=True)
        for e in page_errors[:5]:
            print(f"       {e[:200]}", flush=True)
    print(f"\nKết quả: {ok}/{len(STEPS)} bước đạt", flush=True)
    return 0 if ok == len(STEPS) else 1


def main() -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    ap = argparse.ArgumentParser(description="E2E khói bằng sổ mẫu, $0")
    ap.add_argument("--port", type=int, default=8765)
    ap.add_argument("--build", action="store_true", help="chạy npm run build trước khi thử")
    ap.add_argument("--headed", action="store_true", help="hiện cửa sổ trình duyệt để xem")
    ap.add_argument("--server-python", default=sys.executable, help="python chạy uvicorn")
    args = ap.parse_args()

    if args.build:
        npm = shutil.which("npm") or "npm"
        print("npm run build …", flush=True)
        if subprocess.run([npm, "run", "build"], cwd=WEB).returncode != 0:
            print("[FAIL] build web lỗi")
            return 2
    reason = stale_reason()
    if reason:
        print(f"[FAIL] {reason}")
        return 2
    if not port_is_free(args.port):
        print(f"[FAIL] cổng {args.port} đang bận — đóng chương trình đó hoặc dùng --port khác")
        return 2

    tmp = Path(tempfile.mkdtemp(prefix="tsucho-e2e-"))
    env = {**os.environ, "TSUCHO_DATA_DIR": str(tmp / "data"), "PYTHONUNBUFFERED": "1", "PYTHONIOENCODING": "utf-8"}
    log = open(tmp / "uvicorn.log", "w", encoding="utf-8")
    server = subprocess.Popen(
        [os.path.abspath(args.server_python), "-W", "ignore", "-m", "uvicorn", "api.main:app",
         "--port", str(args.port)],
        cwd=ROOT, env=env, stdout=log, stderr=subprocess.STDOUT)
    base = f"http://127.0.0.1:{args.port}"
    try:
        def healthy() -> bool:
            if server.poll() is not None:
                raise RuntimeError(f"uvicorn thoát sớm (mã {server.returncode}); xem {tmp / 'uvicorn.log'}")
            try:
                return urlopen(f"{base}/api/health", timeout=2).status == 200
            except OSError:
                return False

        wait_until(healthy, "máy chủ trả lời /api/health", timeout=60)
        return run(base, tmp, args.headed)
    finally:
        server.terminate()
        try:
            server.wait(15)
        except subprocess.TimeoutExpired:
            server.kill()
        log.close()
        shutil.rmtree(tmp, ignore_errors=True)


if __name__ == "__main__":
    raise SystemExit(main())
