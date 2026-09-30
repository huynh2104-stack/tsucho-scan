"""Nhập file hai pha: trả lời ngay + xử lý nền, tự xoay/cắt, khoá thao tác khi chưa sẵn sàng.

Bộ nhận hướng được giả lập (`orient.detect`) để test nhanh và không phụ thuộc RapidOCR;
đường chạy bộ đọc thật nằm ở test_orient.py.
"""

import io

import fitz
import pytest
from PIL import Image, ImageDraw

from api import imgjobs, main, orient, pagecrop, workspace
from test_api_auth import client, register  # noqa: F401 — fixture dùng chung: CSDL tạm


@pytest.fixture
def wsp(tmp_path, monkeypatch):
    monkeypatch.setattr(workspace, "DATA_DIR", tmp_path)
    monkeypatch.setattr(workspace, "WS_DIR", tmp_path / "ws")
    monkeypatch.setattr(workspace, "_cache", {})
    return workspace.create(owner="u1")


def make_pdf(n=3, w=420, h=595, **save):
    doc = fitz.open()
    for i in range(n):
        page = doc.new_page(width=w, height=h)
        page.insert_text((60, 120), f"Trang {i + 1}", fontsize=30)
    data = doc.tobytes(**save)
    doc.close()
    return data


def make_png(size=(300, 200)):
    img = Image.new("RGB", size, "white")
    ImageDraw.Draw(img).rectangle((60, 40, 240, 160), fill="black")
    buf = io.BytesIO()
    img.save(buf, "PNG")
    return buf.getvalue()


def huong(rotate, sure=True, lines=90, ratio=9.0):
    return orient.Orientation(rotate, sure, ratio, lines, {})


def lan_luot(*results):
    """Bộ nhận hướng giả: trang thứ i nhận kết quả thứ i."""
    it = iter(results)
    return lambda img: next(it)


def cat_co_dinh(monkeypatch, box=(0.1, 0.1, 0.9, 0.9)):
    monkeypatch.setattr(pagecrop, "is_flat", lambda g: True)
    monkeypatch.setattr(pagecrop, "content_box", lambda g: box)


def kich_thuoc(ws, sheet, name="current.png"):
    with Image.open(sheet.dir(ws.id) / name) as im:
        return im.size


# ── Pha nhanh ────────────────────────────────────────────────────────

def test_pha_nhanh_lap_san_the_ma_chua_dung_toi_anh(wsp):
    made, job = workspace.prepare_upload(wsp, "so.pdf", make_pdf(3))
    assert [s.status for s in made] == ["queued"] * 3
    assert [s.page for s in made] == [1, 2, 3]
    assert not any(s.dir(wsp.id).exists() for s in made)         # chưa render gì
    assert job["sheet_ids"] == [s.id for s in made] and job["auto"] is True
    assert (workspace.Path(job["path"])).is_file()               # file tải lên đã lưu cho việc nền


def test_nhap_lai_cung_file_thi_dat_ten_khac(wsp):
    a, _ = workspace.prepare_upload(wsp, "so.pdf", make_pdf(1))
    b, _ = workspace.prepare_upload(wsp, "so.pdf", make_pdf(1))
    assert (a[0].name, b[0].name) == ("so", "so(1)")


@pytest.mark.parametrize("ten, du_lieu", [
    ("a.txt", b"x"),
    ("a.pdf", b"khong phai pdf"),
    ("a.png", b"khong phai anh"),
])
def test_file_loi_bi_tu_choi_ngay_va_khong_de_lai_the_mo_coi(wsp, ten, du_lieu):
    with pytest.raises(ValueError):
        workspace.prepare_upload(wsp, ten, du_lieu)
    assert wsp.sheets == []


def test_pdf_co_mat_khau_bi_tu_choi(wsp):
    khoa = make_pdf(1, encryption=fitz.PDF_ENCRYPT_AES_256, user_pw="a", owner_pw="b")
    with pytest.raises(ValueError, match="mật khẩu"):
        workspace.prepare_upload(wsp, "khoa.pdf", khoa)


# ── Pha nền ──────────────────────────────────────────────────────────

def test_nen_render_du_cac_trang(wsp):
    made, job = workspace.prepare_upload(wsp, "so.pdf", make_pdf(3), auto=False)
    workspace.process_upload(job)
    assert [s.status for s in made] == ["ready"] * 3
    for s in made:
        d = s.dir(wsp.id)
        assert all((d / f).is_file() for f in ("original.png", "current.png", "thumb.png", "source.pdf"))
        assert s.sha256 and s.width > 0 and s.auto is None and not s.edited()
    assert not workspace.Path(job["path"]).exists()              # file tải lên tạm đã dọn


