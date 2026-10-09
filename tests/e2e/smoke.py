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
  4 sửa 1 ô 残高 thành số sai → bộ đếm "Còn N dòng", huy hiệu cột trái và số dòng vàng cùng tăng,
    phím n nhảy vào ô 残高 → gõ lại số đúng thì hết vàng → sai lần nữa → Ctrl+Z → về như cũ
  5 hộp Xuất file → tải .xlsx → mở bằng openpyxl thấy sheet + dòng dữ liệu
  6 F5 → kết quả còn nguyên (và server đã lưu bản sau Ctrl+Z)
  7 tải PDF 4 trang cố ý đặt sai chiều → thanh tiến độ hiện, máy tự xoay đúng cả 4 trang
    (cần bộ đọc chữ cục bộ RapidOCR; thiếu thì bước này báo SKIP)
  8 gõ ngày kiểu 2025/4/12, ngày vô nghĩa, số toàn góc ０１２３, ▲500 → xuất Excel không lỗi
  9 trình duyệt tiếng Nhật mở lần đầu → giao diện tiếng Nhật; tiếng Pháp → tiếng Anh
 10 mỗi dòng có rid; ô đã sửa nhớ giá trị máy đọc (orig); F5 rồi sửa ô khác vẫn không mất orig
 11 mặt ② của sổ mẫu có đúng 1 dòng vàng thật (số thứ tự nhảy 05→07): bộ đếm, huy hiệu cột trái,
    phím n khớp nhau; ✓ → hết vàng → Ctrl+Z → ✓ lại → F5 vẫn còn ✓ (server lưu reviewed)
 12 ↺ trả ô về giá trị máy đọc · Ctrl+Enter (✓ rồi nhảy tiếp, kể cả khi đang gõ dở) · 「Xác nhận cả mặt sổ」
    (hỏi lại khi còn dòng NG) · 「+ Thêm dòng」chèn ngay dưới dòng đang chọn · Ctrl+Shift+Enter · F5 còn nguyên
 13 lý do hiện bằng tiếng Việt (tooltip giữ chuỗi Nhật); thanh gợi ý có chiều cao cố định; gợi ý sửa một chạm:
    出金 → số đúng, 残高 → số đúng (tự sang dòng cần soát kế), đổi cột 出金↔入金, thêm dòng sót (Ctrl+Z hoàn tác)
 14 xác nhận cả hai mặt sổ → xuất Excel: 0 ô vàng ở bảng dữ liệu, 検証レベル bắt đầu bằng 検証済 hoặc
    残高チェーン検証済, cột 確認メモ ghi 確認済, chú thích hoàn toàn tiếng Nhật
 15 chỗ nối số dư giữa hai mặt sổ liền nhau: đúng thứ tự → «nối liền»; đổi thứ tự → «đứt chuỗi» (dải vàng, chip ⛓✕
    ở cột trái, chip ⚠ ở thanh công cụ); 「Không phải lỗi」sống qua F5; trả thứ tự lại → «nối liền»
 16 thêm lần nữa sổ mẫu (hai mặt giống hệt) → huy hiệu «Có thể trùng với…» ở cột trái, hộp so sánh hai ảnh
    ("x/y số dư trùng"), cảnh báo ở hộp Xuất file; 「Không phải trùng」sống qua F5; 「Xoá mặt bên phải」
 17 danh sách hồ sơ: thanh trên hiện tên hồ sơ đang mở; trang /cases/ khớp số dòng cần soát với cột trái; tạo hồ sơ
    mới (Enter) → mở đúng hồ sơ đó, hai hồ sơ không lẫn mặt sổ; mở lại hồ sơ cũ; đổi tên bằng bấm đúp (Esc bỏ);
    lưu trữ ↔ bỏ lưu trữ; hồ sơ lưu trữ không tự mở lại ở trang chủ; xoá phải BẤM nút (Enter chỉ huỷ hộp, không xoá) và xoá thật;
    hướng dẫn có bước chỉ vào liên kết «Hồ sơ»
 18 sửa thông tin sổ (✎ ở đầu thẻ sổ): mặt ② bị xoá hết thông tin → sửa 銀行名 ở mặt ① và áp cho mặt sau →
    server lưu cả hai (cờ edited) → một Ctrl+Z hoàn tác cả hai, «Làm lại» làm lại cả hai → xuất Excel: ô B1 của
    cả hai sheet = tên mới; bỏ tick «áp dụng» thì mặt sau giữ nguyên; hộp không có gì để điền khi không còn mặt sau
 19 hộp Xuất file: «Tóm tắt trước khi xuất» sạch → «✓ Đã soát hết…»; tạo đủ ba việc (dòng chưa soát + đổi thứ tự gây đứt
    chuỗi + thêm sổ mẫu lần nữa gây trùng) → ba mục khớp cột trái, nút đổi thành «Vẫn xuất», phạm vi «mặt đang xem»
    đếm lại; bấm từng mục nhảy tới đúng chỗ (con trỏ vào dòng vàng / dải đứt / hộp so sánh); «Gộp theo tài khoản» →
    Excel đúng số sheet (các mặt cùng tài khoản chung một tab), B1/B3 và số dòng khớp
 20 ⚙ Cài đặt: chọn ngôn ngữ / chủ đề trong hộp → máy chủ lưu theo tài khoản; máy lạ (trình duyệt trắng, ngôn ngữ en)
    đăng nhập cùng tài khoản thì giao diện theo lựa chọn đã lưu (ja); Esc đóng hộp
 21 «▶ Soát nhanh (N)»: chỉ hiện khi còn dòng cần soát; vào chế độ → thẻ một dòng «Dòng k/N · Mặt「…」», đi qua mọi mặt sổ
    theo thứ tự cột trái (ảnh giữa đổi theo mặt sổ), n/p đi tới/lui, Esc thoát và bảng nhảy về đúng dòng đó
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
from datetime import date, datetime
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
    "download": re.compile("Xuất file tải về|Vẫn xuất"),   # expDownload; hoặc expAnyway khi «Tóm tắt trước khi xuất» còn việc
}
BADGE_LEFT = re.compile(r"^Còn (\d+) dòng cần soát$")   # badLeft(n)

# Sổ mẫu mặt 1 (api/sample.py _SHEET_A): dòng thứ 4 (chỉ số 3) là ヨキンキ, 残高 2,108,211
EDIT_ROW = 3
WRONG_BALANCE = "999"
SAMPLE_BALANCES = (22061, 751475)   # số dư đầu mặt 1 và số dư cuối mặt 2 — phải có trong file Excel
SAMPLE_SHEET_NAME = "サンプル通帳 1"   # tên mặt sổ mẫu thứ nhất (api/sample.py)
SHEET2_NAME = "サンプル通帳 2"          # mặt thứ hai: có 1 dòng vàng thật
GAP_DESC = "証貸 5月"                   # dòng đó (số thứ tự in nhảy 05 → 07 ⇒ 行抜けの疑い)


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


def rail_need(pg, name: str) -> int | None:
    """Số dòng cần soát ghi trên thẻ mặt sổ `name` ở cột trái (thuộc tính data-need), None nếu chưa có."""
    v = pg.locator('[data-tour="rail"] li', has_text=name).first.get_attribute("data-need")
    return None if v is None else int(v)


def review_rows(pg) -> int:
    """Số dòng đang ở trạng thái "cần soát" trong bảng (mặt sổ đang xem)."""
    return pg.locator('tr[data-row][data-state="review"]').count()


def focused(pg) -> dict | None:
    """Ô nhập đang giữ con trỏ: {field, state, row}; None nếu con trỏ không ở trong bảng."""
    return pg.evaluate("""() => {
        const a = document.activeElement;
        if (!a || !a.matches('input[data-cell]')) return null;
        const tr = a.closest('tr');
        return {field: a.dataset.field || null, state: tr.dataset.state,
                row: Array.from(document.querySelectorAll('tr[data-row]')).indexOf(tr)};
    }""")


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
    return "hướng dẫn 8 bước đã đóng"


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
    assert before == 0, f"mặt 1 của sổ mẫu phải sạch mà bộ đếm báo còn {before} dòng"
    assert rail_need(pg, SAMPLE_SHEET_NAME) == 0 and review_rows(pg) == 0, "huy hiệu/số dòng vàng không khớp bộ đếm"
    orig = balance_cell(pg).input_value()
    assert orig, f"dòng {EDIT_ROW} không có số dư để sửa — sổ mẫu đã đổi?"
    ctx["orig_balance"] = orig

    def type_balance(text):
        cell = balance_cell(pg)
        cell.click()
        cell.press("Control+a")
        cell.type(text)
        cell.press("Enter")                                        # Enter = rời ô = ghi giá trị

    type_balance(WRONG_BALANCE)
    after = wait_until(lambda: (n := need_review(pg)) > before and n, "bộ đếm tăng sau khi sửa sai số dư")
    assert balance_cell(pg).input_value() == WRONG_BALANCE, "ô không giữ số vừa gõ"
    # Task 1.2: bộ đếm, huy hiệu cột trái và số dòng vàng trong bảng PHẢI là một con số
    wait_until(lambda: (rail_need(pg, SAMPLE_SHEET_NAME), review_rows(pg)) == (after, after),
               f"huy hiệu cột trái và số dòng vàng cùng báo {after} như bộ đếm")

    pg.keyboard.press("n")                                         # nhảy tới dòng cần soát kế tiếp
    at = wait_until(lambda: focused(pg), "phím n đặt con trỏ vào một ô")
    assert at["field"] == "balance" and at["state"] == "review", f"phím n phải vào ô 残高 của dòng vàng, thực tế {at}"

    type_balance(orig)                                             # sửa lại ĐÚNG ⇒ hết vàng (không cần Ctrl+Z)
    wait_until(lambda: need_review(pg) == 0, "gõ lại số đúng thì bộ đếm về 0")
    assert (rail_need(pg, SAMPLE_SHEET_NAME), review_rows(pg)) == (0, 0), "sửa đúng rồi mà vẫn còn vàng"
    pg.locator("body").click(position={"x": 5, "y": 5})            # bỏ con trỏ khỏi ô
    pg.keyboard.press("n")
    assert focused(pg) is None, "hết dòng cần soát mà phím n vẫn đặt con trỏ vào ô nào đó"

    type_balance(WRONG_BALANCE)
    wait_until(lambda: need_review(pg) == after, f"sai lần nữa: bộ đếm lại {after}")
    pg.keyboard.press("Control+z")
    wait_until(lambda: need_review(pg) == before, f"bộ đếm về {before} sau Ctrl+Z")
    wait_until(lambda: balance_cell(pg).input_value() == orig, f"ô 残高 trở lại {orig} sau Ctrl+Z")
    return (f"bộ đếm {before} → {after} → {before}; huy hiệu cột trái và dòng vàng khớp; phím n vào ô 残高; "
            f"ô {orig} → {WRONG_BALANCE} → {orig}")


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


def export_xlsx(pg, ctx: dict, name: str) -> Path:
    """Mở hộp Xuất file, tải .xlsx về thư mục tạm."""
    pg.locator('[data-tour="export"]').click()
    dialog = pg.locator("[role=dialog][aria-labelledby=exp-title]")
    dialog.wait_for(timeout=5000)
    with pg.expect_download(timeout=30000) as info:
        dialog.get_by_role("button", name=VI["download"]).click()
    saved = Path(ctx["tmp"]) / name
    info.value.save_as(saved)
    return saved


