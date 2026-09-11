"""Dải dòng ước lượng từ ảnh (api/rowmap.py).

Mỗi test dựng một ảnh giả tái hiện MỘT ca hỏng đã gặp trên ảnh sổ thật —
tái phát là đỏ ngay.

Ảnh SCAN (31/07/2026):
- dòng cách đều + khoảng trắng giữa trang (nếp gấp)  → phải khớp 1-1
- nhịp dòng bị bắt thành bội số (21px đọc thành 42px) → dò cách dòng
- tựa + tiêu đề cột đậm mực ở đầu trang              → cửa sổ vơ tiêu đề
- chú thích in nhỏ nép dưới viền đáy bảng            → chiếm chỗ dòng thật

Ảnh CHỤP ĐIỆN THOẠI (01/08/2026) — người dùng báo sai gần 100%:
- nền bàn tối quanh cuốn sổ                          → nền bị tính là mực
- bóng tay làm nửa trang tối hơn                     → cắt mất nửa trang
- sổ đặt nghiêng vài độ                              → nhoè hết đỉnh mực
- mặt sổ nằm ngang                                   → thu mất độ phân giải dọc
"""

import numpy as np
from PIL import Image, ImageDraw

from api import rowmap


def make_page(
    row_ys: list[int],
    w: int = 700,
    h: int = 1000,
    junk_top: list[int] = (),
    rule_ys: list[int] = (),
    footnote_ys: list[int] = (),
):
    """Ảnh trắng với các "dòng chữ" là chuỗi ô đen mô phỏng chữ in."""
    img = Image.new("L", (w, h), 245)
    dr = ImageDraw.Draw(img)

    def text_line(y: int, x0: int = 40, x1: int | None = None, hh: int = 12):
        x1 = x1 or w - 40
        x = x0
        while x < x1:                       # cụm chữ + khe trắng như chữ thật
            dr.rectangle([x, y, min(x + 26, x1), y + hh], fill=30)
            x += 34

    for y in row_ys:
        text_line(y)
    for y in junk_top:
        text_line(y, hh=14)                 # tựa / tiêu đề: đậm hơn chút
    for y in rule_ys:
        dr.rectangle([10, y, w - 10, y + 2], fill=10)   # đường kẻ liền
    for y in footnote_ys:
        text_line(y, hh=6)                  # chú thích in nhỏ
    return img


def rows_even(y0: int, n: int, pitch: int) -> list[int]:
    return [y0 + i * pitch for i in range(n)]


def centers(res: dict) -> list[float]:
    return [(b["y0"] + b["y1"]) / 2 for b in res["bands"]]


def assert_hits(res: dict, row_ys: list[int], h: int, pitch: int):
    """Tâm mỗi dải phải rơi trúng dòng tương ứng (lệch < nửa nhịp)."""
    assert res["exact"], "phải dò được, không được chia đều"
    tol = (pitch / 2) / h
    for c, y in zip(centers(res), row_ys):
        want = (y + 6) / h                  # +6: giữa chiều cao dòng chữ
        assert abs(c - want) < tol, f"dải {c:.3f} lệch khỏi dòng {want:.3f}"


def test_dong_deu_va_nep_gap_giua_trang():
    """Hai nửa trang cách nhau khoảng trắng lớn — dải không được đè lên nếp gấp."""
    top = rows_even(60, 12, 30)
    bottom = rows_even(560, 12, 30)
    img = make_page(top + bottom)
    assert_hits(rowmap.bands_for(img, 24), top + bottom, 1000, 30)


def test_khong_bat_nham_boi_so_nhip():
    """Nhịp 21px từng bị đọc thành 42px → chỉ tìm thấy nửa số dòng."""
    rows = rows_even(100, 20, 21)
    img = make_page(rows)
    assert_hits(rowmap.bands_for(img, 20), rows, 1000, 21)


def test_loai_tua_va_tieu_de_dau_trang():
    """Tựa + hàng tiêu đề có gạch chân — dòng ĐẦU dữ liệu phải có dải riêng.

    Đây là ca 'lệch một dòng': cửa sổ vơ tiêu đề thì mọi cú click đều khoanh
    nhầm sang dòng bên cạnh.
    """
    rows = rows_even(160, 20, 30)
    img = make_page(rows, junk_top=[40, 90], rule_ys=[112])
    assert_hits(rowmap.bands_for(img, 20), rows, 1000, 30)


def test_loai_chu_thich_nep_duoi_vien_day():
    """Chú thích in nhỏ ngay dưới viền đáy bảng không được chiếm chỗ dòng thật."""
    rows = rows_even(100, 24, 30)
    bottom = rows[-1] + 12 + 8              # viền đáy sát dưới dòng cuối
    img = make_page(rows, rule_ys=[bottom], footnote_ys=[bottom + 10])
    assert_hits(rowmap.bands_for(img, 24), rows, 1000, 30)


