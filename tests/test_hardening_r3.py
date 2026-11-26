"""Audit lần 3: kiểm chứng các bản vá bảo mật nhánh đăng nhập, đăng ký, quên mật khẩu và GIS."""

from concurrent.futures import ThreadPoolExecutor
import time

import pytest

from api import auth, mailer, main, oauth, quota, workspace
from test_api_auth import client, register  # noqa: F401
from test_google_gis import get_nonce, gis, post, token  # noqa: F401


def test_gis_replay_bi_chan_du_dat_lai_cookie_thu_cong(client, gis):
    n = get_nonce(client)
    cred = token(n)
    assert post(client, cred).status_code == 200
    client.post("/api/auth/logout")
    # Kẻ tấn công tự gửi lại cookie chứa nonce cũ từ JWT công khai
    client.cookies.set(oauth.GIS_COOKIE, n, path="/api/auth/google")
    r = post(client, cred)
    assert r.status_code == 400 and r.json()["detail"]["kind"] == "state"


def test_gis_tu_choi_nonce_khong_do_server_cap(client, gis):
    forged = "tu-bia-nonce-khong-ton-tai"
    client.cookies.set(oauth.GIS_COOKIE, forged, path="/api/auth/google")
    r = post(client, token(forged))
    assert r.status_code == 400 and r.json()["detail"]["kind"] == "state"


def test_gis_replay_dong_thoi_chi_mot_lan_thanh_cong(client, gis):
    n = get_nonce(client)
    cred = token(n)

    def thu(_):
        from fastapi.testclient import TestClient

        with TestClient(main.app) as c:
            c.cookies.set(oauth.GIS_COOKIE, n, path="/api/auth/google")
            return c.post("/api/auth/google/credential", json={"credential": cred}).status_code

    with ThreadPoolExecutor(6) as ex:
        codes = list(ex.map(thu, range(6)))
    assert sorted(codes) == [200] + [400] * 5


def test_chunked_body_qua_64kb_bi_413(client):
    def gen():
        yield b'{"email":"a@b.c","password":"'
        for _ in range(10):
            yield b"x" * 7000
        yield b'"}'

    r = client.post("/api/auth/login", content=gen(), headers={"Content-Type": "application/json"})
    assert r.status_code == 413 and r.json()["detail"] == {"kind": "too_large"}


def test_cache_control_no_store_va_csp_day_du(client, monkeypatch):
    monkeypatch.setattr(auth, "OPEN_LOGIN", True)
    for url, meth in (
        ("/api/auth/methods", "get"),
        ("/api/auth/trial/new", "post"),
        ("/api/auth/me", "get"),
    ):
        r = getattr(client, meth)(url, json={}) if meth == "post" else getattr(client, meth)(url)
        assert r.headers.get("cache-control") == "no-store", url
    r_login = client.post("/api/auth/login", json={"email": "a@b.c", "password": "x"})
    assert r_login.headers.get("cache-control") == "no-store"

    csp = client.get("/api/health").headers["content-security-policy"]
    for directive in ("default-src 'self'", "object-src 'none'", "base-uri 'self'", "frame-ancestors 'none'"):
        assert directive in csp
    assert "https://accounts.google.com/gsi/" in csp and "https://challenges.cloudflare.com" in csp
    assert "no-store" not in client.get("/api/health").headers.get("cache-control", "")


def test_csrf_fallback_sec_fetch_site_va_referer(client, monkeypatch):
    monkeypatch.setenv("TSUCHO_PUBLIC_URL", "https://app.tsucho-scan.com")
    r1 = client.post("/api/auth/logout", headers={"Sec-Fetch-Site": "cross-site"})
    assert r1.status_code == 403 and r1.json()["detail"] == {"kind": "bad_origin"}
    r2 = client.post("/api/auth/logout", headers={"Referer": "https://evil.example.com/attack.html"})
    assert r2.status_code == 403 and r2.json()["detail"] == {"kind": "bad_origin"}
    r3 = client.post("/api/auth/logout", headers={"Sec-Fetch-Site": "same-origin", "Referer": "https://app.tsucho-scan.com/cases/"})
    assert r3.status_code == 200


def test_cookie_secure_tu_bat_theo_https(monkeypatch):
    monkeypatch.delenv("TSUCHO_COOKIE_SECURE", raising=False)
    monkeypatch.delenv("TSUCHO_COOKIE_SAMESITE", raising=False)
    monkeypatch.setenv("TSUCHO_PUBLIC_URL", "https://app.tsucho-scan.com")
    assert auth._cookie_flags() == {"samesite": "lax", "secure": True}
    monkeypatch.setenv("TSUCHO_COOKIE_SECURE", "0")
    assert auth._cookie_flags() == {"samesite": "lax", "secure": False}
    monkeypatch.delenv("TSUCHO_COOKIE_SECURE")
    monkeypatch.setenv("TSUCHO_PUBLIC_URL", "http://localhost:3000")
    assert auth._cookie_flags() == {"samesite": "lax", "secure": False}


