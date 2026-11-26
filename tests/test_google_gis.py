"""Nút «Sign in with Google» (GIS): /api/auth/google/nonce + /credential, kiểm ID token RS256 bằng chứng chỉ giả.
Không gọi mạng thật: `oauth._fetch_google_certs` bị thay; token ký bằng khoá RSA sinh tại chỗ.
"""

import datetime
import time

import pytest
from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.x509.oid import NameOID
from google.auth import crypt, jwt as gjwt

from api import auth, oauth
from test_api_auth import client, register  # noqa: F401 — fixture dùng chung: CSDL tạm

CID = "gid.apps"


def make_key(kid="k1"):
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    name = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, "test")])
    now = datetime.datetime.now(datetime.timezone.utc)
    cert = (x509.CertificateBuilder().subject_name(name).issuer_name(name).public_key(key.public_key())
            .serial_number(x509.random_serial_number()).not_valid_before(now - datetime.timedelta(days=1))
            .not_valid_after(now + datetime.timedelta(days=30)).sign(key, hashes.SHA256()))
    priv = key.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption())
    pem = cert.public_bytes(serialization.Encoding.PEM).decode()
    return crypt.RSASigner.from_string(priv, kid), pem


KEY, PEM = make_key("k1")


class Certs:
    def __init__(self):
        self.certs = {"k1": PEM}
        self.calls = 0

    def __call__(self):
        self.calls += 1
        return dict(self.certs), 3600


@pytest.fixture
def gis(client, monkeypatch):
    c = Certs()
    monkeypatch.setattr(oauth, "_fetch_google_certs", c)
    monkeypatch.setattr(oauth, "_certs", {"keys": {}, "exp": 0.0, "fetched": 0.0, "failed_at": -1e9, "inflight": False})
    monkeypatch.setenv("GOOGLE_CLIENT_ID", CID)
    monkeypatch.setenv("GOOGLE_CLIENT_SECRET", "gsecret")
    monkeypatch.setenv("TSUCHO_PUBLIC_URL", "https://app.tsucho-scan.com")
    return c


def get_nonce(client):
    r = client.get("/api/auth/google/nonce")
    assert r.status_code == 200
    return r.json()["nonce"]


def token(nonce_, signer=None, kid="k1", **kw):
    p = {"iss": "https://accounts.google.com", "aud": CID, "exp": int(time.time()) + 3600, "iat": int(time.time()),
         "nonce": nonce_, "sub": "g-1", "email": "Nguoi@Vd.com", "email_verified": True, "name": "Người Dùng"}
    p.update(kw)
    return gjwt.encode(signer or KEY, p, key_id=kid).decode()


def post(client, cred, **kw):
    return client.post("/api/auth/google/credential", json={"credential": cred}, **kw)


def me(client):
    return client.get("/api/auth/me").json()


def test_nonce_cookie_httponly_va_no_store(client, gis):
    r = client.get("/api/auth/google/nonce")
    assert r.headers["cache-control"] == "no-store"
    sc = r.headers["set-cookie"]
    assert oauth.GIS_COOKIE in sc and "HttpOnly" in sc and "Path=/api/auth/google" in sc and "Max-Age=1800" in sc
    assert len(r.json()["nonce"]) >= 40


def test_token_hop_le_tao_tai_khoan_va_phien(client, gis):
    r = post(client, token(get_nonce(client)))
    assert r.status_code == 200 and auth.COOKIE in r.headers["set-cookie"]
    j = me(client)
    assert (j["email"], j["kind"], j["email_verified"], j["display_name"]) == ("nguoi@vd.com", "member", True, "Người Dùng")
    with auth._db() as conn:
        row = conn.execute("SELECT * FROM identities").fetchone()
    assert (row["provider"], row["subject"]) == ("google", "g-1")


def test_replay_sau_khi_thanh_cong_that_bai(client, gis):
    n = get_nonce(client)
    cred = token(n)
    assert post(client, cred).status_code == 200
    client.post("/api/auth/logout")
    r = post(client, cred)
    assert r.status_code == 400 and r.json()["detail"]["kind"] == "state"


