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
    "download": "Xuất file tải về",              # expDownload
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