def test_dong_that_duoi_vien_van_giu():
    """Dòng viết tay 新通帳に繰越 nằm DƯỚI viền nhưng cách cả nhịp — là dòng thật."""
    rows = rows_even(100, 20, 30)
    bottom = rows[-1] + 12 + 8
    note = bottom + 34                      # cách viền hơn một nhịp
    img = make_page(rows + [note], rule_ys=[bottom])
    assert_hits(rowmap.bands_for(img, 21), rows + [note], 1000, 30)


def test_thieu_dinh_thi_chia_deu_theo_khoi():
    """Ảnh mờ không dò nổi → chia đều nhưng THEO KHỐI, không đè nếp gấp trắng.

    "Chữ" là nhiễu chấm KHÔNG THEO NHỊP (mô phỏng viết tay nguệch ngoạc) —
    tuyệt đối không tô đặc cả khối: giấy sổ thật đa phần trắng, tô đặc quá nửa
    trang làm ngưỡng mực thích nghi (so với median) mất chuẩn.
    """
    import random

    rng = random.Random(7)
    img = Image.new("L", (700, 1000), 245)
    dr = ImageDraw.Draw(img)
    for y0, y1 in ((50, 380), (620, 950)):         # hai khối, nếp gấp ở giữa
        for _ in range(900):
            x, y = rng.randint(40, 650), rng.randint(y0, y1 - 4)
            dr.rectangle([x, y, x + rng.randint(2, 9), y + rng.randint(1, 3)], fill=30)
    res = rowmap.bands_for(img, 20)
    assert not res["exact"]
    assert len(res["bands"]) == 20
    # Không dải nào rơi vào khoảng trắng 380..620
    for c in centers(res):
        assert not (0.40 < c < 0.60), f"dải {c:.3f} nằm giữa nếp gấp trắng"


# ── Ảnh CHỤP bằng điện thoại (bản 3) ─────────────────────────────────

