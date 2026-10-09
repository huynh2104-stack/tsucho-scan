"""Hồ sơ (workspace): tạo / đổi tên / lưu trữ / xoá, thống kê cho trang danh sách, ghi nguyên tử, khoá (task 2.1)."""

import io
import json
import os
import sys
import threading
import time
from contextlib import contextmanager
from pathlib import Path

import pytest
from PIL import Image

from api import results, workspace
from test_api_auth import client, register  # noqa: F401 — fixture dùng chung: CSDL tạm


def _meta(wid):
    return json.loads((workspace.WS_DIR / wid / "meta.json").read_text(encoding="utf-8"))


def _row(desc, out=None, inn=None, bal=None, **kw):
    return {"date": "2025-04-25", "date_raw": None, "kind": None, "description": desc,
            "extra_text": None, "store_code": None, "amount_out": out, "amount_in": inn,
            "balance": bal, "status": "ok", "reason": "", "sheet_id": "s1", **kw}


def _luu_ket_qua(wid, sheet_id, *rows):
    results.save_job(
        wid, [sheet_id],
        {"accounts": [{"bank_name": "X", "store_no": None, "account_no": "1", "holder": None,
                       "transactions": [{**r, "sheet_id": sheet_id} for r in rows]}], "model": "m"},
        job_id="j",
    )


def _ho_so_co_2_mat(client):
    register(client)
    wid = client.post("/api/ws").json()["id"]
    w = workspace.load(wid)
    for sid in ("s1", "s2"):
        w.sheets.append(workspace.Sheet(id=sid, name=sid, origin=f"{sid}.png"))
    w.save()
    return wid


# ── Tạo / đổi tên / lưu trữ ───────────────────────────────────────────

def test_tao_ho_so_dat_ten_ngay_hoac_de_trong(client):
    register(client)
    a = client.post("/api/ws", json={"book_name": "Khách A"}).json()
    b = client.post("/api/ws").json()                         # không thân bài: cách gọi cũ vẫn chạy
    assert a["book_name"] == "Khách A" and b["book_name"] == ""
    assert a["archived"] is False and a["updated_at"] >= a["created_at"]
    dai = client.post("/api/ws", json={"book_name": "x" * 200}).json()
    assert len(dai["book_name"]) == workspace.BOOK_NAME_MAX
    assert client.post("/api/ws", json={"book_name": 123}).json()["book_name"] == ""   # sai kiểu thì bỏ qua, không nổ
    assert _meta(a["id"])["book_name"] == "Khách A"


def test_doi_ten_va_luu_tru_khong_lam_mat_cai_con_lai(client):
    register(client)
    wid = client.post("/api/ws", json={"book_name": "Khách A"}).json()["id"]
    r = client.patch(f"/api/ws/{wid}", json={"archived": True}).json()
    assert (r["archived"], r["book_name"]) == (True, "Khách A")           # chỉ gửi archived: tên còn nguyên
    r = client.patch(f"/api/ws/{wid}", json={"book_name": "Khách B"}).json()
    assert (r["archived"], r["book_name"]) == (True, "Khách B")           # chỉ gửi tên: trạng thái lưu trữ còn nguyên
    r = client.patch(f"/api/ws/{wid}", json={"archived": False, "book_name": "Khách C"}).json()
    assert (r["archived"], r["book_name"]) == (False, "Khách C")
    assert _meta(wid)["archived"] is False and _meta(wid)["book_name"] == "Khách C"


@pytest.mark.parametrize("bad", ["true", 1, None, [], {}])
def test_archived_phai_la_dung_sai(client, bad):
    register(client)
    wid = client.post("/api/ws").json()["id"]
    assert client.patch(f"/api/ws/{wid}", json={"archived": bad}).status_code == 400
    assert _meta(wid)["archived"] is False


def test_meta_cu_khong_co_updated_at_archived_van_doc_duoc(client):
    register(client)
    wid = client.post("/api/ws").json()["id"]
    raw = _meta(wid)
    for k in ("updated_at", "archived"):
        raw.pop(k)
    (workspace.WS_DIR / wid / "meta.json").write_text(json.dumps(raw), encoding="utf-8")
    workspace._cache.clear()
    w = workspace.load(wid)
    assert w.archived is False and w.updated_at == w.created_at


# ── Xoá ───────────────────────────────────────────────────────────────

