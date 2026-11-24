"""Ảnh gửi về trình duyệt là JPEG sinh lười (view.jpg / thumb.jpg), PNG vẫn là nguồn sự thật. $0."""

import io
import os

import pytest
from PIL import Image, ImageDraw

from api import imgjobs, workspace
from test_api_auth import client, register  # noqa: F401 — fixture dùng chung: CSDL tạm


def png_bytes(size=(300, 200)):
    img = Image.new("RGB", size, "white")
    ImageDraw.Draw(img).rectangle((60, 40, 240, 160), fill="black")
    buf = io.BytesIO()
    img.save(buf, "PNG")
    return buf.getvalue()


@pytest.fixture
def mat(client):
    """(ws_id, sheet_id, thư mục mặt sổ) của một mặt sổ đã nhập xong, người dùng đã đăng nhập."""
    register(client)
    ws = client.post("/api/ws").json()
    sheet = client.post(f"/api/ws/{ws['id']}/sheets?auto=false",
                        files={"files": ("so.png", png_bytes(), "image/png")}).json()["sheets"][0]
    imgjobs.wait_idle()
    return ws["id"], sheet["id"], workspace.WS_DIR / ws["id"] / sheet["id"]


def url(mat, thumb=False):
    return f"/api/ws/{mat[0]}/sheets/{mat[1]}/image" + ("?thumb=true" if thumb else "")


def dem_ma_hoa(monkeypatch):
    goi = []
    goc = workspace._encode_jpeg
    monkeypatch.setattr(workspace, "_encode_jpeg", lambda *a: (goi.append(a), goc(*a))[1])
    return goi


def test_jpeg_cung_kich_thuoc_diem_anh_voi_png(client, mat):
    r = client.get(url(mat))
    assert r.status_code == 200 and r.headers["content-type"] == "image/jpeg"
    with Image.open(mat[2] / "current.png") as png, Image.open(io.BytesIO(r.content)) as jpg:
        assert jpg.format == "JPEG" and jpg.size == png.size


def test_route_tra_jpeg_va_khong_cho_luu_lau(client, mat):
    r = client.get(url(mat))
    assert r.headers["cache-control"] == "private, no-cache"
    assert "immutable" not in r.headers["cache-control"] and "max-age" not in r.headers["cache-control"]
    assert r.headers.get("etag")


def test_xem_lai_voi_etag_nhan_304_va_chua_dang_nhap_nhan_401(client, mat):
    etag = client.get(url(mat)).headers["etag"]
    r = client.get(url(mat), headers={"If-None-Match": etag})
    assert r.status_code == 304 and r.content == b""
    client.post("/api/auth/logout")
    assert client.get(url(mat), headers={"If-None-Match": etag}).status_code == 401


def test_nguoi_khac_khong_xem_duoc(client, mat):
    client.post("/api/auth/logout")
    register(client, "khac@b.com")
    assert client.get(url(mat)).status_code == 404
    assert client.get(url(mat, True)).status_code == 404


def test_thumb_cung_la_jpeg(client, mat):
    r = client.get(url(mat, True))
    assert r.status_code == 200 and r.headers["content-type"] == "image/jpeg"
    assert (mat[2] / "thumb.jpg").is_file()
    with Image.open(mat[2] / "thumb.png") as png, Image.open(io.BytesIO(r.content)) as jpg:
        assert jpg.size == png.size


def test_lan_hai_khong_ma_hoa_lai(client, mat, monkeypatch):
    goi = dem_ma_hoa(monkeypatch)
    client.get(url(mat))
    client.get(url(mat))
    assert len(goi) == 1


def test_sua_png_thi_sinh_lai(client, mat, monkeypatch):
    client.get(url(mat))
    goi = dem_ma_hoa(monkeypatch)
    src = mat[2] / "current.png"
    Image.new("RGB", (120, 90), "gray").save(src)
    r = client.get(url(mat))
    assert len(goi) == 1
    with Image.open(io.BytesIO(r.content)) as jpg:
        assert jpg.size == (120, 90)


def test_khong_co_png_nguon_thi_404(client, mat):
    (mat[2] / "current.png").unlink()
    assert client.get(url(mat)).status_code == 404


