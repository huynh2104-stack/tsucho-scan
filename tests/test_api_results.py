"""Lưu công soát bằng tay (autosave).

Bug 31/07/2026: người dùng sửa ô trong bảng kết quả, đăng xuất rồi đăng nhập
lại thì các ô sửa biến mất — vì bản sửa chỉ nằm trong bộ nhớ trình duyệt.
"""

import json
import time

import pytest

from api import results, workspace
from test_api_auth import client  # noqa: F401 — fixture dùng chung: CSDL tạm


@pytest.fixture
def ws(tmp_path, monkeypatch):
    monkeypatch.setattr(workspace, "DATA_DIR", tmp_path)
    monkeypatch.setattr(workspace, "WS_DIR", tmp_path / "ws")
    monkeypatch.setattr(workspace, "_cache", {})
    return workspace.create(owner="u1")


def _row(desc: str, bal: int, status: str = "ok") -> dict:
    return {
        "date": "2025-04-25", "date_raw": None, "kind": None,
        "description": desc, "extra_text": None, "store_code": None,
        "amount_out": None, "amount_in": 1000, "balance": bal,
        "status": status, "reason": "", "sheet_id": "s1",
    }


def test_ban_sua_tay_song_qua_lan_doc_lai(ws):
    results.save_job(
        ws.id, ["s1"],
        {"accounts": [{"bank_name": "みずほ", "store_no": None, "account_no": "1",
                       "holder": None, "transactions": [_row("SAI", 5000, "check")]}],
         "model": "gemini-2.5-flash", "cost_usd": 0.003},
        job_id="j1",
    )

    blocks = results.load_all(ws.id)["s1"]["blocks"]
    blocks[0]["rows"][0]["description"] = "ĐÃ SỬA"
    blocks[0]["rows"][0]["status"] = "ok"
    results.save_edits(ws.id, "s1", blocks)

    lai = results.load_all(ws.id)["s1"]
    assert lai["blocks"][0]["rows"][0]["description"] == "ĐÃ SỬA"
    assert lai["blocks"][0]["rows"][0]["status"] == "ok"


def test_giu_nguyen_thong_tin_lan_quet(ws):
    """Sửa chữ không phải là quét lại — model và chi phí phải giữ nguyên."""
    results.save_job(
        ws.id, ["s1"],
        {"accounts": [{"bank_name": "X", "store_no": None, "account_no": None,
                       "holder": None, "transactions": [_row("A", 100)]}],
         "model": "gemini-2.5-flash", "cached": False, "cost_usd": 0.003},
        job_id="j1",
    )
    truoc = results.load_all(ws.id)["s1"]

    time.sleep(0.01)
    results.save_edits(ws.id, "s1", truoc["blocks"])
    sau = results.load_all(ws.id)["s1"]

    assert sau["model"] == truoc["model"]
    assert sau["cost_usd"] == truoc["cost_usd"]
    assert sau["job_id"] == truoc["job_id"]
    assert sau["scanned_at"] == truoc["scanned_at"]
    assert sau["edited_at"] > truoc["scanned_at"]


def test_luu_duoc_ca_khi_chua_tung_quet(ws):
    """Mặt sổ chưa có file kết quả nào vẫn lưu được, không nổ."""
    results.save_edits(ws.id, "moi", [{"meta": {}, "rows": [_row("A", 1)]}])
    assert results.load_all(ws.id)["moi"]["blocks"][0]["rows"][0]["balance"] == 1


def test_khong_de_lai_file_tam(ws):
    results.save_edits(ws.id, "s1", [{"meta": {}, "rows": []}])
    con_lai = [p.name for p in (workspace.WS_DIR / ws.id / "results").iterdir()]
    assert con_lai == ["s1.json"], con_lai


def test_file_hong_khong_lam_mat_ban_sua(ws):
    """Kết quả cũ hỏng thì bản sửa mới vẫn ghi được, chỉ mất metadata."""
    d = workspace.WS_DIR / ws.id / "results"
    d.mkdir(parents=True, exist_ok=True)
    (d / "s1.json").write_text("{ hỏng", encoding="utf-8")

    results.save_edits(ws.id, "s1", [{"meta": {}, "rows": [_row("A", 7)]}])
    assert json.loads((d / "s1.json").read_text(encoding="utf-8"))["blocks"][0]["rows"][0][
        "balance"
    ] == 7


# ── Task 1.1: danh tính dòng (rid) + giữ nguyên công soát của người dùng ──────

RID = __import__("re").compile(r"^[0-9a-f]{12}$")


def _quet(ws, *rows):
    results.save_job(
        ws.id, ["s1"],
        {"accounts": [{"bank_name": "X", "store_no": None, "account_no": "1",
                       "holder": None, "transactions": list(rows)}], "model": "m"},
        job_id="j1",
    )
    return results.load_all(ws.id)["s1"]["blocks"][0]["rows"]


def test_quet_xong_moi_dong_co_rid_rieng(ws):
    rows = _quet(ws, _row("A", 100), _row("B", 200), _row("C", 300))
    rids = [r["rid"] for r in rows]
    assert all(RID.match(r) for r in rids) and len(set(rids)) == 3