def test_noi_vao_member_da_xac_minh(client, gis):
    register(client, "Nguoi@vd.com", "matkhau123")
    uid = me(client)["id"]
    client.post("/api/auth/logout")
    assert post(client, token(get_nonce(client))).status_code == 200
    assert me(client)["id"] == uid and auth.count_users() == 1


def _legacy():
    with auth._db() as conn:
        conn.execute("INSERT INTO users (id, email, password_hash, role, created_at, kind, email_verified, legacy)"
                     " VALUES ('old000000001', 'nguoi@vd.com', ?, 'admin', 0, 'member', 1, 1)", (auth.hash_password("x" * 9),))


def test_admin_cu_chi_noi_khi_email_trong_danh_sach(client, gis, monkeypatch):
    monkeypatch.setenv("TSUCHO_ADMIN_EMAILS", "khac@vd.com")
    _legacy()
    assert post(client, token(get_nonce(client))).status_code == 200
    assert me(client)["id"] != "old000000001" and me(client)["role"] == "user"


def test_admin_cu_noi_va_thanh_admin_khi_trong_danh_sach(client, gis, monkeypatch):
    monkeypatch.setenv("TSUCHO_ADMIN_EMAILS", "nguoi@vd.com")
    _legacy()
    assert post(client, token(get_nonce(client))).status_code == 200
    assert me(client)["id"] == "old000000001" and me(client)["role"] == "admin"


def test_email_trong_danh_sach_admin_thanh_admin(client, gis, monkeypatch):
    monkeypatch.setenv("TSUCHO_ADMIN_EMAILS", "nguoi@vd.com")
    assert post(client, token(get_nonce(client))).status_code == 200
    assert me(client)["role"] == "admin"


def test_email_chua_xac_minh_bi_tu_choi(client, gis):
    r = post(client, token(get_nonce(client), email_verified=False))
    assert r.status_code == 400 and r.json()["detail"]["kind"] == "email_unverified"


@pytest.mark.parametrize("kw,kind", [
    ({"aud": "khac.apps"}, "provider"),
    ({"iss": "https://evil.example.com"}, "provider"),
    ({"exp": int(time.time()) - 3600}, "provider"),
    ({"nonce": "nonce-khac"}, "state"),
    ({"sub": ""}, "provider"),
])
def test_token_sai(client, gis, kw, kind):
    r = post(client, token(get_nonce(client), **kw))
    assert r.status_code == 400 and r.json()["detail"]["kind"] == kind
    assert client.get("/api/auth/me").status_code == 401


def test_thieu_cookie_nonce(client, gis):
    r = post(client, token("n"))
    assert r.status_code == 400 and r.json()["detail"]["kind"] == "state"


def test_chu_ky_cua_khoa_khac(client, gis):
    other, _ = make_key("k1")
    r = post(client, token(get_nonce(client), signer=other))
    assert r.status_code == 400 and r.json()["detail"]["kind"] == "provider"


def test_kid_la_chi_tai_lai_mot_lan(client, gis):
    n = get_nonce(client)
    cred = token(n, kid="k-la")
    post(client, cred)
    post(client, cred)
    post(client, cred)
    assert gis.calls == 1                       # lần đầu tải (cache trống); kid lạ trong 60 giây KHÔNG tải lại
    signer2, pem2 = make_key("k2")
    gis.certs["k2"] = pem2
    oauth._certs["fetched"] = time.time() - 120   # qua 60 giây → kid lạ được phép tải lại đúng một lần
    r = post(client, token(n, signer=signer2, kid="k2"))
    assert r.status_code == 200 and gis.calls == 2


@pytest.mark.parametrize("cred", [None, 123, "", "x" * 4097, "khong.phai.jwt", "abc"])
def test_credential_hong(client, gis, cred):
    get_nonce(client)
    r = client.post("/api/auth/google/credential", json={"credential": cred})
    assert r.status_code == 400 and r.json()["detail"]["kind"] == "provider"