def test_xoa_ho_so_xoa_het_thu_muc_va_bo_nho_dem(client):
    wid = _ho_so_co_2_mat(client)
    _luu_ket_qua(wid, "s1", _row("A", bal=1000))
    assert (workspace.WS_DIR / wid / "results").is_dir()
    r = client.delete(f"/api/ws/{wid}")
    assert r.status_code == 200 and r.json() == {"deleted": wid}
    assert not (workspace.WS_DIR / wid).exists()
    assert wid not in workspace._cache
    assert client.get(f"/api/ws/{wid}").status_code == 404
    assert wid not in [w["id"] for w in client.get("/api/ws").json()["workspaces"]]
    assert client.delete(f"/api/ws/{wid}").status_code == 404           # xoá lần hai: không còn


def test_nguoi_khac_khong_xem_sua_xoa_duoc_ho_so(client):
    wid = _ho_so_co_2_mat(client)
    client.post("/api/auth/logout")
    register(client, "khac@vd.com")
    # 404, không phải 403: không tiết lộ là có tồn tại
    assert client.patch(f"/api/ws/{wid}", json={"book_name": "chiếm"}).status_code == 404
    assert client.delete(f"/api/ws/{wid}").status_code == 404
    assert (workspace.WS_DIR / wid / "meta.json").is_file()
    assert _meta(wid)["book_name"] == ""
    assert client.get("/api/ws").json()["workspaces"] == []


def test_xoa_xong_luong_nen_con_giu_doi_tuong_cung_khong_hoi_sinh_thu_muc(client):
    wid = _ho_so_co_2_mat(client)
    ws = workspace.load(wid)                                  # như luồng xử lý ảnh đang giữ
    client.delete(f"/api/ws/{wid}")
    ws.save()                                                 # luồng nền lưu nốt
    _luu_ket_qua(wid, "s1", _row("A", bal=1))                 # lần quét đang chạy ghi kết quả nốt
    assert not (workspace.WS_DIR / wid).exists()


# ── Danh sách + thống kê ──────────────────────────────────────────────

def test_danh_sach_co_thong_ke_tinh_bang_dinh_nghia_chung(client):
    wid = _ho_so_co_2_mat(client)
    _luu_ket_qua(
        wid, "s1",
        _row("繰越", bal=1000, is_note=True, status="note"),      # dòng ghi chú: không tính
        _row("a", out=100, bal=900),
        _row("b", out=100, bal=999, reviewed=True),               # lệch nhưng đã ✓ ⇒ không còn cần soát
        _row("c", out=100, bal=500),                              # lệch ⇒ cần soát
    )
    (ws,) = client.get("/api/ws").json()["workspaces"]
    assert (ws["rows"], ws["need"], ws["confirmed"]) == (3, 1, 1)
    assert (ws["sheets"], ws["archived"], ws["id"]) == (2, False, wid)
    assert ws["updated_at"] >= ws["created_at"]


def test_danh_sach_hien_ca_ho_so_da_luu_tru_va_chi_cua_minh(client):
    register(client)
    a = client.post("/api/ws", json={"book_name": "A"}).json()["id"]
    b = client.post("/api/ws", json={"book_name": "B"}).json()["id"]
    client.patch(f"/api/ws/{b}", json={"archived": True})
    got = {w["id"]: w for w in client.get("/api/ws").json()["workspaces"]}
    assert set(got) == {a, b} and got[b]["archived"] is True and got[a]["archived"] is False
    client.post("/api/auth/logout")
    register(client, "khac@vd.com")
    assert client.get("/api/ws").json()["workspaces"] == []


def test_lan_sua_cuoi_tinh_ca_viec_sua_o_trong_bang(client):
    wid = _ho_so_co_2_mat(client)
    truoc = client.get("/api/ws").json()["workspaces"][0]["updated_at"]
    time.sleep(0.02)
    results.save_edits(wid, "s1", [{"meta": {}, "rows": [_row("A", bal=1)]}])    # không đụng meta.json
    sau = client.get("/api/ws").json()["workspaces"][0]["updated_at"]
    assert sau > truoc


def test_ho_so_rong_thong_ke_bang_khong(client):
    register(client)
    client.post("/api/ws")
    (ws,) = client.get("/api/ws").json()["workspaces"]
    assert (ws["rows"], ws["need"], ws["confirmed"], ws["sheets"]) == (0, 0, 0, 0)


# ── Ghi nguyên tử ─────────────────────────────────────────────────────

