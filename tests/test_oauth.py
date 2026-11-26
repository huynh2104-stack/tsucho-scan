"""Đợt B: đăng nhập Google + LINE (api/oauth.py, auth.login_with_identity). Không bao giờ gọi mạng thật:
`oauth._post_form` bị thay bằng bản giả; khoá nhà cung cấp đặt bằng biến môi trường giả.
"""

import base64
import hashlib
import json
import time
import urllib.parse

import pytest

from api import auth, oauth, workspace
from test_api_auth import client, register, trial  # noqa: F401 — fixture dùng chung: CSDL tạm


def jwt(claims: dict) -> str:
    b = lambda d: base64.urlsafe_b64encode(json.dumps(d).encode()).rstrip(b"=").decode()  # noqa: E731
    return f"{b({'alg': 'RS256'})}.{b(claims)}.sig"


class Fake:
    """Thay `oauth._post_form`: ghi lại lời gọi; trả id_token Google hoặc kết quả verify của LINE."""

    def __init__(self):
        self.calls = []
        self.claims = {}
        self.fail = False
        self.no_id_token = False

    def __call__(self, url, data):
        self.calls.append((url, dict(data)))
        if self.fail:
            raise OSError("mạng đứt")
        if url == oauth.GOOGLE_TOKEN:
            return {} if self.no_id_token else {"id_token": jwt(self.claims)}
        if url == oauth.LINE_TOKEN:
            return {"id_token": "a.b.c"}
        if url == oauth.LINE_VERIFY:
            return self.claims
        raise AssertionError(url)


@pytest.fixture
def fake(monkeypatch):
    f = Fake()
    monkeypatch.setattr(oauth, "_post_form", f)
    monkeypatch.setenv("GOOGLE_CLIENT_ID", "gid.apps")
    monkeypatch.setenv("GOOGLE_CLIENT_SECRET", "gsecret")
    monkeypatch.setenv("LINE_CHANNEL_ID", "lid")
    monkeypatch.setenv("LINE_CHANNEL_SECRET", "lsecret")
    monkeypatch.setenv("TSUCHO_PUBLIC_URL", "https://app.tsucho-scan.com/")
    return f


def google_claims(_nonce, **kw):
    c = {"iss": "https://accounts.google.com", "aud": "gid.apps", "exp": time.time() + 3600, "nonce": _nonce,
         "sub": "g-1", "email": "Nguoi@Vd.com", "email_verified": True, "name": "Người Dùng"}
    c.update(kw)
    return c


def begin(client, provider="google", next_="/cases/"):
    """Bấm nút: trả dict(state, nonce, verifier, location, response)."""
    r = client.get(f"/api/auth/{provider}/start", params={"next": next_}, follow_redirects=False)
    assert r.status_code == 302, r.text
    loc = urllib.parse.urlsplit(r.headers["location"])
    q = dict(urllib.parse.parse_qsl(loc.query))
    with auth._db() as conn:
        row = dict(conn.execute("SELECT * FROM oauth_states WHERE state = ?", (q["state"],)).fetchone())
    return {"state": q["state"], "nonce": row["nonce"], "verifier": row["verifier"], "query": q, "row": row,
            "location": r.headers["location"], "response": r}


def callback(client, provider, **params):
    return client.get(f"/api/auth/{provider}/callback", params=params, follow_redirects=False)


def login_google(client, fake, next_="/cases/", **claims):
    s = begin(client, "google", next_)
    fake.claims = google_claims(s["nonce"], **claims)
    return callback(client, "google", code="CODE", state=s["state"]), s


def ok(r, to="/cases/"):
    assert r.status_code == 302 and r.headers["location"] == to, (r.status_code, r.headers.get("location"))


def err(r, code):
    assert r.status_code == 302 and r.headers["location"] == f"/login/?auth_error={code}", r.headers.get("location")


def me(client):
    return client.get("/api/auth/me").json()


# ── start ─────────────────────────────────────────────────────────────

