"""Từ điển sửa lỗi theo người dùng (task 3.3): học / cập nhật / xoá, tách theo người, khoá so khớp, giới hạn."""

import json
import sqlite3
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from api import auth, corrections, main
from test_api_auth import client, register  # noqa: F401 — fixture dùng chung: CSDL tạm

KEYS = json.loads((Path(__file__).parent / "fixtures" / "dict_keys.json").read_text(encoding="utf-8"))["cases"]


def _learn(c, wrong="ｶ)ﾘﾀﾘｺ", right="カ）リタリコ", field="description"):
    return c.post("/api/dict/learn", json={"field": field, "wrong": wrong, "right": right})


# ── Khoá so khớp ──────────────────────────────────────────────────────

@pytest.mark.parametrize("text, key", KEYS)
def test_khoa_so_khop_dung_theo_file_chung_voi_phia_web(text, key):
    assert corrections.wrong_key(text) == key


def test_khoa_khong_doi_chu_hien_thi_chi_dung_de_so_khop(client):
    register(client)
    e = _learn(client, "ｶ) ﾘﾀﾘｺ", "カ）リタリコ").json()
    assert e["wrong"] == "ｶ) ﾘﾀﾘｺ" and e["right"] == "カ）リタリコ"          # chữ người gõ giữ nguyên
    assert e["key"] == "カ)リタリコ"


# ── Học / cập nhật ────────────────────────────────────────────────────

def test_hoc_mot_cap_roi_doc_lai(client):
    register(client)
    r = _learn(client)
    assert r.status_code == 200
    e = r.json()
    assert (e["field"], e["wrong"], e["right"], e["hits"]) == ("description", "ｶ)ﾘﾀﾘｺ", "カ）リタリコ", 1)
    assert client.get("/api/dict").json()["entries"] == [e]


def test_cung_khoa_thi_cap_nhat_dap_an_va_tang_hits_khong_them_dong_moi(client):
    register(client)
    first = _learn(client, "ｶ)ﾘﾀﾘｺ", "カ）リタリコ").json()
    again = _learn(client, "カ）リタリコ", "株式会社リタリコ").json()        # cùng khoá (NFKC): ghi đè đáp án
    assert again["id"] == first["id"] and again["hits"] == 2 and again["right"] == "株式会社リタリコ"
    assert again["updated_at"] >= first["updated_at"] and again["created_at"] == first["created_at"]
    assert len(client.get("/api/dict").json()["entries"]) == 1


def test_hai_o_khac_nhau_cung_chu_la_hai_muc(client):
    register(client)
    _learn(client, "ﾘ", "リ", field="description")
    _learn(client, "ﾘ", "リ", field="kind")
    assert {e["field"] for e in client.get("/api/dict").json()["entries"]} == {"description", "kind"}


def test_muc_dung_gan_day_nhat_len_dau(client):
    register(client)
    a = _learn(client, "ｱ", "ア").json()
    b = _learn(client, "ｲ", "イ").json()
    _learn(client, "ｱ", "あ")                                                  # dùng lại mục a
    assert [e["id"] for e in client.get("/api/dict").json()["entries"]] == [a["id"], b["id"]]


@pytest.mark.parametrize("body, thong_bao", [
    ({"field": "amount_out", "wrong": "ａ", "right": "ｂ"}, "Ô này"),            # ô tiền không có từ điển
    ({"field": "description", "wrong": "ａ"}, "Chữ đã sửa"),
    ({"field": "description", "right": "ｂ"}, "Chữ máy đọc"),
    ({"field": "description", "wrong": "", "right": "ｂ"}, "đang trống"),        # máy không đọc ra gì: không có cặp sai→đúng
    ({"field": "description", "wrong": "ａ", "right": ""}, "đang trống"),        # người XOÁ TRẮNG ô: không học
    ({"field": "description", "wrong": "ａ", "right": "   "}, "đang trống"),
    ({"field": "description", "wrong": "ａ", "right": "ａ"}, "giống hệt"),
    ({"field": "description", "wrong": " ａ ", "right": "ａ"}, "giống hệt"),     # chỉ khác khoảng trắng hai đầu
    ({"field": "description", "wrong": 5, "right": "ｂ"}, "phải là chuỗi"),
    ({"field": "description", "wrong": ["ａ"], "right": "ｂ"}, "phải là chuỗi"),
    ({"field": "description", "wrong": "ａ" * 201, "right": "ｂ"}, "quá dài"),
    ({"field": None, "wrong": "ａ", "right": "ｂ"}, "Ô này"),
])
def test_khong_hoc_khi_du_lieu_khong_hop_le(client, body, thong_bao):
    register(client)
    r = client.post("/api/dict/learn", json=body)
    assert r.status_code == 400 and thong_bao in r.json()["detail"], r.text
    assert client.get("/api/dict").json()["entries"] == []


