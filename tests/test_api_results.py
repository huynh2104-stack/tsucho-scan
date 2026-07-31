"""Lưu công soát bằng tay (autosave).

Bug 31/07/2026: người dùng sửa ô trong bảng kết quả, đăng xuất rồi đăng nhập
lại thì các ô sửa biến mất — vì bản sửa chỉ nằm trong bộ nhớ trình duyệt.
"""

import json
import time

import pytest

from api import results, workspace


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
