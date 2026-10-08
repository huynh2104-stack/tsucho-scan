"""「Không phải trùng」— người dùng đã so hai mặt sổ nghi trùng và xác nhận chúng khác nhau (task 1.7)."""

import pytest

from api import workspace
from test_api_auth import client, register  # noqa: F401 — fixture dùng chung: CSDL tạm


def _ws_voi_3_mat(client):
    register(client)
    wid = client.post("/api/ws").json()["id"]
    w = workspace.load(wid)
    for sid in ("s1", "s2", "s3"):
        w.sheets.append(workspace.Sheet(id=sid, name=sid, origin=f"{sid}.png"))
    w.save()
    return wid


def test_dup_ok_luu_cap_da_sap_xep_va_khong_phan_biet_thu_tu(client):
    wid = _ws_voi_3_mat(client)
    r = client.post(f"/api/ws/{wid}/dup-ok", json={"a": "s2", "b": "s1"})
    assert r.status_code == 200 and r.json()["dup_ok"] == [["s1", "s2"]]
    # gọi lại, kể cả đảo thứ tự: không thêm cặp thứ hai
    client.post(f"/api/ws/{wid}/dup-ok", json={"a": "s1", "b": "s2"})
    client.post(f"/api/ws/{wid}/dup-ok", json={"a": "s3", "b": "s1"})
    assert client.get(f"/api/ws/{wid}").json()["dup_ok"] == [["s1", "s2"], ["s1", "s3"]]


def test_dup_ok_song_qua_khoi_dong_lai_may_chu(client):
    wid = _ws_voi_3_mat(client)
    client.post(f"/api/ws/{wid}/dup-ok", json={"a": "s1", "b": "s2"})
    workspace._cache.clear()                                   # như vừa khởi động lại: đọc lại từ meta.json
    assert workspace.load(wid).dup_ok == [["s1", "s2"]]
    assert client.get(f"/api/ws/{wid}").json()["dup_ok"] == [["s1", "s2"]]


@pytest.mark.parametrize("body", [
    {"a": "s1", "b": "la-hoac-khong-ton-tai"},
    {"a": "khong-co", "b": "s2"},
    {"a": "s1", "b": "s1"},
    {"a": "s1"},
    {"a": 1, "b": 2},
    {},
])
def test_dup_ok_tu_choi_id_la_va_khong_ghi_gi(client, body):
    wid = _ws_voi_3_mat(client)
    assert client.post(f"/api/ws/{wid}/dup-ok", json=body).status_code == 400
    assert client.get(f"/api/ws/{wid}").json()["dup_ok"] == []


def test_dup_ok_khong_dung_duoc_voi_workspace_cua_nguoi_khac(client):
    wid = _ws_voi_3_mat(client)
    client.post("/api/auth/logout")
    register(client, "khac@vd.com")
    r = client.post(f"/api/ws/{wid}/dup-ok", json={"a": "s1", "b": "s2"})
    assert r.status_code == 404                                # không tiết lộ là có tồn tại
    assert workspace.load(wid).dup_ok == []


def test_dup_ok_can_dang_nhap(client):
    assert client.post("/api/ws/x/dup-ok", json={"a": "s1", "b": "s2"}).status_code == 401


def test_xoa_mat_so_thi_cap_chua_no_cung_bi_xoa(client):
    wid = _ws_voi_3_mat(client)
    for a, b in (("s1", "s2"), ("s2", "s3")):
        client.post(f"/api/ws/{wid}/dup-ok", json={"a": a, "b": b})
    r = client.delete(f"/api/ws/{wid}/sheets/s2")
    assert r.status_code == 200 and r.json()["dup_ok"] == []
    assert workspace.load(wid).dup_ok == []


def test_meta_cu_khong_co_dup_ok_van_doc_duoc(client):
    wid = _ws_voi_3_mat(client)
    import json

    meta = workspace.WS_DIR / wid / "meta.json"
    raw = json.loads(meta.read_text(encoding="utf-8"))
    raw.pop("dup_ok")
    meta.write_text(json.dumps(raw), encoding="utf-8")
    workspace._cache.clear()
    assert workspace.load(wid).dup_ok == []