def test_google_start_tham_so_cookie_va_hang_state(client, fake):
    s = begin(client, "google", "/cases/")
    loc = urllib.parse.urlsplit(s["location"])
    assert f"{loc.scheme}://{loc.netloc}{loc.path}" == "https://accounts.google.com/o/oauth2/v2/auth"
    q = s["query"]
    assert q["response_type"] == "code" and q["client_id"] == "gid.apps"
    assert q["redirect_uri"] == "https://app.tsucho-scan.com/api/auth/google/callback"
    assert q["scope"] == "openid email profile" and q["prompt"] == "select_account"
    assert q["code_challenge_method"] == "S256" and q["nonce"] == s["nonce"]
    assert 43 <= len(s["verifier"]) <= 128
    want = base64.urlsafe_b64encode(hashlib.sha256(s["verifier"].encode()).digest()).rstrip(b"=").decode()
    assert q["code_challenge"] == want and "=" not in want
    assert s["row"]["provider"] == "google" and s["row"]["next_path"] == "/cases/"
    assert 590 < s["row"]["expires_at"] - time.time() <= 600
    assert s["state"] != s["nonce"] and len(s["state"]) >= 40
    sc = s["response"].headers["set-cookie"]
    assert f"{oauth.STATE_COOKIE}={s['state']}" in sc and "HttpOnly" in sc and "Path=/api/auth/" in sc
    assert "SameSite=lax" in sc.replace("Lax", "lax") and "Max-Age=600" in sc


def test_line_start_tham_so(client, fake):
    s = begin(client, "line")
    assert s["location"].startswith("https://access.line.me/oauth2/v2.1/authorize?")
    q = s["query"]
    assert q["client_id"] == "lid" and q["response_type"] == "code" and q["scope"] == "openid profile email"
    assert q["redirect_uri"] == "https://app.tsucho-scan.com/api/auth/line/callback"
    assert q["code_challenge_method"] == "S256" and q["nonce"] == s["nonce"] and "prompt" not in q


def test_provider_la_404_chua_cau_hinh_thi_ve_login_bao_provider(client, fake, monkeypatch):
    assert client.get("/api/auth/facebook/start", follow_redirects=False).status_code == 404
    assert client.get("/api/auth/facebook/callback", follow_redirects=False).status_code == 404
    monkeypatch.delenv("GOOGLE_CLIENT_SECRET")
    err(client.get("/api/auth/google/start", follow_redirects=False), "provider")
    monkeypatch.delenv("LINE_CHANNEL_ID")
    err(client.get("/api/auth/line/start", follow_redirects=False), "provider")
    with auth._db() as conn:
        assert conn.execute("SELECT COUNT(*) AS n FROM oauth_states").fetchone()["n"] == 0


@pytest.mark.parametrize("next_,want", [
    ("/cases/", "/cases/"), ("/cases/?ws=ab&x=1", "/cases/?ws=ab&x=1"), ("//evil.com", "/"), ("/\\evil.com", "/"),
    ("/\t/x", "/"), ("/ a", "/"), ("/a\nb", "/"), ("https://evil.com", "/"), ("/x?u=http://evil.com", "/"),
    ("evil.com", "/"), ("", "/"), ("/a\\b", "/"), ("/" + "a" * 600, "/"),
])
def test_next_chi_nhan_duong_dan_noi_bo(client, fake, next_, want):
    s = begin(client, "google", next_)
    assert s["row"]["next_path"] == want
    fake.claims = google_claims(s["nonce"])
    ok(callback(client, "google", code="C", state=s["state"]), want)


def test_start_khong_next_thi_ve_goc_va_don_state_het_han(client, fake):
    old = begin(client)
    with auth._db() as conn:
        conn.execute("UPDATE oauth_states SET expires_at = ?", (time.time() - 1,))
    r = client.get("/api/auth/google/start", follow_redirects=False)
    assert r.status_code == 302
    with auth._db() as conn:
        rows = conn.execute("SELECT state, next_path FROM oauth_states").fetchall()
    assert len(rows) == 1 and rows[0]["state"] != old["state"] and rows[0]["next_path"] == "/"