def test_oauth_state_cookie_xoa_khop_co(client, monkeypatch):
    monkeypatch.setenv("GOOGLE_CLIENT_ID", "gid")
    monkeypatch.setenv("GOOGLE_CLIENT_SECRET", "gsec")
    r = client.get("/api/auth/google/callback", params={"error": "access_denied"}, follow_redirects=False)
    sc = r.headers["set-cookie"]
    assert "HttpOnly" in sc and "samesite=lax" in sc.lower()


def test_dang_nhap_moi_thu_hoi_phien_cu_cua_trinh_duyet(client):
    register(client, "an@vd.com", "Matkhau123")
    tok_cu = client.cookies.get(auth.COOKIE)
    assert auth.user_for_token(tok_cu) is not None
    register(client, "binh@vd.com", "Matkhau456")
    assert auth.user_for_token(tok_cu) is None


def test_may_chu_cong_khai_thieu_resend_tra_503_va_khong_ghi_outbox(client, monkeypatch):
    monkeypatch.setenv("TSUCHO_PUBLIC_URL", "https://app.tsucho-scan.com")
    monkeypatch.delenv("RESEND_API_KEY", raising=False)
    monkeypatch.delenv("TSUCHO_MAIL_SYNC", raising=False)
    for url in ("/api/auth/register", "/api/auth/forgot", "/api/auth/resend"):
        r = client.post(url, json={"email": "ai@vd.com"})
        assert r.status_code == 503 and r.json()["detail"] == {"kind": "mail_off"}, url
    mailer.send("ai@vd.com", "sub", "body", purpose="verify")
    outbox_dir = workspace.DATA_DIR / "outbox"
    assert not outbox_dir.exists() or list(outbox_dir.glob("*.txt")) == []


def test_register_het_han_muc_ip_khong_chen_user_rac(client):
    for i in range(quota.MAIL_PER_IP + 5):
        r = client.post("/api/auth/register", json={"email": f"u{i}@vd.com"})
        assert r.status_code == 200
    assert auth.count_users() == quota.MAIL_PER_IP


def test_purge_stale_unverified_don_dung_tai_khoan_rac(client):
    empty = auth.create_user("rac@vd.com")
    keep_new = auth.create_user("moi@vd.com")
    keep_verified = auth.create_user("that@vd.com", "Matkhau123", verified=True)
    keep_ws = auth.create_user("co-ws@vd.com")
    workspace.create(owner=keep_ws.id)
    with auth._db() as conn:
        old_ts = time.time() - 10 * 86400
        conn.execute("UPDATE users SET created_at = ? WHERE id IN (?, ?, ?)", (old_ts, empty.id, keep_verified.id, keep_ws.id))
    assert auth.purge_stale_unverified(days=7) == 1
    assert auth.get_by_id(empty.id) is None
    assert auth.get_by_id(keep_new.id) is not None
    assert auth.get_by_id(keep_verified.id) is not None
    assert auth.get_by_id(keep_ws.id) is not None


def test_scrypt_p5_rehash_va_chan_mat_khau_yeu(client, monkeypatch):
    assert auth._SCRYPT_PROD == {"n": 2**14, "r": 8, "p": 5}
    monkeypatch.setattr(auth, "_SCRYPT", dict(auth._SCRYPT_PROD))
    monkeypatch.setattr(auth, "_DUMMY_HASH", None)

    with pytest.raises(auth.AuthError) as e_short:
        auth.check_password_strength("Ab12345")
    assert e_short.value.code == "weak_password"

    with pytest.raises(auth.AuthError) as e_space:
        auth.check_password_strength("        ")
    assert e_space.value.code == "weak_password"

    for num_only in ("12345678", "123456789"):
        with pytest.raises(auth.AuthError) as e_num:
            auth.check_password_strength(num_only)
        assert e_num.value.code == "password_policy"
        assert set(e_num.value.info["missing"]) == {"upper", "lower"}

    with pytest.raises(auth.AuthError) as e_low:
        auth.check_password_strength("abcdefgh")
    assert e_low.value.code == "password_policy" and set(e_low.value.info["missing"]) == {"upper", "digit"}

    with pytest.raises(auth.AuthError) as e_up:
        auth.check_password_strength("ABCDEFGH1")
    assert e_up.value.code == "password_policy" and e_up.value.info["missing"] == ["lower"]

    for common in ("Password123", "Abcd1234"):
        with pytest.raises(auth.AuthError) as e_common:
            auth.check_password_strength(common)
        assert e_common.value.code == "password_common"

    auth.check_password_strength("Tsucho2026")

    # Reset với "12345678" phải báo password_policy (không báo weak_password) và không đốt token
    register(client, "pw@vd.com", "Matkhau123")
    client.post("/api/auth/logout")
    client.post("/api/auth/forgot", json={"email": "pw@vd.com"})
    reset_mail = next((workspace.DATA_DIR / "outbox").glob("*-reset.txt"))
    tk = reset_mail.read_text(encoding="utf-8").split("#token=")[1].split()[0]
    r_bad = client.post("/api/auth/reset", json={"token": tk, "password": "12345678"})
    assert r_bad.status_code == 400 and r_bad.json()["detail"]["kind"] == "password_policy"
    assert client.post("/api/auth/reset", json={"token": tk, "password": "Tsucho2026"}).status_code == 200

    # Giả lập hash cũ p=1 → vẫn đăng nhập được và tự nâng lên p=5
    import hashlib, secrets

    salt = secrets.token_bytes(16)
    dk = hashlib.scrypt(b"matkhau-cu-1", salt=salt, dklen=32, n=2**14, r=8, p=1)
    old_hash = f"scrypt${2**14}$8$1${salt.hex()}${dk.hex()}"
    u = auth.create_user("legacy@vd.com", "Tam-thoi-123", verified=True)
    with auth._db() as conn:
        conn.execute("UPDATE users SET password_hash = ? WHERE id = ?", (old_hash, u.id))
    assert auth.needs_rehash(old_hash) is True
    r = client.post("/api/auth/login", json={"email": "legacy@vd.com", "password": "matkhau-cu-1"})
    assert r.status_code == 200
    _, new_hash = auth.get_by_email("legacy@vd.com")
    assert "$8$5$" in new_hash and not auth.needs_rehash(new_hash)


