"""Đợt A đăng nhập thật (docs/KE_HOACH_DANG_NHAP.md): đăng ký email + xác minh + quên/đặt lại mật khẩu,
tài khoản «お試し» (trial) tách không gian tên, di trú CSDL cũ, gửi thư, kiểm Origin, /methods, /me.

Thư KHÔNG bao giờ gửi thật: không đặt RESEND_API_KEY thì `mailer` ghi ra `DATA_DIR/outbox/` (đọc ở đây).
"""

import json
import re
import sqlite3
import time

import pytest
from fastapi.testclient import TestClient

from api import auth, mailer, main, quota, workspace
from test_api_auth import client, register, trial  # noqa: F401 — fixture dùng chung: CSDL tạm


# ── Công cụ ───────────────────────────────────────────────────────────

def outbox() -> list:
    d = workspace.DATA_DIR / "outbox"
    return sorted(d.glob("*.txt")) if d.exists() else []


def mails(purpose=None, to=None) -> list[str]:
    out = []
    for f in outbox():
        if purpose and not f.stem.endswith(f"-{purpose}") and f"-{purpose}-" not in f.stem:
            continue
        text = f.read_text(encoding="utf-8")
        if to and f"To: {to}\n" not in text:
            continue
        out.append(text)
    return out


def token_in(mail: str) -> str:
    m = re.search(r"token=([A-Za-z0-9_\-]+)", mail)
    assert m, mail
    return m.group(1)


def dang_ky(client, email="moi@vd.com", lang="ja"):
    r = client.post("/api/auth/register", json={"email": email, "lang": lang})
    assert r.status_code == 200, r.text
    return r


def xac_minh(client, email="moi@vd.com", password="Matkhau123"):
    r = client.post("/api/auth/verify", json={"token": token_in(mails("verify", email)[-1]), "password": password})
    assert r.status_code == 200, r.text
    return r.json()


# ── Đăng ký + xác minh ────────────────────────────────────────────────

def test_dang_ky_khong_nhan_mat_khau_gui_thu_xac_minh_va_khong_mo_phien(client):
    r = dang_ky(client, "Moi@VD.com")
    assert r.json() == {"ok": True, "sent": True}
    assert client.get("/api/auth/me").status_code == 401
    u, h = auth.get_by_email("moi@vd.com")
    assert u.kind == "member" and u.role == "user" and u.email_verified is False and h == ""

    [thu] = mails("verify", "moi@vd.com")
    assert "/verify/#token=" in thu and "?token" not in thu, "token sau dấu # (không vào access log/Referer)"
    assert "心当たりがない場合はこのメールを破棄してください" in thu
    with auth._db() as conn:     # CSDL chỉ giữ băm, không giữ token thô
        h = conn.execute("SELECT token_hash FROM email_tokens").fetchone()["token_hash"]
    assert token_in(thu) not in h and len(h) == 64


def test_chua_xac_minh_chua_co_mat_khau_nao_dung_nen_login_401(client):
    dang_ky(client)
    assert auth.get_by_email("moi@vd.com")[1] == "", "mật khẩu chỉ nằm trong token cho tới khi xác minh"
    r = client.post("/api/auth/login", json={"email": "moi@vd.com", "password": "Matkhau123"})
    assert r.status_code == 401 and client.get("/api/auth/me").status_code == 401


def test_tai_khoan_cu_co_hash_ma_chua_xac_minh_thi_403_chi_khi_dung_mat_khau(client):
    u = auth.create_user("cu@vd.com", "Matkhau123", verified=False)
    auth.set_password(u.id, "Matkhau123")
    r = client.post("/api/auth/login", json={"email": "cu@vd.com", "password": "Matkhau123"})
    assert r.status_code == 403 and r.json()["detail"] == {"kind": "unverified"}
    assert client.post("/api/auth/login", json={"email": "cu@vd.com", "password": "sai-be-bet"}).status_code == 401


def test_xac_minh_dat_mat_khau_dang_nhap_luon_va_token_chi_dung_mot_lan(client):
    dang_ky(client)
    token = token_in(mails("verify")[-1])
    r = client.post("/api/auth/verify", json={"token": token, "password": "Mat-khau-tu-dat-1"})
    assert r.status_code == 200
    j = r.json()
    assert (j["email"], j["kind"], j["email_verified"], j["role"]) == ("moi@vd.com", "member", True, "user")
    assert client.get("/api/auth/me").json()["email"] == "moi@vd.com"

    client.post("/api/auth/logout")
    r = client.post("/api/auth/verify", json={"token": token, "password": "Mat-khau-khac-99"})     # dùng lại
    assert r.status_code == 400 and r.json()["detail"] == {"kind": "bad_token"}
    assert client.post("/api/auth/login", json={"email": "moi@vd.com", "password": "Mat-khau-tu-dat-1"}).status_code == 200
    assert client.post("/api/auth/login", json={"email": "moi@vd.com", "password": "Mat-khau-khac-99"}).status_code == 401


def test_verify_mat_khau_yeu_hoac_qua_dai_bi_tu_choi_truoc_khi_dot_token(client):
    dang_ky(client)
    tk = token_in(mails("verify")[-1])
    r = client.post("/api/auth/verify", json={"token": tk, "password": "ngan"})
    assert r.status_code == 400 and r.json()["detail"] == {"kind": "weak_password", "min": 8}
    r = client.post("/api/auth/verify", json={"token": tk, "password": "x" * 129})
    assert r.status_code == 400 and r.json()["detail"]["kind"] == "password_too_long"
    assert client.post("/api/auth/verify", json={"token": tk}).status_code == 400          # thiếu mật khẩu
    assert client.post("/api/auth/verify", json={"token": tk, "password": "Aa1" + "x" * 125}).status_code == 200   # token còn nguyên


def test_token_xac_minh_het_han_48_gio(client):
    dang_ky(client)
    token = token_in(mails("verify")[-1])
    with auth._db() as conn:
        exp, now = conn.execute("SELECT expires_at FROM email_tokens").fetchone()["expires_at"], time.time()
        assert 47.9 * 3600 < exp - now <= 48 * 3600
        conn.execute("UPDATE email_tokens SET expires_at = ?", (now - 1,))
    r = client.post("/api/auth/verify", json={"token": token, "password": "Matkhau123"})
    assert r.status_code == 400 and r.json()["detail"]["kind"] == "bad_token"
    assert auth.get_by_email("moi@vd.com")[0].email_verified is False


