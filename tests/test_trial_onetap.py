"""«お試し» một chạm: dọn tài khoản bỏ không (auth.purge_expired_trials) và `last_seen`."""

import time

import pytest

from api import auth, workspace
from test_api_auth import client, register, trial  # noqa: F401 — fixture dùng chung: CSDL tạm

DAY = 86400


@pytest.fixture(autouse=True)
def _bat_trial(client, monkeypatch):
    monkeypatch.setattr(auth, "OPEN_LOGIN", True)
    monkeypatch.delenv("TSUCHO_TRIAL_KEEP_DAYS", raising=False)


def set_seen(user_id, days_ago):
    with auth._db() as conn:
        conn.execute("UPDATE users SET last_seen = ? WHERE id = ?", (time.time() - days_ago * DAY, user_id))


def guest(client):
    j = client.post("/api/auth/trial/new", json={}).json()
    client.post("/api/auth/logout")
    return j


def exists(uid):
    return auth.get_by_id(uid) is not None


def fill_user_data(uid, client_user_cookie=None):
    """Hồ sơ trên đĩa + hàng ở các bảng phụ cho `uid`."""
    ws = workspace.create(owner=uid)
    (ws.dir() / "x.txt").write_text("du lieu", encoding="utf-8")
    u = auth.get_by_id(uid)
    with auth._db() as conn:
        conn.execute("INSERT INTO usage_counters (key, day, faces) VALUES (?, '2026-01-01', 3)", (f"u:{uid}",))
        conn.execute("INSERT INTO dict_entries (user_id, field, wrong_key, wrong, \"right\", created_at, updated_at)"
                     " VALUES (?, 'f', 'k', 'w', 'r', 0, 0)", (uid,))
        conn.execute("INSERT INTO identities (provider, subject, user_id, created_at) VALUES ('line', ?, ?, 0)", (uid, uid))
        conn.execute("INSERT INTO email_tokens (token_hash, user_id, purpose, expires_at) VALUES (?, ?, 'verify', 1)", (uid, uid))
    tok = auth.start_session(u)
    auth.record_failure(auth.attempt_keys(u.email, "ip-rieng"))
    return ws, tok


def count(table, col, val):
    with auth._db() as conn:
        return conn.execute(f"SELECT COUNT(*) AS n FROM {table} WHERE {col} = ?", (val,)).fetchone()["n"]


def test_purge_xoa_dung_tai_khoan_mot_cham_het_han_va_moi_thu_cua_no(client):
    het, con = guest(client), guest(client)
    ws, tok = fill_user_data(het["id"])
    ws_con, tok_con = fill_user_data(con["id"])
    set_seen(het["id"], 8)                     # (tạo phiên trong fill_user_data đã làm mới last_seen → chỉnh SAU)
    set_seen(con["id"], 6)
    key = auth.attempt_keys("trial:" + het["trial_id"], "")[0]

    assert auth.purge_expired_trials() == 1
    assert not exists(het["id"]) and exists(con["id"])
    assert not ws.dir().exists() and workspace.load(ws.id) is None
    assert ws_con.dir().exists()
    assert auth.user_for_token(tok) is None and auth.user_for_token(tok_con) is not None
    assert count("usage_counters", "key", f"u:{het['id']}") == 0 and count("usage_counters", "key", f"u:{con['id']}") == 1
    assert count("dict_entries", "user_id", het["id"]) == 0 and count("dict_entries", "user_id", con["id"]) == 1
    assert count("identities", "user_id", het["id"]) == 0
    assert count("email_tokens", "user_id", het["id"]) == 0
    assert count("login_fails", "key", key) == 0
    assert auth.purge_expired_trials() == 0            # chạy lần hai: không lỗi, không xoá thêm


def test_purge_khong_dung_trial_cu_member_demo_admin(client, monkeypatch):
    from api import demo
    monkeypatch.setenv("TSUCHO_DEMO_ACCOUNTS", "demo@x.test:matkhau-demo")
    demo.tao_neu_thieu()
    cu = auth.create_trial_user("cu-do-di-tru", "1")                  # ephemeral=0
    mem = auth.create_user("m@vd.com", "matkhau123", verified=True)
    adm = auth.create_user("a@vd.com", "matkhau123", verified=True)
    with auth._db() as conn:
        conn.execute("UPDATE users SET role = 'admin' WHERE id = ?", (adm.id,))
    dm = auth.get_by_email("demo@x.test")[0]
    ids = [cu.id, mem.id, adm.id, dm.id]
    for i in ids:
        set_seen(i, 365)
    wss = [workspace.create(owner=i) for i in ids]
    assert auth.purge_expired_trials() == 0
    assert all(exists(i) for i in ids) and all(w.dir().exists() for w in wss)