@pytest.mark.parametrize("hong", ["viet_file_tam", "doi_ten"])
def test_loi_giua_luc_ghi_thi_meta_cu_con_nguyen_va_khong_de_file_tam(client, monkeypatch, hong):
    wid = _ho_so_co_2_mat(client)
    ws = workspace.load(wid)
    truoc = (workspace.WS_DIR / wid / "meta.json").read_text(encoding="utf-8")

    ws.book_name = "TÊN MỚI CHƯA GHI ĐƯỢC"
    with monkeypatch.context() as mp:                          # chỉ hoàn lại phần giả lập của riêng test này
        if hong == "doi_ten":
            def boom(*a, **k):
                raise OSError("đĩa đầy")
            mp.setattr(workspace.os, "replace", boom)
        else:
            thuc = Path.write_text

            def cut_ngang(self, text, *a, **k):                # ghi dở một nửa rồi chết
                if self.name == "meta.json.tmp":
                    thuc(self, text[: len(text) // 2], *a, **k)
                    raise OSError("mất điện")
                return thuc(self, text, *a, **k)
            mp.setattr(Path, "write_text", cut_ngang)

        with pytest.raises(OSError):
            ws.save()
    assert (workspace.WS_DIR / wid / "meta.json").read_text(encoding="utf-8") == truoc      # file cũ không suy suyển
    assert not (workspace.WS_DIR / wid / "meta.json.tmp").exists()
    json.loads(truoc)                                                                        # và vẫn là JSON hợp lệ


# ── Khoá theo hồ sơ ───────────────────────────────────────────────────

def test_khoa_loai_tru_giua_cac_luong_nhung_khong_giua_cac_ho_so():
    giu, da_vao = threading.Event(), threading.Event()
    log = []

    def luong_a():
        with workspace.locked("hs-a"):
            da_vao.set()
            giu.wait(2)
            log.append("a xong")

    t = threading.Thread(target=luong_a)
    t.start()
    assert da_vao.wait(2)
    with workspace.locked("hs-khac"):                          # hồ sơ khác: vào ngay, không chờ
        log.append("khac vao")
    giu.set()
    with workspace.locked("hs-a"):                             # cùng hồ sơ: phải đợi luồng A nhả
        log.append("b vao")
    t.join(2)
    assert log == ["khac vao", "a xong", "b vao"]


def test_khoa_vao_lai_duoc_nen_route_giu_khoa_van_goi_save_duoc(client):
    wid = _ho_so_co_2_mat(client)
    ws = workspace.load(wid)
    with workspace.locked(wid):
        with workspace.locked(wid):
            ws.book_name = "lồng nhau"
            ws.save()                                          # save() cũng lấy khoá này
    assert _meta(wid)["book_name"] == "lồng nhau"


def test_cac_route_doi_ho_so_deu_lay_khoa(client, monkeypatch):
    wid = _ho_so_co_2_mat(client)
    vao = []                                                   # (ws_id, tên hàm đã gọi `locked`)
    thuc = workspace.locked

    @contextmanager
    def do(ws_id):
        vao.append((ws_id, sys._getframe(2).f_code.co_name))   # frame 2: contextmanager bọc thêm một lớp
        with thuc(ws_id):
            yield
    monkeypatch.setattr(workspace, "locked", do)

    png = io.BytesIO()
    Image.new("RGB", (40, 40), "white").save(png, "PNG")
    lan_goi = [
        ("PATCH", f"/api/ws/{wid}", {"json": {"book_name": "x"}}),
        ("POST", f"/api/ws/{wid}/reorder", {"json": {"sheet_ids": ["s2", "s1"]}}),
        ("POST", f"/api/ws/{wid}/dup-ok", {"json": {"a": "s1", "b": "s2"}}),
        ("POST", f"/api/ws/{wid}/rotate", {"json": {"sheet_ids": ["khong-co"], "degrees": 90}}),
        ("POST", f"/api/ws/{wid}/scan", {"json": {"sheet_ids": []}}),          # 400 ngay, không gọi mô hình
        ("POST", f"/api/ws/{wid}/sample", {}),
        ("POST", f"/api/ws/{wid}/sheets", {"files": {"files": ("a.png", png.getvalue(), "image/png")}}),
        ("DELETE", f"/api/ws/{wid}/sheets/s2", {}),
    ]
    for method, url, kw in lan_goi:
        truoc = len(vao)
        client.request(method, url, **kw)
        moi = vao[truoc:]
        # Phải có một lần lấy khoá do CHÍNH ROUTE gọi, không chỉ do `ws.save()` tự lấy bên trong
        assert any(ws == wid and ham != "save" for ws, ham in moi), f"{method} {url} không tự lấy khoá hồ sơ: {moi}"