def test_password_spraying_song_song_bi_chan_dung_nguong_ip(client):
    def thu(i):
        return client.post("/api/auth/login", json={"email": f"spray{i}@vd.com", "password": "sai"}).status_code

    with ThreadPoolExecutor(20) as ex:
        codes = list(ex.map(thu, range(30)))
    assert codes.count(401) == auth.MAX_FAILS_IP
    assert codes.count(429) == 30 - auth.MAX_FAILS_IP


def test_dau_vao_json_khong_phai_chuoi_bi_chan_an_toan(client, monkeypatch):
    monkeypatch.setattr(auth, "OPEN_LOGIN", True)
    assert client.post("/api/auth/register", json={"email": ["a@b.c"]}).status_code == 400
    assert client.post("/api/auth/login", json={"email": 123, "password": ["x"]}).status_code == 401
    assert client.post("/api/auth/trial", json={"id": ["a"], "password": None}).status_code == 401


def test_oauth_start_rate_limit(client, monkeypatch):
    monkeypatch.setenv("GOOGLE_CLIENT_ID", "gid")
    monkeypatch.setenv("GOOGLE_CLIENT_SECRET", "gsec")
    monkeypatch.setenv("TSUCHO_OAUTH_START_PER_IP", "2")
    for _ in range(2):
        r = client.get("/api/auth/google/start", follow_redirects=False)
        assert r.status_code == 302 and "accounts.google.com" in r.headers["location"]
    r3 = client.get("/api/auth/google/start", follow_redirects=False)
    assert r3.status_code == 302 and r3.headers["location"] == "/login/?auth_error=provider"


def test_gis_nonce_co_han_muc_theo_ip(client, gis, monkeypatch):
    """Mỗi lần cấp nonce ghi một hàng CSDL → gọi dồn dập bị chặn 429 (giao diện giữ nút chuyển hướng thường)."""
    monkeypatch.setenv("TSUCHO_GIS_NONCE_PER_IP", "2")
    for _ in range(2):
        get_nonce(client)
    r = client.get("/api/auth/google/nonce")
    assert r.status_code == 429 and r.json()["detail"]["kind"] == "rate_limited"
    assert r.headers.get("cache-control") == "no-store"


def test_doc_than_lan_hai_toi_may_khach_that_khong_de_quy():
    """Thân POST /api/auth/* đã đọc sẵn để đếm byte: lần receive() thứ hai (chờ ngắt kết nối…) phải gọi hàm gốc,
    không được gọi lại chính nó (đệ quy vô hạn → RecursionError)."""
    import asyncio

    seen = []

    async def app(scope, receive, send):
        seen.append(await receive())
        seen.append(await receive())
        await send({"type": "http.response.start", "status": 200, "headers": []})
        await send({"type": "http.response.body", "body": b"ok"})

    msgs = [{"type": "http.request", "body": b'{"a":1}', "more_body": False}, {"type": "http.disconnect"}]

    async def receive():
        return msgs.pop(0)

    sent = []

    async def send(m):
        sent.append(m)

    scope = {"type": "http", "method": "POST", "path": "/api/auth/login", "headers": []}
    asyncio.run(main.SecurityMiddleware(app)(scope, receive, send))
    assert seen[0]["body"] == b'{"a":1}' and seen[1]["type"] == "http.disconnect"
    assert sent[0]["status"] == 200