def test_token_la_hoac_rong_thi_400(client):
    for t in ("", "khong-co-that", None):
        r = client.post("/api/auth/verify", json={"token": t, "password": "Matkhau123"})
        assert r.status_code == 400 and r.json()["detail"]["kind"] == "bad_token"
    assert client.post("/api/auth/verify", json={"password": "Matkhau123"}).status_code == 400


def test_token_reset_khong_dung_duoc_nhu_token_xac_minh(client):
    """Token mục đích khác không đổi chỗ cho nhau được."""
    register(client, "an@vd.com")
    client.post("/api/auth/logout")
    client.post("/api/auth/forgot", json={"email": "an@vd.com"})
    tk = token_in(mails("reset")[-1])
    assert client.post("/api/auth/verify", json={"token": tk, "password": "Matkhau-moi1"}).status_code == 400
    assert client.post("/api/auth/reset", json={"token": tk, "password": "Matkhau-moi1"}).status_code == 200


def test_dang_ky_email_da_co_gui_thu_da_co_tai_khoan_thay_vi_thu_xac_minh(client):
    register(client, "an@vd.com")
    client.post("/api/auth/logout")
    r = dang_ky(client, "an@vd.com")
    assert r.json() == {"ok": True, "sent": True}
    assert mails("verify", "an@vd.com") == []
    [thu] = mails("exists", "an@vd.com")
    assert "/forgot/" in thu and "token=" not in thu
    # mật khẩu người thật không bị đụng tới
    assert client.post("/api/auth/login", json={"email": "an@vd.com", "password": "Matkhau123"}).status_code == 200


def test_chiem_truoc_ke_xau_dang_ky_email_nan_nhan_thi_mat_khau_la_cua_nan_nhan(client):
    """H1: kẻ xấu /register email nạn nhân → thư tới hộp thư NẠN NHÂN → nạn nhân bấm và TỰ ĐẶT mật khẩu ở bước verify."""
    dang_ky(client, "nan@nhan.com")                                  # kẻ xấu kích hoạt (nó không có cách gửi mật khẩu)
    thu = token_in(mails("verify", "nan@nhan.com")[-1])
    assert auth.get_by_email("nan@nhan.com")[1] == "", "chưa có mật khẩu nào, kẻ xấu không đăng nhập được"
    for mk in ("Matkhau123", "mat-khau-ke-xau"):
        assert client.post("/api/auth/login", json={"email": "nan@nhan.com", "password": mk}).status_code == 401

    cu = auth.start_session(auth.get_by_email("nan@nhan.com")[0])    # phiên có sẵn (nếu có) bị xoá khi xác minh
    r = client.post("/api/auth/verify", json={"token": thu, "password": "Mat-khau-nan-nhan1"})
    assert r.status_code == 200 and auth.user_for_token(cu) is None
    client.post("/api/auth/logout")
    assert client.post("/api/auth/login", json={"email": "nan@nhan.com", "password": "mat-khau-ke-xau"}).status_code == 401
    assert client.post("/api/auth/login", json={"email": "nan@nhan.com", "password": "Mat-khau-nan-nhan1"}).status_code == 200


def test_dang_ky_lai_khi_chua_xac_minh_thi_chi_thu_moi_nhat_dung_duoc(client):
    dang_ky(client, "nan@nhan.com")
    cu = token_in(mails("verify")[-1])
    dang_ky(client, "nan@nhan.com")
    moi = token_in(mails("verify")[-1])
    assert cu != moi
    assert client.post("/api/auth/verify", json={"token": cu, "password": "Matkhau123"}).status_code == 400
    assert client.post("/api/auth/verify", json={"token": moi, "password": "Matkhau123"}).status_code == 200





def test_verify_xoa_moi_phien_cu_va_mo_phien_moi(client):
    dang_ky(client)
    u, _ = auth.get_by_email("moi@vd.com")
    cu = auth.start_session(u)
    xac_minh(client)
    assert auth.user_for_token(cu) is None
    assert client.get("/api/auth/me").status_code == 200


def test_dang_ky_khong_lo_email_qua_trang_thai_va_noi_dung(client):
    register(client, "co@vd.com")
    client.post("/api/auth/logout")
    a = dang_ky(client, "co@vd.com")
    b = dang_ky(client, "chua-co@vd.com")
    assert (a.status_code, a.json()) == (b.status_code, b.json())


def test_dang_ky_email_hong_co_ma_va_khong_gui_thu(client):
    xau = ["khong-phai-email", "trial:a@b.com", "a b@vd.com", "a@vd.com\nBcc: x@y.z", "<a>@vd.com", "a,b@vd.com",
           "a;b@vd.com", 'a"b@vd.com', "a(b)@vd.com", "a[b]@vd.com", "a\\b@vd.com", "a\x00b@vd.com", "",
           "a" * 250 + "@vd.com"]
    for email in xau:
        r = client.post("/api/auth/register", json={"email": email})
        assert r.status_code == 400 and r.json()["detail"]["kind"] == "bad_email", (email, r.text)
    assert mails() == []
    ok = "a" * 64 + "@" + "b" * 63 + ".com"                              # 254 ký tự là mức tối đa
    assert len(ok) <= auth.MAX_EMAIL
    assert client.post("/api/auth/register", json={"email": ok}).status_code == 200


def test_resend(client):
    dang_ky(client)
    cu = token_in(mails("verify")[-1])
    r = client.post("/api/auth/resend", json={"email": "MOI@vd.com", "lang": "en"})
    assert r.status_code == 200 and r.json() == {"ok": True, "sent": True}
    assert len(mails("verify")) == 2
    assert "Confirm your email address" in mails("verify")[-1]
    moi = token_in(mails("verify")[-1])
    assert moi != cu
    assert client.post("/api/auth/verify", json={"token": cu, "password": "Matkhau123"}).status_code == 400   # bị thay
    assert client.post("/api/auth/verify", json={"token": moi, "password": "Matkhau123"}).status_code == 200
    # email lạ / đã xác minh: vẫn 200, không gửi thêm
    n = len(outbox())
    for email in ("la-hoac@vd.com", "moi@vd.com"):
        assert client.post("/api/auth/resend", json={"email": email}).status_code == 200
    assert len(outbox()) == n


