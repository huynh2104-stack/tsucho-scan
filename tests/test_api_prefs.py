"""Cài đặt theo tài khoản (task 3.1): danh sách trắng + kiểu, tách theo người, di trú CSDL cũ, ghi đồng thời."""

import json
import sqlite3
import threading
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from api import auth, main, prefs
from test_api_auth import client, register  # noqa: F401 — fixture dùng chung: CSDL tạm

DEFAULTS = json.loads((Path(__file__).parent / "fixtures" / "prefs_defaults.json").read_text(encoding="utf-8"))


def _raw(user_id: str) -> str:
    with auth._db() as conn:
        return conn.execute("SELECT prefs FROM users WHERE id = ?", (user_id,)).fetchone()["prefs"]


# ── Mặc định & đọc/ghi ────────────────────────────────────────────────

def test_mac_dinh_khop_file_chung_voi_phia_web():
    assert prefs.DEFAULTS == DEFAULTS


def test_nguoi_moi_nhan_mac_dinh_va_chua_ghi_gi_xuong_csdl(client):
    me = register(client)
    assert client.get("/api/me/prefs").json() == DEFAULTS
    assert _raw(me["id"]) == "{}"


def test_put_gop_tung_khoa_va_tra_ban_day_du(client):
    me = register(client)
    r = client.put("/api/me/prefs", json={"fontScale": 1.3})
    assert r.status_code == 200 and r.json() == {**DEFAULTS, "fontScale": 1.3}
    r = client.put("/api/me/prefs", json={"dictMode": "auto", "lang": "ja"})
    assert r.json() == {**DEFAULTS, "fontScale": 1.3, "dictMode": "auto", "lang": "ja"}      # khoá cũ còn nguyên
    assert client.get("/api/me/prefs").json() == r.json()
    assert json.loads(_raw(me["id"])) == {"fontScale": 1.3, "dictMode": "auto", "lang": "ja"}   # chỉ ghi khoá đã đổi


def test_dua_ve_null_hoac_mac_dinh_cho_lang_theme(client):
    register(client)
    client.put("/api/me/prefs", json={"lang": "en", "theme": "dark"})
    r = client.put("/api/me/prefs", json={"lang": None})
    assert r.json()["lang"] is None and r.json()["theme"] == "dark"


def test_put_object_rong_khong_doi_gi(client):
    register(client)
    client.put("/api/me/prefs", json={"showCost": True})
    assert client.put("/api/me/prefs", json={}).json() == {**DEFAULTS, "showCost": True}


# ── Từ chối ───────────────────────────────────────────────────────────

@pytest.mark.parametrize("body", [
    {"khoa_la": 1},
    {"fontScale": 1.5},
    {"fontScale": "1"},
    {"fontScale": True},                      # True == 1 trong Python nhưng không phải số 1
    {"fontScale": None},
    {"dictMode": "tu-dong"},
    {"dictMode": 1},
    {"dictMode": None},
    {"showCost": 1},
    {"showCost": "true"},
    {"autoRotate": None},
    {"accountingMode": "yes"},
    {"lang": "fr"},
    {"theme": "blue"},
    {"lang": ["vi"]},
    {"fontScale": 1, "khoa_la": 2},           # một khoá xấu thì cả yêu cầu bị từ chối, khoá tốt không được ghi dở
])
def test_khoa_la_hoac_sai_kieu_bi_400_va_khong_ghi_gi(client, body):
    me = register(client)
    r = client.put("/api/me/prefs", json=body)
    assert r.status_code == 400, r.text
    assert _raw(me["id"]) == "{}"
    assert client.get("/api/me/prefs").json() == DEFAULTS


@pytest.mark.parametrize("body", [[1], "abc", 5])
def test_than_bai_khong_phai_object_bi_400_hoac_422(client, body):
    register(client)
    assert client.put("/api/me/prefs", json=body).status_code in (400, 422)


def test_chua_dang_nhap_bi_401(client):
    assert client.get("/api/me/prefs").status_code == 401
    assert client.put("/api/me/prefs", json={"showCost": True}).status_code == 401