# ── callback thành công ───────────────────────────────────────────────

def test_google_callback_tao_tai_khoan_phien_va_ve_next(client, fake):
    r, s = login_google(client, fake)
    ok(r)
    assert auth.COOKIE in r.headers["set-cookie"]
    j = me(client)
    assert (j["email"], j["kind"], j["email_verified"], j["role"], j["display_name"]) == \
           ("nguoi@vd.com", "member", True, "user", "Người Dùng")
    assert j["providers"] == ["google"]
    u, h = auth.get_by_email("nguoi@vd.com")
    assert h == "" and u.email_verified
    url, data = fake.calls[0]
    assert url == oauth.GOOGLE_TOKEN
    assert data == {"code": "CODE", "client_id": "gid.apps", "client_secret": "gsecret",
                    "redirect_uri": "https://app.tsucho-scan.com/api/auth/google/callback",
                    "grant_type": "authorization_code", "code_verifier": s["verifier"]}
    # cookie state bị xoá, hàng state cũng mất
    assert oauth.STATE_COOKIE in r.headers["set-cookie"] and "Max-Age=0" in r.headers["set-cookie"]
    with auth._db() as conn:
        assert conn.execute("SELECT COUNT(*) AS n FROM oauth_states").fetchone()["n"] == 0


def test_dang_nhap_lai_google_vao_dung_tai_khoan_cu_va_cap_nhat_email(client, fake):
    login_google(client, fake)
    uid = me(client)["id"]
    client.post("/api/auth/logout")
    ok(login_google(client, fake, email="moi-doi@vd.com")[0])
    assert me(client)["id"] == uid
    with auth._db() as conn:
        assert conn.execute("SELECT email FROM identities").fetchone()["email"] == "moi-doi@vd.com"
        assert conn.execute("SELECT COUNT(*) AS n FROM users").fetchone()["n"] == 1


def test_google_email_trong_danh_sach_admin_thanh_admin_va_nhan_du_lieu_cu(client, fake, monkeypatch):
    monkeypatch.setenv("TSUCHO_ADMIN_EMAILS", "nguoi@vd.com")
    cu = workspace.create()
    ok(login_google(client, fake)[0])
    assert me(client)["role"] == "admin"
    assert client.get(f"/api/ws/{cu.id}").status_code == 200


def test_tai_khoan_chi_co_google_quen_mat_khau_dat_mat_khau_roi_dang_nhap_email(client, fake):
    login_google(client, fake)
    client.post("/api/auth/logout")
    client.post("/api/auth/forgot", json={"email": "nguoi@vd.com", "lang": "en"})
    outbox = sorted((workspace.DATA_DIR / "outbox").glob("*-reset.txt"))
    assert len(outbox) == 1
    tk = outbox[0].read_text(encoding="utf-8").split("#token=")[1].split()[0]
    assert client.post("/api/auth/reset", json={"token": tk, "password": "Mat-khau-moi-9"}).status_code == 200
    client.post("/api/auth/logout")
    assert client.post("/api/auth/login", json={"email": "nguoi@vd.com", "password": "Mat-khau-moi-9"}).status_code == 200


# ── state / lỗi ───────────────────────────────────────────────────────