def test_ma_hoa_loi_thi_tra_png_khong_phai_500(client, mat, monkeypatch):
    def hong(*a):
        raise OSError("đĩa đầy")
    monkeypatch.setattr(workspace, "_encode_jpeg", hong)
    r = client.get(url(mat))
    assert r.status_code == 200 and r.headers["content-type"] == "image/png"


@pytest.mark.parametrize("mode", ["RGBA", "P", "L", "LA", "1"])
def test_nguon_nhieu_che_do_van_ma_hoa_duoc(tmp_path, mode):
    src, dst = tmp_path / "a.png", tmp_path / "a.jpg"
    Image.new(mode, (50, 40)).save(src)
    workspace._encode_jpeg(src, dst, 85)
    with Image.open(dst) as jpg:
        assert jpg.format == "JPEG" and jpg.size == (50, 40)
    assert not list(tmp_path.glob("*.tmp"))


# ── Vòng sửa: JPEG không bao giờ cũ vĩnh viễn ─────────────────────────

def test_png_bi_ghi_de_giua_luc_ma_hoa_thi_ra_anh_moi(client, mat, monkeypatch):
    src = mat[2] / "current.png"
    goc, lan = Image.open, []

    def mo(*a, **k):
        im = goc(*a, **k)
        if not lan:                      # lần mở đầu tiên (đang mã hoá bản cũ): PNG bị thay bằng ảnh khác
            lan.append(1)
            Image.new("RGB", (120, 90), "gray").save(src)
        return im

    monkeypatch.setattr(workspace.Image, "open", mo)
    r = client.get(url(mat))
    monkeypatch.setattr(workspace.Image, "open", goc)
    with Image.open(io.BytesIO(r.content)) as jpg:
        assert jpg.size == (120, 90)                         # ảnh MỚI, không phải bản cũ
    assert (mat[2] / "view.jpg").stat().st_mtime_ns == src.stat().st_mtime_ns


def test_png_mtime_cu_hon_jpeg_thi_sinh_lai(client, mat, monkeypatch):
    client.get(url(mat))
    goi = dem_ma_hoa(monkeypatch)
    src = mat[2] / "current.png"
    Image.new("RGB", (120, 90), "gray").save(src)
    os.utime(src, ns=(1_000_000_000, 1_000_000_000))        # PNG «khôi phục» với mtime cũ hơn JPEG
    r = client.get(url(mat))
    assert len(goi) == 1
    with Image.open(io.BytesIO(r.content)) as jpg:
        assert jpg.size == (120, 90)


def test_mtime_bang_nhau_dung_nghia_thi_khong_sinh_lai(client, mat, monkeypatch):
    client.get(url(mat))
    assert (mat[2] / "view.jpg").stat().st_mtime_ns == (mat[2] / "current.png").stat().st_mtime_ns
    goi = dem_ma_hoa(monkeypatch)
    client.get(url(mat))
    assert goi == []


def doi_replace(monkeypatch, so_lan):
    """os.replace ném PermissionError `so_lan` lần (None = mãi) khi đích là view.jpg."""
    goc, dem = os.replace, []

    def replace(a, b):
        if str(b).endswith("view.jpg") and (so_lan is None or len(dem) < so_lan):
            dem.append(1)
            raise PermissionError("đang mở")
        return goc(a, b)

    monkeypatch.setattr(workspace.os, "replace", replace)
    return dem


def test_replace_loi_mot_lan_roi_duoc_van_ra_jpeg(client, mat, monkeypatch):
    dem = doi_replace(monkeypatch, 1)
    r = client.get(url(mat))
    assert len(dem) == 1 and r.headers["content-type"] == "image/jpeg"


def test_replace_loi_mai_thi_tra_png_200(client, mat, monkeypatch):
    doi_replace(monkeypatch, None)
    r = client.get(url(mat))
    assert r.status_code == 200 and r.headers["content-type"] == "image/png"
    assert not list(mat[2].glob("*.tmp"))


def test_xoay_anh_thi_etag_cu_khong_nhan_304(client, mat):
    etag = client.get(url(mat)).headers["etag"]
    r = client.post(f"/api/ws/{mat[0]}/rotate", json={"sheet_ids": [mat[1]], "degrees": 90})
    assert r.status_code == 200, r.text
    r = client.get(url(mat), headers={"If-None-Match": etag})
    assert r.status_code == 200
    with Image.open(io.BytesIO(r.content)) as jpg:
        assert jpg.size == (200, 300)                        # 300×200 xoay 90° → 200×300