def step_manual_input(pg, base: str, ctx: dict) -> str:
    """Task 0.3: ngày/số gõ tay kiểu lạ không được làm hỏng bảng hay file xuất."""
    pg.get_by_text(SAMPLE_SHEET_NAME).first.click()
    pg.locator("tr[data-row]").first.wait_for(timeout=10000)

    def date_cell(i):
        return pg.locator("tr[data-row]").nth(i).locator("input[data-cell]").nth(1)

    def money_cell(i, k):                       # k: 0 = 出金, 1 = 入金, 2 = 残高
        return pg.locator("tr[data-row]").nth(i).locator("input[data-money]").nth(k)

    def type_into(cell, text):
        cell.click()
        cell.press("Control+a")
        cell.type(text)
        cell.press("Enter")

    type_into(date_cell(1), "2025/4/12")
    wait_until(lambda: date_cell(1).input_value() == "2025-04-12", "ngày 2025/4/12 được đổi sang 2025-04-12")
    type_into(date_cell(2), "tuần sau")
    wait_until(lambda: date_cell(2).input_value() == "tuần sau", "ô ngày giữ chuỗi gõ")
    wait_until(lambda: pg.locator("tr[data-row]").nth(2).locator("td.bg-warnbg").count() > 0,
               "dòng có ngày không đọc được chuyển sang vàng")
    type_into(money_cell(1, 0), "１２３４")
    wait_until(lambda: money_cell(1, 0).input_value() == "1,234", "số toàn góc １２３４ thành 1,234")
    # Lỗi người dùng báo 03/10: gõ LẠI đúng giá trị đã chuẩn hoá thì ô giữ nguyên chữ vừa gõ
    type_into(date_cell(1), "2025/4/12")
    wait_until(lambda: date_cell(1).input_value() == "2025-04-12", "gõ lại 2025/4/12 phải ra lại 2025-04-12")
    type_into(date_cell(1), "R7.4.12")
    wait_until(lambda: date_cell(1).input_value() == "2025-04-12", "gõ lại bằng niên hiệu cũng ra 2025-04-12")
    type_into(money_cell(1, 0), "１２３４")
    wait_until(lambda: money_cell(1, 0).input_value() == "1,234", "gõ lại １２３４ phải ra lại 1,234")
    type_into(money_cell(1, 0), "1234円")
    wait_until(lambda: money_cell(1, 0).input_value() == "1,234", "gõ 1234円 phải ra 1,234")
    before = money_cell(3, 0).input_value()
    type_into(money_cell(3, 0), "▲500")
    wait_until(lambda: money_cell(3, 0).get_attribute("data-invalid") == "1", "ô báo đỏ khi gõ ▲500")
    assert money_cell(3, 0).input_value() == before, "ô phải giữ giá trị cũ khi gõ ▲500"

    path = export_xlsx(pg, ctx, "nhap-tay.xlsx")
    from openpyxl import load_workbook

    ws = load_workbook(path).worksheets[0]
    cells = [c for row in ws.iter_rows() for c in row if c.value is not None]
    assert any(isinstance(c.value, datetime) and c.value.date() == date(2025, 4, 12) for c in cells), "thiếu ô ngày 2025-04-12"
    bad = [c for c in cells if c.value == "tuần sau"]
    assert bad and str(bad[0].fill.start_color.rgb).endswith("FFF2CC"), "ngày hỏng phải ghi chuỗi gốc và tô vàng"
    assert any(c.value == 1234 for c in cells), "thiếu số 1234"
    return "ngày 2025/4/12 → 2025-04-12; ngày vô nghĩa → vàng; １２３４ → 1,234; ▲500 bị từ chối; Excel xuất được"


def step_language_from_browser(pg, base: str, ctx: dict) -> str:
    """Task 0.3: chưa chọn ngôn ngữ thì theo trình duyệt (ja → ja, ngôn ngữ lạ → en) và <html lang> đúng."""
    browser = pg.context.browser
    seen = []
    for locale, button, lang in (("ja-JP", "ログイン", "ja"), ("fr-FR", "Sign in", "en")):
        c = browser.new_context(locale=locale)               # KHÔNG đặt tsucho.lang như context chính
        try:
            p = c.new_page()
            p.goto(f"{base}/login/")
            p.get_by_role("button", name=button, exact=True).wait_for(timeout=10000)
            got = p.evaluate("document.documentElement.lang")
            assert got == lang, f"locale {locale}: <html lang> là {got!r}, cần {lang!r}"
            seen.append(f"{locale}→{lang}")
        finally:
            c.close()
    return ", ".join(seen)


def sample_rows(pg, base: str) -> list[dict]:
    """Các dòng của mặt sổ mẫu 1 theo SERVER (kết quả đã lưu)."""
    ws_id = pg.request.get(f"{base}/api/ws").json()["workspaces"][0]["id"]
    data = pg.request.get(f"{base}/api/ws/{ws_id}").json()
    sheet = next(s for s in data["sheets"] if s["name"] == SAMPLE_SHEET_NAME)
    return data["results"][sheet["id"]]["blocks"][0]["rows"]


def step_orig_survives_reload(pg, base: str, ctx: dict) -> str:
    """Task 1.1: dòng có rid bền; ô đã sửa nhớ giá trị MÁY ĐỌC; F5 rồi autosave lại cả mặt sổ
    cũng không làm mất chúng (client không được làm rơi khoá lạ)."""
    wait_until(lambda: (sample_rows(pg, base)[1].get("orig") or {}).get("date") == "2025-04-11",
               "server đã lưu orig của dòng 1 (autosave)", timeout=15)
    truoc = sample_rows(pg, base)
    rids = [r["rid"] for r in truoc]
    assert all(re.fullmatch(r"[0-9a-f]{12}", x) for x in rids) and len(set(rids)) == len(rids), rids
    assert truoc[1]["orig"] == {"date": "2025-04-11", "amount_out": 1100}, truoc[1].get("orig")
    assert truoc[2]["orig"] == {"date": "2025-04-11"}, truoc[2].get("orig")

    pg.reload()
    pg.get_by_text(SAMPLE_SHEET_NAME).first.click(timeout=15000)
    pg.locator("tr[data-row]").first.wait_for(timeout=15000)
    cell = pg.locator("tr[data-row]").nth(5).locator("input[data-cell]").nth(3)     # 摘要 của dòng 5
    goc = cell.input_value()
    cell.click()
    cell.press("Control+a")
    cell.type("ĐÃ SỬA")
    cell.press("Enter")
    wait_until(lambda: (sample_rows(pg, base)[5].get("orig") or {}).get("description") == goc,
               "server lưu orig của ô vừa sửa sau F5", timeout=15)
    sau = sample_rows(pg, base)
    assert [r["rid"] for r in sau] == rids, "rid đổi sau F5 + autosave"
    assert sau[1]["orig"] == truoc[1]["orig"] and sau[2]["orig"] == truoc[2]["orig"], "mất orig sau F5"
    return f"{len(rids)} dòng có rid bền; orig còn nguyên sau F5; dòng 5 nhớ máy đọc {goc!r}"


def sheet_rows(pg, base: str, name: str) -> list[dict]:
    """Các dòng của mặt sổ mẫu tên `name` theo SERVER."""
    ws_id = pg.request.get(f"{base}/api/ws").json()["workspaces"][0]["id"]
    data = pg.request.get(f"{base}/api/ws/{ws_id}").json()
    sheet = next(s for s in data["sheets"] if s["name"] == name)
    return data["results"][sheet["id"]]["blocks"][0]["rows"]


def step_review_definition(pg, base: str, ctx: dict) -> str:
    """Task 1.2: mặt ② có đúng một dòng vàng thật; bộ đếm, huy hiệu, phím n và nút ✓ nói cùng một chuyện."""
    def open_sheet2():
        pg.get_by_text(SHEET2_NAME).first.click()
        pg.locator("tr[data-row]").first.wait_for(timeout=10000)

    def agree(n: int, what: str):
        wait_until(lambda: (need_review(pg), rail_need(pg, SHEET2_NAME), review_rows(pg)) == (n, n, n),
                   f"{what}: bộ đếm, huy hiệu cột trái và số dòng vàng cùng là {n}")

    open_sheet2()
    agree(1, "mặt ② lúc mới mở")
    row = pg.locator('tr[data-row][data-state="review"]').first
    assert row.locator('input[data-field="description"]').input_value() == GAP_DESC, "dòng vàng không phải dòng 証貸 5月"
    assert "Số dòng nhảy 05→07" in row.inner_text(), f"cột 確認メモ không nói lý do bằng tiếng Việt: {row.inner_text()!r}"
    tip = row.locator("td", has_text="Số dòng nhảy").first.get_attribute("title") or ""
    assert "行抜けの疑い" in tip, f"tooltip phải giữ chuỗi gốc của máy: {tip!r}"

    pg.locator("body").click(position={"x": 5, "y": 5})
    pg.keyboard.press("n")
    at = wait_until(lambda: focused(pg), "phím n đặt con trỏ vào dòng vàng")
    assert at["state"] == "review" and at["field"] == "description", f"phím n phải vào ô 摘要 của dòng vàng, thực tế {at}"

    row.locator('button[data-act="confirm"]').click()
    agree(0, "sau khi bấm ✓")
    assert pg.locator('tr[data-row][data-state="confirmed"]').count() == 1, "dòng đã ✓ phải có trạng thái confirmed"
    assert "Đã soát" in pg.locator('tr[data-row][data-state="confirmed"]').first.inner_text(), "cột 確認メモ không ghi Đã soát"
    assert need_review(pg) == 0 and pg.get_by_text(VI["allChecked"]).count() >= 1

    pg.keyboard.press("Control+z")
    agree(1, "Ctrl+Z hoàn tác ✓")
    pg.locator('tr[data-row][data-state="review"] button[data-act="confirm"]').first.click()
    agree(0, "bấm ✓ lại")

    def server_reviewed():
        r = next(x for x in sheet_rows(pg, base, SHEET2_NAME) if x["description"] == GAP_DESC)
        return r if r.get("reviewed") is True and isinstance(r.get("reviewed_at"), (int, float)) else None

    saved = wait_until(server_reviewed, "server đã lưu reviewed + reviewed_at (autosave)", timeout=15)
    assert saved["status"] == "check" and "行抜け" in saved["reason"], "✓ không được sửa status/reason của máy"

    pg.reload()
    open_sheet2()
    agree(0, "sau F5")
    assert pg.locator('tr[data-row][data-state="confirmed"]').count() == 1, "sau F5 dòng ✓ mất trạng thái"

    pg.locator('tr[data-row][data-state="confirmed"] button[data-act="confirm"]').first.click()   # bỏ ✓
    agree(1, "bỏ ✓")
    wait_until(lambda: not next(x for x in sheet_rows(pg, base, SHEET2_NAME) if x["description"] == GAP_DESC).get("reviewed"),
               "server xoá reviewed sau khi bỏ ✓", timeout=15)
    pg.locator('tr[data-row][data-state="review"] button[data-act="confirm"]').first.click()
    agree(0, "✓ lần cuối")
    return "mặt ② có 1 dòng vàng (行抜けの疑い) · bộ đếm = huy hiệu = số dòng vàng · n vào ô 摘要 · ✓/Ctrl+Z/F5/bỏ ✓ đều đúng"


