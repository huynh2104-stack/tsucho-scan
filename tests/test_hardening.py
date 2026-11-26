"""Audit lần 2: khoá đếm sai (C2, T2, THẤP-1), nối admin legacy (C3), trần thư (T3), static/UNC (T5), tắt docs (T7),
cache (T8), CORS/HSTS (THẤP-6/7), ký tự lạ (THẤP-3/4)."""

import json
import logging
import re
import time
import urllib.error
from concurrent.futures import ThreadPoolExecutor

import pytest

from api import auth, captcha, mailer, main, quota, workspace
from test_api_auth import client, register, trial  # noqa: F401 — fixture dùng chung: CSDL tạm
from test_oauth import fake, login_google, me  # noqa: F401


def post_raw(client, url, raw: str):
    return client.post(url, content=raw, headers={"Content-Type": "application/json"})


def token_from(pattern: str) -> str:
    f = next((workspace.DATA_DIR / "outbox").glob(pattern))
    return f.read_text(encoding="utf-8").split("#token=")[1].split()[0]


# ── C2: đăng nhập đúng không xoá khoá IP ──────────────────────────────

def test_dang_nhap_dung_khong_xoa_bo_dem_ip(client):
    register(client, "chinh@vd.com", "matkhau123")
    client.post("/api/auth/logout")
    for i in range(auth.MAX_FAILS_IP - 1):
        assert client.post("/api/auth/login", json={"email": f"nan{i}@vd.com", "password": "x"}).status_code == 401
    assert client.post("/api/auth/login", json={"email": "chinh@vd.com", "password": "matkhau123"}).status_code == 200
    client.post("/api/auth/logout")
    assert client.post("/api/auth/login", json={"email": "nan-cuoi@vd.com", "password": "x"}).status_code == 401   # lần thứ 20
    r = client.post("/api/auth/login", json={"email": "bat-ky@vd.com", "password": "x"})
    assert r.status_code == 429 and r.json()["detail"]["kind"] == "locked", "bộ đếm IP không được reset bởi lần đúng"


def test_trial_dung_cung_khong_xoa_bo_dem_ip(client, monkeypatch):
    monkeypatch.setattr(auth, "OPEN_LOGIN", True)
    trial(client, "toi")
    client.post("/api/auth/logout")
    for i in range(auth.MAX_FAILS_IP - 1):
        client.post("/api/auth/login", json={"email": f"nan{i}@vd.com", "password": "x"})
    assert client.post("/api/auth/trial", json={"id": "toi", "password": "1"}).status_code == 200
    assert client.post("/api/auth/login", json={"email": "cuoi@vd.com", "password": "x"}).status_code == 401
    assert client.post("/api/auth/login", json={"email": "cuoi2@vd.com", "password": "x"}).status_code == 429


# ── T2: khoá băm, đầu vào quá dài, thân quá lớn ──────────────────────

def test_khoa_dem_la_bam_khong_phinh_theo_do_dai(client):
    keys = auth.attempt_keys("An@VD.com ", "1.2.3.4")
    assert keys[0] == auth.attempt_keys("an@vd.com", "9.9.9.9")[0] and re.fullmatch(r"e:[0-9a-f]{24}", keys[0])
    assert keys[1] == "i:1.2.3.4"
    client.post("/api/auth/login", json={"email": "an@vd.com", "password": "x"})
    with auth._db() as conn:
        assert sorted(r["key"] for r in conn.execute("SELECT key FROM login_fails")) == sorted(
            auth.attempt_keys("an@vd.com", "testclient"))


def test_email_hoac_id_qua_dai_la_401_va_khong_ghi_khoa(client, monkeypatch):
    monkeypatch.setattr(auth, "OPEN_LOGIN", True)
    r = client.post("/api/auth/login", json={"email": "a" * 300 + "@vd.com", "password": "x"})
    assert r.status_code == 401 and r.json()["detail"] == "Email hoặc mật khẩu không đúng"
    r = client.post("/api/auth/trial", json={"id": "a" * (auth.OPEN_ID_MAX + 1), "password": "x"})
    assert r.status_code == 401
    with auth._db() as conn:
        assert conn.execute("SELECT COUNT(*) AS n FROM login_fails").fetchone()["n"] == 0
    assert auth.count_users() == 0