def test_resend_van_gui_khi_token_cu_het_han(client):
    dang_ky(client)
    with auth._db() as conn:
        conn.execute("UPDATE email_tokens SET expires_at = ?", (time.time() - 1,))
    assert client.post("/api/auth/resend", json={"email": "moi@vd.com"}).status_code == 200
    assert len(mails("verify")) == 2          # không còn phụ thuộc token cũ: tạo token mới


def test_trial_moi_toi_da_10_moi_ip_moi_ngay_dang_nhap_lai_khong_tinh(client, trial_on, monkeypatch):
    mat_khau = []
    for i in range(10):
        r = client.post("/api/auth/trial/new", json={})
        assert r.status_code == 200
        mat_khau.append((r.json()["trial_id"], r.json()["trial_password"]))
        client.post("/api/auth/logout")
    r = client.post("/api/auth/trial/new", json={})
    assert r.status_code == 429 and r.json()["detail"] == {"kind": "trial_new_limit"}
    # vào lại tài khoản cũ qua /trial: không tính vào trần tạo mới
    assert client.post("/api/auth/trial", json={"id": mat_khau[3][0], "password": mat_khau[3][1]}).status_code == 200
    # IP khác thì tạo được; biến môi trường đổi được trần
    client.post("/api/auth/logout")
    monkeypatch.setenv("TSUCHO_TRUST_PROXY", "cloudflare")
    r = client.post("/api/auth/trial/new", json={}, headers={"CF-Connecting-IP": "198.51.100.1"})
    assert r.status_code == 200
    monkeypatch.setenv("TSUCHO_TRIAL_NEW_PER_IP", "11")
    client.post("/api/auth/logout")
    monkeypatch.delenv("TSUCHO_TRUST_PROXY")
    assert client.post("/api/auth/trial/new", json={}).status_code == 200


def test_trial_vao_lai_khong_dung_han_muc_tao_moi(client, trial_on, monkeypatch):
    monkeypatch.setenv("TSUCHO_TRIAL_NEW_PER_IP", "1")
    trial(client, "da-co")
    for _ in range(3):
        assert client.post("/api/auth/trial", json={"id": "da-co", "password": "1"}).status_code == 200
    with auth._db() as conn:
        assert conn.execute("SELECT COUNT(*) AS n FROM usage_counters WHERE key LIKE 'tn:%'").fetchone()["n"] == 0


def test_xac_minh_email_admin_thanh_admin_va_nhan_du_lieu_cu(client, monkeypatch):
    monkeypatch.setenv("TSUCHO_ADMIN_EMAILS", "chu@vd.com")
    cu = workspace.create()
    dang_ky(client, "chu@vd.com")
    assert xac_minh(client, "chu@vd.com")["role"] == "admin"
    assert client.get(f"/api/ws/{cu.id}").status_code == 200


# ── Quên / đặt lại mật khẩu ───────────────────────────────────────────

def test_quen_mat_khau_chi_gui_cho_member_da_xac_minh_nhung_luon_200(client):
    register(client, "an@vd.com")
    client.post("/api/auth/logout")
    dang_ky(client, "chua@vd.com")                    # chưa xác minh
    n = len(outbox())
    for email in ("an@vd.com", "chua@vd.com", "khong-co@vd.com"):
        r = client.post("/api/auth/forgot", json={"email": email, "lang": "vi"})
        assert r.status_code == 200 and r.json() == {"ok": True, "sent": True}
    assert len(outbox()) == n + 1
    [thu] = mails("reset")
    assert "To: an@vd.com" in thu and "/reset/#token=" in thu and "30 phút" in thu


def test_reset_doi_mat_khau_xoa_moi_phien_cu_va_mo_phien_moi(client):
    register(client, "an@vd.com")
    cu = client.cookies.get(auth.COOKIE)
    may_khac = TestClient(main.app)
    with may_khac:
        may_khac.post("/api/auth/login", json={"email": "an@vd.com", "password": "Matkhau123"})
        assert may_khac.get("/api/auth/me").status_code == 200

        client.post("/api/auth/forgot", json={"email": "an@vd.com"})
        r = client.post("/api/auth/reset", json={"token": token_in(mails("reset")[-1]), "password": "Mat-khau-moi-9"})
        assert r.status_code == 200 and r.json()["email"] == "an@vd.com"

        assert may_khac.get("/api/auth/me").status_code == 401, "phiên máy khác phải bị đá ra"
        client.cookies.set(auth.COOKIE, cu)
        assert client.get("/api/auth/me").status_code == 401, "token phiên cũ vô hiệu"
    client.cookies.clear()
    assert client.post("/api/auth/login", json={"email": "an@vd.com", "password": "Matkhau123"}).status_code == 401
    assert client.post("/api/auth/login", json={"email": "an@vd.com", "password": "Mat-khau-moi-9"}).status_code == 200


def test_reset_dang_nhap_luon_bang_phien_moi(client):
    register(client, "an@vd.com")
    client.post("/api/auth/logout")
    client.post("/api/auth/forgot", json={"email": "an@vd.com"})
    r = client.post("/api/auth/reset", json={"token": token_in(mails("reset")[-1]), "password": "Mat-khau-moi-9"})
    assert r.status_code == 200
    assert client.get("/api/auth/me").json()["email"] == "an@vd.com"


def test_reset_token_dung_lai_het_han_hoac_mat_khau_yeu(client):
    register(client, "an@vd.com")
    client.post("/api/auth/logout")
    client.post("/api/auth/forgot", json={"email": "an@vd.com"})
    tk = token_in(mails("reset")[-1])

    r = client.post("/api/auth/reset", json={"token": tk, "password": "ngan"})
    assert r.status_code == 400 and r.json()["detail"]["kind"] == "weak_password"     # chưa đốt token
    assert client.post("/api/auth/reset", json={"token": tk, "password": "Mat-khau-moi-9"}).status_code == 200
    r = client.post("/api/auth/reset", json={"token": tk, "password": "Mat-khau-khac-9"})
    assert r.status_code == 400 and r.json()["detail"]["kind"] == "bad_token"          # dùng lại

    # hết hạn 30 phút
    client.post("/api/auth/forgot", json={"email": "an@vd.com"})
    tk2 = token_in(mails("reset")[-1])
    with auth._db() as conn:
        conn.execute("UPDATE email_tokens SET expires_at = ? WHERE purpose = 'reset' AND used_at IS NULL",
                     (time.time() - 1,))
    assert client.post("/api/auth/reset", json={"token": tk2, "password": "Mat-khau-khac-9"}).status_code == 400