def test_state_sai_thieu_cookie_dung_lai_het_han_hoac_khac_provider(client, fake):
    # state không tồn tại
    s = begin(client)
    err(callback(client, "google", code="C", state="khong-co"), "state")
    err(callback(client, "google", code="C"), "state")
    # thiếu cookie
    client.cookies.clear()
    fake.claims = google_claims(s["nonce"])
    err(callback(client, "google", code="C", state=s["state"]), "state")
    assert fake.calls == [], "không được gọi nhà cung cấp khi state không hợp lệ"

    # cookie khác state
    s = begin(client)
    client.cookies.clear()
    client.cookies.set(oauth.STATE_COOKIE, "khac", path="/api/auth/")
    err(callback(client, "google", code="C", state=s["state"]), "state")

    # dùng lại state sau khi đã thành công
    r, s = login_google(client, fake)
    ok(r)
    client.cookies.set(oauth.STATE_COOKIE, s["state"], path="/api/auth/")
    err(callback(client, "google", code="C", state=s["state"]), "state")

    # hết hạn
    s = begin(client)
    with auth._db() as conn:
        conn.execute("UPDATE oauth_states SET expires_at = ? WHERE state = ?", (time.time() - 1, s["state"]))
    err(callback(client, "google", code="C", state=s["state"]), "state")

    # state của Google đem sang callback LINE
    s = begin(client, "google")
    err(callback(client, "line", code="C", state=s["state"]), "state")


def test_state_dung_mot_lan_ke_ca_khi_buoc_sau_loi(client, fake):
    s = begin(client)
    fake.claims = google_claims(s["nonce"], aud="khac")
    err(callback(client, "google", code="C", state=s["state"]), "provider")
    fake.claims = google_claims(s["nonce"])
    err(callback(client, "google", code="C", state=s["state"]), "state")


def test_nguoi_dung_huy_o_trang_nha_cung_cap_la_cancelled(client, fake):
    s = begin(client)
    err(callback(client, "google", error="access_denied", state=s["state"]), "cancelled")
    err(callback(client, "google", error="access_denied"), "cancelled")
    with auth._db() as conn:
        assert conn.execute("SELECT COUNT(*) AS n FROM oauth_states").fetchone()["n"] == 0
    assert fake.calls == []


@pytest.mark.parametrize("claims,code", [
    ({"aud": "khong-phai-cua-minh"}, "provider"),
    ({"aud": ["x", "y"]}, "provider"),
    ({"iss": "https://evil.example.com"}, "provider"),
    ({"nonce": "nonce-sai"}, "provider"),
    ({"nonce": None}, "provider"),
    ({"exp": time.time() - 3600}, "provider"),
    ({"exp": "nhieu"}, "provider"),
    ({"sub": ""}, "provider"),
    ({"email_verified": False}, "email_unverified"),
    ({"email_verified": None}, "email_unverified"),
    ({"email": ""}, "email_unverified"),
])
def test_id_token_google_sai_thi_dung_ma_loi(client, fake, claims, code):
    r, _ = login_google(client, fake, **claims)
    err(r, code)
    assert client.get("/api/auth/me").status_code == 401
    assert auth.count_users() == 0


def test_id_token_google_chap_nhan_iss_khong_scheme_aud_dang_list_va_lech_gio_60s(client, fake):
    ok(login_google(client, fake, iss="accounts.google.com", aud=["gid.apps", "khac"], exp=time.time() - 30)[0])


def test_loi_mang_http_json_thieu_id_token_thi_la_provider(client, fake):
    s = begin(client)
    fake.fail = True
    err(callback(client, "google", code="C", state=s["state"]), "provider")
    fake.fail = False
    s = begin(client)
    fake.no_id_token = True
    err(callback(client, "google", code="C", state=s["state"]), "provider")
    s = begin(client)
    err(callback(client, "google", state=s["state"]), "provider")                      # thiếu code


def test_callback_khong_bao_gio_500(client, fake, monkeypatch):
    def hong(*a, **k):
        raise RuntimeError("bug bất ngờ")

    monkeypatch.setattr(auth, "login_with_identity", hong)
    r, _ = login_google(client, fake)
    err(r, "provider")


def test_post_form_that_loi_mang_duoc_bao_boc(monkeypatch):
    def hong(*a, **k):
        raise OSError("không có mạng")

    monkeypatch.setattr(oauth.urllib.request, "urlopen", hong)
    with pytest.raises(OSError):
        oauth._post_form("https://x.example/token", {"a": "b"})
    with pytest.raises(oauth.OAuthError) as e:
        oauth._exchange("https://x.example/token", {"a": "b"})
    assert e.value.code == "provider"