def photo(rows, w=700, h=1000, bg=None, skew=0.0, shade=False, margin=60):
    """Ảnh mô phỏng ảnh chụp: có nền quanh tờ giấy, có thể nghiêng / loang sáng."""
    img = Image.new("RGB", (w, h), (18, 18, 22) if bg else (245, 245, 245))
    page = Image.new("RGB", (w - 2 * margin, h - 2 * margin), (232, 230, 226))
    dr = ImageDraw.Draw(page)
    pw = page.width
    for y in rows:
        yy = y - margin
        x = 30
        while x < pw - 30:
            # nghiêng: dòng chữ trôi dần theo bề ngang
            dy = int(x * skew)
            dr.rectangle([x, yy + dy, min(x + 26, pw - 30), yy + dy + 11], fill=(70, 60, 60))
            x += 34
    img.paste(page, (margin, margin))

    if shade:                      # bóng tay đổ xuống nửa dưới
        a = np.asarray(img, dtype=np.float32)
        a[h // 2:] *= 0.55
        img = Image.fromarray(a.astype(np.uint8))
    return img


def test_nen_toi_quanh_to_giay_khong_lam_hong():
    """Ảnh chụp trên bàn tối: nền KHÔNG được tính là mực.

    Đây là ca ゆうちょ — bản 2 dồn cả 21 dải vào nửa dưới trang.
    """
    rows = rows_even(140, 20, 34)
    res = rowmap.bands_for(photo(rows, bg=True), 20)
    assert res["exact"]
    cs = [c * 1000 for c in centers(res)]
    for c, y in zip(cs, rows):
        assert abs(c - (y + 5)) < 20, f"dải {c:.0f} lệch khỏi dòng {y}"


def test_bong_tay_lam_toi_nua_trang():
    """Nửa trang bị bóng che vẫn phải nhận đủ dòng của CẢ HAI nửa.

    Bản đầu của `_page_box` so sáng với mức giữa min–max nên cắt phăng nửa
    sáng hơn, dồn hết dải vào nửa còn lại.
    """
    rows = rows_even(120, 24, 34)
    res = rowmap.bands_for(photo(rows, shade=True), 24)
    cs = [c for c in centers(res)]
    assert min(cs) < 0.35, "không có dải nào ở nửa trên → đã cắt mất nửa trang"
    assert max(cs) > 0.65, "không có dải nào ở nửa dưới"


def test_so_dat_nghieng():
    """Sổ chụp nghiêng ~2° vẫn dò được dòng (nhờ khử nghiêng)."""
    rows = rows_even(140, 20, 34)
    res = rowmap.bands_for(photo(rows, skew=0.035), 20)
    assert res["exact"], "nghiêng nhẹ mà đã phải chia đều"
    assert res["skew_deg"] > 0.5, f"không đo ra độ nghiêng: {res['skew_deg']}"


def test_anh_nam_ngang_khong_bi_thu_mat_do_phan_giai():
    """Mặt sổ nằm ngang (rộng gấp 2.5 lần cao) vẫn dò được.

    Bản 2 ép bề ngang về 700px nên ảnh 2900×1160 chỉ còn cao 280px — 24 dòng
    trong 280px thì không còn đỉnh mực nào.
    """
    rows = [140 + i * 34 for i in range(24)]
    img = photo(rows, w=1000, h=1000).resize((2900, 1160))
    res = rowmap.bands_for(img, 24)
    assert res["exact"]


def test_khong_bao_gio_tra_dai_ngoai_khung():
    for n in (1, 5, 24):
        res = rowmap.bands_for(photo(rows_even(140, n, 34), bg=True), n)
        assert len(res["bands"]) == n
        for b in res["bands"]:
            assert 0.0 <= b["y0"] <= b["y1"] <= 1.0, b


def test_bien_dang_va_anh_rong():
    assert rowmap.bands_for(Image.new("L", (700, 1000), 245), 0)["bands"] == []
    tiny = rowmap.bands_for(Image.new("L", (50, 10), 245), 5)
    assert len(tiny["bands"]) == 5 and not tiny["exact"]
    blank = rowmap.bands_for(Image.new("L", (700, 1000), 245), 7)
    assert len(blank["bands"]) == 7


# ── Ca đo được trên ảnh thật, 11/09/2026 ────────────────────────────

def test_dinh_rac_o_nep_gap_khong_lam_lech_ca_trang():
    """Vệt mờ ở nếp gấp + mép giấy dưới cùng → phải bỏ ĐÚNG chúng, không cắt đầu.

    Ca thật `SCAN0000_page-0001`: 27 đỉnh cho 24 dòng, ba đỉnh thừa là hai vệt
    mờ hai bên nếp gấp và đường mép giấy ở đáy. Bản cũ cắt 3 đỉnh ĐẦU (dòng dữ
    liệu thật) nên click dòng 1 lại khoanh vào dòng 4 — cả trang lệch 3 bậc.
    """
    top = rows_even(40, 12, 26)
    bottom = rows_even(420, 12, 26)
    rows = top + bottom
    img = make_page(rows, h=760)
    dr = ImageDraw.Draw(img)
    # hai vệt MỜ hai bên nếp gấp (xám nhạt, không phải chữ)
    for y in (366, 400):
        for x in range(60, 640, 40):
            dr.rectangle([x, y, x + 18, y + 5], fill=205)
    # mép giấy: đường kẻ liền sát đáy
    dr.rectangle([10, 752, 690, 754], fill=10)

    assert_hits(rowmap.bands_for(img, 24), rows, 760, 26)


def test_dong_dai_ngan_xen_ke_khong_lam_nhip_gap_doi():
    """Sổ ゆうちょ: dòng 料金 ngắn, mảnh, nép bên phải, xen giữa các dòng dài.

    Lượng mực khi ấy lặp theo chu kỳ HAI dòng, nên tự tương quan mạnh nhất ở
    2×nhịp. Bản cũ lấy luôn 2× rồi `_peaks` gạt mất một nửa số dòng — cả 4 mặt
    sổ dính lỗi này đều tụt xuống chế độ chia đều (đoán). Đo lại trên ảnh giả
    này: nhịp cũ ra 53px, nhịp đúng là 28px.
    """
    pitch = 28
    rows = rows_even(60, 22, pitch)
    img = Image.new("L", (700, 60 + 22 * pitch + 80), 245)
    dr = ImageDraw.Draw(img)
    for i, y in enumerate(rows):
        dai = i % 2 == 0
        x, x1 = (40, 660) if dai else (430, 620)   # 料金 nép sát cột tiền
        hh = 12 if dai else 7                       # và in nhỏ hơn
        while x < x1:
            dr.rectangle([x, y, min(x + 26, x1), y + hh], fill=30)
            x += 34

    assert_hits(rowmap.bands_for(img, len(rows)), rows, img.height, pitch)


def test_dong_bieu_mau_in_muc_mau_khong_bi_tinh_la_dong():
    """Tiêu đề cột + chú thích in bằng MỰC MÀU của biểu mẫu, dữ liệu in mực ĐEN.

    Ca thật `so-yucho-dep`: hàng tiêu đề「年月日 取扱店 …」có lượng mực, vị trí
    cột số dư và cả cột số thứ tự ở mép **y hệt một dòng dữ liệu** — đo cả ba
    tín hiệu đó đều không tách nổi, nên nó chiếm mất dải của dòng 01, đẩy cả
    trang lệch. Chỉ có màu mực tách được: biểu mẫu in hồng/đỏ, còn máy in kim
    in dữ liệu bằng mực đen.
    """
    pitch = 26
    rows = rows_even(150, 20, pitch)             # dữ liệu: mực ĐEN
    img = Image.new("RGB", (700, 1000), (245, 243, 240))
    dr = ImageDraw.Draw(img)

    def ke_dong(y: int, mau: tuple[int, int, int], hh: int = 12):
        x = 40
        while x < 660:
            dr.rectangle([x, y, min(x + 26, 660), y + hh], fill=mau)
            x += 34

    HONG = (214, 122, 132)                       # mực biểu mẫu
    DEN = (32, 32, 34)                           # mực máy in kim
    for y in (98, 124):                          # tựa + hàng tiêu đề cột
        ke_dong(y, HONG)
    for y in rows:
        ke_dong(y, DEN)
    for y in (rows[-1] + pitch, rows[-1] + 2 * pitch):   # chú thích chân trang
        ke_dong(y, HONG)

    assert_hits(rowmap.bands_for(img, len(rows)), rows, 1000, pitch)