def test_token_reset_hieu_luc_30_phut(client):
    register(client, "an@vd.com")
    client.post("/api/auth/forgot", json={"email": "an@vd.com"})
    with auth._db() as conn:
        exp = conn.execute("SELECT expires_at FROM email_tokens WHERE purpose = 'reset'").fetchone()["expires_at"]
    assert 29 * 60 < exp - time.time() <= 30 * 60


def test_hai_lan_forgot_thi_link_cu_het_hieu_luc(client):
    register(client, "an@vd.com")
    client.post("/api/auth/forgot", json={"email": "an@vd.com"})
    client.post("/api/auth/forgot", json={"email": "an@vd.com"})
    cu, moi = (token_in(m) for m in mails("reset"))
    assert client.post("/api/auth/reset", json={"token": cu, "password": "Mat-khau-moi-9"}).status_code == 400
    assert client.post("/api/auth/reset", json={"token": moi, "password": "Mat-khau-moi-9"}).status_code == 200


# ── Hạn mức gửi thư ───────────────────────────────────────────────────

def test_toi_da_3_thu_moi_gio_cho_moi_email_vuot_van_200(client):
    register(client, "an@vd.com")
    client.post("/api/auth/logout")
    for _ in range(5):
        r = client.post("/api/auth/forgot", json={"email": "an@vd.com"})
        assert r.status_code == 200 and r.json() == {"ok": True, "sent": True}
    assert len(mails("reset", "an@vd.com")) == 3


def test_spam_register_khong_chan_duoc_thu_dat_lai_mat_khau(client):
    """Hạn mức thư tách theo mục đích: kẻ xấu đăng ký/gửi lại hết lượt `verify` vẫn không chặn `reset`/`exists`."""
    register(client, "an@vd.com")
    client.post("/api/auth/logout")
    for _ in range(6):
        dang_ky(client, "an@vd.com")                                  # exists × 3 (đủ hạn mức), còn lại bị bỏ
    assert len(mails("exists", "an@vd.com")) == 3
    client.post("/api/auth/forgot", json={"email": "an@vd.com"})
    assert len(mails("reset", "an@vd.com")) == 1
    with auth._db() as conn:
        keys = {r["key"] for r in conn.execute("SELECT key FROM usage_counters")}
    assert {"m:exists:an@vd.com", "m:reset:an@vd.com"} <= keys


def test_toi_da_10_thu_moi_gio_cho_moi_ip(client):
    for i in range(14):
        dang_ky(client, f"nguoi{i}@vd.com")
    assert len(mails("verify")) == quota.MAIL_PER_IP == 10


def test_han_muc_thu_theo_gio_tu_het_han(client, monkeypatch):
    register(client, "an@vd.com")
    client.post("/api/auth/logout")
    for _ in range(4):
        client.post("/api/auth/forgot", json={"email": "an@vd.com"})
    assert len(mails("reset")) == 3
    with auth._db() as conn:               # giờ trước đó
        conn.execute("UPDATE usage_counters SET day = '2000-01-01T00' WHERE key LIKE 'm:%' OR key LIKE 'mi:%'")
    client.post("/api/auth/forgot", json={"email": "an@vd.com"})
    assert len(mails("reset")) == 4


# ── Kiểm Origin ───────────────────────────────────────────────────────

def test_post_tu_trang_la_bi_403_o_moi_duong_api(client, monkeypatch):
    monkeypatch.setenv("TSUCHO_PUBLIC_URL", "https://app.tsucho-scan.com")
    ep = ("/api/auth/login", "/api/auth/register", "/api/auth/trial", "/api/auth/verify", "/api/auth/resend",
          "/api/auth/forgot", "/api/auth/reset", "/api/auth/logout", "/api/ws", "/api/ws/x/scan")
    for url in ep:
        r = client.post(url, json={}, headers={"Origin": "https://evil.example.com"})
        assert r.status_code == 403 and r.json()["detail"] == {"kind": "bad_origin"}, url
    for method in ("put", "patch", "delete"):
        r = getattr(client, method)("/api/me/prefs", headers={"Origin": "https://evil.example.com"})
        assert r.status_code == 403, method
    assert client.post("/api/auth/forgot", json={"email": "x@y.com"}, headers={"Origin": "null"}).status_code == 403
    # GET không đổi trạng thái: không kiểm Origin
    assert client.get("/api/health", headers={"Origin": "https://evil.example.com"}).status_code == 200


def test_origin_hop_le_duoc_qua(client, monkeypatch):
    # máy chủ thật: chỉ PUBLIC_URL (+ TSUCHO_ORIGINS khai tường minh), localhost KHÔNG được
    monkeypatch.setenv("TSUCHO_PUBLIC_URL", "https://app.tsucho-scan.com")
    for o in ("https://app.tsucho-scan.com", "https://APP.tsucho-scan.com/"):
        assert client.post("/api/auth/forgot", json={"email": "x@y.com"}, headers={"Origin": o}).status_code == 200, o
    for o in ("http://localhost:3000", "http://127.0.0.1:8000", "http://localhost"):
        assert client.post("/api/auth/forgot", json={"email": "x@y.com"}, headers={"Origin": o}).status_code == 403, o
    monkeypatch.setenv("TSUCHO_ORIGINS", "https://khac.example.com")
    assert client.post("/api/auth/forgot", json={"email": "x@y.com"}, headers={"Origin": "https://khac.example.com"}).status_code == 200
    assert client.post("/api/auth/forgot", json={"email": "x@y.com"}).status_code == 200      # không có Origin: qua

    # máy phát triển: PUBLIC_URL không đặt hoặc là localhost → localhost được
    for pub in (None, "http://localhost:3000"):
        monkeypatch.delenv("TSUCHO_ORIGINS", raising=False)
        if pub:
            monkeypatch.setenv("TSUCHO_PUBLIC_URL", pub)
        else:
            monkeypatch.delenv("TSUCHO_PUBLIC_URL", raising=False)
        for o in ("http://localhost:3000", "http://127.0.0.1:8000", "http://localhost"):
            assert client.post("/api/auth/forgot", json={"email": "x@y.com"}, headers={"Origin": o}).status_code == 200, (pub, o)
        assert client.post("/api/auth/forgot", json={"email": "x@y.com"},
                           headers={"Origin": "http://localhost.evil.com"}).status_code == 403