# ── Tách theo người ───────────────────────────────────────────────────

def test_nguoi_nay_khong_doc_duoc_va_khong_sua_duoc_cai_dat_nguoi_kia(client):
    register(client, "a@x.com")
    client.put("/api/me/prefs", json={"dictMode": "off", "lang": "ja"})
    other = TestClient(main.app)
    with other:
        register(other, "b@x.com")
        assert other.get("/api/me/prefs").json() == DEFAULTS             # B không thấy gì của A
        other.put("/api/me/prefs", json={"showCost": True})
        assert client.get("/api/me/prefs").json() == {**DEFAULTS, "dictMode": "off", "lang": "ja"}   # A không bị B đổi
        assert other.get("/api/me/prefs").json() == {**DEFAULTS, "showCost": True}


def test_dang_xuat_dang_nhap_lai_van_con_cai_dat(client):
    register(client)
    client.put("/api/me/prefs", json={"fontScale": 1.15})
    client.post("/api/auth/logout")
    assert client.get("/api/me/prefs").status_code == 401
    assert client.post("/api/auth/login", json={"email": "a@b.com", "password": "matkhau123"}).status_code == 200
    assert client.get("/api/me/prefs").json()["fontScale"] == 1.15


# ── Dữ liệu cũ / hỏng ─────────────────────────────────────────────────

@pytest.mark.parametrize("stored", ["", "khong phai json", "[1, 2]", "null", '"abc"', "123"])
def test_cot_prefs_hong_thi_dung_mac_dinh_khong_no(client, stored):
    me = register(client)
    with auth._db() as conn:
        conn.execute("UPDATE users SET prefs = ? WHERE id = ?", (stored, me["id"]))
    assert client.get("/api/me/prefs").json() == DEFAULTS
    assert client.put("/api/me/prefs", json={"showCost": True}).json() == {**DEFAULTS, "showCost": True}


def test_khoa_thua_hoac_sai_kieu_da_luu_bi_bo_qua_khoa_dung_van_dung(client):
    me = register(client)
    bad = json.dumps({"fontScale": 9, "khoa_cua_ban_sau": 1, "showCost": True, "dictMode": 5})
    with auth._db() as conn:
        conn.execute("UPDATE users SET prefs = ? WHERE id = ?", (bad, me["id"]))
    assert client.get("/api/me/prefs").json() == {**DEFAULTS, "showCost": True}


def test_csdl_cu_chua_co_cot_prefs_tu_di_tru_va_giu_nguoi_dung(tmp_path, monkeypatch):
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
    auth.init_db()                                                      # chạy lại không lỗi (cột đã có)
    assert prefs.get("u1") == DEFAULTS
    assert auth.get_by_id("u1").email == "cu@x.com"
    assert prefs.update("u1", {"dictMode": "off"})["dictMode"] == "off"
    cols = {r[1] for r in sqlite3.connect(db).execute("PRAGMA table_info(users)")}
    assert "prefs" in cols


def test_hai_yeu_cau_dong_thoi_doi_hai_khoa_khac_nhau_khong_mat_khoa_nao(client):
    me = register(client)
    keys = [("showCost", True), ("autoRotate", True), ("autoFixOnUpload", True), ("accountingMode", True),
            ("dictMode", "off"), ("fontScale", 1.3), ("lang", "ja"), ("theme", "dark")]
    barrier = threading.Barrier(len(keys))
    errors: list[Exception] = []

    def go(k, v):
        try:
            barrier.wait(timeout=5)
            prefs.update(me["id"], {k: v})
        except Exception as e:  # noqa: BLE001
            errors.append(e)

    threads = [threading.Thread(target=go, args=kv) for kv in keys]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    assert not errors, errors
    assert prefs.get(me["id"]) == {**DEFAULTS, **dict(keys)}


def test_update_nguoi_dung_khong_ton_tai_la_loi(client):
    with pytest.raises(ValueError):
        prefs.update("khong-co", {"showCost": True})
