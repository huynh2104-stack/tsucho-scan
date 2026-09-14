# -*- coding: utf-8 -*-
"""Chụp ảnh màn hình thật của ứng dụng để dùng cho trang giới thiệu.

Vì sao phải có script này thay vì chụp tay: trang giới thiệu khoe "đây là
màn hình thật", nên ảnh phải chụp lại được bất cứ lúc nào giao diện đổi.
Chụp tay thì lần sau kích thước khác, chủ đề khác, và không ai nhớ đã bấm
gì để ra được cảnh đó.

QUAN TRỌNG — CHE TÊN KHÁCH HÀNG
    Dữ liệu mẫu trong máy phát triển là sổ ngân hàng THẬT của một khách
    hàng thật. Tên pháp nhân của họ hiện trong danh sách mặt sổ. Trang
    giới thiệu là trang công khai, nên script đổi MỌI tên pháp nhân
    (有限会社… / 株式会社…) thành một tên mẫu TRƯỚC KHI bấm chụp.

    Cố ý dùng biểu thức chung chứ không viết thẳng tên thật vào đây: mã
    nguồn cũng công khai, viết tên vào thì che ảnh mà hở mã.

    Ảnh cuốn sổ vẫn là sổ thật — số tiền phải thật thì chuỗi số dư mới
    cộng đúng, và đó chính là điều trang này chứng minh.

Cần có trước khi chạy:
    · ứng dụng chạy ở http://localhost:8000 (xem .claude/launch.json)
    · pip install playwright pillow  &&  python -m playwright install chromium
    · một tài khoản đã quét sẵn vài mặt sổ

Chạy:
    python tsucho-scan-homepage/tools/chup-anh-man-hinh.py
"""
from __future__ import annotations

import os
import sys
import time

try:
    from PIL import Image
    from playwright.sync_api import sync_playwright
except ImportError:
    sys.exit("Thiếu thư viện. Chạy: pip install playwright pillow")

URL = os.environ.get("TSUCHO_URL", "http://localhost:8000/")
EMAIL = os.environ.get("TSUCHO_EMAIL", "user01@gmail.com")
MATKHAU = os.environ.get("TSUCHO_PASSWORD", "")
MAT_SO = os.environ.get("TSUCHO_SHEET", "11111111111111")

GOC = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
RA = os.path.join(GOC, "public", "shots")
TAM = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".tam")

# Chụp ở đúng tỉ lệ 16:10 của máy tính xách tay, gấp đôi độ phân giải cho nét.
KHUNG = {"width": 1920, "height": 1200}

TEN_MAU = "有限会社みなと工業"

# Đổi mọi tên pháp nhân thành tên mẫu. Không viết tên thật vào đây.
CHE_TEN = """(tenMau)=>{
  const re = /(有限会社|株式会社|合同会社)[^\\s（(・：:]{1,10}/g;
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const can = [];
  while (w.nextNode()) if (re.test(w.currentNode.nodeValue)) { re.lastIndex = 0; can.push(w.currentNode); }
  can.forEach(n => { n.nodeValue = n.nodeValue.replace(re, tenMau); });
  return can.length;
}"""


def tat_huong_dan(pg) -> None:
    """Gỡ lớp phủ hướng dẫn 7 bước.

    Trình duyệt sạch thì chưa có khoá localStorage nào để đánh dấu "đã xem",
    mà khoá ấy lại gắn mã người dùng nên không đoán trước được. Gỡ thẳng nút
    gốc ra khỏi DOM là cách chắc chắn và không phụ thuộc ngôn ngữ giao diện.
    Phải gọi lại sau MỖI lần tải lại trang.
    """
    pg.evaluate(
        """()=>{ document.querySelectorAll('[role=dialog][aria-labelledby=tour-title]')
                  .forEach(e => e.remove()); }"""
    )
    time.sleep(0.4)


def chuan_bi(pg, chu_de: str) -> None:
    """Tắt hướng dẫn 7 bước, đặt tiếng Nhật và chủ đề sáng/tối."""
    pg.evaluate(
        """([chuDe])=>{
        for (const k of Object.keys(localStorage)) {
          if (k.startsWith('tsucho.tour.')) localStorage.setItem(k, '1');
        }
        localStorage.setItem('tsucho.lang', 'ja');
        localStorage.setItem('tsucho.theme', chuDe);
      }""",
        [chu_de],
    )


