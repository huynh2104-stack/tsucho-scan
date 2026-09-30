"""Khung cắt gọn: ôm sát phần nội dung, bỏ vệt máy scan và đốm bụi, không đụng ảnh chụp."""

import numpy as np
import pytest

pytest.importorskip("cv2")

from api import pagecrop  # noqa: E402


def trang(w=800, h=1100, block=(150, 250, 650, 850), strip=True, specks=True):
    """Trang trắng có một khối 'chữ' (gạch ngang đậm), vệt máy scan và vài đốm bụi."""
    g = np.full((h, w), 255, np.uint8)
    x0, y0, x1, y1 = block
    for y in range(y0, y1, 14):
        g[y:y + 5, x0:x1] = 60
    if strip:
        g[20:h - 20, 15:40] = 10            # cách mép 15px, dài gần hết trang, rộng 25px
    if specks:
        g[h - 30:h - 27, w - 40:w - 37] = 0
        g[500:503, 60:63] = 0
    return g


def test_khung_om_sat_khoi_noi_dung_va_bo_vet_may_scan():
    l, t, r, b = pagecrop.content_box(trang())
    assert 0.12 < l < 0.19                   # khối bắt đầu ở x=150/800 ≈ 0.19, trừ lề; vệt (x<0.05) bị bỏ
    assert 0.78 < r < 0.86
    assert 0.18 < t < 0.24 and 0.74 < b < 0.82


def test_dom_bui_o_goc_khong_keo_khung_ra():
    with_specks = pagecrop.content_box(trang(specks=True))
    without = pagecrop.content_box(trang(specks=False))
    assert with_specks == without


def test_khung_khong_cat_vao_noi_dung():
    g = trang(specks=False)
    l, t, r, b = pagecrop.content_box(g)
    h, w = g.shape
    ink = g < 128
    ink[:, :45] = False                       # bỏ vệt máy scan (x từ 15 đến 40): không phải nội dung
    ys, xs = np.nonzero(ink)
    assert l * w <= xs.min() and r * w >= xs.max() and t * h <= ys.min() and b * h >= ys.max()


def test_trang_trang_hoac_chi_co_vet_thi_khong_cat():
    assert pagecrop.content_box(np.full((1000, 700), 255, np.uint8)) is None
    assert pagecrop.content_box(trang(block=(0, 0, 0, 0), specks=False)) is None


def test_noi_dung_gan_het_trang_thi_khong_cat():
    assert pagecrop.content_box(trang(block=(10, 10, 790, 1090), strip=False, specks=False)) is None


def test_chi_anh_phang_moi_duoc_cat():
    assert pagecrop.is_flat(trang())
    rng = np.random.default_rng(1)
    anh_chup = rng.integers(20, 120, (1000, 700), dtype=np.uint8)     # nền bàn tối, lộn xộn
    anh_chup[200:800, 150:550] = 240                                  # tờ giấy ở giữa
    assert not pagecrop.is_flat(anh_chup)