def step_review_actions(pg, base: str, ctx: dict) -> str:
    """Task 1.3: ↺ khôi phục giá trị máy đọc, Ctrl+Enter, xác nhận cả mặt sổ, chèn dòng đúng chỗ.

    Dựa vào trạng thái mặt ① sau các bước 8 và 10: dòng 1 có 出金 gõ thành 1,234 (chuỗi lệch, NG),
    dòng 2 có ngày "tuần sau" (ngày hỏng) ⇒ 2 dòng vàng; dòng 1 còn orig.date, dòng 5 đã sửa 摘要."""
    pg.get_by_text(SAMPLE_SHEET_NAME).first.click()
    pg.locator("tr[data-row]").first.wait_for(timeout=10000)

    def row(i):
        return pg.locator("tr[data-row]").nth(i)

    def cell(i, field):
        return row(i).locator(f'input[data-field="{field}"]')

    def restore(i, field):
        td = cell(i, field).locator("xpath=..")               # ô cha của <input>
        td.hover()                                            # ↺ chỉ hiện khi rê chuột vào ô
        td.locator(f'button[data-restore="{field}"]').click()

    def server_row(i):
        return sheet_rows(pg, base, SAMPLE_SHEET_NAME)[i]

    def state(i):
        return row(i).get_attribute("data-state")

    assert need_review(pg) == 2, f"mặt ① phải còn 2 dòng vàng sau bước 8 (dòng 1 NG, dòng 2 ngày hỏng), thực tế {need_review(pg)}"
    n_rows = pg.locator("tr[data-row]").count()

    # ── ↺ khôi phục giá trị máy đọc ──
    assert cell(1, "amount_out").input_value() == "1,234"
    restore(1, "amount_out")
    wait_until(lambda: cell(1, "amount_out").input_value() == "1,100", "↺ trả 出金 về 1,100 (máy đọc)")
    wait_until(lambda: need_review(pg) == 1, "khôi phục 出金 thì dòng 1 hết NG")
    assert state(1) == "edited" and "đã sửa tay" in row(1).inner_text(), "dòng 1 còn orig.date ⇒ phải ghi ✎ đã sửa tay"
    tip = row(1).locator("td", has_text="đã sửa tay").first.get_attribute("title") or ""
    assert "年月日" in tip and "→" in tip, f"lời chú phải liệt kê máy đọc → hiện tại, thực tế {tip!r}"
    wait_until(lambda: server_row(1).get("orig") == {"date": "2025-04-11"}, "server xoá amount_out khỏi orig", timeout=15)
    restore(2, "date")
    wait_until(lambda: cell(2, "date").input_value() == "2025-04-11", "↺ trả ngày về 2025-04-11")
    wait_until(lambda: need_review(pg) == 0, "khôi phục ngày thì hết dòng vàng")
    wait_until(lambda: "orig" not in server_row(2), "server bỏ hẳn orig của dòng 2", timeout=15)

    # ── Ctrl+Enter: ✓ dòng đang đứng (kể cả chữ gõ dở) rồi nhảy tới dòng cần soát kế ──
    bal = balance_cell(pg, 3)
    bal.click(); bal.press("Control+a"); bal.type(WRONG_BALANCE); bal.press("Enter")
    wait_until(lambda: need_review(pg) == 2, "sửa sai 残高 dòng 3 ⇒ 2 dòng vàng (dòng 3 và 4)")
    desc0 = cell(3, "description").input_value()
    d = cell(3, "description")
    d.click(); d.press("Control+a"); d.type("XYZ")                # CHƯA bấm Enter
    pg.keyboard.press("Control+Enter")
    wait_until(lambda: state(3) == "confirmed", "Ctrl+Enter ✓ dòng 3")
    at = wait_until(lambda: focused(pg), "Ctrl+Enter nhảy con trỏ sang dòng cần soát kế")
    assert (at["row"], at["field"], at["state"]) == (4, "balance", "review"), f"phải vào ô 残高 dòng 4, thực tế {at}"
    assert cell(3, "description").input_value() == "XYZ", "chữ gõ dở phải được ghi trước khi ✓"
    assert need_review(pg) == 1
    pg.keyboard.press("Control+z")
    pg.keyboard.press("Control+z")
    wait_until(lambda: need_review(pg) == 2 and cell(3, "description").input_value() == desc0,
               "Ctrl+Z hai lần trả lại cả ✓ lẫn chữ gõ")

    # ── 「Xác nhận cả mặt sổ」: còn NG thì hỏi lại ──
    pg.locator('button[data-act="confirm-all"]').first.click()
    dialog = pg.locator("[role=alertdialog]")
    dialog.wait_for(timeout=5000)
    assert "2 dòng số dư lệch" in dialog.inner_text(), f"hộp thoại phải nói còn 2 dòng số dư lệch: {dialog.inner_text()!r}"
    pg.keyboard.press("Escape")
    dialog.wait_for(state="detached", timeout=5000)
    assert need_review(pg) == 2, "huỷ hộp thoại thì không được xác nhận gì"
    pg.locator('button[data-act="confirm-all"]').first.click()
    dialog.wait_for(timeout=5000)
    dialog.get_by_role("button", name="Xác nhận cả mặt sổ").click()
    wait_until(lambda: need_review(pg) == 0, "xác nhận cả mặt ⇒ hết dòng vàng")
    done = pg.locator('tr[data-row][data-state="confirmed"]').count()
    assert done == n_rows - 1 and state(0) == "note", f"mọi dòng trừ ghi chú phải confirmed ({done}/{n_rows - 1})"
    assert pg.locator('button[data-act="confirm-all"]').first.is_disabled(), "đã ✓ hết thì nút phải mờ đi"
    pg.keyboard.press("Control+z")
    wait_until(lambda: need_review(pg) == 2, "Ctrl+Z hoàn tác xác nhận cả mặt")
    pg.keyboard.press("Control+z")                                # trả luôn số dư sai của dòng 3
    wait_until(lambda: need_review(pg) == 0 and balance_cell(pg, 3).input_value() == ctx["orig_balance"],
               "hoàn tác về sạch")

    # ── 「+ Thêm dòng」chèn NGAY DƯỚI dòng đang chọn; Ctrl+Shift+Enter cũng vậy ──
    cell(2, "description").click()                                # chọn dòng 2
    pg.locator("button", has_text="Thêm dòng").first.click()
    wait_until(lambda: pg.locator("tr[data-row]").count() == n_rows + 1, "thêm một dòng")
    assert state(3) == "review", "dòng mới chèn ngay dưới dòng 2 và phải cần soát (chưa ✓)"
    at = wait_until(lambda: focused(pg), "con trỏ vào dòng mới")
    assert (at["row"], at["field"]) == (3, "date"), f"con trỏ phải vào ô ngày của dòng mới, thực tế {at}"
    cell(6, "description").click()
    pg.keyboard.press("Control+Shift+Enter")
    wait_until(lambda: pg.locator("tr[data-row]").count() == n_rows + 2, "Ctrl+Shift+Enter chèn thêm một dòng")
    assert state(7) == "review", "dòng chèn bằng phím tắt phải nằm ngay dưới dòng 6"
    assert need_review(pg) == 2
    pg.keyboard.press("Control+Enter")                            # ✓ dòng 7 rồi nhảy sang dòng cần soát còn lại
    wait_until(lambda: state(7) == "confirmed", "Ctrl+Enter ✓ dòng chèn")
    at = wait_until(lambda: focused(pg), "nhảy tới dòng cần soát còn lại")
    assert (at["row"], at["field"]) == (3, "date"), f"phải nhảy về dòng 3 (ô ngày), thực tế {at}"
    pg.keyboard.press("Control+Enter")
    wait_until(lambda: need_review(pg) == 0, "✓ nốt dòng còn lại")

    # ── F5 vẫn còn nguyên ──
    def saved():
        rows = sheet_rows(pg, base, SAMPLE_SHEET_NAME)
        ok = len(rows) == n_rows + 2 and rows[3].get("reviewed") and rows[7].get("reviewed") and rows[3].get("added") and rows[7].get("added")
        return rows if ok else None

    rows = wait_until(saved, "server lưu 2 dòng chèn với added + reviewed", timeout=15)
    assert all(re.fullmatch(r"[0-9a-f]{12}", r["rid"]) for r in rows) and len({r["rid"] for r in rows}) == len(rows)
    pg.reload()
    pg.get_by_text(SAMPLE_SHEET_NAME).first.click(timeout=15000)
    pg.locator("tr[data-row]").first.wait_for(timeout=15000)
    assert pg.locator("tr[data-row]").count() == n_rows + 2, "sau F5 mất dòng chèn"
    wait_until(lambda: need_review(pg) == 0, "sau F5 vẫn không còn dòng vàng")
    assert state(3) == "confirmed" and state(7) == "confirmed", "sau F5 mất ✓ của dòng chèn"
    return ("↺ trả 出金 và ngày về máy đọc (orig tự dọn) · Ctrl+Enter ✓ + nhảy, ghi cả chữ gõ dở · xác nhận cả mặt có hỏi khi còn NG · "
            "chèn dòng ngay dưới dòng chọn (nút và Ctrl+Shift+Enter) · F5 còn nguyên")