def test_luu_lai_va_doc_lai_giu_trang_thai(wsp, monkeypatch):
    made, job = workspace.prepare_upload(wsp, "so.pdf", make_pdf(2), auto=False)
    workspace.process_upload(job)
    monkeypatch.setattr(workspace, "_cache", {})                 # như khởi động lại máy chủ
    lai = workspace.load(wsp.id)
    assert [s.status for s in lai.sheets] == ["ready", "ready"]
    assert lai.sheets[0].sha256 == made[0].sha256


def test_khoi_dong_lai_giua_chung_thi_mat_dang_xu_ly_thanh_hong(wsp, monkeypatch):
    workspace.prepare_upload(wsp, "so.pdf", make_pdf(2))
    monkeypatch.setattr(workspace, "_cache", {})
    lai = workspace.load(wsp.id)
    assert [(s.status, s.error) for s in lai.sheets] == [("failed", "interrupted")] * 2


def test_mat_so_bi_xoa_truoc_khi_nen_xu_ly_thi_bi_bo_qua(wsp):
    made, job = workspace.prepare_upload(wsp, "so.pdf", make_pdf(3), auto=False)
    workspace.remove(wsp, made[1].id)
    workspace.process_upload(job)
    assert [s.id for s in wsp.sheets] == [made[0].id, made[2].id]
    assert all(s.status == "ready" for s in wsp.sheets)
    assert not made[1].dir(wsp.id).exists()


def test_trang_pdf_hong_thi_chi_trang_do_that_bai(wsp, monkeypatch):
    real = fitz.Document.__getitem__

    def hong(self, i):
        if i == 1:
            raise RuntimeError("trang 2 hỏng")
        return real(self, i)

    monkeypatch.setattr(fitz.Document, "__getitem__", hong)
    made, job = workspace.prepare_upload(wsp, "so.pdf", make_pdf(3), auto=False)
    workspace.process_upload(job)
    assert [s.status for s in made] == ["ready", "failed", "ready"]
    assert made[1].error == "render"


def test_file_trung_noi_dung_duoc_danh_dau_sau_khi_xu_ly(wsp):
    pdf = make_pdf(1)
    a, ja = workspace.prepare_upload(wsp, "a.pdf", pdf, auto=False)
    b, jb = workspace.prepare_upload(wsp, "b.pdf", pdf, auto=False)
    workspace.process_upload(ja)
    workspace.process_upload(jb)
    assert a[0].duplicate_of is None and b[0].duplicate_of == a[0].id


# ── Tự xoay / cắt ────────────────────────────────────────────────────

def test_tu_xoay_va_cat_roi_hoan_tac_mot_lan_ve_anh_goc(wsp, monkeypatch):
    monkeypatch.setattr(orient, "detect", lan_luot(huong(270), huong(0)))
    cat_co_dinh(monkeypatch)
    made, job = workspace.prepare_upload(wsp, "so.pdf", make_pdf(2))
    workspace.process_upload(job)
    a, b = made
    w0, h0 = kich_thuoc(wsp, a, "original.png")
    assert (a.status, a.rotation, a.cropped, a.scanned) == ("ready", 270, True, False)
    assert a.auto["rotate"] == 270 and a.auto["cropped"] is True
    # xoay 270 đổi chiều, rồi cắt còn 80% mỗi cạnh
    assert kich_thuoc(wsp, a) == (int(h0 * 0.9) - int(h0 * 0.1), int(w0 * 0.9) - int(w0 * 0.1))
    assert (b.rotation, b.cropped, b.auto["rotate"]) == (0, True, 0)   # trang đúng chiều: chỉ cắt

    workspace.undo(wsp, a)                                       # MỘT lần hoàn tác là về ảnh gốc
    assert kich_thuoc(wsp, a) == (w0, h0)
    assert (a.rotation, a.cropped, a.auto) == (0, False, None)


def test_tat_tu_chinh_thi_khong_hoi_bo_nhan_huong(wsp, monkeypatch):
    def cam(_):
        raise AssertionError("auto=False thì không được phân tích")
    monkeypatch.setattr(orient, "detect", cam)
    made, job = workspace.prepare_upload(wsp, "so.pdf", make_pdf(2), auto=False)
    workspace.process_upload(job)
    assert all(s.status == "ready" and s.auto is None and not s.edited() for s in made)


