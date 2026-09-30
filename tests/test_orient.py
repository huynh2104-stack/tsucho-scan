"""Tự nhận hướng trang: luật bỏ phiếu (thuần) + một lượt thử bằng bộ đọc chữ thật."""

import pytest
from PIL import Image, ImageDraw, ImageFont

from api import autoprep, ocrengine, orient

LONG = 1000.0
DAI = 0.10 * LONG        # một dòng chữ dài 10% cạnh dài


def dong(tall=False, flipped=False, length=DAI, ratio=6.0):
    return {"tall": tall, "flipped": flipped, "length": length, "ratio": ratio, "score": 0.9}


def nhieu(n, **kw):
    return [dong(**kw) for _ in range(n)]


# ── Luật bỏ phiếu ────────────────────────────────────────────────────

def test_trang_dung_chieu_khong_can_xoay():
    o = orient.decide(nhieu(20), LONG)
    assert (o.rotate, o.sure) == (0, True)


def test_trang_lon_nguoc_180():
    o = orient.decide(nhieu(20, flipped=True) + nhieu(2), LONG)
    assert (o.rotate, o.sure) == (180, True)


@pytest.mark.parametrize("flipped, can_xoay", [(False, 270), (True, 90)])
def test_trang_nam_ngang(flipped, can_xoay):
    # Dòng dọc đọc từ TRÊN xuống (xuôi sau khi RapidOCR xoay hộp) → phải xoay 270 CW mới đứng;
    # đọc từ dưới lên → xoay 90 CW.
    o = orient.decide(nhieu(30, tall=True, flipped=flipped) + nhieu(3), LONG)
    assert (o.rotate, o.sure) == (can_xoay, True)


def test_it_dong_thi_khong_du_chac_de_xoay():
    o = orient.decide(nhieu(6, tall=True), LONG)
    assert o.rotate == 270 and not o.sure         # 6 < MIN_LINES_TURN


def test_phieu_giang_co_thi_khong_du_chac():
    o = orient.decide(nhieu(14, tall=True) + nhieu(8, flipped=True), LONG)
    assert o.rotate == 270 and not o.sure         # 14 / 8 = 1.75 < RATIO_TURN


def test_khong_xoay_thi_luon_chac_du_it_dong():
    # Không xoay thì không có gì để nhầm: trang bìa vài dòng vẫn được coi là "đúng chiều"
    o = orient.decide(nhieu(3) + nhieu(1, flipped=True), LONG)
    assert (o.rotate, o.sure) == (0, True)


def test_hop_ngan_hoac_vuong_bi_bo_qua():
    ngan = nhieu(30, tall=True, length=0.02 * LONG)                      # ngắn hơn 3% cạnh dài
    vuong = nhieu(30, tall=True, ratio=1.1)                              # gần vuông: không phải dòng chữ
    assert orient.decide(ngan, LONG).lines == 0
    assert orient.decide(vuong, LONG).lines == 0


# ── Bộ đọc chữ thật (bỏ qua nếu máy chưa cài RapidOCR) ───────────────

def trang_chu():
    """Trang giả sổ ngân hàng: nhiều dòng ngày + số tiền, chữ đủ to để bộ dò thấy."""
    img = Image.new("RGB", (1200, 900), "white")
    d = ImageDraw.Draw(img)
    font = ImageFont.load_default(size=30)
    for i in range(16):
        y = 60 + i * 50
        d.text((60, y), f"07-04-{11 + i:02d}  R  TRANSFER {i + 1}", fill="black", font=font)
        d.text((760, y), f"{(i + 3) * 12345:,}", fill="black", font=font)
        d.text((1000, y), f"{(i + 9) * 98765:,}", fill="black", font=font)
    return img


@pytest.mark.skipif(ocrengine.engine() is None, reason="chưa cài RapidOCR")
@pytest.mark.parametrize("can_xoay", [0, 90, 180, 270])
def test_nhan_dung_huong_tren_trang_that(can_xoay):
    dung = trang_chu()
    # Làm cho trang cần xoay `can_xoay` độ CW mới đứng: xoay nó ngược lại `can_xoay` độ
    lech = autoprep.turn(dung, (360 - can_xoay) % 360)
    o = orient.detect(lech)
    assert o is not None and o.sure
    assert o.rotate == can_xoay, f"đoán {o.rotate}, phiếu {o.votes}"


def test_tat_bo_doc_thi_tra_none(monkeypatch):
    monkeypatch.setenv("TSUCHO_LOCAL_OCR", "0")
    assert orient.detect(trang_chu()) is None