def test_do_dai_dung_bang_tran_van_nhan(client):
    register(client)
    assert _learn(client, "ａ" * 200, "ｂ" * 200).status_code == 200


def test_tu_dien_day_thi_tu_choi_muc_moi_nhung_van_cap_nhat_muc_cu(client, monkeypatch):
    register(client)
    monkeypatch.setattr(corrections, "MAX_ENTRIES", 2)
    _learn(client, "ｱ", "ア")
    _learn(client, "ｲ", "イ")
    r = _learn(client, "ｳ", "ウ")
    assert r.status_code == 400 and "đã đầy" in r.json()["detail"]
    assert _learn(client, "ｱ", "あ").status_code == 200                          # sửa mục có sẵn thì vẫn được
    assert len(client.get("/api/dict").json()["entries"]) == 2


# ── Xoá ───────────────────────────────────────────────────────────────

def test_xoa_tung_muc_va_xoa_het(client):
    register(client)
    a = _learn(client, "ｱ", "ア").json()
    b = _learn(client, "ｲ", "イ").json()
    _learn(client, "ｳ", "ウ")
    assert client.delete(f"/api/dict/{a['id']}").json() == {"deleted": a["id"]}
    assert client.delete(f"/api/dict/{a['id']}").status_code == 404                # xoá hai lần
    assert [e["id"] for e in client.get("/api/dict").json()["entries"]].count(b["id"]) == 1
    assert client.delete("/api/dict").json() == {"deleted": 2}
    assert client.get("/api/dict").json()["entries"] == []
    assert client.delete("/api/dict").json() == {"deleted": 0}


def test_hoc_lai_sau_khi_xoa_la_muc_moi_hits_ve_1(client):
    register(client)
    e = _learn(client).json()
    client.delete(f"/api/dict/{e['id']}")
    assert _learn(client).json()["hits"] == 1


# ── Tách theo người (dữ liệu tài chính) ───────────────────────────────

def test_nguoi_nay_khong_thay_khong_xoa_duoc_tu_dien_nguoi_kia(client):
    register(client, "a@x.com")
    a = _learn(client).json()
    other = TestClient(main.app)
    with other:
        register(other, "b@x.com")
        assert other.get("/api/dict").json()["entries"] == []                      # B không thấy gì của A
        assert other.delete(f"/api/dict/{a['id']}").status_code == 404             # B không xoá được mục của A
        b = other.post("/api/dict/learn", json={"field": "description", "wrong": "ｶ)ﾘﾀﾘｺ", "right": "KHÁC"}).json()
        assert b["hits"] == 1 and b["right"] == "KHÁC"                              # cùng chữ sai nhưng là mục RIÊNG của B
        assert other.delete("/api/dict").json() == {"deleted": 1}                   # B xoá hết: chỉ của B
    assert client.get("/api/dict").json()["entries"] == [a]                        # của A còn nguyên


def test_chua_dang_nhap_bi_401(client):
    assert client.get("/api/dict").status_code == 401
    assert client.post("/api/dict/learn", json={"field": "description", "wrong": "ａ", "right": "ｂ"}).status_code == 401
    assert client.delete("/api/dict/1").status_code == 401
    assert client.delete("/api/dict").status_code == 401


def test_csdl_cu_chua_co_bang_tu_dien_tu_tao(tmp_path, monkeypatch):
    db = tmp_path / "old.db"
    conn = sqlite3.connect(db)
    conn.executescript("""
        CREATE TABLE users (id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL,
                            role TEXT NOT NULL DEFAULT 'user', created_at REAL NOT NULL);
        INSERT INTO users VALUES ('u1', 'cu@x.com', 'h', 'admin', 1.0);
    """)
    conn.commit()
    conn.close()
    monkeypatch.setattr(auth, "DB_PATH", db)
    auth.init_db()
    assert corrections.list_entries("u1") == []
    assert corrections.learn("u1", "description", "ｱ", "ア")["hits"] == 1