def test_trang_yeu_xoay_theo_da_so_cua_file(wsp, monkeypatch):
    monkeypatch.setattr(orient, "detect", lan_luot(
        *[huong(270)] * 4, huong(270, sure=False, lines=10, ratio=1.7)))
    cat_co_dinh(monkeypatch)
    made, job = workspace.prepare_upload(wsp, "so.pdf", make_pdf(5))
    workspace.process_upload(job)
    assert [s.status for s in made] == ["ready"] * 5
    assert [s.rotation for s in made] == [270] * 5
    assert made[4].auto["propagated"] is True and made[0].auto["propagated"] is False


def test_trang_yeu_nghieng_huong_khac_thi_de_nguyen_va_ghi_chua_chac(wsp, monkeypatch):
    monkeypatch.setattr(orient, "detect", lan_luot(
        *[huong(270)] * 4, huong(90, sure=False, lines=10, ratio=1.7)))
    cat_co_dinh(monkeypatch)
    made, job = workspace.prepare_upload(wsp, "so.pdf", make_pdf(5))
    workspace.process_upload(job)
    yeu = made[4]
    assert yeu.status == "ready" and yeu.rotation == 0
    assert yeu.auto["sure"] is False and yeu.auto["detected"] == 90 and yeu.auto["rotate"] == 0
    assert yeu.cropped                                           # vẫn cắt gọn


def test_bia_chac_la_0_khong_bi_keo_theo_da_so(wsp, monkeypatch):
    monkeypatch.setattr(orient, "detect", lan_luot(*[huong(270)] * 4, huong(0, lines=9)))
    cat_co_dinh(monkeypatch)
    made, job = workspace.prepare_upload(wsp, "so.pdf", make_pdf(5))
    workspace.process_upload(job)
    assert [s.rotation for s in made] == [270, 270, 270, 270, 0]


def test_thieu_bo_doc_chu_thi_van_nhap_binh_thuong(wsp, monkeypatch):
    monkeypatch.setattr(orient, "detect", lambda img: None)
    cat_co_dinh(monkeypatch)
    made, job = workspace.prepare_upload(wsp, "so.pdf", make_pdf(2))
    workspace.process_upload(job)
    assert all(s.status == "ready" and s.rotation == 0 and s.auto["checked"] is False for s in made)


def test_phan_tich_loi_thi_mat_so_van_dung_duoc(wsp, monkeypatch):
    def hong(_):
        raise RuntimeError("bộ đọc chữ chết")
    monkeypatch.setattr(orient, "detect", hong)
    made, job = workspace.prepare_upload(wsp, "so.pdf", make_pdf(2))
    workspace.process_upload(job)
    assert all(s.status == "ready" and s.rotation == 0 for s in made)


# ── Ảnh rời + EXIF ───────────────────────────────────────────────────

def jpeg_exif(orientation, size=(300, 200)):
    img = Image.new("RGB", size, "white")
    ImageDraw.Draw(img).rectangle((20, 20, 120, 80), fill="black")
    exif = Image.Exif()
    exif[0x0112] = orientation
    buf = io.BytesIO()
    img.save(buf, "JPEG", exif=exif)
    return buf.getvalue()


@pytest.mark.parametrize("orientation", [6, 8])
def test_exif_xoay_duoc_ap_dung_va_ban_quet_la_diem_anh_da_xoay(wsp, orientation):
    made, job = workspace.prepare_upload(wsp, "chup.jpg", jpeg_exif(orientation), auto=False)
    workspace.process_upload(job)
    s = made[0]
    assert s.exif_fixed and (s.width, s.height) == (200, 300)     # 300×200 thô → 200×300 sau khi xoay
    assert s.edited() and s.scan_path(wsp.id).name == "scan.jpg"
    assert (s.dir(wsp.id) / "source.jpg").is_file()               # bản gốc vẫn giữ nguyên


def test_khong_co_exif_thi_van_gui_bytes_goc_de_dung_lai_cache(wsp):
    made, job = workspace.prepare_upload(wsp, "chup.jpg", jpeg_exif(1), auto=False)
    workspace.process_upload(job)
    s = made[0]
    assert not s.exif_fixed and not s.edited() and s.scan_path(wsp.id).name == "source.jpg"


def test_anh_rong_khong_ra_anh_thi_bao_hong_dung_ma(wsp, monkeypatch):
    made, job = workspace.prepare_upload(wsp, "a.png", make_png(), auto=False)
    workspace.Path(job["path"]).write_bytes(b"da bi hong giua duong")
    workspace.process_upload(job)
    assert (made[0].status, made[0].error) == ("failed", "decode")


# ── Qua API ──────────────────────────────────────────────────────────