# ── Nối / tạo tài khoản (§3.3) ────────────────────────────────────────

def test_noi_google_vao_member_da_xac_minh_cung_email(client, fake):
    register(client, "Nguoi@vd.com", "Matkhau123")
    uid = me(client)["id"]
    client.post("/api/auth/logout")
    ok(login_google(client, fake)[0])
    assert me(client)["id"] == uid and me(client)["providers"] == ["google"]
    client.post("/api/auth/logout")
    assert client.post("/api/auth/login", json={"email": "nguoi@vd.com", "password": "Matkhau123"}).status_code == 200
    assert auth.count_users() == 1


def test_khong_noi_vao_trial_cung_ten(client, fake, monkeypatch):
    monkeypatch.setattr(auth, "OPEN_LOGIN", True)
    t = trial(client, "nguoi@vd.com").json()
    client.post("/api/auth/logout")
    ok(login_google(client, fake)[0])
    assert me(client)["id"] != t["id"] and me(client)["kind"] == "member"


def test_khong_noi_vao_demo_dung_google_sub(client, fake, monkeypatch):
    from api import demo
    monkeypatch.setenv("TSUCHO_DEMO_ACCOUNTS", "nguoi@vd.com:matkhau-demo")
    demo.tao_neu_thieu()
    d = auth.get_by_email("nguoi@vd.com")[0]
    ok(login_google(client, fake)[0])
    j = me(client)
    assert j["id"] != d.id and j["kind"] == "member" and j["email"] == "nguoi@vd.com"        # hiển thị email Google
    assert auth.get_by_id(j["id"]).email == "google:g-1" and j["email_verified"] is False


def test_khong_noi_vao_admin_cu_legacy_va_khong_thanh_admin(client, fake, monkeypatch):
    monkeypatch.setenv("TSUCHO_ADMIN_EMAILS", "nguoi-khac@vd.com")       # legacy KHÔNG nằm trong danh sách admin → không nối
    with auth._db() as conn:
        conn.execute("INSERT INTO users (id, email, password_hash, role, created_at, kind, email_verified, legacy)"
                     " VALUES ('old000000001', 'nguoi@vd.com', ?, 'admin', 0, 'member', 1, 1)", (auth.hash_password("x" * 9),))
    ok(login_google(client, fake)[0])
    j = me(client)
    assert j["id"] != "old000000001" and j["role"] == "user"
    assert auth.get_by_id(j["id"]).email == "google:g-1"


def test_member_chua_xac_minh_va_chua_co_gi_thi_bi_xoa_nhuong_email(client, fake):
    client.post("/api/auth/register", json={"email": "nguoi@vd.com"})        # có token verify, hash ''
    cu = auth.get_by_email("nguoi@vd.com")[0]
    ok(login_google(client, fake)[0])
    j = me(client)
    assert j["id"] != cu.id and j["email"] == "nguoi@vd.com" and j["email_verified"] is True
    assert auth.get_by_id(cu.id) is None
    with auth._db() as conn:
        assert conn.execute("SELECT COUNT(*) AS n FROM email_tokens WHERE user_id = ?", (cu.id,)).fetchone()["n"] == 0
        assert conn.execute("SELECT COUNT(*) AS n FROM users").fetchone()["n"] == 1
    assert auth.get_by_email("nguoi@vd.com")[0].id == j["id"]


def test_member_chua_xac_minh_nhung_da_co_du_lieu_thi_giu_nguyen_va_dung_google_sub(client, fake):
    client.post("/api/auth/register", json={"email": "nguoi@vd.com"})
    cu = auth.get_by_email("nguoi@vd.com")[0]
    ws = workspace.create()
    ws.owner = cu.id
    ws.save()
    ok(login_google(client, fake)[0])
    j = me(client)
    assert j["id"] != cu.id and auth.get_by_id(cu.id) is not None
    assert auth.get_by_id(j["id"]).email == "google:g-1"