def test_than_post_auth_qua_64kb_la_413(client):
    r = post_raw(client, "/api/auth/login", '{"email":"a@b.c","password":"' + "x" * 70000 + '"}')
    assert r.status_code == 413 and r.json()["detail"] == {"kind": "too_large"}
    assert r.headers["x-frame-options"] == "DENY"
    ok = post_raw(client, "/api/auth/login", '{"email":"a@b.c","password":"' + "x" * 60000 + '"}')
    assert ok.status_code == 401


# ── THẤP-1: đoán song song ────────────────────────────────────────────

def test_20_lan_doan_dong_thoi_chi_5_lan_duoc_kiem_tra_roi_bi_khoa(client, monkeypatch):
    register(client, "an@vd.com", "matkhau123")
    client.post("/api/auth/logout")
    real = auth.verify_password
    n = []

    def dem(pw, stored):
        n.append(1)
        time.sleep(0.01)
        return real(pw, stored)

    monkeypatch.setattr(auth, "verify_password", dem)

    def thu(_):
        return client.post("/api/auth/login", json={"email": "an@vd.com", "password": "sai"}).status_code

    with ThreadPoolExecutor(20) as ex:
        codes = list(ex.map(thu, range(20)))
    assert len(n) == auth.MAX_FAILS_EMAIL == 5
    assert sorted(codes) == [401] * 5 + [429] * 15
    assert auth._attempt_locks == {}, "khoá tự dọn khi rảnh"


# ── C3: admin cũ legacy ───────────────────────────────────────────────

def _legacy_admin(email="nguoi@vd.com"):
    with auth._db() as conn:
        conn.execute("INSERT INTO users (id, email, password_hash, role, created_at, kind, email_verified, legacy)"
                     " VALUES ('old000000001', ?, ?, 'admin', 0, 'member', 1, 1)", (email, auth.hash_password("x" * 9)))


def test_reset_thanh_cong_bo_co_legacy_roi_google_noi_duoc(client, fake):
    _legacy_admin()
    client.post("/api/auth/forgot", json={"email": "nguoi@vd.com"})
    tk = token_from("*-reset.txt")
    assert client.post("/api/auth/reset", json={"token": tk, "password": "mat-khau-moi-9"}).status_code == 200
    with auth._db() as conn:
        assert conn.execute("SELECT legacy FROM users WHERE id = 'old000000001'").fetchone()["legacy"] == 0
    client.post("/api/auth/logout")
    login_google(client, fake)
    assert me(client)["id"] == "old000000001"


def test_google_noi_vao_admin_legacy_khi_email_nam_trong_danh_sach_admin(client, fake, monkeypatch):
    monkeypatch.setenv("TSUCHO_ADMIN_EMAILS", "nguoi@vd.com")
    _legacy_admin()
    login_google(client, fake)
    j = me(client)
    assert j["id"] == "old000000001" and j["role"] == "admin" and j["providers"] == ["google"]
    with auth._db() as conn:
        assert conn.execute("SELECT legacy FROM users WHERE id = 'old000000001'").fetchone()["legacy"] == 0


# ── T3: trần thư toàn hệ thống + lỗi Resend ───────────────────────────

def test_tran_thu_toan_he_thong_theo_ngay(client, monkeypatch, caplog):
    monkeypatch.setenv("TSUCHO_MAIL_DAILY_LIMIT", "2")
    monkeypatch.setattr(quota, "MAIL_PER_IP", 100)
    for i in range(4):
        auth.create_user(f"u{i}@vd.com", "matkhau123", verified=True)
    caplog.set_level(logging.WARNING)
    for i in range(4):
        client.post("/api/auth/forgot", json={"email": f"u{i}@vd.com"})
    assert len(list((workspace.DATA_DIR / "outbox").glob("*-reset.txt"))) == 2
    assert any("TSUCHO_MAIL_DAILY_LIMIT" in r.message for r in caplog.records)
    with auth._db() as conn:
        assert conn.execute("SELECT faces FROM usage_counters WHERE key = 'mail-all'").fetchone()["faces"] == 2