def step_fix_suggestions(pg, base: str, ctx: dict) -> str:
    """Task 1.5: lý do dễ hiểu + gợi ý sửa một chạm. Chạy TRƯỚC khi ✓ cả mặt (dòng đã ✓ thì không còn NG)."""
    pg.get_by_text(SAMPLE_SHEET_NAME).first.click()
    pg.locator("tr[data-row]").first.wait_for(timeout=10000)

    def idx(desc: str) -> int:
        i = pg.evaluate("""d => Array.from(document.querySelectorAll('tr[data-row]'))
            .findIndex(tr => (tr.querySelector('input[data-field=description]') || {}).value === d)""", desc)
        assert i >= 0, f"không thấy dòng {desc!r}"
        return i

    def cell(i, field):
        return pg.locator("tr[data-row]").nth(i).locator(f'input[data-field="{field}"]')

    def typ(c, text):
        c.click(); c.press("Control+a")
        if text:
            c.type(text)
        else:
            c.press("Delete")                                    # gõ chuỗi rỗng không xoá vùng đang bôi đen
        c.press("Enter")

    def bar():
        return pg.locator("[data-fixbar]")

    def chips():
        return [b.get_attribute("data-fix") for b in bar().locator("button[data-fix]").all()]

    def pick_row(i):
        cell(i, "description").click()

    n_rows = pg.locator("tr[data-row]").count()
    a, c_, b_ = idx("SS手数料"), idx("ヨキンキ"), idx("手数料")
    assert need_review(pg) == 0, "đầu bước này mặt ① phải sạch"
    h_idle = bar().bounding_box()["height"]
    assert "Ctrl+Enter" in bar().inner_text(), "lúc rảnh thanh gợi ý phải nhắc phím tắt"

    # ── 出金 gõ nhầm 1,700 (đúng là 1,100) + 残高 dòng ヨキンキ gõ sai ──
    typ(cell(a, "amount_out"), "1700")
    typ(cell(c_, "balance"), "999")
    wait_until(lambda: need_review(pg) == 3, "2 chỗ sai ⇒ 3 dòng vàng (dòng 出金 sai + dòng 残高 sai + dòng kế lệch theo)")
    pick_row(a)
    wait_until(lambda: chips() == ["amount", "addrow"], "dòng 出金 sai có gợi ý 出金 → số đúng và thêm dòng sót")
    text = bar().inner_text()
    assert "Số dư lệch +600 so với phép tính từ dòng trên" in text, f"lý do phải nói mức lệch thật: {text!r}"
    assert "出金 → 1,100" in text and "Thêm dòng 入金 ¥600" in text, text
    assert bar().bounding_box()["height"] == h_idle, "thanh gợi ý đổi chiều cao khi có gợi ý ⇒ bảng sẽ giật"
    memo = pg.locator("tr[data-row]").nth(a).locator("td", has_text="Số dư lệch").first
    assert "残高" not in memo.inner_text() and "Số dư lệch" in memo.inner_text(), memo.inner_text()

    bar().locator('button[data-fix="amount"]').click()
    wait_until(lambda: cell(a, "amount_out").input_value() == "1,100", "bấm 出金 → 1,100 thì ô về 1,100")
    # Áp xong thì dòng này hết vàng ⇒ tự sang dòng cần soát kế (dòng 残高 sai), con trỏ vào đúng ô 残高
    at = wait_until(lambda: focused(pg), "sau khi sửa xong tự sang dòng cần soát kế")
    assert (at["row"], at["field"], at["state"]) == (c_, "balance", "review"), f"phải vào ô 残高 của dòng ヨキンキ, thực tế {at}"
    wait_until(lambda: chips() == ["balance"], "dòng 残高 sai chỉ có một gợi ý (dòng kế khớp ⇒ đủ bằng chứng)")
    assert "残高 → 2,108,211" in bar().inner_text()
    bar().locator('button[data-fix="balance"]').click()
    wait_until(lambda: need_review(pg) == 0 and cell(c_, "balance").input_value() == "2,108,211",
               "bấm 残高 → 2,108,211 thì cả dòng đó lẫn dòng kế hết vàng")

    # ── Số tiền nằm nhầm cột ──
    typ(cell(b_, "amount_in"), "2750")
    typ(cell(b_, "amount_out"), "")
    wait_until(lambda: need_review(pg) == 1, "手数料 chuyển sang cột 入金 ⇒ lệch")
    pick_row(b_)
    wait_until(lambda: chips()[:1] == ["swap"], "gợi ý đầu tiên là đổi cột")
    assert "Đổi cột 出金↔入金" in bar().inner_text()
    bar().locator('button[data-fix="swap"]').click()
    wait_until(lambda: need_review(pg) == 0, "đổi cột xong thì hết vàng")
    assert (cell(b_, "amount_out").input_value(), cell(b_, "amount_in").input_value()) == ("2,750", ""), "số tiền phải về đúng cột 出金"

    # ── Thêm dòng bị sót (Ctrl+Z hoàn tác được) ──
    typ(cell(a, "amount_out"), "1700")
    pick_row(a)
    wait_until(lambda: "addrow" in chips(), "có gợi ý thêm dòng sót")
    bar().locator('button[data-fix="addrow"]').click()
    wait_until(lambda: pg.locator("tr[data-row]").count() == n_rows + 1, "thêm một dòng")
    row_new = pg.locator("tr[data-row]").nth(a)
    assert row_new.get_attribute("data-state") == "review" and cell(a, "amount_in").input_value() == "600", "dòng mới: 入金 600, cần ✓"
    assert cell(a, "balance").input_value() == "22,661"
    at = wait_until(lambda: focused(pg), "con trỏ vào dòng mới")
    assert (at["row"], at["field"]) == (a, "description"), f"phải vào ô 摘要 của dòng mới, thực tế {at}"
    assert pg.locator("tr[data-row]").nth(a + 1).get_attribute("data-state") != "review", "dòng cũ phải hết lệch"
    assert need_review(pg) == 1, "chỉ dòng thêm tay còn cần ✓"
    pg.keyboard.press("Control+z")
    wait_until(lambda: pg.locator("tr[data-row]").count() == n_rows and need_review(pg) == 1, "Ctrl+Z bỏ dòng vừa thêm")
    pick_row(a)
    wait_until(lambda: "amount" in chips(), "dòng 出金 sai lại có gợi ý")
    bar().locator('button[data-fix="amount"]').click()
    wait_until(lambda: need_review(pg) == 0 and cell(a, "amount_out").input_value() == "1,100", "trả mặt ① về sạch")
    return ("lý do hiện tiếng Việt, tooltip giữ chuỗi Nhật · 出金 → 1,100 và 残高 → 2,108,211 (tự sang dòng kế) · đổi cột · "
            "thêm dòng sót + Ctrl+Z · thanh gợi ý không đổi chiều cao")


def step_export_confirmed(pg, base: str, ctx: dict) -> str:
    """Task 1.4: soát xong (✓ cả hai mặt) rồi xuất Excel thì file không còn ô vàng nào."""
    from openpyxl import load_workbook

    for name in (SAMPLE_SHEET_NAME, SHEET2_NAME):
        pg.get_by_text(name).first.click()
        pg.locator("tr[data-row]").first.wait_for(timeout=10000)
        button = pg.locator('button[data-act="confirm-all"]').first
        if not button.is_disabled():
            button.click()
        wait_until(lambda: pg.locator('tr[data-row]:not([data-state="confirmed"]):not([data-state="note"])').count() == 0,
                   f"mọi dòng của {name} đã ✓")
    path = export_xlsx(pg, ctx, "da-soat.xlsx")

    viet = re.compile("[ăâđêôơưĂÂĐÊÔƠƯàáảãạằắẳẵặầấẩẫậèéẻẽẹềếểễệìíỉĩịòóỏõọồốổỗộờớởỡợùúủũụừứửữựỳýỷỹỵ]")
    wb = load_workbook(path, data_only=True)
    assert len(wb.sheetnames) >= 2, wb.sheetnames
    seen = []
    for ws in wb.worksheets:
        vang = [c.coordinate for row in ws.iter_rows(min_row=9) for c in row
                if str(c.fill.start_color.rgb).endswith("FFF2CC")]
        assert not vang, f"{ws.title}: đã ✓ hết mà file vẫn còn ô vàng: {vang[:6]}"
        level = str(ws["B6"].value)
        assert level.startswith(("検証済", "残高チェーン検証済")), f"{ws.title}: 検証レベル = {level!r}"
        memo_col = next(c for c in range(1, ws.max_column + 1) if ws.cell(row=8, column=c).value == "確認メモ")
        confirmed = sum(1 for r in range(9, ws.max_row + 1) if str(ws.cell(row=r, column=memo_col).value or "").startswith("確認済"))
        assert confirmed > 0 and f"人手確認 {confirmed}行" in str(ws["F6"].value), f"{ws.title}: F6 = {ws['F6'].value!r}, 確認済 {confirmed} dòng"
        legend = [ws[a].value for a in ("F1", "F2", "F3", "B6", "F6", "H6")]
        assert not any(viet.search(str(v)) for v in legend), f"{ws.title}: chú thích còn chữ Việt: {legend}"
        seen.append(f"{ws.title}: {level} ({confirmed} dòng 確認済)")
    return " · ".join(seen)


def step_sheet_links(pg, base: str, ctx: dict) -> str:
    """Task 1.6: kiểm chỗ nối số dư giữa hai mặt sổ liền nhau (sổ mẫu: mặt ② mở bằng 繰越 = số dư cuối mặt ①)."""
    ws_id = pg.request.get(f"{base}/api/ws").json()["workspaces"][0]["id"]

    def workspace():
        return pg.request.get(f"{base}/api/ws/{ws_id}").json()

    sheets = workspace()["sheets"]
    order = [x["id"] for x in sheets]
    by_name = {x["name"]: x["id"] for x in sheets}
    s1, s2 = by_name[SAMPLE_SHEET_NAME], by_name[SHEET2_NAME]

    def open_sheet(name):
        pg.get_by_text(name).first.click()
        pg.locator("tr[data-row]").first.wait_for(timeout=10000)

    def strip():
        return pg.locator("[data-link]").first

    def chips():
        return pg.locator("[data-link-chip]").count()

    def server_link_ok():
        return next(r for r in workspace()["results"].values() if r["sheet_id"] == s1).get("link_ok")

    # 1. Đúng thứ tự: nối liền, không có chip nào
    open_sheet(SHEET2_NAME)
    wait_until(lambda: strip().get_attribute("data-link") == "ok", "mặt ② nối liền với mặt ①")
    assert f"Nối liền với「{SAMPLE_SHEET_NAME}」" in strip().inner_text(), strip().inner_text()
    assert chips() == 0 and pg.locator("[data-links-badge]").count() == 0

    # 2. Đổi thứ tự hai mặt: mặt ① đứng sau mặt ② ⇒ số dư đầu mặt ① (22,061) không nối với số dư cuối mặt ② (751,475)
    new_order = [s2, s1] + [i for i in order if i not in (s1, s2)]
    assert pg.request.post(f"{base}/api/ws/{ws_id}/reorder", data={"sheet_ids": new_order}).ok
    pg.reload()
    open_sheet(SAMPLE_SHEET_NAME)
    wait_until(lambda: strip().get_attribute("data-link") == "break", "đổi thứ tự thì báo đứt chuỗi")
    text = strip().inner_text()
    assert "Đứt chuỗi với mặt trước" in text and "-729,414" in text, text
    wait_until(lambda: chips() == 1, "thẻ mặt ① ở cột trái có chip ⛓✕")
    badge = pg.locator("[data-links-badge]")
    wait_until(lambda: badge.count() == 1 and badge.inner_text().strip() == "⚠ 1 chỗ đứt", "thanh công cụ báo 1 chỗ đứt")
    assert need_review(pg) == 0, "chỗ đứt tính riêng, không cộng vào số dòng cần soát"

    # 3. Chip ⚠: sang dạng danh sách
    badge.click()
    wait_until(lambda: pg.get_by_role("button", name=re.compile("Gộp danh sách")).get_attribute("aria-pressed") == "true",
               "bấm chip thì sang dạng danh sách")
    pg.get_by_role("button", name=re.compile("Trang hiện tại")).click()

    # 4. 「Không phải lỗi」: hết chip, sống qua F5, bỏ xác nhận được
    strip().get_by_role("button", name="Không phải lỗi").click()
    wait_until(lambda: strip().get_attribute("data-link") == "dismissed" and chips() == 0
               and pg.locator("[data-links-badge]").count() == 0, "bấm Không phải lỗi thì hết báo động")
    wait_until(lambda: server_link_ok() == {"prev": s2, "diff": -729414}, "server lưu link_ok (mặt trước + mức chênh)", timeout=15)
    pg.reload()
    open_sheet(SAMPLE_SHEET_NAME)
    wait_until(lambda: strip().get_attribute("data-link") == "dismissed", "sau F5 vẫn là đã xác nhận")
    assert chips() == 0
    strip().get_by_role("button", name="Bỏ xác nhận").click()
    wait_until(lambda: strip().get_attribute("data-link") == "break" and chips() == 1, "bỏ xác nhận thì báo lại")
    wait_until(lambda: server_link_ok() is None, "server xoá link_ok", timeout=15)

    # 5. Xác nhận lại rồi trả đúng thứ tự: chỗ nối thật thì «nối liền», mặt đứng đầu danh sách không có dải nào
    strip().get_by_role("button", name="Không phải lỗi").click()
    wait_until(lambda: server_link_ok() is not None, "lưu lại xác nhận", timeout=15)
    assert pg.request.post(f"{base}/api/ws/{ws_id}/reorder", data={"sheet_ids": order}).ok
    pg.reload()
    open_sheet(SHEET2_NAME)
    wait_until(lambda: strip().get_attribute("data-link") == "ok", "trả đúng thứ tự thì nối liền")
    assert chips() == 0 and pg.locator("[data-links-badge]").count() == 0
    open_sheet(SAMPLE_SHEET_NAME)
    assert pg.locator("[data-link]").count() == 0, "mặt ① đứng đầu danh sách: không có mặt trước nên không có dải nào"
    return "đúng thứ tự: nối liền · đổi thứ tự: dải đứt + ⛓✕ + chip ⚠ (không cộng vào số dòng) · Không phải lỗi sống qua F5 và bỏ được · trả đúng thứ tự thì nối liền"