def test_header_bao_mat_moi_phan_hoi_va_no_store_cho_trang_token(client):
    for r in (client.get("/api/health"), client.post("/api/auth/forgot", json={"email": "x@y.com"}),
              client.post("/api/auth/forgot", json={"email": "x@y.com"}, headers={"Origin": "https://evil.example.com"}),
              client.get("/api/ws")):
        h = r.headers
        assert h["referrer-policy"] == "strict-origin-when-cross-origin" and h["x-content-type-options"] == "nosniff"
        assert "frame-ancestors 'none'" in h["content-security-policy"] and h["x-frame-options"] == "DENY"
    assert "no-store" not in client.get("/api/health").headers.get("cache-control", "")
    for path in ("/verify/", "/reset/", "/forgot/"):
        r = client.get(path)
        assert r.headers["cache-control"] == "no-store" and r.headers["referrer-policy"] == "no-referrer", path


# ── «お試し» (trial) ──────────────────────────────────────────────────

@pytest.fixture
def trial_on(monkeypatch):
    monkeypatch.setattr(auth, "OPEN_LOGIN", True)


def test_trial_mot_cham_tao_ngau_nhien_va_vao_lai_bang_trial(client, trial_on):
    r = client.post("/api/auth/trial/new", json={})
    assert r.status_code == 200, r.text
    j = r.json()
    assert j["kind"] == "trial" and j["role"] == "user" and j["ephemeral"] is True
    assert re.fullmatch(r"guest-[a-z2-7]{10}", j["trial_id"]) and j["email"] == j["trial_id"]
    assert len(j["trial_password"]) >= 30 and "created" not in j
    with auth._db() as conn:
        row = conn.execute("SELECT email, ephemeral, last_seen FROM users").fetchone()
    assert row["email"] == "trial:" + j["trial_id"] and row["ephemeral"] == 1 and row["last_seen"] > 0
    assert client.get("/api/auth/me").json()["ephemeral"] is True

    client.post("/api/auth/logout")
    r2 = client.post("/api/auth/trial", json={"id": j["trial_id"], "password": j["trial_password"]})
    assert r2.status_code == 200 and r2.json()["id"] == j["id"] and "trial_password" not in r2.json()
    assert "created" not in r2.json()
    client.post("/api/auth/logout")
    other = client.post("/api/auth/trial/new", json={}).json()
    assert other["trial_id"] != j["trial_id"] and other["trial_password"] != j["trial_password"] and other["id"] != j["id"]


def test_trial_id_la_khong_tao_moi_chi_401_nhu_sai_mat_khau(client, trial_on, monkeypatch):
    n = []
    monkeypatch.setattr(auth, "burn_time", lambda: n.append(1))
    r = client.post("/api/auth/trial", json={"id": "chua-co", "password": "1"})
    assert r.status_code == 401 and r.json()["detail"] == "Email hoặc mật khẩu không đúng"
    assert auth.count_users() == 0 and n == [1]
    with auth._db() as conn:
        assert conn.execute("SELECT COUNT(*) AS n FROM login_fails").fetchone()["n"] == 2      # có đếm khoá như sai mật khẩu
    trial(client, "co-san")
    sai = client.post("/api/auth/trial", json={"id": "co-san", "password": "sai"})
    assert sai.status_code == 401 and sai.json() == r.json()


def test_trial_mot_cham_bat_buoc_captcha_khi_da_cau_hinh(client, trial_on, monkeypatch):
    from api import captcha
    monkeypatch.setenv("TURNSTILE_SECRET_KEY", "s")
    monkeypatch.setenv("TURNSTILE_SITE_KEY", "k")
    monkeypatch.setenv("TSUCHO_PUBLIC_URL", "https://app.tsucho-scan.com")
    monkeypatch.setattr(captcha, "_post_form", lambda url, data: {"success": True, "hostname": "app.tsucho-scan.com"})
    r = client.post("/api/auth/trial/new", json={})
    assert r.status_code == 400 and r.json()["detail"] == {"kind": "captcha"} and auth.count_users() == 0
    assert client.post("/api/auth/trial/new", json={"captcha": "tok"}).status_code == 200


def test_trial_mot_cham_tat_thi_404(client, monkeypatch):
    monkeypatch.setattr(auth, "OPEN_LOGIN", False)
    r = client.post("/api/auth/trial/new", json={})
    assert r.status_code == 404 and r.json()["detail"] == {"kind": "trial_off"}
    assert client.post("/api/auth/trial/new").status_code == 404 and auth.count_users() == 0


def test_trial_sai_mat_khau_bi_dem_va_khoa_nhu_login(client, trial_on):
    trial(client, "sato", "dung")
    client.post("/api/auth/logout")
    for _ in range(auth.MAX_FAILS_EMAIL):
        assert client.post("/api/auth/trial", json={"id": "sato", "password": "sai"}).status_code == 401
    r = client.post("/api/auth/trial", json={"id": "sato", "password": "dung"})
    assert r.status_code == 429 and r.json()["detail"]["kind"] == "locked"


def test_trial_khoa_rieng_khong_khoa_email_that_cung_ten(client, trial_on):
    register(client, "sato@vd.com", "Matkhau123")
    client.post("/api/auth/logout")
    trial(client, "sato@vd.com", "dung")
    client.post("/api/auth/logout")
    for _ in range(auth.MAX_FAILS_EMAIL):
        client.post("/api/auth/trial", json={"id": "sato@vd.com", "password": "sai"})
    assert client.post("/api/auth/login", json={"email": "sato@vd.com", "password": "Matkhau123"}).status_code == 200


def test_trial_tat_thi_404(client, monkeypatch):
    monkeypatch.setattr(auth, "OPEN_LOGIN", False)
    r = client.post("/api/auth/trial", json={"id": "a", "password": "1"})
    assert r.status_code == 404 and r.json()["detail"] == {"kind": "trial_off"}
    assert auth.count_users() == 0


