"""Cloudflare Turnstile cho /register, /forgot, /resend (api/captcha.py). Không gọi mạng thật: `captcha._post_form` bị thay."""

import pytest

from api import auth, captcha, workspace
from test_api_auth import client, register  # noqa: F401 — fixture dùng chung: CSDL tạm

ROUTES = [("/api/auth/register", {"email": "moi@vd.com"}), ("/api/auth/forgot", {"email": "an@vd.com"}),
          ("/api/auth/resend", {"email": "moi@vd.com"})]


@pytest.fixture
def ts(monkeypatch):
    """Bật Turnstile, thay lời gọi mạng; `calls` ghi lại, `reply` là phản hồi giả."""
    monkeypatch.setenv("TURNSTILE_SECRET_KEY", "sekrit")
    monkeypatch.setenv("TURNSTILE_SITE_KEY", "0xSITE")
    monkeypatch.setenv("TSUCHO_PUBLIC_URL", "https://app.tsucho-scan.com")
    box = type("B", (), {})()
    box.calls, box.reply, box.fail = [], {"success": True, "hostname": "app.tsucho-scan.com"}, False

    def fake(url, data):
        box.calls.append((url, dict(data)))
        if box.fail:
            raise OSError("mạng đứt")
        return box.reply

    monkeypatch.setattr(captcha, "_post_form", fake)
    return box


def outbox():
    d = workspace.DATA_DIR / "outbox"
    return list(d.glob("*.txt")) if d.exists() else []


def test_thieu_secret_thi_khong_kiem(client, monkeypatch):
    monkeypatch.delenv("TURNSTILE_SECRET_KEY", raising=False)
    monkeypatch.setattr(captcha, "_post_form", lambda *a: pytest.fail("không được gọi mạng"))
    for url, body in ROUTES:
        assert client.post(url, json=body).status_code == 200


@pytest.mark.parametrize("url,body", ROUTES)
def test_co_secret_thieu_hoac_sai_token_la_400_captcha_va_khong_gui_thu(client, ts, url, body):
    register(client, "an@vd.com")
    client.post("/api/auth/logout")
    n = len(outbox())
    bad = [{}, {"captcha": ""}, {"captcha": None}, {"captcha": 123}, {"captcha": "x" * 2049}]
    for extra in bad:
        r = client.post(url, json={**body, **extra})
        assert r.status_code == 400 and r.json()["detail"] == {"kind": "captcha"}, extra
    assert ts.calls == [], "token thiếu/quá dài bị từ chối trước khi gọi Cloudflare"
    ts.reply = {"success": False, "error-codes": ["invalid-input-response"]}
    assert client.post(url, json={**body, "captcha": "tok"}).status_code == 400
    ts.reply = {"success": True, "hostname": "evil.example.com"}
    assert client.post(url, json={**body, "captcha": "tok"}).status_code == 400
    ts.reply = {"success": "true"}
    assert client.post(url, json={**body, "captcha": "tok"}).status_code == 400
    ts.fail = True
    assert client.post(url, json={**body, "captcha": "tok"}).status_code == 400
    assert len(outbox()) == n, "captcha hỏng thì không gửi thư nào"


def test_captcha_kiem_truoc_ca_email_hop_le_nen_email_hong_cung_chi_ra_captcha(client, ts):
    r = client.post("/api/auth/register", json={"email": "khong-phai-email"})
    assert r.status_code == 400 and r.json()["detail"] == {"kind": "captcha"}
    r = client.post("/api/auth/register", json={"email": "khong-phai-email", "captcha": "tok"})
    assert r.json()["detail"]["kind"] == "bad_email"


def test_hop_le_thi_hanh_vi_cu_va_gui_dung_tham_so(client, ts):
    register(client, "an@vd.com")
    client.post("/api/auth/logout")
    r = client.post("/api/auth/forgot", json={"email": "an@vd.com", "captcha": "tok-ok"})
    assert r.status_code == 200 and r.json() == {"ok": True, "sent": True}
    assert len(outbox()) == 1
    (url, data), = ts.calls
    assert url == "https://challenges.cloudflare.com/turnstile/v0/siteverify"
    assert data["secret"] == "sekrit" and data["response"] == "tok-ok" and data["remoteip"] == "testclient"
    assert len(data["idempotency_key"]) == 36
    ts.calls.clear()
    client.post("/api/auth/register", json={"email": "moi@vd.com", "captcha": "t"})
    assert ts.calls[0][1]["idempotency_key"] != data["idempotency_key"]


def test_remoteip_la_ip_that_khong_gom_64(client, ts, monkeypatch):
    monkeypatch.setenv("TSUCHO_TRUST_PROXY", "cloudflare")
    client.post("/api/auth/register", json={"email": "moi@vd.com", "captcha": "t"},
                headers={"CF-Connecting-IP": "2001:db8:1:2:aaaa::1"})
    assert ts.calls[0][1]["remoteip"] == "2001:db8:1:2:aaaa::1"


def test_hostname_hop_le_gom_public_url_localhost_va_origins(client, ts, monkeypatch):
    monkeypatch.setenv("TSUCHO_ORIGINS", "https://khac.example.com")
    for host in ("app.tsucho-scan.com", "khac.example.com", "APP.tsucho-scan.com"):
        ts.reply = {"success": True, "hostname": host}
        assert client.post("/api/auth/forgot", json={"email": "x@vd.com", "captcha": "t"}).status_code == 200, host
    ts.reply = {"success": True, "hostname": "localhost"}          # máy thật: localhost KHÔNG hợp lệ
    assert client.post("/api/auth/forgot", json={"email": "x@vd.com", "captcha": "t"}).status_code == 400
    ts.reply = {"success": True}                                   # đang kiểm mà không có hostname → thất bại
    assert client.post("/api/auth/forgot", json={"email": "x@vd.com", "captcha": "t"}).status_code == 400
    monkeypatch.setenv("TSUCHO_PUBLIC_URL", "http://localhost:3000")
    ts.reply = {"success": True, "hostname": "localhost"}          # máy phát triển: localhost hợp lệ
    assert client.post("/api/auth/forgot", json={"email": "x@vd.com", "captcha": "t"}).status_code == 200


def test_methods_tra_site_key_chi_khi_du_ca_hai_khoa(client, monkeypatch):
    for k in ("TURNSTILE_SITE_KEY", "TURNSTILE_SECRET_KEY"):
        monkeypatch.delenv(k, raising=False)
    assert client.get("/api/auth/methods").json()["turnstile_site_key"] is None
    monkeypatch.setenv("TURNSTILE_SITE_KEY", "0xSITE")
    assert client.get("/api/auth/methods").json()["turnstile_site_key"] is None
    monkeypatch.setenv("TURNSTILE_SECRET_KEY", "s")
    assert client.get("/api/auth/methods").json()["turnstile_site_key"] == "0xSITE"
    monkeypatch.delenv("TURNSTILE_SITE_KEY")
    assert client.get("/api/auth/methods").json()["turnstile_site_key"] is None


def test_post_form_that_loi_mang_ném_ra_de_verify_bat(monkeypatch):
    monkeypatch.setenv("TURNSTILE_SECRET_KEY", "s")

    def hong(*a, **k):
        raise TimeoutError("timeout")

    monkeypatch.setattr(captcha.urllib.request, "urlopen", hong)
    assert captcha.verify("tok", "1.1.1.1") is False