def test_chua_cau_hinh_google_thi_404(client):
    assert client.get("/api/auth/google/nonce").status_code == 404
    assert post(client, "x").status_code == 404


def test_origin_la_bi_chan(client, gis):
    r = post(client, "x", headers={"Origin": "https://evil.example.com"})
    assert r.status_code == 403


def test_throttle_20_lan_sai_thi_429(client, gis):
    get_nonce(client)
    for _ in range(auth.MAX_FAILS_IP):
        assert post(client, "abc").status_code == 400
    r = post(client, "abc")
    assert r.status_code == 429 and r.json()["detail"]["kind"] == "locked" and r.json()["detail"]["seconds"] > 0


def test_methods_google_client_id(client, monkeypatch):
    assert client.get("/api/auth/methods").json()["google_client_id"] is None
    monkeypatch.setenv("GOOGLE_CLIENT_ID", CID)
    assert client.get("/api/auth/methods").json()["google_client_id"] is None      # thiếu secret
    monkeypatch.setenv("GOOGLE_CLIENT_SECRET", "s")
    m = client.get("/api/auth/methods").json()
    assert m["google_client_id"] == CID and m["google"] is True


def test_referrer_policy_theo_duong_dan(client):
    assert client.get("/api/health").headers["referrer-policy"] == "strict-origin-when-cross-origin"
    assert client.get("/login/").headers["referrer-policy"] == "strict-origin-when-cross-origin"
    for p in ("/verify/", "/reset/", "/forgot/"):
        assert client.get(p).headers["referrer-policy"] == "no-referrer", p


def test_state_khong_tinh_vao_khoa(client, gis):
    for _ in range(auth.MAX_FAILS_IP + 5):
        assert post(client, "abc").status_code == 400               # chưa có cookie nonce → state, không ghi khoá
    n = get_nonce(client)
    for _ in range(auth.MAX_FAILS_IP + 5):
        r = post(client, token("nonce-khac"))
        assert r.status_code == 400 and r.json()["detail"]["kind"] == "state"
    assert post(client, token(n)).status_code == 200


def test_xoa_cookie_nonce_cung_co_voi_luc_dat(client, gis):
    n = get_nonce(client)
    r = post(client, token(n))
    sc = r.headers["set-cookie"]
    assert oauth.GIS_COOKIE in sc and "Max-Age=0" in sc and "Path=/api/auth/google" in sc and "HttpOnly" in sc


class Boom:
    def __init__(self):
        self.calls = 0

    def __call__(self):
        self.calls += 1
        raise OSError("mạng đứt")


def test_chung_chi_mat_mang_dung_ban_cu_va_chi_goi_mot_lan(client, gis, monkeypatch):
    n = get_nonce(client)
    assert post(client, token(n)).status_code == 200               # nạp cache
    client.post("/api/auth/logout")
    oauth._certs["exp"] = time.time() - 10                         # hết hạn
    boom = Boom()
    monkeypatch.setattr(oauth, "_fetch_google_certs", boom)
    for _ in range(3):
        n = get_nonce(client)
        assert post(client, token(n)).status_code == 200
        client.post("/api/auth/logout")
    assert boom.calls == 1
    assert oauth._certs["exp"] > time.time() + 200                 # gia hạn 300 giây


def test_chung_chi_mat_mang_luc_khoi_dong_that_bai_nhanh(client, gis, monkeypatch):
    boom = Boom()
    monkeypatch.setattr(oauth, "_fetch_google_certs", boom)
    n = get_nonce(client)
    for _ in range(5):
        r = post(client, token(n))
        assert r.status_code == 400 and r.json()["detail"]["kind"] == "provider"
    assert boom.calls == 1


def test_chung_chi_phan_hoi_qua_lon_bi_tu_choi(monkeypatch):
    class Resp:
        headers = {}

        def read(self, n=-1):
            return b"x" * n

        def __enter__(self):
            return self

        def __exit__(self, *a):
            return False

    monkeypatch.setattr(oauth.urllib.request, "urlopen", lambda *a, **k: Resp())
    with pytest.raises(ValueError):
        oauth._fetch_google_certs()