def step_duplicate_pages(pg, base: str, ctx: dict) -> str:
    """Task 1.7: hai mặt sổ chung nhiều số dư = nghi cùng một trang chụp hai lần. Thêm sổ mẫu lần nữa cho ra hai
    cặp trùng ($0, không gọi Gemini)."""
    ws_id = pg.request.get(f"{base}/api/ws").json()["workspaces"][0]["id"]

    def workspace():
        return pg.request.get(f"{base}/api/ws/{ws_id}").json()

    n_before = len(workspace()["sheets"])
    added = pg.request.post(f"{base}/api/ws/{ws_id}/sample").json()["added"]
    assert len(added) == 2, added
    pg.reload()
    pg.get_by_text(SAMPLE_SHEET_NAME).first.wait_for(timeout=15000)

    chips = pg.locator("[data-dup-chip]")
    wait_until(lambda: chips.count() == 2, "hai bản chụp lại của sổ mẫu đều có huy hiệu «Có thể trùng»")
    assert f"Có thể trùng với「{SAMPLE_SHEET_NAME}」" in chips.first.inner_text(), chips.first.inner_text()
    assert pg.locator("[data-dup-compare]").count() == 0

    # Hộp so sánh hai ảnh
    chips.first.click()
    box = pg.locator("[data-dup-compare]")
    box.wait_for(timeout=5000)
    assert re.fullmatch(r"\d+/\d+ số dư trùng nhau", box.locator("[data-dup-match]").inner_text().strip()), box.inner_text()
    wait_until(lambda: box.locator("img").count() == 2 and all(
        im.evaluate("e => e.complete && e.naturalWidth > 0") for im in box.locator("img").all()), "hai ảnh đã tải")
    box.locator('[data-dup="later"]').click()
    box.wait_for(state="detached", timeout=5000)
    assert chips.count() == 2, "Để sau thì không đổi gì"

    # Cảnh báo (không chặn) ở hộp Xuất file
    pg.locator('[data-tour="export"]').click()
    dialog = pg.locator("[role=dialog][aria-labelledby=exp-title]")
    dialog.wait_for(timeout=5000)
    warn = dialog.locator('[data-sum="dup"]')
    wait_until(lambda: warn.count() == 1 and "2 cặp có thể trùng" in warn.inner_text(), "tóm tắt ở hộp Xuất file báo 2 cặp trùng")
    assert dialog.get_by_role("button", name=VI["download"]).is_enabled(), "cảnh báo không được chặn việc xuất"
    pg.keyboard.press("Escape")
    dialog.wait_for(state="detached", timeout=5000)

    # 「Không phải trùng」: hết huy hiệu, sống qua F5
    chips.first.click()
    box.wait_for(timeout=5000)
    box.locator('[data-dup="not"]').click()
    wait_until(lambda: chips.count() == 1 and box.count() == 0, "bấm Không phải trùng thì cặp đó hết bị nghi")
    wait_until(lambda: len(workspace()["dup_ok"]) == 1, "server lưu dup_ok")
    pg.reload()
    pg.get_by_text(SAMPLE_SHEET_NAME).first.wait_for(timeout=15000)
    wait_until(lambda: chips.count() == 1, "sau F5 cặp đã xác nhận vẫn không bị nghi lại")

    # 「Xoá mặt bên phải」: có hỏi lại, rồi xoá thật
    victim = chips.first.inner_text()
    chips.first.click()
    box.wait_for(timeout=5000)
    box.locator('[data-dup="delete"]').click()
    pg.locator("[role=alertdialog]").get_by_role("button", name="Xoá mặt sổ").click()
    wait_until(lambda: chips.count() == 0 and len(workspace()["sheets"]) == n_before + 1, "mặt bên phải đã bị xoá, hết huy hiệu")
    assert box.count() == 0

    # Dọn: bỏ nốt bản sổ mẫu thêm vào để các bước sau (nếu có) không bị ảnh hưởng
    for sid in added:
        if any(x["id"] == sid for x in workspace()["sheets"]):
            assert pg.request.delete(f"{base}/api/ws/{ws_id}/sheets/{sid}").ok
    assert len(workspace()["sheets"]) == n_before and workspace()["dup_ok"] == [], "xoá mặt sổ phải dọn luôn cặp dup_ok chứa nó"
    return f"2 bản chụp lại → 2 huy hiệu ({victim.strip()[:30]}…) · hộp so sánh có 2 ảnh + số dư trùng · cảnh báo khi xuất · Không phải trùng sống qua F5 · Xoá mặt bên phải"


def step_cases(pg, base: str, ctx: dict) -> str:
    """Task 2.2: trang danh sách hồ sơ. Hồ sơ A là hồ sơ các bước trước đã dùng; tạo thêm hồ sơ B rồi dọn (còn lại
    đúng một hồ sơ để các bước sau không lẫn)."""
    def j(path):
        return pg.request.get(f"{base}{path}").json()

    a_id = j("/api/ws")["workspaces"][0]["id"]
    user_id = j("/api/auth/me")["id"]
    cards = pg.locator("[data-testid=case-card]")
    chip = pg.locator("[data-testid=current-case]")
    search = pg.get_by_placeholder("Tìm theo tên hồ sơ…")

    def go_cases():
        pg.locator('[data-tour="cases"]').click()
        pg.wait_for_url("**/cases/", timeout=10000)

    # ── Đặt tên hồ sơ A trên bàn làm việc → thanh trên hiện tên đó ──
    pg.goto(f"{base}/")
    pg.locator('[data-tour="drop"]').wait_for(timeout=15000)
    name_box = pg.get_by_placeholder("Tên sổ")
    name_box.fill("Khách A")
    name_box.press("Tab")
    wait_until(lambda: j(f"/api/ws/{a_id}")["book_name"] == "Khách A", "server lưu tên hồ sơ A")
    wait_until(lambda: "Khách A" in chip.inner_text(), "thanh trên hiện tên hồ sơ đang mở")

    # ── Trang danh sách: số «cần soát» khớp với cột trái ──
    go_cases()
    cards.first.wait_for(timeout=10000)
    assert cards.count() == 1, f"mới có 1 hồ sơ mà thấy {cards.count()}"
    brief = j("/api/ws")["workspaces"][0]
    assert brief["id"] == a_id and brief["book_name"] == "Khách A" and not brief["archived"], brief
    assert brief["rows"] > 0 and brief["sheets"] >= 2, brief
    status = cards.first.locator("[data-testid=case-status]").inner_text().strip()
    want = VI["allChecked"] if brief["need"] == 0 else f"Còn {brief['need']} dòng"
    assert status == want, f"thẻ hồ sơ ghi «{status}», máy chủ tính «{want}»"
    assert "Đang mở" in cards.first.inner_text(), "hồ sơ đang làm phải có nhãn «Đang mở»"
    # Cùng một định nghĩa: tổng số trên các thẻ mặt sổ ở cột trái (đo ở bàn làm việc) phải bằng số ở đây
    pg.goto(f"{base}/")
    pg.locator('[data-tour="rail"] li').first.wait_for(timeout=15000)
    wait_until(lambda: pg.locator('[data-tour="rail"] li[data-need]').count() > 0, "cột trái có số cần soát")
    rail_total = sum(int(e.get_attribute("data-need")) for e in pg.locator('[data-tour="rail"] li[data-need]').all())
    assert rail_total == brief["need"], f"cột trái cộng được {rail_total}, trang hồ sơ ghi {brief['need']}"

    # ── Tạo hồ sơ B bằng Enter → mở đúng hồ sơ đó, rỗng ──
    go_cases()
    pg.locator("[data-testid=case-new]").click()
    pg.locator("[data-testid=case-new-name]").fill("Khách B")
    pg.locator("[data-testid=case-new-name]").press("Enter")
    pg.locator('[data-tour="drop"]').wait_for(timeout=15000)
    wait_until(lambda: "Khách B" in chip.inner_text(), "thanh trên hiện tên hồ sơ mới")
    b_id = re.search(r"[?&]ws=([\w-]+)", pg.url).group(1)
    assert b_id != a_id and j(f"/api/ws/{b_id}")["sheets"] == [], "hồ sơ mới phải rỗng"
    assert pg.locator('[data-tour="rail"] li').count() == 0, "bàn làm việc của hồ sơ mới phải chưa có mặt sổ"
    pg.locator("button", has_text=VI["trySample"]).click()
    pg.locator("tr[data-row]").first.wait_for(timeout=15000)
    b_sheets = [s["id"] for s in j(f"/api/ws/{b_id}")["sheets"]]
    a_sheets = [s["id"] for s in j(f"/api/ws/{a_id}")["sheets"]]
    assert len(b_sheets) == 2 and not set(b_sheets) & set(a_sheets), "hai hồ sơ không được chung mặt sổ"

    # ── Danh sách có hai hồ sơ, B (sửa gần nhất) đứng đầu; mở lại A → thấy mặt sổ của A, không thấy của B ──
    go_cases()
    wait_until(lambda: cards.count() == 2, "danh sách có hai hồ sơ")
    assert cards.first.get_attribute("data-case-id") == b_id, "hồ sơ vừa sửa phải đứng đầu"
    assert "Đang mở" in cards.first.inner_text() and "Đang mở" not in cards.nth(1).inner_text()
    cards.nth(1).locator("[data-testid=case-open]").click()
    pg.locator('[data-tour="rail"] li').first.wait_for(timeout=15000)
    wait_until(lambda: "Khách A" in chip.inner_text(), "mở lại hồ sơ A")
    rail_names = pg.locator('[data-tour="rail"] li').all_inner_texts()
    assert len(rail_names) == len(a_sheets), f"hồ sơ A có {len(a_sheets)} mặt sổ, cột trái hiện {len(rail_names)}"
    pg.reload()                                                     # ?ws=… còn trên địa chỉ → F5 vẫn là hồ sơ A
    pg.locator('[data-tour="rail"] li').first.wait_for(timeout=15000)
    wait_until(lambda: "Khách A" in chip.inner_text(), "F5 vẫn là hồ sơ A")

    # ── Hướng dẫn có bước chỉ vào liên kết «Hồ sơ» ──
    pg.locator('[data-tour="help"]').click()
    tour = pg.locator("[role=dialog][aria-labelledby=tour-title]")
    tour.wait_for(timeout=5000)
    assert "/ 8" in tour.inner_text(), tour.inner_text()
    for _ in range(6):
        pg.keyboard.press("ArrowRight")
    wait_until(lambda: "Hồ sơ" in tour.locator("#tour-title").inner_text(), "bước thứ 7 của hướng dẫn nói về hồ sơ")
    pg.keyboard.press("Escape")
    tour.wait_for(state="detached", timeout=5000)

    # ── Đổi tên bằng bấm đúp: Esc bỏ, Enter lưu, sống qua F5 ──
    pg.goto(f"{base}/cases/")
    cards.first.wait_for(timeout=10000)
    card_b = pg.locator(f'[data-case-id="{b_id}"]')
    card_b.locator("[data-testid=case-name]").dblclick()
    box = card_b.locator("input")
    box.fill("Tên bỏ đi")
    box.press("Escape")
    wait_until(lambda: card_b.locator("input").count() == 0, "Esc đóng ô đổi tên")
    assert card_b.locator("[data-testid=case-name]").inner_text() == "Khách B", "Esc phải bỏ thay đổi"
    assert j(f"/api/ws/{b_id}")["book_name"] == "Khách B"
    card_b.locator("[data-testid=case-name]").dblclick()
    box = card_b.locator("input")
    box.fill("Khách B2")
    box.press("Enter")
    wait_until(lambda: j(f"/api/ws/{b_id}")["book_name"] == "Khách B2", "server lưu tên mới")
    pg.reload()
    wait_until(lambda: pg.locator(f'[data-case-id="{b_id}"] [data-testid=case-name]').inner_text() == "Khách B2", "tên mới sau F5")

    # ── Lưu trữ B: sang tab «Đã lưu trữ», tìm kiếm không dấu, bỏ lưu trữ ──
    card_b = pg.locator(f'[data-case-id="{b_id}"]')
    card_b.locator("[data-testid=case-archive]").click()
    wait_until(lambda: cards.count() == 1, "B biến khỏi tab «Đang làm»")
    wait_until(lambda: j(f"/api/ws/{b_id}")["archived"] is True, "server lưu trạng thái lưu trữ")
    pg.get_by_role("tab", name=re.compile("Đã lưu trữ")).click()
    wait_until(lambda: cards.count() == 1 and cards.first.get_attribute("data-case-id") == b_id, "B nằm ở tab «Đã lưu trữ»")
    search.fill("khach b2")                                         # gõ không dấu vẫn ra
    assert cards.count() == 1
    search.fill("không có tên này")
    wait_until(lambda: cards.count() == 0, "từ khoá lạ thì không còn thẻ nào")
    search.fill("")

    # Hồ sơ đã cất đi thì trang chủ không tự mở lại nó (dù trình duyệt đang nhớ nó là «làm dở»)
    pg.evaluate("([k, v]) => localStorage.setItem(k, v)", [f"tsucho.ws.{user_id}", b_id])
    pg.goto(f"{base}/")
    pg.locator('[data-tour="rail"] li').first.wait_for(timeout=15000)
    wait_until(lambda: "Khách A" in chip.inner_text(), "trang chủ bỏ qua hồ sơ lưu trữ, mở hồ sơ đang làm")

    pg.goto(f"{base}/cases/")
    pg.get_by_role("tab", name=re.compile("Đã lưu trữ")).click()
    wait_until(lambda: cards.count() == 1, "tab lưu trữ còn B")
    cards.first.locator("[data-testid=case-archive]").click()                   # «Bỏ lưu trữ»
    wait_until(lambda: j(f"/api/ws/{b_id}")["archived"] is False, "bỏ lưu trữ")

    # ── Xoá B: Enter không xoá, phải bấm nút ──
    pg.get_by_role("tab", name=re.compile("Đang làm")).click()
    wait_until(lambda: cards.count() == 2, "B trở lại tab «Đang làm»")
    pg.locator(f'[data-case-id="{b_id}"] [data-testid=case-delete]').click()
    dialog = pg.locator("[role=alertdialog]")
    dialog.wait_for(timeout=5000)
    assert "Mất cả ảnh lẫn kết quả quét" in dialog.inner_text(), dialog.inner_text()
    pg.keyboard.press("Enter")                                      # Enter rơi vào nút Huỷ: đóng hộp, KHÔNG xoá
    wait_until(lambda: dialog.count() == 0, "Enter chỉ huỷ hộp xác nhận")
    assert j(f"/api/ws/{b_id}").get("id") == b_id, "Enter không được xoá hồ sơ"
    pg.locator(f'[data-case-id="{b_id}"] [data-testid=case-delete]').click()
    dialog.wait_for(timeout=5000)
    dialog.get_by_role("button", name="Xoá hẳn hồ sơ").click()
    wait_until(lambda: cards.count() == 1, "B biến khỏi danh sách")
    assert pg.request.get(f"{base}/api/ws/{b_id}").status == 404, "máy chủ phải xoá thật"
    assert [w["id"] for w in j("/api/ws")["workspaces"]] == [a_id], "chỉ còn hồ sơ A"
    return ("tên hồ sơ trên thanh trên · số cần soát khớp cột trái · tạo (Enter) → mở đúng hồ sơ rỗng, không lẫn mặt sổ · "
            "mở lại A, F5 giữ A · hướng dẫn 8 bước · đổi tên (Esc bỏ) · lưu trữ/bỏ lưu trữ + tìm không dấu · "
            "lưu trữ không tự mở lại · xoá phải bấm nút và xoá thật")