def test_resend_http_loi_log_error_kem_ma_khong_lo_khoa(monkeypatch, caplog):
    def hong(req, timeout=None):
        raise urllib.error.HTTPError(req.full_url, 429, "Too Many", {}, None)

    monkeypatch.setattr(mailer.urllib.request, "urlopen", hong)
    caplog.set_level(logging.ERROR)
    mailer._send_resend("re_SECRETKEY", "x@y.z", "tiêu đề bí mật", "nội dung bí mật", "")
    recs = [r for r in caplog.records if r.levelno == logging.ERROR]
    assert recs and "429" in recs[0].message
    assert "re_SECRETKEY" not in caplog.text and "bí mật" not in caplog.text


# ── T4: captcha hostname + cảnh báo ───────────────────────────────────

def test_captcha_localhost_chi_hop_le_khi_public_url_la_localhost(monkeypatch):
    monkeypatch.setenv("TURNSTILE_SECRET_KEY", "s")
    monkeypatch.setenv("TSUCHO_PUBLIC_URL", "https://app.tsucho-scan.com")
    monkeypatch.delenv("TSUCHO_ORIGINS", raising=False)
    assert captcha._allowed_hostnames() == {"app.tsucho-scan.com"}
    monkeypatch.setenv("TSUCHO_PUBLIC_URL", "http://localhost:3000")
    assert "localhost" in captcha._allowed_hostnames()
    monkeypatch.delenv("TSUCHO_PUBLIC_URL")
    assert "localhost" in captcha._allowed_hostnames()


def test_canh_bao_thieu_khoa_turnstile_khi_may_chu_that(monkeypatch, capsys):
    monkeypatch.setenv("TSUCHO_PUBLIC_URL", "http://localhost:3000")
    monkeypatch.delenv("TURNSTILE_SECRET_KEY", raising=False)
    captcha.warn_if_unconfigured()
    assert capsys.readouterr().err == ""
    monkeypatch.setenv("TSUCHO_PUBLIC_URL", "https://app.tsucho-scan.com")
    monkeypatch.setenv("TURNSTILE_SITE_KEY", "k")
    captcha.warn_if_unconfigured()
    assert "TURNSTILE" in capsys.readouterr().err
    monkeypatch.setenv("TURNSTILE_SECRET_KEY", "s")
    captcha.warn_if_unconfigured()
    assert capsys.readouterr().err == ""


# ── T5/T8: file tĩnh ──────────────────────────────────────────────────

web = pytest.mark.skipif(not main.WEB_DIR.is_dir(), reason="chưa build web/out")


@web
@pytest.mark.parametrize("path", ["%5C%5Cevil%5Cshare%5Cx", "C:/Windows/win.ini", "a%5Cb", "%2Fetc%2Fpasswd", "x%00y"])
def test_duong_dan_unc_o_dia_tuyet_doi_tra_trang_chu_khong_cham_resolve(client, monkeypatch, path):
    def cam(self, *a, **k):
        raise AssertionError("không được resolve() đường dẫn độc")

    monkeypatch.setattr(main.Path, "resolve", cam)
    r = client.get("/" + path)
    assert r.status_code == 200 and r.content == (main.WEB_DIR / "index.html").read_bytes()


@web
def test_next_static_immutable_chi_khi_200(client):
    f = next((main.WEB_DIR / "_next" / "static").rglob("*.js"))
    url = "/_next/static/" + f.relative_to(main.WEB_DIR / "_next" / "static").as_posix()
    r = client.get(url)
    assert r.status_code == 200 and "immutable" in r.headers["cache-control"]
    r = client.get("/_next/static/khong-co/file.js")
    assert r.status_code == 404 and "immutable" not in r.headers.get("cache-control", "")
    assert client.get("/login/").headers["cache-control"] == "no-cache"


# ── T7, THẤP-6, THẤP-7 ────────────────────────────────────────────────

