# -*- coding: utf-8 -*-
"""Đo độ mượt của BẢNG KẾT QUẢ khi có hàng trăm dòng (task 3.5) — $0, không gọi Gemini.

Dựng một hồ sơ tạm có ~24 mặt sổ / ~480 dòng bằng sổ mẫu (nhân đôi dòng qua API), mở «Gộp danh sách» (vẽ cả 24 mặt) rồi
đo thời gian từ lúc bấm một dòng tới khung hình kế tiếp được vẽ xong (hai lần requestAnimationFrame). Có thể làm chậm CPU
(`--cpu 4` = giả lập máy yếu gấp 4 lần) để số đo khác biệt rõ hơn.

Chạy (cần web đã build, như smoke.py):
    python tests/e2e/perf_table.py [--cpu 4] [--clicks 40] [--port 8794]

In: số dòng / số phần tử DOM, trung vị và p95 của thời gian bấm → vẽ xong, và thời gian để vẽ lại cả bảng lần đầu.
"""
from __future__ import annotations

import argparse
import os
import shutil
import statistics
import subprocess
import sys
import tempfile
import time
from pathlib import Path
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parents[2]
EMAIL, PASSWORD = "perf@test.local", "matkhau-perf-123"
SAMPLES = 12                     # mỗi lần thêm sổ mẫu = 2 mặt sổ ⇒ 24 mặt


def main() -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=8794)
    ap.add_argument("--cpu", type=float, default=1.0, help="hệ số làm chậm CPU (4 = máy yếu gấp 4)")
    ap.add_argument("--clicks", type=int, default=40)
    ap.add_argument("--server-python", default=sys.executable)
    args = ap.parse_args()

    tmp = Path(tempfile.mkdtemp(prefix="tsucho-perf-"))
    env = {**os.environ, "TSUCHO_DATA_DIR": str(tmp / "data"), "PYTHONUNBUFFERED": "1", "PYTHONIOENCODING": "utf-8"}
    log = open(tmp / "uvicorn.log", "w", encoding="utf-8")
    server = subprocess.Popen(
        [os.path.abspath(args.server_python), "-W", "ignore", "-m", "uvicorn", "api.main:app", "--port", str(args.port)],
        cwd=ROOT, env=env, stdout=log, stderr=subprocess.STDOUT)
    base = f"http://127.0.0.1:{args.port}"
    try:
        for _ in range(200):
            try:
                if urlopen(f"{base}/api/health", timeout=2).status == 200:
                    break
            except OSError:
                time.sleep(0.3)
        from playwright.sync_api import sync_playwright

        with sync_playwright() as p:
            browser = p.chromium.launch()
            ctx = browser.new_context(locale="vi-VN", viewport={"width": 1440, "height": 900})
            ctx.add_init_script("try { localStorage.setItem('tsucho.lang', 'vi'); } catch (e) {}")
            pg = ctx.new_page()
            pg.set_default_timeout(30000)
            pg.goto(f"{base}/login/")
            pg.get_by_role("button", name="Chưa có tài khoản? Đăng ký").click()
            pg.fill("#email", EMAIL)
            pg.fill("#password", PASSWORD)
            pg.click("button[type=submit]")
            pg.locator('[data-tour="drop"]').wait_for()
            pg.get_by_role("button", name="Bỏ qua").click()

            ws_id = pg.request.get(f"{base}/api/ws").json()["workspaces"][0]["id"]
            for _ in range(SAMPLES):
                assert pg.request.post(f"{base}/api/ws/{ws_id}/sample").ok
            data = pg.request.get(f"{base}/api/ws/{ws_id}").json()
            for sid, res in data["results"].items():          # nhân đôi dòng để có ~480 dòng (rid trùng được máy chủ cấp lại)
                for b in res["blocks"]:
                    b["rows"] = b["rows"] + [dict(r) for r in b["rows"]]
                assert pg.request.put(f"{base}/api/ws/{ws_id}/results/{sid}", data={"blocks": res["blocks"], "link_ok": None}).ok

            pg.goto(f"{base}/")
            pg.locator('[data-tour="rail"] li').first.wait_for()
            if args.cpu > 1:
                cdp = ctx.new_cdp_session(pg)
                cdp.send("Emulation.setCPUThrottlingRate", {"rate": args.cpu})
            pg.get_by_role("button", name="Gộp danh sách").click()
            t0 = time.time()
            pg.locator("tr[data-row]").first.wait_for()
            pg.wait_for_function("document.querySelectorAll('tr[data-row]').length > 400")
            first_paint = time.time() - t0
            rows = pg.locator("tr[data-row]").count()
            dom = pg.evaluate("document.getElementsByTagName('*').length")

            # Bấm lần lượt các dòng rải đều qua cả 24 mặt sổ; đo bấm → khung hình kế tiếp vẽ xong
            samples: list[float] = []
            js = """async (i) => {
                const trs = document.querySelectorAll('tr[data-row]');
                const tr = trs[i];
                if (!tr) return -1;
                tr.scrollIntoView({block: 'center'});
                await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
                const td = tr.querySelectorAll('td')[2];
                const t = performance.now();
                td.dispatchEvent(new MouseEvent('click', {bubbles: true}));
                await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
                return performance.now() - t;
            }"""
            for k in range(args.clicks):
                samples.append(pg.evaluate(js, (k * 37) % rows))
            samples = [x for x in samples if x >= 0]
            samples.sort()
            p95 = samples[min(len(samples) - 1, int(len(samples) * 0.95))]
            print(f"dòng={rows} phần_tử_DOM={dom} CPU×{args.cpu:g} lần_đo={len(samples)}")
            print(f"bấm dòng → vẽ xong: trung vị {statistics.median(samples):.1f} ms · p95 {p95:.1f} ms · lớn nhất {samples[-1]:.1f} ms")
            print(f"vẽ cả bảng lần đầu sau «Gộp danh sách»: {first_paint * 1000:.0f} ms (gồm chờ mạng + hydrate)")
            browser.close()
        return 0
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