def step_book_info(pg, base: str, ctx: dict) -> str:
    """Task 2.3: sửa thông tin sổ ở đầu thẻ. Sổ mẫu mặt ② bị xoá hết thông tin (như sổ không có bìa), sửa mặt ① rồi áp
    cho mặt sau. Cuối bước trả thông tin hai mặt về như cũ để các bước sau không bị ảnh hưởng."""
    from openpyxl import load_workbook

    def j(path):
        return pg.request.get(f"{base}{path}").json()

    ws_id = j("/api/ws")["workspaces"][0]["id"]
    data = j(f"/api/ws/{ws_id}")
    by_name = {s["name"]: s["id"] for s in data["sheets"]}
    sid1, sid2 = by_name[SAMPLE_SHEET_NAME], by_name[SHEET2_NAME]
    meta1 = dict(data["results"][sid1]["blocks"][0]["meta"])
    original = {sid: [dict(b["meta"]) for b in data["results"][sid]["blocks"]] for sid in (sid1, sid2)}
    assert meta1["bank_name"] and meta1["account_no"], f"sổ mẫu mặt ① phải có ngân hàng + số tài khoản: {meta1}"
    EMPTY = {"bank_name": None, "store_no": None, "account_no": None, "holder": None}

    def set_meta(sid, metas):
        """Ghi thẳng meta các khối của một mặt sổ qua API (giữ nguyên dòng)."""
        blocks = j(f"/api/ws/{ws_id}")["results"][sid]["blocks"]
        for b, m in zip(blocks, metas):
            b["meta"] = m
        r = pg.request.put(f"{base}/api/ws/{ws_id}/results/{sid}", data={"blocks": blocks})
        assert r.ok, r.text()

    def metas_on_server(sid):
        return [b["meta"] for b in j(f"/api/ws/{ws_id}")["results"][sid]["blocks"]]

    def open_sheet1():
        pg.goto(f"{base}/")
        pg.get_by_text(SAMPLE_SHEET_NAME).first.click(timeout=15000)
        pg.locator("tr[data-row]").first.wait_for(timeout=15000)

    dialog = pg.locator("[data-testid=bookinfo-dialog]")
    field = lambda name: dialog.locator(f'input[data-field="{name}"]')

    # ── Mặt ② mất hết thông tin; sửa mặt ① và áp cho mặt sau ──
    set_meta(sid2, [EMPTY] * len(original[sid2]))
    open_sheet1()
    pg.locator('[data-act="edit-meta"]').first.click()
    dialog.wait_for(timeout=5000)
    assert field("bank_name").input_value() == meta1["bank_name"], "hộp phải hiện sẵn thông tin hiện tại"
    assert field("account_no").input_value() == meta1["account_no"]
    tick = dialog.locator("[data-testid=bookinfo-propagate]")
    assert tick.is_checked(), "ô áp cho mặt sau phải bật sẵn khi có mặt sau trống"
    assert "Áp dụng cho 1 mặt sổ phía sau chưa có thông tin" in dialog.inner_text(), dialog.inner_text()
    field("bank_name").fill("テスト銀行")
    dialog.locator("[data-testid=bookinfo-save]").click()
    dialog.wait_for(state="detached", timeout=5000)
    assert "テスト銀行" in pg.locator("[data-account-head]").first.inner_text(), "tiêu đề thẻ sổ phải đổi ngay"

    def both_new():
        m1, m2 = metas_on_server(sid1), metas_on_server(sid2)
        return (m1[0]["bank_name"] == "テスト銀行" and m1[0].get("edited") is True
                and m2[0]["bank_name"] == "テスト銀行" and m2[0].get("edited") is True
                and m2[0]["account_no"] == meta1["account_no"])
    wait_until(both_new, "server lưu cả hai mặt (cờ edited) và mặt ② được điền số tài khoản", timeout=15)

    # ── Một Ctrl+Z hoàn tác cả hai; «Làm lại» làm lại cả hai ──
    pg.keyboard.press("Control+z")
    wait_until(lambda: metas_on_server(sid1)[0]["bank_name"] == meta1["bank_name"]
               and metas_on_server(sid2)[0]["bank_name"] is None, "Ctrl+Z hoàn tác cả hai mặt sổ", timeout=15)
    assert "edited" not in metas_on_server(sid1)[0], "hoàn tác phải trả về đúng bản trước, không còn cờ edited"
    pg.get_by_role("button", name=re.compile("Làm lại")).first.click()
    wait_until(both_new, "Làm lại áp lại cả hai mặt", timeout=15)

    # ── Xuất Excel: ô B1 của cả hai sheet đúng tên mới ──
    path = export_xlsx(pg, ctx, "thong-tin-so.xlsx")
    pg.keyboard.press("Escape")
    wb = load_workbook(path, data_only=True)
    banks = [(w["A1"].value, w["B1"].value, w["B3"].value) for w in wb.worksheets]
    assert len(banks) >= 2 and all(a == "銀行" for a, _, _ in banks), banks
    assert all(b == "テスト銀行" for _, b, _ in banks), f"B1 các sheet: {[b for _, b, _ in banks]}"
    assert all(n == meta1["account_no"] for _, _, n in banks), f"B3 các sheet: {[n for _, _, n in banks]}"

    # ── Bỏ tick «áp dụng»: mặt sau giữ nguyên ──
    set_meta(sid2, [EMPTY] * len(original[sid2]))
    set_meta(sid1, original[sid1])
    open_sheet1()
    pg.locator('[data-act="edit-meta"]').first.click()
    dialog.wait_for(timeout=5000)
    dialog.locator("[data-testid=bookinfo-propagate]").uncheck()
    field("bank_name").fill("テスト銀行2")
    field("bank_name").press("Enter")                                    # Enter trong ô = Lưu
    dialog.wait_for(state="detached", timeout=5000)
    wait_until(lambda: metas_on_server(sid1)[0]["bank_name"] == "テスト銀行2", "mặt ① đã lưu tên mới")
    assert metas_on_server(sid2)[0]["bank_name"] is None, "bỏ tick thì mặt ② không được điền"

    # ── Mặt ② nay là mặt cuối có kết quả: không còn gì để điền; Esc đóng hộp mà không đổi gì ──
    pg.get_by_text(SHEET2_NAME).first.click()
    pg.locator("tr[data-row]").first.wait_for(timeout=10000)
    pg.locator('[data-act="edit-meta"]').first.click()
    dialog.wait_for(timeout=5000)
    assert dialog.locator("[data-testid=bookinfo-propagate]").count() == 0
    assert "không có mặt sổ nào còn thiếu thông tin" in dialog.inner_text(), dialog.inner_text()
    field("bank_name").fill("không lưu")
    pg.keyboard.press("Escape")
    dialog.wait_for(state="detached", timeout=5000)
    time.sleep(1.2)                                                      # quá hạn autosave (800 ms) mà vẫn không đổi
    assert metas_on_server(sid2)[0]["bank_name"] is None, "Esc không được lưu gì"

    # ── Trả về như cũ cho các bước sau ──
    for sid in (sid1, sid2):
        set_meta(sid, original[sid])
    open_sheet1()
    assert metas_on_server(sid1) == original[sid1] and metas_on_server(sid2) == original[sid2]
    return ("hộp hiện sẵn thông tin hiện tại · áp cho mặt sau (tick bật sẵn, «1 mặt sổ») · server lưu cả hai + cờ edited · "
            "một Ctrl+Z hoàn tác cả hai, Làm lại áp lại · Excel: B1 và B3 của mọi sheet đúng · bỏ tick thì mặt sau giữ nguyên · "
            "hết mặt sau thì hộp báo không có gì để điền · Esc không lưu")