def test_trial_id_rong_qua_dai_hay_mat_khau_hong(client, trial_on):
    assert client.post("/api/auth/trial", json={"id": "  ", "password": "1"}).status_code == 401
    r = client.post("/api/auth/trial", json={"id": "a" * (auth.OPEN_ID_MAX + 1), "password": "1"})
    assert r.status_code == 401            # ID quá dài: 401 như sai mật khẩu, không ghi khoá đếm
    r = client.post("/api/auth/trial", json={"id": "a", "password": "x" * 129})
    assert r.status_code == 400 and r.json()["detail"]["kind"] == "password_too_long"
    assert auth.count_users() == 0


def test_trial_khong_chiem_duoc_email_that(client, trial_on):
    """Người lạ tạo ID thử trùng email thật thì chủ email vẫn đăng ký được, và hai tài khoản tách hẳn nhau."""
    ke_la = trial(client, "chu@congty.co.jp", "ke-la").json()
    client.post("/api/auth/logout")

    dang_ky(client, "chu@congty.co.jp")
    xac_minh(client, "chu@congty.co.jp", "Mat-khau-that-1")
    that = client.get("/api/auth/me").json()
    assert that["id"] != ke_la["id"] and that["kind"] == "member"
    client.post("/api/auth/logout")

    # mật khẩu của kẻ lạ không vào được tài khoản thật qua ô email; tiền tố trial: cũng không trúng tài khoản thử
    assert client.post("/api/auth/login", json={"email": "chu@congty.co.jp", "password": "ke-la"}).status_code == 401
    assert client.post("/api/auth/login", json={"email": "trial:chu@congty.co.jp", "password": "ke-la"}).status_code == 401
    # và ngược lại: mật khẩu thật không vào được tài khoản thử
    assert client.post("/api/auth/trial", json={"id": "chu@congty.co.jp", "password": "Mat-khau-that-1"}).status_code == 401


def test_trial_khong_tu_noi_voi_google_hay_email_va_login_khong_dang_nhap_trial(client, trial_on):
    trial(client, "x@vd.com")
    client.post("/api/auth/logout")
    assert auth.get_by_email("x@vd.com") is None and auth.get_by_email("trial:x@vd.com") is None
    assert client.post("/api/auth/login", json={"email": "x@vd.com", "password": "1"}).status_code == 401


def test_login_chi_cho_member_va_demo_khong_tu_tao(client, trial_on):
    r = client.post("/api/auth/login", json={"email": "nguoi-la", "password": "1"})
    assert r.status_code == 401 and auth.count_users() == 0


def test_demo_dang_nhap_nhu_da_xac_minh(client, monkeypatch):
    from api import demo
    monkeypatch.setenv("TSUCHO_DEMO_ACCOUNTS", "demo@x.test:matkhau-demo")
    demo.tao_neu_thieu()
    r = client.post("/api/auth/login", json={"email": "demo@x.test", "password": "matkhau-demo"})
    assert r.status_code == 200
    assert (r.json()["kind"], r.json()["email_verified"], r.json()["role"]) == ("demo", True, "user")


# ── /methods và /me ───────────────────────────────────────────────────

