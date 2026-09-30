"""Lập kế hoạch tự chỉnh: gộp nhận hướng + cắt gọn, và luật "theo đa số của cả file"."""

import numpy as np
from PIL import Image

from api import autoprep, orient


def plan(detected=270, sure=True, lines=90, checked=True):
    return autoprep.Plan(rotate=detected if sure else 0, detected=detected, sure=sure,
                         lines=lines, checked=checked)


# ── Đa số của cả file ────────────────────────────────────────────────

def test_da_so_lay_theo_cac_trang_manh():
    trang = [plan(270)] * 5 + [plan(0, lines=10)]        # bìa ít chữ không được bỏ phiếu
    assert autoprep.consensus(trang) == 270


def test_khong_du_trang_manh_thi_khong_co_da_so():
    assert autoprep.consensus([plan(270), plan(270)]) is None            # chỉ 2 trang mạnh
    assert autoprep.consensus([plan(270, sure=False)] * 6) is None       # không chắc thì không tính
    assert autoprep.consensus([plan(270, checked=False)] * 6) is None    # chưa kiểm được


def test_khong_dong_thuan_thi_khong_co_da_so():
    assert autoprep.consensus([plan(270)] * 3 + [plan(90)] * 3) is None  # 50/50 < 70%
    assert autoprep.consensus([plan(270)] * 7 + [plan(90)] * 3) == 270   # đúng 70%


def test_file_von_da_dung_chieu_thi_da_so_la_0():
    assert autoprep.consensus([plan(0)] * 4) == 0


def test_trang_yeu_chi_theo_khi_chinh_no_cung_nghieng_ve_huong_do():
    yeu = plan(270, sure=False, lines=10)
    assert autoprep.should_follow(yeu, 270)
    assert not autoprep.should_follow(plan(90, sure=False, lines=10), 270)   # nghiêng về hướng khác
    assert not autoprep.should_follow(plan(0, sure=True, lines=9), 270)      # bìa: chắc là 0, không kéo
    assert not autoprep.should_follow(yeu, None) and not autoprep.should_follow(yeu, 0)


# ── analyze ──────────────────────────────────────────────────────────

def anh_phang(w=900, h=600, block=(500, 100, 800, 500)):
    """Trang scan ngang, phần chữ dồn về bên phải."""
    a = np.full((h, w), 255, np.uint8)
    x0, y0, x1, y1 = block
    for y in range(y0, y1, 12):
        a[y:y + 4, x0:x1] = 50
    return Image.fromarray(a).convert("RGB")


def test_cat_tinh_tren_anh_da_xoay(monkeypatch):
    img = anh_phang()
    monkeypatch.setattr(orient, "detect", lambda im: orient.Orientation(90, True, 9.0, 60, {}))
    p = autoprep.analyze(img)
    assert p.rotate == 90 and p.checked and p.flat and p.box is not None
    # Khung phải khớp với khung tính thẳng trên ảnh ĐÃ xoay, không phải ảnh gốc
    from api import pagecrop

    xoay = autoprep.turn(orient.shrink(img.convert("RGB")), 90)
    assert p.box == pagecrop.content_box(np.asarray(xoay.convert("L")))


def test_khong_chac_thi_khong_xoay_nhung_van_cat(monkeypatch):
    monkeypatch.setattr(orient, "detect", lambda im: orient.Orientation(270, False, 1.7, 14, {}))
    p = autoprep.analyze(anh_phang())
    assert p.rotate == 0 and p.detected == 270 and not p.sure and p.box is not None


def test_khong_co_bo_doc_thi_bo_qua_buoc_huong(monkeypatch):
    monkeypatch.setattr(orient, "detect", lambda im: None)
    p = autoprep.analyze(anh_phang())
    assert p.rotate == 0 and not p.checked and p.box is not None


def test_xoay_cho_truoc_thi_khong_hoi_bo_doc(monkeypatch):
    def cam(_):
        raise AssertionError("không được nhận hướng lại khi đã cho sẵn góc xoay")
    monkeypatch.setattr(orient, "detect", cam)
    assert autoprep.analyze(anh_phang(), rotate=270).rotate == 270


def test_anh_chup_khong_bi_cat(monkeypatch):
    monkeypatch.setattr(orient, "detect", lambda im: orient.Orientation(0, True, 9.0, 60, {}))
    rng = np.random.default_rng(3)
    anh = Image.fromarray(rng.integers(20, 120, (800, 600), dtype=np.uint8)).convert("RGB")
    p = autoprep.analyze(anh)
    assert not p.flat and p.box is None


def test_turn_khong_mat_diem_anh():
    img = anh_phang(300, 200)
    for k in (90, 180, 270):
        assert autoprep.turn(autoprep.turn(img, k), 360 - k).tobytes() == img.tobytes()
    assert autoprep.turn(img, 90).size == (200, 300)