def test_purge_dung_last_seen_roi_created_at_va_so_ngay_tuy_chinh(client, monkeypatch):
    g = guest(client)
    with auth._db() as conn:
        conn.execute("UPDATE users SET last_seen = NULL, created_at = ? WHERE id = ?", (time.time() - 10 * DAY, g["id"]))
    assert auth.purge_expired_trials(days=30) == 0
    monkeypatch.setenv("TSUCHO_TRIAL_KEEP_DAYS", "9")
    assert auth.trial_keep_days() == 9 and auth.purge_expired_trials() == 1
    monkeypatch.setenv("TSUCHO_TRIAL_KEEP_DAYS", "rac")
    assert auth.trial_keep_days() == 7


def test_loi_xoa_mot_ho_so_khong_hong_ca_luot_va_giu_lai_tai_khoan_de_thu_lai(client, monkeypatch):
    a, b = guest(client), guest(client)
    ws_a, _ = fill_user_data(a["id"])
    ws_b, _ = fill_user_data(b["id"])
    set_seen(a["id"], 9)
    set_seen(b["id"], 9)
    real = workspace.delete

    def hong(ws):
        if ws.id == ws_a.id:
            raise OSError("đĩa lỗi")
        real(ws)

    monkeypatch.setattr(workspace, "delete", hong)
    assert auth.purge_expired_trials() == 1
    assert exists(a["id"]) and not exists(b["id"]), "tài khoản lỗi được giữ (không để hồ sơ mồ côi cho claim_ownerless)"
    monkeypatch.setattr(workspace, "delete", real)
    assert auth.purge_expired_trials() == 1 and not exists(a["id"]) and not ws_a.dir().exists()


def test_last_seen_cap_nhat_khi_tao_phien_va_co_dieu_kien_khi_dung(client):
    j = client.post("/api/auth/trial/new", json={}).json()        # đang có phiên
    uid = j["id"]
    set_seen(uid, 2)

    def seen():
        with auth._db() as conn:
            return conn.execute("SELECT last_seen FROM users WHERE id = ?", (uid,)).fetchone()["last_seen"]

    cu = seen()
    client.get("/api/auth/me")                                    # đã cũ hơn 1 giờ → cập nhật
    moi = seen()
    assert moi > cu + DAY
    time.sleep(0.05)
    client.get("/api/auth/me")                                    # còn mới → KHÔNG ghi
    assert seen() == moi
    with auth._db() as conn:                                      # lùi 30 phút: vẫn chưa quá 1 giờ → không ghi
        conn.execute("UPDATE users SET last_seen = ? WHERE id = ?", (time.time() - 1800, uid))
    t = seen()
    client.get("/api/auth/me")
    assert seen() == t
    with auth._db() as conn:
        conn.execute("UPDATE users SET last_seen = ? WHERE id = ?", (time.time() - 7200, uid))
    client.get("/api/auth/me")
    assert seen() > time.time() - 60
    # đăng nhập lại (tạo phiên) luôn cập nhật
    set_seen(uid, 0.5)
    client.post("/api/auth/logout")
    client.post("/api/auth/trial", json={"id": j["trial_id"], "password": j["trial_password"]})
    assert seen() > time.time() - 60


def test_di_tru_them_cot_ephemeral_va_last_seen_cho_csdl_cu(tmp_path, monkeypatch):
    import sqlite3
    monkeypatch.setattr(auth, "DB_PATH", tmp_path / "cu.db")
    c = sqlite3.connect(tmp_path / "cu.db")
    c.executescript("CREATE TABLE users (id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL,"
                    " role TEXT NOT NULL DEFAULT 'user', created_at REAL NOT NULL, prefs TEXT NOT NULL DEFAULT '{}');"
                    "INSERT INTO users (id, email, password_hash, created_at) VALUES ('u1', 'chu', 'x', 1);")
    c.commit()
    c.close()
    auth.init_db()
    auth.init_db()
    with auth._db() as conn:
        r = conn.execute("SELECT ephemeral, last_seen, kind, email FROM users").fetchone()
    assert (r["ephemeral"], r["last_seen"], r["kind"], r["email"]) == (0, None, "trial", "trial:chu")


def test_luong_don_dep_chay_nen_khong_chan(client, monkeypatch):
    import threading
    chay = threading.Event()
    monkeypatch.setattr(auth, "purge_expired_trials", lambda: chay.set() or 0)
    dung = threading.Event()
    t = auth.start_purge_thread(interval_hours=6, stop=dung)
    assert t.daemon and chay.wait(5)
    dung.set()
    t.join(5)
    assert not t.is_alive()
