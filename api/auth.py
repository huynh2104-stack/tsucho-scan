"""Đăng nhập & tách dữ liệu theo người dùng.

Cách làm — chọn thứ ĐƠN GIẢN NHẤT mà vẫn đúng, không thêm thư viện nào:

- CSDL: **SQLite** một file `.data/app.db` (stdlib `sqlite3`). Đổi sang PostgreSQL
  sau này chỉ phải viết lại đúng file này.
- Mật khẩu: băm bằng **scrypt** của `hashlib` — có sẵn trong Python, không cần
  `passlib`/`bcrypt`. Mỗi lần thử mất ~50–100ms nên dò mật khẩu rất chậm.
- Phiên: **token ngẫu nhiên** đặt trong cookie `HttpOnly`, KHÔNG phải JWT.
  JWT không thu hồi được; token trong bảng thì bấm "đăng xuất" là mất hiệu lực
  ngay. Trong CSDL chỉ lưu **băm SHA-256 của token**, lộ file .db cũng không
  đăng nhập được.

⚠ Chưa có: giới hạn số lần đăng nhập sai, quên mật khẩu, xác minh email.
   Cần làm trước khi mở cho người ngoài (xem WEB_PLAN §5b).
"""

import hashlib
import hmac
import os
import re
import secrets
import sqlite3
import time
import uuid
from contextlib import contextmanager
from dataclasses import dataclass

from fastapi import Cookie, Depends, HTTPException, Response

from .workspace import DATA_DIR

DB_PATH = DATA_DIR / "app.db"

COOKIE = "tsucho_session"
SESSION_DAYS = 14
MIN_PASSWORD = 8

# Băm scrypt: n=2^14, r=8, p=1 → ~16MB RAM, ~50–100ms mỗi lần thử.
_SCRYPT = dict(n=2**14, r=8, p=1)

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


@dataclass
class User:
    id: str
    email: str
    role: str            # 'admin' | 'user' — mới dùng cột, chưa có màn quản lý
    created_at: float

    def to_json(self) -> dict:
        return {"id": self.id, "email": self.email, "role": self.role}


# ── CSDL ─────────────────────────────────────────────────────────────

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id            TEXT PRIMARY KEY,
    email         TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role          TEXT NOT NULL DEFAULT 'user',
    created_at    REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL,
    created_at REAL NOT NULL,
    expires_at REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
