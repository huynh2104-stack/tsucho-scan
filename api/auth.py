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

- Chống dò mật khẩu: đếm số lần sai trong bảng `login_fails`, khoá tạm 15 phút.
  Xem phần "Chống dò mật khẩu" bên dưới.

⚠ Chưa có: quên mật khẩu, xác minh email.
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

# ── Ngưỡng chống dò mật khẩu ─────────────────────────────────────────
# Đếm theo HAI khoá cùng lúc:
#   e:<email> — chặn dò một tài khoản cụ thể (ngưỡng thấp)
#   i:<ip>    — chặn rải mật khẩu qua nhiều email từ một máy (ngưỡng cao hơn,
#               vì cả văn phòng có thể dùng chung một IP)
MAX_FAILS_EMAIL = 5
MAX_FAILS_IP = 20
LOCK_SECONDS = 15 * 60
WINDOW_SECONDS = 15 * 60


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
CREATE TABLE IF NOT EXISTS login_fails (
    key          TEXT PRIMARY KEY,
    fails        INTEGER NOT NULL,
    first_at     REAL NOT NULL,
    locked_until REAL NOT NULL DEFAULT 0
);
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


# ── Chống dò mật khẩu ────────────────────────────────────────────────
#
# scrypt tuy chậm (~50-100ms/lần) nhưng KHÔNG đủ: cứ để mặc thì một máy vẫn thử
# được hơn một triệu mật khẩu mỗi ngày. Đếm số lần sai rồi khoá tạm là lớp chặn
# thật sự.
#
# Đánh đổi đã cân nhắc: người ngoài biết email của giám đốc có thể cố tình gõ
# sai 5 lần để KHOÁ ông ấy 15 phút. Chấp nhận được vì (a) khoá tự hết, không cần
# ai mở, (b) mất 15 phút vẫn nhẹ hơn mất cả sổ ngân hàng. Muốn chặt hơn thì phải
# thêm CAPTCHA hoặc mã qua email — cả hai đều nặng hơn nhiều so với lợi ích ở
# quy mô này.

def attempt_keys(email: str, ip: str) -> list[str]:
    return [f"e:{normalize_email(email)}", f"i:{ip}"]


def _limit_for(key: str) -> int:
    return MAX_FAILS_EMAIL if key.startswith("e:") else MAX_FAILS_IP


def _cleanup(conn, now: float) -> None:
    """Bỏ hàng đã hết hạn khoá, và hàng đếm dở đã quá cửa sổ.

    Hết 15 phút khoá là **xoá sạch bộ đếm**, không giữ lại. Nếu giữ thì người
    dùng thật gõ sai đúng một lần nữa là bị khoá tiếp ngay — quên mật khẩu
    thành ra bị phạt vĩnh viễn.
    """
    conn.execute(
        "DELETE FROM login_fails WHERE (locked_until > 0 AND locked_until <= ?)"
        " OR (locked_until = 0 AND first_at < ?)",
        (now, now - WINDOW_SECONDS),
    )


def lock_remaining(keys: list[str]) -> int:
    """Còn bị khoá bao nhiêu GIÂY nữa (0 = không khoá)."""
    now = time.time()
    with _db() as conn:
        _cleanup(conn, now)
        holes = ",".join("?" * len(keys))
        row = conn.execute(
            f"SELECT MAX(locked_until) AS u FROM login_fails WHERE key IN ({holes})",
            keys,
        ).fetchone()
    until = row["u"] if row and row["u"] else 0
    return max(0, int(until - now) + 1) if until > now else 0


def record_failure(keys: list[str]) -> None:
    now = time.time()
    with _db() as conn:
        _cleanup(conn, now)
        for key in keys:
            old = conn.execute(
                "SELECT fails, first_at FROM login_fails WHERE key = ?", (key,)
            ).fetchone()
            fails = (old["fails"] + 1) if old else 1
            first_at = old["first_at"] if old else now
            locked = now + LOCK_SECONDS if fails >= _limit_for(key) else 0
            conn.execute(
                "INSERT INTO login_fails (key, fails, first_at, locked_until)"
                " VALUES (?, ?, ?, ?)"
                " ON CONFLICT(key) DO UPDATE SET fails = excluded.fails,"
                " locked_until = excluded.locked_until",
                (key, fails, first_at, locked),
            )


def clear_failures(keys: list[str]) -> None:
    """Đăng nhập đúng → xoá bộ đếm, không để lần sai hôm qua cộng dồn."""
    with _db() as conn:
        holes = ",".join("?" * len(keys))
        conn.execute(f"DELETE FROM login_fails WHERE key IN ({holes})", keys)


def client_ip(request) -> str:
    """IP người gọi.

    Sau proxy (Render, Cloudflare) thì `request.client.host` là IP của proxy —
    mọi người dùng chung một khoá, một người gõ sai là cả nhà bị khoá. Lúc đó
    phải đọc `X-Forwarded-For`.

    Nhưng header ấy do trình duyệt gửi nên **giả được**: chạy trực tiếp không
    qua proxy mà vẫn tin nó thì kẻ dò chỉ cần đổi header mỗi lần gọi là thoát
    khoá theo IP. Vì vậy chỉ tin khi `TSUCHO_TRUST_PROXY=1` — đặt biến này khi
    và chỉ khi app thật sự nằm sau proxy.
    """
    if os.getenv("TSUCHO_TRUST_PROXY", "").lower() in ("1", "true", "yes"):
        forwarded = request.headers.get("x-forwarded-for", "")
        if forwarded.strip():
            return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "?"


_DUMMY_HASH: str | None = None


def burn_time() -> None:
    """Băm một mật khẩu giả để lần gọi này tốn thời gian y như lần thật.

    Không có nó thì email chưa từng đăng ký trả lời trong ~1ms còn email có
    thật mất ~80ms — đo thời gian là biết địa chỉ nào đã có tài khoản, đúng thứ
    mà câu báo lỗi giống nhau đang cố giấu.
    """
    global _DUMMY_HASH
    if _DUMMY_HASH is None:
        _DUMMY_HASH = hash_password(secrets.token_hex(16))
    verify_password("khong-bao-gio-dung", _DUMMY_HASH)


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