def test_tai_len_tra_loi_ngay_roi_nen_xu_ly_va_khoa_thao_tac_khi_chua_xong(client, monkeypatch):  # noqa: F811
    register(client)
    wid = client.post("/api/ws").json()["id"]
    hang = []
    monkeypatch.setattr(main.imgjobs, "submit", lambda fn, *a: hang.append((fn, a)))

    r = client.post(f"/api/ws/{wid}/sheets", files={"files": ("so.pdf", make_pdf(2), "application/pdf")})
    assert r.status_code == 200
    body = r.json()
    assert len(body["added"]) == 2 and body["errors"] == []
    assert [s["status"] for s in body["sheets"]] == ["queued", "queued"]

    sid = body["added"][0]
    r = client.post(f"/api/ws/{wid}/rotate", json={"sheet_ids": [sid], "degrees": 90})
    assert r.status_code == 409 and r.json()["detail"] == {"kind": "not_ready", "status": "queued"}
    assert client.post(f"/api/ws/{wid}/scan", json={"sheet_ids": [sid]}).status_code == 409
    assert client.get(f"/api/ws/{wid}/sheets/{sid}/image?thumb=true").status_code == 404

    for fn, args in hang:
        fn(*args)                                                # luồng nền chạy xong
    sheets = client.get(f"/api/ws/{wid}/sheets").json()["sheets"]
    assert [s["status"] for s in sheets] == ["ready", "ready"]
    assert client.post(f"/api/ws/{wid}/rotate", json={"sheet_ids": [sid], "degrees": 90}).status_code == 200


def test_tai_len_bang_luong_nen_that(client, monkeypatch):  # noqa: F811
    monkeypatch.setattr(orient, "detect", lambda img: None)
    register(client)
    wid = client.post("/api/ws").json()["id"]
    r = client.post(f"/api/ws/{wid}/sheets?auto=false", files={"files": ("a.png", make_png(), "image/png")})
    assert r.status_code == 200
    imgjobs.wait_idle()
    (s,) = client.get(f"/api/ws/{wid}/sheets").json()["sheets"]
    assert s["status"] == "ready" and s["width"] == 300 and s["auto"] is None


def test_lo_co_file_loi_thi_file_tot_van_nhan(client, monkeypatch):  # noqa: F811
    register(client)
    wid = client.post("/api/ws").json()["id"]
    monkeypatch.setattr(main.imgjobs, "submit", lambda fn, *a: None)
    r = client.post(f"/api/ws/{wid}/sheets", files=[
        ("files", ("tot.png", make_png(), "image/png")),
        ("files", ("xau.txt", b"x", "text/plain")),
    ])
    body = r.json()
    assert r.status_code == 200 and len(body["added"]) == 1
    assert [e["file"] for e in body["errors"]] == ["xau.txt"]

    r = client.post(f"/api/ws/{wid}/sheets", files={"files": ("xau.txt", b"x", "text/plain")})
    assert r.status_code == 400                                  # không file nào nhận được


def test_tu_can_chinh_cho_mat_so_da_co_va_bo_qua_mat_da_quet(client, monkeypatch):  # noqa: F811
    register(client)
    wid = client.post("/api/ws").json()["id"]
    ws = workspace.load(wid)
    (s,) = workspace.add_upload(ws, "a.png", make_png())         # đồng bộ, không tự chỉnh
    hang = []
    monkeypatch.setattr(main.imgjobs, "submit", lambda fn, *a: hang.append((fn, a)))
    monkeypatch.setattr(orient, "detect", lan_luot(huong(90)))

    r = client.post(f"/api/ws/{wid}/autoprep", json={"sheet_ids": [s.id]})
    assert r.json()["queued"] == [s.id] and s.status == "analyzing"
    for fn, args in hang:
        fn(*args)
    assert (s.status, s.rotation) == ("ready", 90) and s.auto["rotate"] == 90

    s.scanned = True                                             # đã quét: ảnh đổi thì kết quả lệch
    r = client.post(f"/api/ws/{wid}/autoprep", json={"sheet_ids": [s.id]})
    assert r.json()["skipped"] == [s.id] and r.json()["queued"] == []
    r = client.post(f"/api/ws/{wid}/autoprep", json={"sheet_ids": [s.id], "force": True})
    assert r.json()["queued"] == [s.id]


def test_chinh_tay_xoa_nhan_may_da_tu_chinh(wsp, monkeypatch):
    monkeypatch.setattr(orient, "detect", lan_luot(huong(90)))
    made, job = workspace.prepare_upload(wsp, "a.png", make_png())
    workspace.process_upload(job)
    s = made[0]
    assert s.auto is not None
    workspace.rotate(wsp, s, 90)                                 # người dùng tự xoay thêm
    assert s.auto is None