def test_member_chua_xac_minh_dang_co_phien_hoac_mat_khau_cung_khong_bi_xoa(client, fake):
    u = auth.create_user("nguoi@vd.com", "Matkhau123", verified=False)               # có mật khẩu (tài khoản cũ)
    ok(login_google(client, fake)[0])
    assert auth.get_by_id(u.id) is not None and me(client)["id"] != u.id


def test_line_khong_email_dung_line_sub_va_khong_lo_chuoi_line(client, fake):
    s = begin(client, "line", "/cases/")
    fake.claims = {"sub": "U123abc", "name": "Taro", "aud": "lid"}
    ok(callback(client, "line", code="LC", state=s["state"]))
    j = me(client)
    assert j["email"] == "Taro" and "line:" not in json.dumps(j)
    assert j["providers"] == ["line"] and j["display_name"] == "Taro" and j["email_verified"] is False
    assert auth.get_by_id(j["id"]).email == "line:U123abc"
    assert [c[0] for c in fake.calls] == [oauth.LINE_TOKEN, oauth.LINE_VERIFY]
    assert fake.calls[0][1] == {"grant_type": "authorization_code", "code": "LC", "client_id": "lid",
                                "redirect_uri": "https://app.tsucho-scan.com/api/auth/line/callback",
                                "client_secret": "lsecret", "code_verifier": s["verifier"]}
    assert fake.calls[1][1] == {"id_token": "a.b.c", "client_id": "lid", "nonce": s["nonce"]}


def test_line_khong_ten_khong_email_hien_LINE(client, fake):
    s = begin(client, "line")
    fake.claims = {"sub": "U9"}
    ok(callback(client, "line", code="C", state=s["state"]))
    assert me(client)["email"] == "LINE"


def test_line_co_email_trung_member_khong_noi_chi_hien_thi(client, fake):
    register(client, "nguoi@vd.com", "Matkhau123")
    uid = me(client)["id"]
    client.post("/api/auth/logout")
    s = begin(client, "line")
    fake.claims = {"sub": "U1", "name": "Taro", "email": "Nguoi@vd.com"}
    ok(callback(client, "line", code="C", state=s["state"]))
    j = me(client)
    assert j["id"] != uid and j["email"] == "nguoi@vd.com" and j["email_verified"] is False
    assert auth.get_by_id(j["id"]).email == "line:U1" and auth.get_by_id(uid).email == "nguoi@vd.com"
    client.post("/api/auth/logout")
    # lần sau vào lại đúng tài khoản LINE đó
    s = begin(client, "line")
    fake.claims = {"sub": "U1"}
    ok(callback(client, "line", code="C", state=s["state"]))
    assert me(client)["id"] == j["id"]


def test_line_email_khong_nang_admin(client, fake, monkeypatch):
    monkeypatch.setenv("TSUCHO_ADMIN_EMAILS", "nguoi@vd.com")
    s = begin(client, "line")
    fake.claims = {"sub": "U1", "email": "nguoi@vd.com"}
    ok(callback(client, "line", code="C", state=s["state"]))
    assert me(client)["role"] == "user"


def test_line_verify_loi_thi_provider(client, fake):
    s = begin(client, "line")
    fake.claims = {"name": "khong co sub"}
    err(callback(client, "line", code="C", state=s["state"]), "provider")
    assert auth.count_users() == 0


def test_hai_tai_khoan_google_khac_nhau_khong_lan_nhau(client, fake):
    ok(login_google(client, fake, sub="g-1", email="a@vd.com")[0])
    a = me(client)["id"]
    client.post("/api/auth/logout")
    ok(login_google(client, fake, sub="g-2", email="b@vd.com")[0])
    assert me(client)["id"] != a


def test_methods_phan_anh_khoa_da_cau_hinh(client, fake, monkeypatch):
    m = client.get("/api/auth/methods").json()
    assert m["google"] is True and m["line"] is True
    monkeypatch.delenv("LINE_CHANNEL_SECRET")
    assert client.get("/api/auth/methods").json()["line"] is False
