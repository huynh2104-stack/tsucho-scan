"""Dải dòng ước lượng từ ảnh (api/rowmap.py, bản 2).

Mỗi test dựng một ảnh giả tái hiện MỘT ca hỏng đã gặp trên ảnh sổ thật
(31/07/2026) — tái phát là đỏ ngay:

- dòng cách đều + khoảng trắng giữa trang (nếp gấp)  → phải khớp 1-1
- nhịp dòng bị bắt thành bội số (21px đọc thành 42px) → dò cách dòng
- tựa + tiêu đề cột đậm mực ở đầu trang              → cửa sổ vơ tiêu đề
- chú thích in nhỏ nép dưới viền đáy bảng            → chiếm chỗ dòng thật
"""

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


def test_bien_dang_va_anh_rong():
    assert rowmap.bands_for(Image.new("L", (700, 1000), 245), 0) == {
        "bands": [], "exact": False,
    }
    tiny = rowmap.bands_for(Image.new("L", (50, 10), 245), 5)
    assert len(tiny["bands"]) == 5 and not tiny["exact"]
    blank = rowmap.bands_for(Image.new("L", (700, 1000), 245), 7)
    assert len(blank["bands"]) == 7