def step_export_summary(pg, base: str, ctx: dict) -> str:
    """Task 2.4: «Tóm tắt trước khi xuất» (không chặn, mỗi mục nhảy tới chỗ cần xem) và cấu trúc «Gộp theo tài khoản».
    Cuối bước trả hồ sơ về đúng như trước."""
    from openpyxl import load_workbook

    def j(path):
        return pg.request.get(f"{base}{path}").json()

    ws_id = j("/api/ws")["workspaces"][0]["id"]
    data = j(f"/api/ws/{ws_id}")
    order0 = [x["id"] for x in data["sheets"]]
    by_name = {x["name"]: x["id"] for x in data["sheets"]}
    s1, s2 = by_name[SAMPLE_SHEET_NAME], by_name[SHEET2_NAME]
    orig = {sid: (data["results"][sid]["blocks"], data["results"][sid].get("link_ok")) for sid in (s1, s2)}

    dialog = pg.locator("[role=dialog][aria-labelledby=exp-title]")
    summary = pg.locator("[data-export-summary]")

    def put(sid, blocks, link_ok):
        r = pg.request.put(f"{base}/api/ws/{ws_id}/results/{sid}", data={"blocks": blocks, "link_ok": link_ok})
        assert r.ok, r.text()

    def open_export():
        pg.locator('[data-tour="export"]').click()
        dialog.wait_for(timeout=5000)

    def close_export():
        pg.keyboard.press("Escape")
        dialog.wait_for(state="detached", timeout=5000)

    def reload_to_workbench():
        pg.goto(f"{base}/")
        pg.locator('[data-tour="rail"] li').first.wait_for(timeout=15000)
        wait_until(lambda: pg.locator('[data-tour="rail"] li[data-need]').count() > 0, "cột trái có số cần soát")

    # ── 1. Hồ sơ sạch: tóm tắt báo ổn, nút giữ nhãn thường ──
    reload_to_workbench()
    open_export()
    assert summary.get_attribute("data-issues") == "no", summary.inner_text()
    assert "Đã soát hết · không có chỗ đứt · không có cặp trùng" in summary.inner_text(), summary.inner_text()
    assert dialog.get_by_role("button", name="Xuất file tải về").is_enabled()
    assert dialog.get_by_role("button", name="Vẫn xuất").count() == 0
    close_export()

    # ── 2. Tạo đủ ba việc: dòng chưa soát (mặt ②), đứt chuỗi (đổi thứ tự), cặp trùng (thêm sổ mẫu lần nữa) ──
    blocks2 = [{**b, "rows": [{k: v for k, v in r.items() if k not in ("reviewed", "reviewed_at")} for r in b["rows"]]}
               for b in orig[s2][0]]
    put(s2, blocks2, None)
    put(s1, orig[s1][0], None)                                                # bỏ «Không phải lỗi» của bước 15
    new_order = [s2, s1] + [i for i in order0 if i not in (s1, s2)]
    assert pg.request.post(f"{base}/api/ws/{ws_id}/reorder", data={"sheet_ids": new_order}).ok
    added = pg.request.post(f"{base}/api/ws/{ws_id}/sample").json()["added"]
    assert len(added) == 2, added
    reload_to_workbench()
    chips_break = pg.locator("[data-link-chip]")
    chips_dup = pg.locator("[data-dup-chip]")
    wait_until(lambda: chips_break.count() == 1 and chips_dup.count() == 2, "cột trái thấy 1 chỗ đứt và 2 huy hiệu trùng")
    rail_total = sum(int(e.get_attribute("data-need")) for e in pg.locator('[data-tour="rail"] li[data-need]').all())
    assert rail_total >= 2, f"cần ít nhất 2 dòng cần soát (mặt ② và bản sao), cột trái cộng được {rail_total}"

    open_export()
    wait_until(lambda: summary.get_attribute("data-issues") == "yes", "tóm tắt báo còn việc")
    assert summary.locator('[data-sum="need"]').inner_text().strip() == f"Còn {rail_total} dòng cần soát", summary.inner_text()
    assert summary.locator('[data-sum="break"]').inner_text().strip() == "1 chỗ đứt giữa các mặt", summary.inner_text()
    assert summary.locator('[data-sum="dup"]').inner_text().strip() == "2 cặp có thể trùng", summary.inner_text()
    anyway = dialog.get_by_role("button", name="Vẫn xuất")
    assert anyway.is_enabled(), "tóm tắt chỉ nhắc, không được chặn việc xuất"
    assert dialog.get_by_role("button", name="Xuất file tải về").count() == 0
    close_export()

    # Phạm vi «mặt đang xem»: mặt ① không có việc gì (chỗ đứt và cặp trùng cần CẢ HAI mặt trong phạm vi)
    pg.locator('[data-tour="rail"] li', has_text=SAMPLE_SHEET_NAME).first.click()
    pg.locator("tr[data-row]").first.wait_for(timeout=10000)
    open_export()
    dialog.get_by_role("button", name=re.compile("Chỉ mặt sổ đang xem")).click()
    wait_until(lambda: summary.get_attribute("data-issues") == "no", "phạm vi mặt ① thì không còn việc")
    dialog.get_by_role("button", name=re.compile("Toàn bộ mặt sổ đã quét")).click()
    wait_until(lambda: summary.get_attribute("data-issues") == "yes", "về toàn bộ thì còn việc")
    close_export()

    # ── 3. Mỗi mục nhảy tới đúng chỗ ──
    open_export()
    summary.locator('[data-sum="need"]').click()
    dialog.wait_for(state="detached", timeout=5000)
    wait_until(lambda: (focused(pg) or {}).get("state") == "review", "con trỏ vào ô của dòng cần soát đầu tiên")
    open_export()
    summary.locator('[data-sum="break"]').click()
    dialog.wait_for(state="detached", timeout=5000)
    wait_until(lambda: pg.locator('[data-link="break"]').count() >= 1, "nhảy tới dải «đứt chuỗi»")
    open_export()
    summary.locator('[data-sum="dup"]').click()
    dialog.wait_for(state="detached", timeout=5000)
    box = pg.locator("[data-dup-compare]")
    box.wait_for(timeout=5000)
    box.locator('[data-dup="later"]').click()
    box.wait_for(state="detached", timeout=5000)

    # ── 4. «Gộp theo tài khoản»: cùng bank + số tài khoản thì chung một tab (cho bản sao thứ hai sang tài khoản khác) ──
    copy2 = j(f"/api/ws/{ws_id}")["results"][added[1]]
    for blk in copy2["blocks"]:
        blk["meta"]["account_no"] = "9999999"
    put(added[1], copy2["blocks"], None)
    reload_to_workbench()                                                     # trình duyệt mới là nguồn của file xuất: nạp lại bản vừa sửa qua API
    results = j(f"/api/ws/{ws_id}")["results"]
    sheets_now = [x["id"] for x in j(f"/api/ws/{ws_id}")["sheets"]]
    expect: dict = {}                                                         # (bank, account) hoặc id mặt → số dòng
    for sid in sheets_now:
        if sid not in results:
            continue
        for b in results[sid]["blocks"]:
            m = b["meta"]
            key = (m.get("bank_name"), m.get("account_no")) if m.get("account_no") else ("sheet", sid)
            expect[key] = expect.get(key, 0) + len(b["rows"])
    assert len(expect) >= 1

    open_export()
    dialog.get_by_role("button", name=re.compile("Gộp theo tài khoản")).click()
    with pg.expect_download(timeout=30000) as info:
        anyway.click()
    path = Path(ctx["tmp"]) / "theo-tai-khoan.xlsx"
    info.value.save_as(path)
    dialog.wait_for(state="detached", timeout=10000)
    wb = load_workbook(path)                                                  # giữ công thức: dòng dữ liệu nào cũng có ô 残高チェック
    assert len(wb.worksheets) == len(expect), f"{len(wb.worksheets)} tab, kỳ vọng {len(expect)}: {expect}"
    got = []
    for w in wb.worksheets:
        n = 0
        for r in range(9, w.max_row + 1):                                     # dòng dữ liệu liền nhau, hết khi gặp dòng trống hẳn
            if all(w.cell(row=r, column=c).value is None for c in range(1, w.max_column + 1)):
                break
            n += 1
        got.append(n)
    assert sorted(got) == sorted(expect.values()), f"số dòng mỗi tab {sorted(got)} ≠ kỳ vọng {sorted(expect.values())}"
    assert all(w["A1"].value == "銀行" and w["A3"].value == "口座番号" for w in wb.worksheets)
    assert sorted(str(w["B3"].value) for w in wb.worksheets) == ["0000001", "9999999"][: len(wb.worksheets)] or len(wb.worksheets) == 1,         [w["B3"].value for w in wb.worksheets]
    assert len(wb.worksheets) == 2 and any("9999999" in w.title for w in wb.worksheets), [w.title for w in wb.worksheets]

    # ── 5. Trả hồ sơ về như cũ ──
    for sid in added:
        assert pg.request.delete(f"{base}/api/ws/{ws_id}/sheets/{sid}").ok
    assert pg.request.post(f"{base}/api/ws/{ws_id}/reorder", data={"sheet_ids": order0}).ok
    put(s1, orig[s1][0], orig[s1][1])
    put(s2, orig[s2][0], orig[s2][1])
    reload_to_workbench()
    back = j(f"/api/ws/{ws_id}")
    assert [x["id"] for x in back["sheets"]] == order0 and back["dup_ok"] == []
    assert back["results"][s1]["blocks"] == orig[s1][0] and back["results"][s2]["blocks"] == orig[s2][0]
    return (f"sạch → «✓ Đã soát hết…» · còn việc → «Còn {rail_total} dòng · 1 chỗ đứt · 2 cặp trùng» khớp cột trái, nút «Vẫn xuất» không chặn · "
            f"phạm vi mặt đang xem đếm lại · mỗi mục nhảy tới đúng chỗ · Gộp theo tài khoản → {len(expect)} tab (cùng tài khoản chung tab, tài khoản khác tách tab), số dòng khớp")