def test_docs_chi_bat_o_may_phat_trien(monkeypatch):
    monkeypatch.delenv("TSUCHO_PUBLIC_URL", raising=False)
    assert main._docs_enabled() and main._app_kwargs() == {}
    monkeypatch.setenv("TSUCHO_PUBLIC_URL", "http://127.0.0.1:8000")
    assert main._docs_enabled()
    monkeypatch.setenv("TSUCHO_PUBLIC_URL", "https://app.tsucho-scan.com")
    assert not main._docs_enabled()
    assert main._app_kwargs() == {"docs_url": None, "redoc_url": None, "openapi_url": None}
    from fastapi import FastAPI
    paths = {r.path for r in FastAPI(**main._app_kwargs()).routes}
    assert not paths & {"/docs", "/redoc", "/openapi.json"}


def test_cors_khong_mo_localhost_tren_may_that(monkeypatch):
    monkeypatch.delenv("TSUCHO_ORIGINS", raising=False)
    monkeypatch.delenv("TSUCHO_PUBLIC_URL", raising=False)
    assert main._cors_origins() == ["http://localhost:3000", "http://127.0.0.1:3000"]
    monkeypatch.setenv("TSUCHO_PUBLIC_URL", "https://app.tsucho-scan.com")
    assert main._cors_origins() == []
    monkeypatch.setenv("TSUCHO_ORIGINS", "https://khac.example.com,*")
    assert main._cors_origins() == ["https://khac.example.com"]


def test_hsts_chi_khi_public_url_la_https(client, monkeypatch):
    assert "strict-transport-security" not in client.get("/api/health").headers
    monkeypatch.setenv("TSUCHO_PUBLIC_URL", "https://app.tsucho-scan.com")
    assert client.get("/api/health").headers["strict-transport-security"] == "max-age=31536000"
    r = client.post("/api/auth/forgot", json={}, headers={"Origin": "https://evil.example.com"})        # cả phản hồi 403
    assert r.status_code == 403 and r.headers["strict-transport-security"] == "max-age=31536000"


# ── THẤP-3/4 ──────────────────────────────────────────────────────────

@pytest.mark.parametrize("email", ["google:x@vd.com", "line:U1@vd.com", "trial:a@vd.com", "a:b@vd.com", "a@vd.com:80"])
def test_email_co_dau_hai_cham_bi_chan(client, email):
    r = client.post("/api/auth/register", json={"email": email})
    assert r.status_code == 400 and r.json()["detail"]["kind"] == "bad_email"


def test_ky_tu_surrogate_khong_gay_500(client, monkeypatch):
    monkeypatch.setattr(auth, "OPEN_LOGIN", True)
    bad = "\\ud800aaaaaaaa"                       # chuỗi JSON thoát: giải mã ra surrogate đơn độc
    r = post_raw(client, "/api/auth/trial", '{"id":"x","password":"' + bad + '"}')
    assert r.status_code == 400 and r.json()["detail"]["kind"] == "weak_password"
    assert post_raw(client, "/api/auth/trial", '{"id":"\\ud800","password":"1"}').status_code == 401
    assert post_raw(client, "/api/auth/login", '{"email":"\\ud800@a.bc","password":"x"}').status_code == 401
    assert post_raw(client, "/api/auth/login", '{"email":"a@b.cd","password":"' + bad + '"}').status_code == 401
    assert post_raw(client, "/api/auth/register", '{"email":"\\ud800@a.bc"}').json()["detail"]["kind"] == "bad_email"
    # /verify, /reset: kiểm mật khẩu TRƯỚC khi đốt token
    client.post("/api/auth/register", json={"email": "moi@vd.com"})
    tk = token_from("*-verify.txt")
    r = post_raw(client, "/api/auth/verify", json.dumps({"token": tk})[:-1] + ',"password":"' + bad + '"}')
    assert r.status_code == 400 and r.json()["detail"]["kind"] == "weak_password"
    assert client.post("/api/auth/verify", json={"token": tk, "password": "matkhau123"}).status_code == 200
    client.post("/api/auth/forgot", json={"email": "moi@vd.com"})
    tk2 = token_from("*-reset.txt")
    r = post_raw(client, "/api/auth/reset", json.dumps({"token": tk2})[:-1] + ',"password":"' + bad + '"}')
    assert r.status_code == 400 and r.json()["detail"]["kind"] == "weak_password"
    assert client.post("/api/auth/reset", json={"token": tk2, "password": "mat-khau-moi-9"}).status_code == 200