def test_so_mau_cung_di_qua_save_job_nen_tu_co_rid(ws):
    from api import sample

    sample.add_to(ws)
    for data in results.load_all(ws.id).values():
        for b in data["blocks"]:
            assert all(RID.match(r["rid"]) for r in b["rows"])


def test_file_cu_khong_co_rid_duoc_bo_sung_va_ghi_lai_dung_mot_lan(ws, monkeypatch):
    d = workspace.WS_DIR / ws.id / "results"
    d.mkdir(parents=True, exist_ok=True)
    cu = {"sheet_id": "s1", "job_id": "j0", "scanned_at": 1.0, "model": "m",
          "blocks": [{"meta": {}, "rows": [_row("A", 100), _row("B", 200)]}]}
    (d / "s1.json").write_text(json.dumps(cu), encoding="utf-8")

    ghi = []
    thuc = results._write_atomic
    monkeypatch.setattr(results, "_write_atomic", lambda p, data: (ghi.append(p.name), thuc(p, data)))

    lan1 = results.load_all(ws.id)["s1"]["blocks"][0]["rows"]
    assert all(RID.match(r["rid"]) for r in lan1) and ghi == ["s1.json"]
    # đã ghi xuống đĩa: đọc thẳng file thấy đủ rid
    tren_dia = json.loads((d / "s1.json").read_text(encoding="utf-8"))["blocks"][0]["rows"]
    assert [r["rid"] for r in tren_dia] == [r["rid"] for r in lan1]

    lan2 = results.load_all(ws.id)["s1"]["blocks"][0]["rows"]
    assert ghi == ["s1.json"]                      # lần hai KHÔNG ghi nữa
    assert [r["rid"] for r in lan2] == [r["rid"] for r in lan1]    # và rid không đổi


def test_save_edits_giu_nguyen_moi_khoa_cong_soat(ws):
    rows = _quet(ws, _row("A", 100), _row("B", 200))
    rows[0].update(orig={"description": "SAI", "balance": 90}, reviewed=True, reviewed_at=1700000000,
                   inferred=["balance"], tuong_lai={"x": [1, 2]})
    rows[1].update(added=True)
    results.save_edits(ws.id, "s1", [{"meta": {}, "rows": rows}])

    lai = results.load_all(ws.id)["s1"]["blocks"][0]["rows"]
    assert lai[0]["orig"] == {"description": "SAI", "balance": 90}
    assert (lai[0]["reviewed"], lai[0]["reviewed_at"], lai[0]["inferred"]) == (True, 1700000000, ["balance"])
    assert lai[0]["tuong_lai"] == {"x": [1, 2]}                    # khoá lạ của phiên bản sau cũng được giữ
    assert lai[1]["added"] is True
    assert lai[0]["rid"] == rows[0]["rid"]                          # rid không đổi qua lần lưu


def test_save_edits_bo_sung_rid_cho_dong_thieu_va_sua_rid_trung(ws):
    a, b, c = _row("A", 1), _row("B", 2), _row("C", 3)
    a["rid"] = b["rid"] = "trung12345ab"                           # hai dòng cùng rid (client lỗi)
    results.save_edits(ws.id, "s1", [{"meta": {}, "rows": [a, b, c]}])
    rids = [r["rid"] for r in results.load_all(ws.id)["s1"]["blocks"][0]["rows"]]
    assert rids[0] == "trung12345ab" and len(set(rids)) == 3 and all(rids)


@pytest.mark.parametrize("rid", [123, "x" * 33, ["a"]])
def test_save_edits_tu_choi_rid_sai(ws, rid):
    dong = _row("A", 1)
    dong["rid"] = rid
    with pytest.raises(ValueError, match="rid"):
        results.save_edits(ws.id, "s1", [{"meta": {}, "rows": [dong]}])
    assert "s1" not in results.load_all(ws.id)                       # không ghi gì


def test_save_edits_tu_choi_dong_khong_phai_dict(ws):
    with pytest.raises(ValueError):
        results.save_edits(ws.id, "s1", [{"meta": {}, "rows": ["abc"]}])


def test_api_tra_400_khi_rid_sai(client):
    from test_api_auth import register

    register(client)
    wid = client.post("/api/ws").json()["id"]
    w = workspace.load(wid)
    w.sheets.append(workspace.Sheet(id="s1", name="a", origin="a.png"))
    w.save()
    r = client.put(f"/api/ws/{wid}/results/s1",
                   json={"blocks": [{"meta": {}, "rows": [{**_row("A", 1), "rid": "x" * 40}]}]})
    assert r.status_code == 400 and "rid" in r.json()["detail"]
    ok = client.put(f"/api/ws/{wid}/results/s1",
                    json={"blocks": [{"meta": {}, "rows": [_row("A", 1)]}]})
    assert ok.status_code == 200 and RID.match(ok.json()["blocks"][0]["rows"][0]["rid"])
