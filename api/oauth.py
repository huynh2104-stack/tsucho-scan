"""Đăng nhập Google (OpenID Connect) và LINE Login v2.1 — luồng mã + PKCE. Xem docs/KE_HOACH_DANG_NHAP.md §3.1–§3.4.

Trình duyệt chỉ đi qua hai route: `/api/auth/{provider}/start` (tạo state/nonce/PKCE rồi chuyển sang nhà cung cấp) và
`/api/auth/{provider}/callback` (đổi mã, kiểm id_token, nối/tạo tài khoản, mở phiên). Gọi HTTP chỉ qua `_post_form`
(stdlib urllib) để test thay được; không thư viện ngoài.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import logging
import os
import re
import secrets
import threading
import time
import urllib.error
import urllib.parse
import urllib.request

from . import auth

log = logging.getLogger("tsucho.oauth")

PROVIDERS = ("google", "line")
STATE_TTL = 600
STATE_COOKIE = "tsucho_oauth"
COOKIE_PATH = "/api/auth/"

GOOGLE_AUTH = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN = "https://oauth2.googleapis.com/token"
GOOGLE_CERTS = "https://www.googleapis.com/oauth2/v1/certs"
GIS_COOKIE = "tsucho_gis"                  # nonce của nút Google (GIS) buộc vào trình duyệt, HttpOnly
GIS_TTL = 1800
GOOGLE_ISS = ("accounts.google.com", "https://accounts.google.com")
LINE_AUTH = "https://access.line.me/oauth2/v2.1/authorize"
LINE_TOKEN = "https://api.line.me/oauth2/v2.1/token"
LINE_VERIFY = "https://api.line.me/oauth2/v2.1/verify"

_BAD_NEXT = re.compile(r"[\x00-\x20\x7f\\]")


class OAuthError(Exception):
    """Lỗi đăng nhập qua nhà cung cấp; `code` là giá trị của `auth_error` trên /login/."""

    def __init__(self, code: str, detail: str = "") -> None:
        super().__init__(detail or code)
        self.code = code


def _keys(provider: str) -> tuple[str, str]:
    if provider == "google":
        return os.getenv("GOOGLE_CLIENT_ID", "").strip(), os.getenv("GOOGLE_CLIENT_SECRET", "").strip()
    return os.getenv("LINE_CHANNEL_ID", "").strip(), os.getenv("LINE_CHANNEL_SECRET", "").strip()


def configured(provider: str) -> bool:
    cid, secret = _keys(provider)
    return bool(cid and secret)


def google_client_id() -> str | None:
    """Client ID công khai cho nút GIS; None khi Google chưa cấu hình đủ."""
    return _keys("google")[0] if configured("google") else None


def safe_next(value: str | None) -> str:
    """Chỉ nhận đường dẫn nội bộ: bắt đầu `/`, không `//`, không `/\\`, không `://`, không ký tự điều khiển/khoảng trắng."""
    n = value or "/"
    if (
        not n.startswith("/") or n.startswith("//") or "://" in n or _BAD_NEXT.search(n) or len(n) > 500
    ):
        return "/"
    return n


def redirect_uri(provider: str) -> str:
    base = os.getenv("TSUCHO_PUBLIC_URL", "http://localhost:3000").strip().rstrip("/") or "http://localhost:3000"
    return f"{base}/api/auth/{provider}/callback"


def _b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def start(provider: str, next_path: str | None) -> tuple[str, str]:
    """Tạo state/nonce/PKCE, lưu `oauth_states`, trả (URL chuyển hướng, state)."""
    state, nonce = secrets.token_urlsafe(32), secrets.token_urlsafe(32)
    verifier = secrets.token_urlsafe(64)
    challenge = _b64url(hashlib.sha256(verifier.encode()).digest())
    now = time.time()
    with auth._db() as conn:
        conn.execute("DELETE FROM oauth_states WHERE expires_at < ?", (now,))
        conn.execute(
            "INSERT INTO oauth_states (state, provider, nonce, verifier, next_path, expires_at) VALUES (?,?,?,?,?,?)",
            (state, provider, nonce, verifier, safe_next(next_path), now + STATE_TTL),
        )
    cid, _ = _keys(provider)
    params = {
        "response_type": "code", "client_id": cid, "redirect_uri": redirect_uri(provider), "state": state,
        "scope": "openid email profile" if provider == "google" else "openid profile email",
        "nonce": nonce, "code_challenge": challenge, "code_challenge_method": "S256",
    }
    if provider == "google":
        params["prompt"] = "select_account"
    base = GOOGLE_AUTH if provider == "google" else LINE_AUTH
    return f"{base}?{urllib.parse.urlencode(params)}", state


def _take_state(state: str, provider: str) -> dict | None:
    """Lấy và XOÁ hàng state (dùng một lần, kể cả khi bước sau lỗi). Hết hạn/khác provider → None."""
    if not state:
        return None
    with auth._db() as conn:
        row = conn.execute("SELECT * FROM oauth_states WHERE state = ?", (state,)).fetchone()
        conn.execute("DELETE FROM oauth_states WHERE state = ?", (state,))
    if not row or row["provider"] != provider or row["expires_at"] < time.time():
        return None
    return dict(row)


def _post_form(url: str, data: dict) -> dict:
    """POST form-urlencoded, trả JSON. Lỗi mạng/HTTP/JSON → ném (người gọi đổi thành `provider`)."""
    req = urllib.request.Request(
        url, data=urllib.parse.urlencode(data).encode(), method="POST",
        headers={"Content-Type": "application/x-www-form-urlencoded", "Accept": "application/json",
                 "User-Agent": "tsucho-scan/1.0"},
    )
    with urllib.request.urlopen(req, timeout=15) as resp:
        out = json.loads(resp.read().decode("utf-8"))
    if not isinstance(out, dict):
        raise ValueError("phản hồi không phải JSON object")
    return out


def _jwt_claims(token: str) -> dict:
    """Payload của id_token (nhận trực tiếp từ nhà cung cấp qua HTTPS nên không kiểm chữ ký — xem kế hoạch §3.1)."""
    try:
        payload = token.split(".")[1]
        claims = json.loads(base64.urlsafe_b64decode(payload + "=" * (-len(payload) % 4)))
    except Exception as e:
        raise OAuthError("provider", "id_token hỏng") from e
    if not isinstance(claims, dict):
        raise OAuthError("provider", "id_token hỏng")
    return claims


def _same(a, b) -> bool:
    return isinstance(a, str) and isinstance(b, str) and hmac.compare_digest(a.encode(), b.encode())


def _exchange(url: str, data: dict) -> dict:
    try:
        return _post_form(url, data)
    except Exception as e:                                  # mạng / HTTP / JSON: chi tiết vào log, KHÔNG log mã/token
        log.warning("gọi %s thất bại: %s", url, type(e).__name__)
        raise OAuthError("provider", f"{url}: {type(e).__name__}") from e


def _google_identity(code: str, st: dict) -> tuple[str, str, bool, str]:
    cid, secret = _keys("google")
    tok = _exchange(GOOGLE_TOKEN, {
        "code": code, "client_id": cid, "client_secret": secret, "redirect_uri": redirect_uri("google"),
        "grant_type": "authorization_code", "code_verifier": st["verifier"],
    })
    id_token = tok.get("id_token")
    if not isinstance(id_token, str):
        raise OAuthError("provider", "thiếu id_token")
    return _google_claims(_jwt_claims(id_token), cid, st["nonce"])


def _google_claims(c: dict, cid: str, nonce: str, nonce_code: str = "provider") -> tuple[str, str, bool, str]:
    """Kiểm các trường của id_token Google (dùng chung luồng chuyển hướng và nút GIS) → (sub, email, verified, name).
    Chữ ký do người gọi lo: luồng chuyển hướng nhận token trực tiếp từ Google qua HTTPS, nút GIS thì kiểm RS256."""
    aud = c.get("aud")
    if c.get("iss") not in GOOGLE_ISS:
        raise OAuthError("provider", "iss sai")
    if not (aud == cid or (isinstance(aud, list) and cid in aud)):
        raise OAuthError("provider", "aud sai")
    exp = c.get("exp")
    if not isinstance(exp, (int, float)) or exp + 60 <= time.time():
        raise OAuthError("provider", "id_token hết hạn")
    if not _same(c.get("nonce"), nonce):
        raise OAuthError(nonce_code, "nonce sai")
    sub = c.get("sub")
    if not isinstance(sub, str) or not sub:
        raise OAuthError("provider", "thiếu sub")
    if c.get("email_verified") not in (True, "true") or not c.get("email"):
        raise OAuthError("email_unverified", "email chưa xác minh")
    return sub, str(c["email"]), True, str(c.get("name") or "")


# ── Nút «Sign in with Google» (GIS): trình duyệt gửi ID token, máy chủ tự kiểm chữ ký ──

_CERTS_MAX_BYTES = 65536
_certs: dict = {"keys": {}, "exp": 0.0, "fetched": 0.0, "failed_at": -1e9, "inflight": False}
_certs_lock = threading.Lock()


def _fetch_google_certs() -> tuple[dict, int]:
    """Tải chứng chỉ công khai của Google: ({kid: PEM}, max-age giây). Tách riêng để test thay được."""
    req = urllib.request.Request(GOOGLE_CERTS, headers={"User-Agent": "tsucho-scan/1.0"})
    with urllib.request.urlopen(req, timeout=5) as resp:
        raw = resp.read(_CERTS_MAX_BYTES + 1)
        cc = resp.headers.get("Cache-Control", "") or ""
    if len(raw) > _CERTS_MAX_BYTES:
        raise ValueError("phản hồi chứng chỉ quá lớn")
    keys = json.loads(raw.decode("utf-8"))
    m = re.search(r"max-age=(\d+)", cc)
    return keys, int(m.group(1)) if m else 3600


def _google_certs(kid: str | None) -> dict:
    """Chứng chỉ đang cache. Hết hạn thì tải lại; `kid` lạ thì tải lại tối đa một lần mỗi 60 giây. Tải NGOÀI khoá, chỉ
    một luồng tải mỗi lúc (single-flight). Tải lỗi → nghỉ 30 giây: còn chứng chỉ cũ thì dùng tiếp (gia hạn 300 giây),
    chưa có gì thì báo lỗi ngay, không gọi mạng."""
    now = time.time()
    with _certs_lock:
        keys = dict(_certs["keys"])
        stale = now >= _certs["exp"]
        unknown = bool(kid) and kid not in keys and now - _certs["fetched"] >= 60
        if not (stale or unknown):
            return keys
        if now - _certs.get("failed_at", -1e9) < 30 or _certs.get("inflight"):
            if stale and keys:
                _certs["exp"] = max(_certs["exp"], now + 300)
            if keys:
                return keys
            raise OAuthError("provider", "chưa có chứng chỉ Google")
        _certs["inflight"] = True
        _certs["fetched"] = now
    try:
        fetched, age = _fetch_google_certs()
        if not isinstance(fetched, dict):
            raise ValueError("certs không phải object")
    except Exception as e:
        log.warning("tải chứng chỉ Google thất bại: %s", type(e).__name__)
        with _certs_lock:
            _certs["inflight"] = False
            _certs["failed_at"] = time.time()
            if _certs["keys"]:
                _certs["exp"] = max(_certs["exp"], time.time() + 300)
                return dict(_certs["keys"])
        raise OAuthError("provider", "không tải được chứng chỉ Google") from e
    with _certs_lock:
        _certs.update(keys=fetched, exp=time.time() + min(max(age, 0), 86400), inflight=False)
        return dict(fetched)


def verify_google_credential(credential: str, nonce: str) -> tuple[str, str, bool, str]:
    """Kiểm ID token từ nút Google → (sub, email, verified, name), cùng dạng luồng chuyển hướng. Sai → OAuthError."""
    cid, _ = _keys("google")
    if not isinstance(credential, str) or not credential or len(credential) > 4096 or not cid:
        raise OAuthError("provider", "credential hỏng")
    if not isinstance(nonce, str) or not nonce:
        raise OAuthError("state", "thiếu nonce")
    try:
        from google.auth import jwt as gjwt

        kid = gjwt.decode_header(credential).get("kid")
        claims = gjwt.decode(credential, certs=_google_certs(kid), audience=cid, clock_skew_in_seconds=60)
    except OAuthError:
        raise
    except Exception as e:
        raise OAuthError("provider", f"id_token sai: {type(e).__name__}") from e
    return _google_claims(dict(claims), cid, nonce, "state")


def _line_identity(code: str, st: dict) -> tuple[str, str, bool, str]:
    cid, secret = _keys("line")
    tok = _exchange(LINE_TOKEN, {
        "grant_type": "authorization_code", "code": code, "redirect_uri": redirect_uri("line"),
        "client_id": cid, "client_secret": secret, "code_verifier": st["verifier"],
    })
    id_token = tok.get("id_token")
    if not isinstance(id_token, str):
        raise OAuthError("provider", "thiếu id_token")
    c = _exchange(LINE_VERIFY, {"id_token": id_token, "client_id": cid, "nonce": st["nonce"]})
    sub = c.get("sub")
    if not isinstance(sub, str) or not sub:
        raise OAuthError("provider", "thiếu sub")
    # Email LINE chỉ để hiển thị (identities.email) — không dùng để nối tài khoản hay nâng admin
    return sub, str(c.get("email") or ""), False, str(c.get("name") or "")


def finish(provider: str, code: str | None, state: str | None, cookie_state: str | None,
           error: str | None) -> tuple[auth.User, str]:
    """Xử lý callback: trả (người dùng, đường dẫn `next`) hoặc ném OAuthError(code)."""
    st = _take_state(state or "", provider)           # luôn xoá state trước mọi kiểm tra khác
    if error:
        raise OAuthError("cancelled", error)
    if st is None or not _same(cookie_state, state):
        raise OAuthError("state", "state thiếu/hết hạn/không khớp cookie")
    if not code:
        raise OAuthError("provider", "thiếu code")
    sub, email, verified, name = (_google_identity if provider == "google" else _line_identity)(code, st)
    return auth.login_with_identity(provider, sub, email, verified, name), st["next_path"]