"""


@contextmanager
def _db():
    """Mở kết nối riêng cho mỗi thao tác.

    Route đồng bộ của FastAPI chạy trong threadpool, mà kết nối sqlite3 không
    dùng chung giữa các thread được — mở/đóng từng lần là an toàn nhất và với
    quy mô này thì chi phí không đáng kể.
    """
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH, timeout=10)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def init_db() -> None:
    with _db() as conn:
        conn.executescript(SCHEMA)


def _row_to_user(row: sqlite3.Row) -> User:
    return User(
        id=row["id"],
        email=row["email"],
        role=row["role"],
        created_at=row["created_at"],
    )


# ── Mật khẩu ─────────────────────────────────────────────────────────

def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    dk = hashlib.scrypt(password.encode(), salt=salt, dklen=32, **_SCRYPT)
    return f"scrypt${_SCRYPT['n']}${_SCRYPT['r']}${_SCRYPT['p']}${salt.hex()}${dk.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        algo, n, r, p, salt_hex, hash_hex = stored.split("$")
        if algo != "scrypt":
            return False
        dk = hashlib.scrypt(
            password.encode(),
            salt=bytes.fromhex(salt_hex),
            n=int(n), r=int(r), p=int(p),
            dklen=len(hash_hex) // 2,
        )
    except (ValueError, TypeError):
        return False
    return hmac.compare_digest(dk.hex(), hash_hex)


# ── Người dùng ───────────────────────────────────────────────────────

def normalize_email(email: str) -> str:
    return email.strip().lower()


def count_users() -> int:
    with _db() as conn:
        return conn.execute("SELECT COUNT(*) AS n FROM users").fetchone()["n"]


def get_by_email(email: str) -> tuple[User, str] | None:
    """Trả (user, password_hash) — hash chỉ dùng để kiểm tra lúc đăng nhập."""
    with _db() as conn:
        row = conn.execute(
            "SELECT * FROM users WHERE email = ?", (normalize_email(email),)
        ).fetchone()
    return (_row_to_user(row), row["password_hash"]) if row else None


def get_by_id(user_id: str) -> User | None:
    with _db() as conn:
        row = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
    return _row_to_user(row) if row else None


def create_user(email: str, password: str) -> User:
    """Tạo tài khoản. Người ĐẦU TIÊN đăng ký thành admin."""
    email = normalize_email(email)
    if not EMAIL_RE.match(email):
        raise ValueError("Email không hợp lệ")
    if len(password) < MIN_PASSWORD:
        raise ValueError(f"Mật khẩu phải từ {MIN_PASSWORD} ký tự trở lên")

    user = User(
        id=uuid.uuid4().hex[:12],
        email=email,
        role="admin" if count_users() == 0 else "user",
        created_at=time.time(),
    )
    try:
        with _db() as conn:
            conn.execute(
                "INSERT INTO users (id, email, password_hash, role, created_at)"
                " VALUES (?, ?, ?, ?, ?)",
                (user.id, user.email, hash_password(password), user.role, user.created_at),
            )
    except sqlite3.IntegrityError as e:
        raise ValueError("Email này đã có tài khoản") from e
    return user


# ── Phiên đăng nhập ──────────────────────────────────────────────────

def _token_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def start_session(user: User) -> str:
    token = secrets.token_urlsafe(32)
    now = time.time()
    with _db() as conn:
        conn.execute("DELETE FROM sessions WHERE expires_at < ?", (now,))
        conn.execute(
            "INSERT INTO sessions (token_hash, user_id, created_at, expires_at)"
            " VALUES (?, ?, ?, ?)",
            (_token_hash(token), user.id, now, now + SESSION_DAYS * 86400),
        )
    return token


def end_session(token: str) -> None:
    with _db() as conn:
        conn.execute("DELETE FROM sessions WHERE token_hash = ?", (_token_hash(token),))


def user_for_token(token: str) -> User | None:
    with _db() as conn:
        row = conn.execute(
            "SELECT user_id FROM sessions WHERE token_hash = ? AND expires_at > ?",
            (_token_hash(token), time.time()),
        ).fetchone()
    return get_by_id(row["user_id"]) if row else None


# ── Cookie ───────────────────────────────────────────────────────────

def _cookie_flags() -> dict:
    """Khi frontend và API khác TÊN MIỀN (Vercel ↔ Render) thì bắt buộc
    `SameSite=None; Secure`, còn chạy localhost thì `Lax` là đủ và không cần
    HTTPS. Đặt qua biến môi trường để không phải sửa code lúc triển khai."""
    samesite = os.getenv("TSUCHO_COOKIE_SAMESITE", "lax").lower()
    secure = os.getenv("TSUCHO_COOKIE_SECURE", "").lower() in ("1", "true", "yes")
    return {"samesite": samesite, "secure": secure or samesite == "none"}


def set_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        COOKIE, token,
        max_age=SESSION_DAYS * 86400,
        httponly=True,
        path="/",
        **_cookie_flags(),
    )


def clear_cookie(response: Response) -> None:
    response.delete_cookie(COOKIE, path="/", **_cookie_flags())


# ── Dependency dùng ở route ──────────────────────────────────────────

def optional_user(session: str | None = Cookie(default=None, alias=COOKIE)) -> User | None:
    return user_for_token(session) if session else None


def require_user(user: User | None = Depends(optional_user)) -> User:
    if not user:
        raise HTTPException(401, "Chưa đăng nhập")
    return user
