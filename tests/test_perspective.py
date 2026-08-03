"""Nắn phối cảnh: kéo 4 góc / thanh trượt dọc–ngang.

Ảnh chụp sổ bằng điện thoại cầm chếch xuống thì trang ra HÌNH THANG — dòng ở xa
xích lại gần nhau. Xoay ảnh không cứu được vì đó là biến dạng phối cảnh.
"""

import numpy as np
import pytest
from PIL import Image, ImageDraw

from api import workspace


@pytest.fixture
def ws(tmp_path, monkeypatch):
    monkeypatch.setattr(workspace, "DATA_DIR", tmp_path)
    monkeypatch.setattr(workspace, "WS_DIR", tmp_path / "ws")
    monkeypatch.setattr(workspace, "_cache", {})
    return workspace.create(owner="u1")


def ke_o(w=400, h=300, quad=None):
    """Ảnh có một khung chữ nhật đen; `quad` để vẽ nó thành hình thang."""
    img = Image.new("RGB", (w, h), (250, 250, 250))
    dr = ImageDraw.Draw(img)
    pts = quad or [(0, 0), (w - 1, 0), (w - 1, h - 1), (0, h - 1)]
    dr.line([*pts, pts[0]], fill=(20, 20, 20), width=3)
    return img


def them(ws, img) -> workspace.Sheet:
    import io

    buf = io.BytesIO()
    img.save(buf, "PNG")
    return workspace.add_upload(ws, "anh.png", buf.getvalue())[0]


def goc_khung(path) -> tuple[float, float, float, float]:
    """(trái, phải ở HÀNG TRÊN, trái, phải ở HÀNG DƯỚI) của vệt đen, theo tỉ lệ."""
    a = np.asarray(Image.open(path).convert("L"), dtype=np.float32)
    h, w = a.shape

    def be_rong(y: int) -> tuple[float, float]:
        toi = np.where(a[y] < 128)[0]
        return (toi[0] / w, toi[-1] / w) if len(toi) else (0.0, 0.0)

    t0, t1 = be_rong(int(h * 0.12))
    d0, d1 = be_rong(int(h * 0.88))
    return t0, t1, d0, d1


def test_nan_hinh_thang_thanh_chu_nhat(ws):
    """Khung hình thang → sau khi nắn, hàng trên và hàng dưới rộng bằng nhau."""
    w, h = 400, 300
    thang = [(80, 20), (320, 20), (390, 280), (10, 280)]   # trên hẹp, dưới rộng
    sheet = them(ws, ke_o(w, h, thang))

    t0, t1, d0, d1 = goc_khung(sheet.dir(ws.id) / "current.png")
    assert (t1 - t0) < (d1 - d0) * 0.75, "ảnh mẫu phải thật sự là hình thang"

    workspace.perspective(
        ws, sheet, [(x / w, y / h) for x, y in thang]
    )
    t0, t1, d0, d1 = goc_khung(sheet.dir(ws.id) / "current.png")
    tren, duoi = t1 - t0, d1 - d0
    assert abs(tren - duoi) < 0.08, f"nắn xong vẫn lệch: trên {tren:.3f} dưới {duoi:.3f}"


def test_giu_nguyen_khi_bon_goc_la_ca_anh(ws):
    """Kéo 4 góc đúng bằng khung ảnh thì ảnh gần như không đổi."""
    sheet = them(ws, ke_o())
    truoc = np.asarray(Image.open(sheet.dir(ws.id) / "current.png").convert("L"), np.float32)
    workspace.perspective(ws, sheet, [(0, 0), (1, 0), (1, 1), (0, 1)])
    sau = np.asarray(Image.open(sheet.dir(ws.id) / "current.png").convert("L"), np.float32)
    assert float(np.abs(truoc - sau).mean()) < 2.0


def test_danh_dau_da_chinh_va_bat_quet_lai(ws):
    sheet = them(ws, ke_o())
    sheet.scanned = True
    workspace.perspective(ws, sheet, [(0.1, 0.05), (0.9, 0.05), (1, 1), (0, 1)])
    assert sheet.warped and sheet.edited()
    assert not sheet.scanned, "ảnh đổi rồi thì kết quả cũ không còn khớp"


def test_hoan_tac_duoc(ws):
    sheet = them(ws, ke_o())
    truoc = (sheet.dir(ws.id) / "current.png").read_bytes()
    workspace.perspective(ws, sheet, [(0.2, 0.1), (0.8, 0.1), (1, 1), (0, 1)])
    assert (sheet.dir(ws.id) / "current.png").read_bytes() != truoc
    workspace.undo(ws, sheet)
    assert (sheet.dir(ws.id) / "current.png").read_bytes() == truoc


def test_ve_anh_goc_xoa_ca_nan_phoi_canh(ws):
    sheet = them(ws, ke_o())
    workspace.perspective(ws, sheet, [(0.2, 0.1), (0.8, 0.1), (1, 1), (0, 1)])
    workspace.reset_sheet(ws, sheet)
    assert not sheet.warped and not sheet.edited()


@pytest.mark.parametrize(
    "quad",
    [
        [(0.45, 0), (0.55, 0), (0.55, 1), (0.45, 1)],     # bẹp ngang
        [(0, 0.45), (1, 0.45), (1, 0.55), (0, 0.55)],     # bẹp dọc
    ],
)
def test_tu_giac_bet_bi_tu_choi(ws, quad):
    """Kéo nhầm 4 góc chụm lại thì báo lỗi, không đẻ ra ảnh vô nghĩa."""
    sheet = them(ws, ke_o())
    with pytest.raises(ValueError, match="quá hẹp"):
        workspace.perspective(ws, sheet, quad)


def test_doi_dung_bon_goc(ws):
    sheet = them(ws, ke_o())
    with pytest.raises(ValueError, match="4 góc"):
        workspace.perspective(ws, sheet, [(0, 0), (1, 0), (1, 1)])