def step_settings(pg, base: str, ctx: dict) -> str:
    """Task 3.1: ⚙ Cài đặt lưu THEO TÀI KHOẢN (ngôn ngữ, chủ đề) — đổi máy vẫn giữ. Cuối bước trả lại tiếng Việt."""
    def prefs():
        return pg.request.get(f"{base}/api/me/prefs").json()

    pg.goto(f"{base}/")
    pg.locator('[data-tour="drop"]').wait_for(timeout=15000)
    assert prefs()["lang"] is None and prefs()["theme"] is None, "chưa chọn gì thì máy chủ không giữ ngôn ngữ/chủ đề"

    # ── Mở hộp, chọn tiếng Nhật và chủ đề tối → máy chủ lưu ──
    dialog = pg.locator("[data-testid=settings-dialog]")
    pg.locator("[data-testid=settings-btn]").click()
    dialog.wait_for(timeout=5000)
    assert "Lưu theo tài khoản" in dialog.inner_text(), dialog.inner_text()
    dialog.get_by_role("button", name="日本語").click()
    wait_until(lambda: prefs()["lang"] == "ja", "máy chủ lưu ngôn ngữ ja", timeout=15)
    assert "設定" in dialog.inner_text(), "giao diện phải đổi sang tiếng Nhật ngay"
    dialog.get_by_role("button", name="ダーク").click()
    wait_until(lambda: prefs()["theme"] == "dark", "máy chủ lưu chủ đề tối", timeout=15)
    assert pg.evaluate("document.documentElement.dataset.theme") == "dark"

    # ── Máy lạ: trình duyệt trắng (không có localStorage), ngôn ngữ en-US — đăng nhập cùng tài khoản ──
    other = pg.context.browser.new_context(locale="en-US", viewport={"width": 1280, "height": 800})
    try:
        pg2 = other.new_page()
        pg2.set_default_timeout(10000)
        pg2.goto(f"{base}/login/")
        pg2.fill("#email", EMAIL)
        pg2.fill("#password", PASSWORD)
        pg2.click("button[type=submit]")
        pg2.locator('[data-tour="drop"]').wait_for(timeout=15000)
        wait_until(lambda: pg2.evaluate("document.documentElement.lang") == "ja", "máy lạ nhận ngôn ngữ đã lưu (ja)")
        wait_until(lambda: pg2.evaluate("document.documentElement.dataset.theme") == "dark", "máy lạ nhận chủ đề đã lưu (tối)")
        assert pg2.locator("[data-testid=settings-btn]").get_attribute("aria-label") == "設定"
    finally:
        other.close()

    # ── Esc đóng hộp; trả lại tiếng Việt + chủ đề theo hệ thống ──
    dialog.get_by_role("button", name="システム").click()                  # đang là tiếng Nhật: bấm chủ đề TRƯỚC khi đổi về VI
    dialog.get_by_role("button", name="VI").click()
    wait_until(lambda: prefs()["lang"] == "vi" and prefs()["theme"] == "system", "trả lại vi + hệ thống", timeout=15)
    pg.keyboard.press("Escape")
    dialog.wait_for(state="detached", timeout=5000)
    pg.reload()
    pg.locator('[data-tour="drop"]').wait_for(timeout=15000)
    assert pg.evaluate("document.documentElement.lang") == "vi"
    return "⚙ mở/đóng bằng Esc · chọn ja + tối → máy chủ lưu theo tài khoản · máy lạ (en-US, không có localStorage) đăng nhập cùng tài khoản thì thấy tiếng Nhật + chủ đề tối · trả lại vi"


def viewer_sheet(pg) -> str | None:
    """Tên mặt sổ đang hiện ở khung ảnh giữa (dòng «Mặt sổ: …» dưới ảnh)."""
    return pg.evaluate("""() => {
        const b = [...document.querySelectorAll('b')].find(e => e.parentElement && e.parentElement.textContent.trim().startsWith('Mặt sổ'));
        return b ? b.textContent : null;
    }""")


def break_sheet_state(pg, base: str, ws_id: str, sid1: str, sid2: str):
    """Dựng hai mặt sổ CÓ dòng cần soát: mặt ① một dòng in sai số dư, mặt ② bỏ ✓ (còn 1 dòng vàng thật).
    Trả về bản gốc để trả lại sau khi thử."""
    data = pg.request.get(f"{base}/api/ws/{ws_id}").json()
    orig = {sid: (data["results"][sid]["blocks"], data["results"][sid].get("link_ok")) for sid in (sid1, sid2)}
    b1 = [{**b, "rows": [dict(r) for r in b["rows"]]} for b in orig[sid1][0]]
    b1[0]["rows"][EDIT_ROW]["balance"] = 999                                # như bước 4: số dư in sai ⇒ vàng
    b2 = [{**b, "rows": [{k: v for k, v in r.items() if k not in ("reviewed", "reviewed_at")} for r in b["rows"]]}
          for b in orig[sid2][0]]
    for sid, blocks in ((sid1, b1), (sid2, b2)):
        r = pg.request.put(f"{base}/api/ws/{ws_id}/results/{sid}", data={"blocks": blocks, "link_ok": None})
        assert r.ok, r.text()
    return orig


def restore_sheet_state(pg, base: str, ws_id: str, orig: dict):
    for sid, (blocks, link_ok) in orig.items():
        r = pg.request.put(f"{base}/api/ws/{ws_id}/results/{sid}", data={"blocks": blocks, "link_ok": link_ok})
        assert r.ok, r.text()


def step_quick_review(pg, base: str, ctx: dict) -> str:
    """Task 3.2 (bước 1: khung): «▶ Soát nhanh» đi lần lượt qua mọi dòng cần soát của mọi mặt sổ."""
    def j(path):
        return pg.request.get(f"{base}{path}").json()

    ws_id = j("/api/ws")["workspaces"][0]["id"]
    sheets = j(f"/api/ws/{ws_id}")["sheets"]
    by_name = {x["name"]: x["id"] for x in sheets}
    s1, s2 = by_name[SAMPLE_SHEET_NAME], by_name[SHEET2_NAME]
    start = pg.locator("[data-testid=quick-start]")
    quick = pg.locator("[data-testid=quick-review]")
    progress = pg.locator("[data-testid=quick-progress]")

    def reload_to_workbench():
        pg.goto(f"{base}/")
        pg.locator('[data-tour="rail"] li').first.wait_for(timeout=15000)
        wait_until(lambda: pg.locator('[data-tour="rail"] li[data-need]').count() > 0, "cột trái có số cần soát")

    # ── Hồ sơ sạch: không có nút ──
    reload_to_workbench()
    assert start.count() == 0, "không còn dòng cần soát thì không có nút «Soát nhanh»"

    orig = break_sheet_state(pg, base, ws_id, s1, s2)
    try:
        reload_to_workbench()
        need = {sid: int(pg.locator('[data-tour="rail"] li', has_text=name).first.get_attribute("data-need") or 0)
                for sid, name in ((s1, SAMPLE_SHEET_NAME), (s2, SHEET2_NAME))}
        total = need[s1] + need[s2]
        assert need[s1] >= 1 and need[s2] >= 1, f"cần dòng cần soát ở cả hai mặt: {need}"
        start.wait_for(timeout=5000)
        assert start.inner_text().strip() == f"▶ Soát nhanh ({total})", start.inner_text()

        # ── Vào chế độ: thẻ một dòng, bắt đầu ở mặt sổ ĐẦU TIÊN có dòng cần soát ──
        start.click()
        quick.wait_for(timeout=5000)
        wait_until(lambda: f"Dòng 1/{total} · Mặt「{SAMPLE_SHEET_NAME}」" in progress.inner_text(), "tiến độ dòng 1")
        wait_until(lambda: viewer_sheet(pg) == SAMPLE_SHEET_NAME, "ảnh giữa là mặt ①")
        assert start.count() == 0, "đang soát nhanh thì nút bắt đầu biến mất"

        # ── n: bỏ qua/đi tới — qua hết mặt ① rồi sang mặt ②, ảnh giữa đổi theo ──
        seen = [progress.inner_text().strip()]
        for _ in range(total - 1):
            pg.keyboard.press("n")
            wait_until(lambda: progress.inner_text().strip() != seen[-1], "n sang dòng kế")
            seen.append(progress.inner_text().strip())
        assert seen[-1].startswith(f"Dòng {total}/{total}") and f"Mặt「{SHEET2_NAME}」" in seen[-1], seen
        wait_until(lambda: viewer_sheet(pg) == SHEET2_NAME, "sang mặt ② thì ảnh giữa đổi theo")
        pg.keyboard.press("n")                                               # quay vòng về dòng đầu
        wait_until(lambda: progress.inner_text().strip() == seen[0], "n ở dòng cuối thì quay vòng về dòng đầu")
        pg.keyboard.press("p")                                               # p: lùi — vòng ngược về dòng cuối
        wait_until(lambda: progress.inner_text().strip() == seen[-1], "p lùi một dòng (quay vòng)")
        pg.locator("[data-testid=quick-prev]").click()
        wait_until(lambda: progress.inner_text().strip() == seen[-2], "nút Quay lại")

        # ── Esc: thoát, bảng nhảy về ĐÚNG dòng đang xem ──
        pg.keyboard.press("Escape")
        quick.wait_for(state="detached", timeout=5000)
        wait_until(lambda: (focused(pg) or {}).get("state") == "review", "con trỏ vào ô của dòng đang xem trong bảng")
        assert start.count() == 1, "thoát rồi thì nút bắt đầu hiện lại"
        assert viewer_sheet(pg) == (SAMPLE_SHEET_NAME if total - 2 < need[s1] else SHEET2_NAME), viewer_sheet(pg)
    finally:
        restore_sheet_state(pg, base, ws_id, orig)
    reload_to_workbench()
    assert start.count() == 0
    return (f"hồ sơ sạch không có nút · còn {total} dòng ({need[s1]} ở mặt ①, {need[s2]} ở mặt ②) → «▶ Soát nhanh ({total})» · "
            "thẻ «Dòng k/N · Mặt…» · n/p/nút đi qua hai mặt sổ (ảnh giữa đổi theo, quay vòng) · Esc về đúng dòng trong bảng")


STEPS = [
    ("1. Đăng ký tài khoản", step_register),
    ("2. Bỏ qua hướng dẫn", step_skip_tour),
    ("3. Thử với sổ mẫu", step_sample),
    ("4. Sửa 残高 sai → bộ đếm tăng → Ctrl+Z", step_edit_undo),
    ("5. Xuất Excel", step_export),
    ("6. F5 vẫn còn kết quả", step_reload),
    ("7. Tải PDF sai chiều → tự xoay đúng", step_upload_rotated_pdf),
    ("8. Gõ ngày/số kiểu lạ → Excel không lỗi", step_manual_input),
    ("9. Ngôn ngữ theo trình duyệt", step_language_from_browser),
    ("10. rid bền + orig sống qua F5", step_orig_survives_reload),
    ("11. Dòng vàng thật + ✓ (một định nghĩa 'cần soát')", step_review_definition),
    ("12. ↺, Ctrl+Enter, xác nhận cả mặt, chèn dòng đúng chỗ", step_review_actions),
    ("13. Lý do tiếng Việt + gợi ý sửa một chạm", step_fix_suggestions),
    ("14. Soát xong → xuất Excel không còn ô vàng", step_export_confirmed),
    ("15. Chỗ nối số dư giữa các mặt sổ", step_sheet_links),
    ("16. Hai ảnh chụp cùng một trang", step_duplicate_pages),
    ("17. Danh sách hồ sơ", step_cases),
    ("18. Sửa thông tin sổ", step_book_info),
    ("19. Tóm tắt trước khi xuất + xuất theo tài khoản", step_export_summary),
    ("20. Cài đặt theo tài khoản", step_settings),
    ("21. Soát nhanh", step_quick_review),
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