def test_methods(client, monkeypatch):
    for k in ("GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "LINE_CHANNEL_ID", "LINE_CHANNEL_SECRET"):
        monkeypatch.delenv(k, raising=False)
    monkeypatch.setattr(auth, "OPEN_LOGIN", True)
    assert client.get("/api/auth/methods").json() == {
        "google": False, "line": False, "email": True, "trial": True, "trial_limit": 5, "trial_keep_days": 7, "member_limit": 30,
        "turnstile_site_key": None, "google_client_id": None,
    }
    monkeypatch.setenv("GOOGLE_CLIENT_ID", "id")                       # thiếu secret → vẫn ẩn
    assert client.get("/api/auth/methods").json()["google"] is False
    monkeypatch.setenv("GOOGLE_CLIENT_SECRET", "s")
    monkeypatch.setenv("LINE_CHANNEL_ID", "l")
    monkeypatch.setenv("LINE_CHANNEL_SECRET", "s")
    monkeypatch.setenv("TSUCHO_TRIAL_SCAN_LIMIT", "7")
    monkeypatch.setenv("TSUCHO_MEMBER_SCAN_LIMIT", "40")
    monkeypatch.setattr(auth, "OPEN_LOGIN", False)
    assert client.get("/api/auth/methods").json() == {
        "google": True, "line": True, "email": True, "trial": False, "trial_limit": 7, "trial_keep_days": 7, "member_limit": 40,
        "turnstile_site_key": None, "google_client_id": "id",
    }


def test_me_co_kind_quota_va_providers(client, trial_on):
    me = register(client, "an@vd.com")
    assert me["kind"] == "member" and me["email_verified"] is True and me["display_name"] == ""
    j = client.get("/api/auth/me").json()
    assert j["providers"] == [] and j["quota"] == {"limit": 30, "used": 0, "left": 30}
    assert {"id", "email", "role", "kind", "email_verified", "display_name", "providers", "quota"} <= set(j)

    client.post("/api/auth/logout")
    trial(client, "kh")
    j = client.get("/api/auth/me").json()
    assert (j["kind"], j["email"], j["quota"]) == ("trial", "kh", {"limit": 5, "used": 0, "left": 5})


def test_me_admin_khong_gioi_han(client, monkeypatch):
    monkeypatch.setenv("TSUCHO_ADMIN_EMAILS", "chu@vd.com")
    register(client, "chu@vd.com")
    q = client.get("/api/auth/me").json()["quota"]
    assert q == {"limit": None, "used": 0, "left": None}


# ── Gửi thư ───────────────────────────────────────────────────────────

def test_mau_thu_ba_thu_tieng(client):
    ja = mailer.render("verify", None, "http://x/verify/?token=T")
    assert "確認" in ja[0] and "48時間" in ja[1] and "心当たりがない場合はこのメールを破棄してください" in ja[1]
    assert '<a href="http://x/verify/?token=T">' in ja[2]
    vi = mailer.render("reset", "vi", "http://x/reset/?token=T")
    assert "Đặt lại mật khẩu" in vi[0] and "30 phút" in vi[1]
    en = mailer.render("exists", "en", "http://x/forgot/")
    assert "already" in en[0].lower() and "http://x/forgot/" in en[1]
    assert mailer.render("verify", "xx", "L")[0] == ja[0].replace("http://x/verify/?token=T", "L")   # ngôn ngữ lạ → ja


def test_link_trong_thu_dung_public_url(client, monkeypatch):
    monkeypatch.setenv("TSUCHO_PUBLIC_URL", "https://app.tsucho-scan.com/")
    dang_ky(client)
    assert "https://app.tsucho-scan.com/verify/#token=" in mails("verify")[-1]
    register(client, "an@vd.com")
    client.post("/api/auth/logout")
    client.post("/api/auth/forgot", json={"email": "an@vd.com"})
    assert "https://app.tsucho-scan.com/reset/#token=" in mails("reset")[-1]


def test_canh_bao_thieu_resend_khi_may_chu_that(monkeypatch, capsys, caplog):
    monkeypatch.delenv("RESEND_API_KEY", raising=False)
    monkeypatch.delenv("TSUCHO_PUBLIC_URL", raising=False)
    mailer.warn_if_unconfigured()
    monkeypatch.setenv("TSUCHO_PUBLIC_URL", "http://localhost:3000")
    mailer.warn_if_unconfigured()
    assert capsys.readouterr().err == ""
    monkeypatch.setenv("TSUCHO_PUBLIC_URL", "https://app.tsucho-scan.com")
    mailer.warn_if_unconfigured()
    assert "RESEND_API_KEY" in capsys.readouterr().err
    monkeypatch.setenv("RESEND_API_KEY", "re_x")
    mailer.warn_if_unconfigured()
    assert capsys.readouterr().err == ""


def test_viec_gui_thu_chay_nen_khi_khong_dat_mail_sync(client, monkeypatch):
    import threading
    monkeypatch.delenv("TSUCHO_MAIL_SYNC")
    seen = []
    monkeypatch.setattr(mailer, "send_verify", lambda to, tk, lang: seen.append(threading.current_thread().name))
    r = client.post("/api/auth/register", json={"email": "bg@vd.com"})
    assert r.status_code == 200
    mailer.wait_idle()
    assert seen == ["mail-bg"]


def test_thu_ghi_outbox_dong_bo_dung_dinh_dang(client):
    dang_ky(client, lang="vi")
    [f] = outbox()
    assert re.fullmatch(r"\d{8}-\d{6}-\d{6}-verify\.txt", f.name)
    text = f.read_text(encoding="utf-8")
    assert text.startswith("To: moi@vd.com\nSubject: ") and "Xác minh" in text


def test_co_resend_key_thi_goi_resend_trong_luong_nen_khong_ghi_file(client, monkeypatch):
    import threading
    monkeypatch.setenv("RESEND_API_KEY", "re_test")
    got = {}
    done = threading.Event()

    def gia(key, to, subject, text, html):
        got.update(key=key, to=to, subject=subject, thread=threading.current_thread().name)
        done.set()

    monkeypatch.setattr(mailer, "_send_resend", gia)
    dang_ky(client)
    assert done.wait(5)
    assert got["key"] == "re_test" and got["to"] == "moi@vd.com" and got["thread"] == "mailer"
    assert outbox() == []


def test_resend_gui_json_bearer_va_loi_chi_ghi_log(monkeypatch):
    seen = {}

    class Resp:
        def __enter__(self): return self
        def __exit__(self, *a): return False
        def read(self): return b"{}"

    def urlopen(req, timeout=None):
        seen.update(url=req.full_url, auth=req.get_header("Authorization"), body=json.loads(req.data),
                    ctype=req.get_header("Content-type"), method=req.get_method())
        return Resp()

    monkeypatch.setattr(mailer.urllib.request, "urlopen", urlopen)
    monkeypatch.setenv("TSUCHO_MAIL_FROM", "A <a@b.c>")
    mailer._send_resend("re_k", "x@y.z", "Tiêu đề", "chữ", "<p>chữ</p>")
    assert seen["url"] == "https://api.resend.com/emails" and seen["auth"] == "Bearer re_k"
    assert seen["method"] == "POST" and seen["ctype"] == "application/json"
    assert seen["body"] == {"from": "A <a@b.c>", "to": ["x@y.z"], "subject": "Tiêu đề", "text": "chữ", "html": "<p>chữ</p>"}

    def hong(req, timeout=None):
        raise OSError("mạng đứt")

    monkeypatch.setattr(mailer.urllib.request, "urlopen", hong)
    mailer._send_resend("re_k", "x@y.z", "s", "t", "")          # không ném


# ── Di trú CSDL cũ ────────────────────────────────────────────────────

CU = """
CREATE TABLE users (id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user', created_at REAL NOT NULL, prefs TEXT NOT NULL DEFAULT '{}');
CREATE TABLE sessions (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, created_at REAL NOT NULL, expires_at REAL NOT NULL);
CREATE TABLE login_fails (key TEXT PRIMARY KEY, fails INTEGER NOT NULL, first_at REAL NOT NULL, locked_until REAL NOT NULL DEFAULT 0);
CREATE TABLE demo_usage (user_id TEXT NOT NULL, day TEXT NOT NULL, faces INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (user_id, day));
"""


@pytest.fixture
def db_cu(tmp_path, monkeypatch):
    """CSDL kiểu CŨ (không cột kind/email_verified/...): 1 admin, 1 người dùng đăng nhập mở, 1 tài khoản demo."""
    monkeypatch.setattr(workspace, "DATA_DIR", tmp_path)
    monkeypatch.setattr(workspace, "WS_DIR", tmp_path / "ws")
    monkeypatch.setattr(workspace, "_cache", {})
    monkeypatch.setattr(auth, "DB_PATH", tmp_path / "cu.db")
    monkeypatch.setattr(auth, "OPEN_LOGIN", True)
    monkeypatch.setenv("TSUCHO_DEMO_ACCOUNTS", "Demo@X.test:matkhau-demo")
    conn = sqlite3.connect(tmp_path / "cu.db")
    conn.executescript(CU)
    now = time.time()
    rows = [("adm000000001", "admin@vd.com", auth.hash_password("matkhau-admin"), "admin"),
            ("opn000000002", "chu", auth.hash_password("1"), "user"),
            ("dem000000003", "demo@x.test", auth.hash_password("matkhau-demo"), "user")]
    for i, e, h, r in rows:
        conn.execute("INSERT INTO users (id, email, password_hash, role, created_at) VALUES (?,?,?,?,?)", (i, e, h, r, now))
    conn.execute("INSERT INTO sessions VALUES (?, ?, ?, ?)", (auth._token_hash("tok-cu"), "opn000000002", now, now + 3600))
    conn.commit()
    conn.close()
    return tmp_path


def _users():
    with auth._db() as conn:
        return {r["id"]: dict(r) for r in conn.execute("SELECT * FROM users")}


def test_di_tru_phan_loai_tai_khoan_cu(db_cu):
    auth.init_db()
    u = _users()
    assert (u["adm000000001"]["kind"], u["adm000000001"]["email_verified"], u["adm000000001"]["email"]) == \
           ("member", 1, "admin@vd.com")
    assert [u[i]["legacy"] for i in ("adm000000001", "opn000000002", "dem000000003")] == [1, 0, 0], \
        "admin cũ đánh dấu legacy (đợt B: luật nối OAuth phải bỏ qua)"
    assert (u["dem000000003"]["kind"], u["dem000000003"]["email_verified"], u["dem000000003"]["email"]) == \
           ("demo", 1, "demo@x.test")
    assert (u["opn000000002"]["kind"], u["opn000000002"]["email_verified"], u["opn000000002"]["email"]) == \
           ("trial", 0, "trial:chu")
    for row in u.values():
        assert row["display_name"] == "" and row["scan_limit"] is None
    with auth._db() as conn:
        tables = {r["name"] for r in conn.execute("SELECT name FROM sqlite_master WHERE type = 'table'")}
        assert {"identities", "email_tokens", "oauth_states", "usage_counters", "meta"} <= tables


def test_init_db_chay_hai_lan_khong_doi_gi_them(db_cu):
    auth.init_db()
    truoc = _users()
    auth.init_db()
    auth.init_db()
    assert _users() == truoc
    assert truoc["opn000000002"]["email"] == "trial:chu", "không được thêm tiền tố lần nữa"


def test_di_tru_chi_phan_loai_mot_lan_ke_ca_khi_co_nguoi_moi(db_cu):
    auth.init_db()
    auth.create_user("moi@vd.com", "Matkhau123", verified=False)       # member chưa xác minh: KHÔNG bị đổi thành trial
    auth.init_db()
    u = auth.get_by_email("moi@vd.com")[0]
    assert (u.kind, u.email) == ("member", "moi@vd.com")


def test_nguoi_cu_dang_nhap_mo_van_vao_duoc_qua_trial_voi_user_id_cu(db_cu):
    auth.init_db()
    with TestClient(main.app) as c:
        r = c.post("/api/auth/trial", json={"id": "chu", "password": "1"})
        assert r.status_code == 200, r.text
        assert r.json()["id"] == "opn000000002" and "created" not in r.json() and r.json()["email"] == "chu"
        # phiên cũ vẫn dùng được, user_id không đổi
        c.cookies.set(auth.COOKIE, "tok-cu")
        assert c.get("/api/auth/me").json()["id"] == "opn000000002"
        # ô email thật không còn nhận ID cũ
        c.cookies.clear()
        assert c.post("/api/auth/login", json={"email": "chu", "password": "1"}).status_code == 401
        # admin và demo cũ vẫn đăng nhập bằng email
        a = c.post("/api/auth/login", json={"email": "admin@vd.com", "password": "matkhau-admin"})
        assert a.status_code == 200 and (a.json()["role"], a.json()["kind"]) == ("admin", "member")
        c.post("/api/auth/logout")
        d = c.post("/api/auth/login", json={"email": "demo@x.test", "password": "matkhau-demo"})
        assert d.status_code == 200 and d.json()["kind"] == "demo"


def test_di_tru_csdl_moi_tinh_danh_dau_da_phan_loai(tmp_path, monkeypatch):
    monkeypatch.setattr(auth, "DB_PATH", tmp_path / "moi.db")
    auth.init_db()
    with auth._db() as conn:
        assert conn.execute("SELECT value FROM meta WHERE key = 'accounts_classified'").fetchone()["value"] == "1"


def test_login_tai_khoan_chua_co_mat_khau_van_dot_thoi_gian_nhu_email_la(client, monkeypatch):
    dang_ky(client)
    n = []
    monkeypatch.setattr(auth, "burn_time", lambda: n.append(1))
    for email in ("moi@vd.com", "khong-co@vd.com"):                       # chưa đặt mật khẩu / không tồn tại
        assert client.post("/api/auth/login", json={"email": email, "password": "Matkhau123"}).status_code == 401
    assert len(n) == 2


def test_mat_khau_qua_dai_bi_tu_choi_o_login_va_trial(client, trial_on):
    r = client.post("/api/auth/trial", json={"id": "a", "password": "x" * 129})
    assert r.status_code == 400 and r.json()["detail"]["kind"] == "password_too_long"
    register(client, "an@vd.com")
    client.post("/api/auth/logout")
    assert client.post("/api/auth/login", json={"email": "an@vd.com", "password": "x" * 129}).status_code == 401


def test_methods_an_dang_ky_khi_may_that_chua_cai_gui_thu(client, monkeypatch):
    """Máy thật (PUBLIC_URL không phải localhost) mà thiếu RESEND_API_KEY: giao diện phải ẩn đăng ký/quên mật khẩu,
    vì báo «đã gửi thư» mà thư không bao giờ tới thì người dùng kẹt."""
    monkeypatch.setenv("TSUCHO_PUBLIC_URL", "https://app.tsucho-scan.com")
    monkeypatch.delenv("RESEND_API_KEY", raising=False)
    assert client.get("/api/auth/methods").json()["email"] is False
    monkeypatch.setenv("RESEND_API_KEY", "re_test")
    assert client.get("/api/auth/methods").json()["email"] is True
    monkeypatch.setenv("TSUCHO_PUBLIC_URL", "http://localhost:3000")
    monkeypatch.delenv("RESEND_API_KEY", raising=False)
    assert client.get("/api/auth/methods").json()["email"] is True