def mo_mat_so(pg) -> None:
    """Chọn một mặt sổ rồi bấm một dòng, để vệt đỏ hiện trên ảnh."""
    o = pg.locator(f"text={MAT_SO}").first
    if o.count():
        o.click()
        time.sleep(3)
    hang = pg.locator("tr[data-row]")
    if hang.count() > 4:
        hang.nth(3).click()
        time.sleep(2)


def cat(nguon: str, hop: tuple[int, int, int, int], ten: str, rong: int, chat=84) -> None:
    anh = Image.open(os.path.join(TAM, nguon + ".png")).crop(hop)
    anh = anh.resize((rong, round(anh.height * rong / anh.width)), Image.LANCZOS)
    duong = os.path.join(RA, ten + ".webp")
    anh.save(duong, "WEBP", quality=chat, method=6)
    print(f"  {ten:<18} {anh.width}×{anh.height}  {os.path.getsize(duong) // 1024} KB")


def main() -> int:
    if not MATKHAU:
        sys.exit("Đặt mật khẩu qua biến môi trường TSUCHO_PASSWORD trước khi chạy.")
    os.makedirs(RA, exist_ok=True)
    os.makedirs(TAM, exist_ok=True)

    with sync_playwright() as p:
        trinh_duyet = p.chromium.launch()
        ngu_canh = trinh_duyet.new_context(
            viewport=KHUNG, device_scale_factor=2, locale="ja-JP"
        )
        pg = ngu_canh.new_page()
        pg.goto(URL, wait_until="networkidle")
        chuan_bi(pg, "dark")

        if pg.locator("input[type=email]").count():
            pg.fill("input[type=email]", EMAIL)
            pg.fill("input[type=password]", MATKHAU)
            pg.click("button[type=submit]")
            pg.wait_for_load_state("networkidle")
            time.sleep(4)
        tat_huong_dan(pg)

        print("Chụp màn hình…")
        for chu_de, ten in [("dark", "nen-toi"), ("light", "nen-sang")]:
            chuan_bi(pg, chu_de)
            pg.reload(wait_until="networkidle")
            time.sleep(3)
            tat_huong_dan(pg)
            mo_mat_so(pg)
            n = pg.evaluate(CHE_TEN, TEN_MAU)
            time.sleep(0.6)
            pg.screenshot(path=os.path.join(TAM, ten + ".png"))
            print(f"  {ten}: đã che {n} chỗ có tên pháp nhân")

        # Hai cảnh không cắt ra được từ màn hình chính.
        #
        # Thứ tự có lý do: chụp hộp thoại xuất file TRƯỚC, nắn phối cảnh SAU.
        # Vào chế độ nắn phối cảnh là thanh công cụ đổi sang「補正を適用 /
        # キャンセル」và lớp kéo bốn góc phủ lên vùng ảnh, khiến nút 出力
        # không bấm được nữa. Làm ngược lại thì kẹt.
        pg.locator("button:has-text('出力')").last.click()
        time.sleep(2.5)
        pg.evaluate(CHE_TEN, TEN_MAU)
        pg.screenshot(path=os.path.join(TAM, "xuat-file.png"))
        pg.locator("button:has-text('キャンセル')").last.click()
        time.sleep(1.5)

        pg.locator("button:has-text('台形補正')").first.click()
        time.sleep(2.5)
        pg.evaluate(CHE_TEN, TEN_MAU)
        pg.screenshot(path=os.path.join(TAM, "nan-phoi-canh.png"))

        ngu_canh.close()
        trinh_duyet.close()

    print("Cắt ảnh cho web…")
    # Ảnh màn hình đầy đủ: bản SÁNG hợp tông giấy của trang hơn bản tối
    cat("nen-sang", (0, 0, 3840, 2400), "app-light", 2200, 80)
    # Năm bước đều 4:3 — chúng chồng lên nhau trong một khung ở #how
    cat("nen-sang", (10, 90, 570, 510), "step-1-import", 880)
    cat("nan-phoi-canh", (600, 596, 2080, 1706), "step-2-straighten", 880)
    cat("nen-sang", (2085, 100, 3245, 970), "step-3-scan", 880)
    cat("nen-sang", (820, 700, 1820, 1450), "step-4-fix", 1000)
    cat("xuat-file", (1053, 553, 2787, 1853), "step-5-export", 1100)

    print(f"\nXong. Ảnh nằm ở {RA}")
    print("Nhớ mở từng tấm xem bằng mắt trước khi commit — không còn tên thật nào.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