def test_ghi_nguyen_tu_khong_doi_noi_dung_png(tmp_path, monkeypatch):
    import hashlib
    monkeypatch.setattr(workspace, "DATA_DIR", tmp_path)
    monkeypatch.setattr(workspace, "WS_DIR", tmp_path / "ws")
    ws = workspace.Workspace(id="w")
    sheet = workspace.Sheet(id="s", name="s", origin="s.png")
    img = Image.open(io.BytesIO(png_bytes((300, 200)))).copy()
    workspace._write_sheet_images(ws, sheet, img)
    d = sheet.dir("w")

    def sha(p):
        return hashlib.sha256(p.read_bytes()).hexdigest()

    ref = tmp_path / "ref.png"
    img.save(ref)
    assert sha(d / "current.png") == sha(d / "original.png") == sha(ref)
    thumb = img.copy()
    thumb.thumbnail((workspace.THUMB_W, workspace.THUMB_W * 3), Image.LANCZOS)
    thumb.save(tmp_path / "ref_thumb.png")
    assert sha(d / "thumb.png") == sha(tmp_path / "ref_thumb.png")
    workspace._regen_current(ws, sheet, img)
    assert sha(d / "current.png") == sha(ref)
    assert not list(d.glob("*.tmp"))


def test_replace_thu_lai_roi_nem_loi_voi_png(tmp_path, monkeypatch):
    goc, dem = os.replace, []

    def replace(a, b):
        dem.append(1)
        raise PermissionError("đang mở")

    monkeypatch.setattr(workspace.os, "replace", replace)
    with pytest.raises(PermissionError):
        workspace._atomic(tmp_path / "current.png", lambda tmp: Image.new("RGB", (5, 5)).save(tmp, "PNG"))
    assert len(dem) == 3 and not list(tmp_path.glob("*.tmp"))


def test_so_sanh_etag_yeu(client, mat):
    etag = client.get(url(mat)).headers["etag"]
    assert client.get(url(mat), headers={"If-None-Match": f"W/{etag}"}).status_code == 304
    assert client.get(url(mat), headers={"If-None-Match": f'"khac", {etag}'}).status_code == 304
    assert client.get(url(mat), headers={"If-None-Match": '"khac"'}).status_code == 200


def test_rgba_trong_suot_thanh_nen_trang(tmp_path):
    src, dst = tmp_path / "a.png", tmp_path / "a.jpg"
    Image.new("RGBA", (30, 30), (0, 0, 0, 0)).save(src)
    workspace._encode_jpeg(src, dst, 85)
    with Image.open(dst) as jpg:
        assert min(jpg.getpixel((15, 15))) >= 250
    Image.new("L", (30, 30), 128).save(src)
    workspace._encode_jpeg(src, dst, 85)
    with Image.open(dst) as jpg:
        assert jpg.mode == "L"                               # xám giữ xám, khỏi nở thành RGB


def test_xoa_mat_so_va_ho_so_khong_con_file_nao(client, mat):
    client.get(url(mat))
    client.get(url(mat, True))
    (mat[2] / "words.json").write_text("{}", encoding="utf-8")
    assert {"view.jpg", "thumb.jpg", "words.json"} <= {p.name for p in mat[2].iterdir()}
    assert client.delete(f"/api/ws/{mat[0]}/sheets/{mat[1]}").status_code == 200
    assert not mat[2].exists()
    ws2 = client.post("/api/ws").json()["id"]
    sheet = client.post(f"/api/ws/{ws2}/sheets?auto=false",
                        files={"files": ("so.png", png_bytes(), "image/png")}).json()["sheets"][0]
    imgjobs.wait_idle()
    d = workspace.WS_DIR / ws2 / sheet["id"]
    client.get(f"/api/ws/{ws2}/sheets/{sheet['id']}/image")
    (d / "words.json").write_text("{}", encoding="utf-8")
    assert client.delete(f"/api/ws/{ws2}").status_code == 200
    assert not (workspace.WS_DIR / ws2).exists()
