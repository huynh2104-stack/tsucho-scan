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

Ba loại tài khoản (cột `kind`): `member` (đăng ký email đã xác minh), `trial` («お試し», email lưu dạng
`trial:<id>` để không chiếm được email thật), `demo` (TSUCHO_DEMO_ACCOUNTS). Xem docs/KE_HOACH_DANG_NHAP.md.
"""

import hashlib
import hmac
import ipaddress
import os
import re
import secrets
import sqlite3
import time
import uuid
from contextlib import contextmanager
from dataclasses import dataclass

from fastapi import Cookie, Depends, HTTPException, Response

from . import workspace as _workspace
from .workspace import DATA_DIR

DB_PATH = DATA_DIR / "app.db"

COOKIE = "tsucho_session"
SESSION_DAYS = 14
MIN_PASSWORD = 8
MAX_PASSWORD = 128
MAX_EMAIL = 254
_EMAIL_BAD = re.compile(r'[\x00-\x20\x7f<>,;"()\[\]\\]')

# Băm scrypt: n=2^14, r=8, p=1 → ~16MB RAM, ~50–100ms mỗi lần thử.
_SCRYPT = dict(n=2**14, r=8, p=1)

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")

# «お試し» (tài khoản `trial`, endpoint /api/auth/trial): ID + mật khẩu tuỳ ý, ID chưa có thì tự tạo rồi vào luôn.
# ID đã có thì vẫn phải đúng mật khẩu. TSUCHO_OPEN_LOGIN=0 tắt hẳn (404 trial_off).
OPEN_LOGIN = os.getenv("TSUCHO_OPEN_LOGIN", "1") != "0"
OPEN_ID_MAX = 100
TRIAL_PREFIX = "trial:"
VERIFY_HOURS = 48
RESET_MINUTES = 30


class AuthError(ValueError):
    """Lỗi tài khoản KÈM MÃ để giao diện tự dịch.

    Máy chủ không biết người dùng đang xem tiếng Nhật, Việt hay Anh, nên câu
    chữ phải ghép ở trình duyệt. Trước đây chỗ này chỉ ném chuỗi tiếng Việt:
    người Nhật đăng ký trùng email vẫn thấy「Email này đã có tài khoản」.
    Câu tiếng Việt trong `args[0]` giữ lại làm bản dự phòng.
    """

    def __init__(self, code: str, message: str, **info: object) -> None:
        super().__init__(message)
        self.code = code
        self.info = info

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
    role: str            # 'admin' | 'user'
    created_at: float
    kind: str = "member"           # 'member' | 'trial' | 'demo'
    email_verified: bool = False
    display_name: str = ""
    scan_limit: int | None = None  # None = theo mặc định của loại tài khoản (xem quota.py)
    identity_email: str = ""       # email nhà cung cấp (Google/LINE) — chỉ để HIỂN THỊ cho tài khoản `google:`/`line:`

    @property
    def login_id(self) -> str:
        """Email/ID người dùng thấy: trial lưu `trial:<id>` nhưng chỉ hiện `<id>`; tài khoản Google/LINE không có email
        thật trong cột `email` (lưu `google:<sub>`/`line:<sub>`) thì hiện email nhà cung cấp, rồi tên, rồi tên nhà cung cấp."""
        if self.kind == "trial" and self.email.startswith(TRIAL_PREFIX):
            return self.email[len(TRIAL_PREFIX):]
        for prefix, label in (("google:", "Google"), ("line:", "LINE")):
            if self.email.startswith(prefix):
                return self.identity_email or self.display_name or label
        return self.email

    def to_json(self) -> dict:
        return {
            "id": self.id, "email": self.login_id, "role": self.role, "kind": self.kind,
            "email_verified": bool(self.email_verified), "display_name": self.display_name,
        }


# ── CSDL ─────────────────────────────────────────────────────────────

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id            TEXT PRIMARY KEY,
    email         TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role          TEXT NOT NULL DEFAULT 'user',
    created_at    REAL NOT NULL,
    prefs         TEXT NOT NULL DEFAULT '{}',
    kind          TEXT NOT NULL DEFAULT 'member',
    email_verified INTEGER NOT NULL DEFAULT 0,
    display_name  TEXT NOT NULL DEFAULT '',
    scan_limit    INTEGER,
    legacy        INTEGER NOT NULL DEFAULT 0
);
-- Từ điển sửa lỗi theo từng người dùng (task 3.3); `wrong_key` chỉ để so khớp. Bảng MỚI nên CREATE IF NOT EXISTS
-- là đủ cho cả CSDL cũ (không cần ALTER).
CREATE TABLE IF NOT EXISTS dict_entries (
    user_id    TEXT NOT NULL,
    field      TEXT NOT NULL,
    wrong_key  TEXT NOT NULL,
    wrong      TEXT NOT NULL,
    "right"    TEXT NOT NULL,
    hits       INTEGER NOT NULL DEFAULT 1,
    created_at REAL NOT NULL,
    updated_at REAL NOT NULL,
    PRIMARY KEY (user_id, field, wrong_key)
);
CREATE TABLE IF NOT EXISTS demo_usage (
    user_id TEXT NOT NULL,
    day     TEXT NOT NULL,
    faces   INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id, day)
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
-- Đăng nhập Google / LINE (đợt B dùng; tạo sẵn)
CREATE TABLE IF NOT EXISTS identities (
    provider   TEXT NOT NULL,
    subject    TEXT NOT NULL,
    user_id    TEXT NOT NULL,
    email      TEXT NOT NULL DEFAULT '',
    created_at REAL NOT NULL,
    PRIMARY KEY (provider, subject)
);
-- Link trong thư xác minh / đặt lại mật khẩu: chỉ lưu băm SHA-256, dùng một lần
CREATE TABLE IF NOT EXISTS email_tokens (
    token_hash TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL,
    purpose    TEXT NOT NULL,
    expires_at REAL NOT NULL,
    used_at    REAL
);
CREATE INDEX IF NOT EXISTS idx_email_tokens_user ON email_tokens(user_id);
CREATE TABLE IF NOT EXISTS oauth_states (
    state      TEXT PRIMARY KEY,
    provider   TEXT NOT NULL,
    nonce      TEXT NOT NULL,
    verifier   TEXT NOT NULL,
    next_path  TEXT NOT NULL DEFAULT '/',
    expires_at REAL NOT NULL
);
-- Hạn mức chung (api/quota.py): key 'u:<id>' | 'ip:<ip>' | 'trial-all' | 'm:<email>' | 'mi:<ip>'
CREATE TABLE IF NOT EXISTS usage_counters (
    key TEXT NOT NULL, day TEXT NOT NULL, faces INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (key, day)
);
CREATE TABLE IF NOT EXISTS meta (
    key   TEXT PRIMARY KEY,
    value TEXT
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


def demo_emails() -> set[str]:
    """Email các tài khoản dùng thử khai trong TSUCHO_DEMO_ACCOUNTS (cùng cách tách với demo.danh_sach)."""
    out: set[str] = set()
    for phan in os.environ.get("TSUCHO_DEMO_ACCOUNTS", "").split("|"):
        manh = [x.strip() for x in phan.strip().split(":")]
        if len(manh) >= 2 and manh[0] and manh[1]:
            out.add(normalize_email(manh[0]))
    return out


def init_db() -> None:
    with _db() as conn:
        conn.executescript(SCHEMA)
        # Di trú: `CREATE TABLE IF NOT EXISTS` KHÔNG thêm cột vào bảng đã tồn tại, nên CSDL đang chạy thật
        # sinh ra trước các task sau sẽ thiếu cột. Thiếu thì thêm; người cũ nhận giá trị mặc định.
        cols = {row["name"] for row in conn.execute("PRAGMA table_info(users)")}
        if "prefs" not in cols:
            conn.execute("ALTER TABLE users ADD COLUMN prefs TEXT NOT NULL DEFAULT '{}'")
        if "kind" not in cols:
            conn.execute("ALTER TABLE users ADD COLUMN kind TEXT NOT NULL DEFAULT 'member'")
        if "email_verified" not in cols:
            conn.execute("ALTER TABLE users ADD COLUMN email_verified INTEGER NOT NULL DEFAULT 0")
        if "display_name" not in cols:
            conn.execute("ALTER TABLE users ADD COLUMN display_name TEXT NOT NULL DEFAULT ''")
        if "scan_limit" not in cols:
            conn.execute("ALTER TABLE users ADD COLUMN scan_limit INTEGER")
        if "legacy" not in cols:
            conn.execute("ALTER TABLE users ADD COLUMN legacy INTEGER NOT NULL DEFAULT 0")
        _classify_old_accounts(conn)


def _classify_old_accounts(conn) -> None:
    """Phân loại tài khoản có từ trước khi có `kind` — đúng MỘT lần (đánh dấu trong bảng `meta`).

    demo (email trong TSUCHO_DEMO_ACCOUNTS) → 'demo'; admin → member đã xác minh + `legacy=1`; còn lại (tạo bằng
    đăng nhập mở) → 'trial' với email `trial:<id>`. `user_id` giữ nguyên nên dữ liệu và phiên không mất.
    """
    if conn.execute("SELECT 1 FROM meta WHERE key = 'accounts_classified'").fetchone():
        return
    demos = sorted(demo_emails())
    if demos:
        holes = ",".join("?" * len(demos))
        conn.execute(
            f"UPDATE users SET kind = 'demo', email_verified = 1 WHERE email IN ({holes})", demos
        )
    conn.execute(
        # ⚠ legacy=1: admin cũ có email do người ta TỰ GÕ lúc đăng ký (chưa từng được chứng minh). Luật nối tài khoản OAuth
        # của đợt B (Google/LINE) PHẢI BỎ QUA tài khoản legacy=1, nếu không ai kiểm soát email trùng sẽ thành admin.
        "UPDATE users SET kind = 'member', email_verified = 1, legacy = 1 WHERE role = 'admin' AND kind != 'demo'"
    )
    conn.execute(
        "UPDATE users SET kind = 'trial', email = ? || email"
        " WHERE kind = 'member' AND role != 'admin' AND email_verified = 0 AND email NOT LIKE ?",
        (TRIAL_PREFIX, TRIAL_PREFIX + "%"),
    )
    conn.execute("INSERT OR REPLACE INTO meta (key, value) VALUES ('accounts_classified', '1')")


def _row_to_user(row: sqlite3.Row) -> User:
    shown = ""
    if row["email"].startswith(("google:", "line:")):
        with _db() as conn:
            r = conn.execute("SELECT email FROM identities WHERE user_id = ? AND email != '' LIMIT 1", (row["id"],)).fetchone()
        shown = r["email"] if r else ""
    return User(
        id=row["id"],
        email=row["email"],
        role=row["role"],
        created_at=row["created_at"],
        kind=row["kind"],
        email_verified=bool(row["email_verified"]),
        display_name=row["display_name"],
        scan_limit=row["scan_limit"],
        identity_email=shown,
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

def ip_bucket(ip: str) -> str:
    """Khoá đếm theo IP: IPv6 gom về /64 (một nhà thường được cấp cả /64, đổi đuôi địa chỉ là vô hạn IP);
    IPv4 giữ nguyên; chuỗi không phải IP (vd "testclient", "?") giữ nguyên."""
    try:
        a = ipaddress.ip_address(ip)
    except ValueError:
        return ip
    if a.version == 6:
        if a.ipv4_mapped:
            return str(a.ipv4_mapped)
        return f"{ipaddress.ip_network(f'{a}/64', strict=False).network_address}/64"
    return str(a)


def attempt_keys(email: str, ip: str) -> list[str]:
    return [f"e:{normalize_email(email)}", f"i:{ip_bucket(ip)}"]


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

    Sau Cloudflare (Tunnel) thì `X-Forwarded-For` vẫn giả được: Cloudflare chỉ
    NỐI IP thật vào cuối, phần đầu là chữ người gửi tự điền. Header đáng tin là
    `CF-Connecting-IP` (Cloudflare luôn ghi đè) → đặt `TSUCHO_TRUST_PROXY=cloudflare`.
    Chỉ đặt khi app CHỈ nhận kết nối từ cloudflared (nghe ở 127.0.0.1), không thì
    ai gọi thẳng vào cũng tự điền được header này.
    """
    mode = os.getenv("TSUCHO_TRUST_PROXY", "").strip().lower()
    if mode == "cloudflare":
        cf = request.headers.get("cf-connecting-ip", "").strip()
        if cf:
            return cf
    elif mode in ("1", "true", "yes"):
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
    """Trả (user, password_hash) — hash chỉ dùng để kiểm tra lúc đăng nhập.

    KHÔNG BAO GIỜ trúng tài khoản `trial` (email của nó là `trial:<id>`; ai gõ thẳng chuỗi ấy vào ô email
    cũng không được vào) — tài khoản thử tra bằng `get_trial`.
    """
    with _db() as conn:
        row = conn.execute(
            "SELECT * FROM users WHERE email = ? AND kind != 'trial'", (normalize_email(email),)
        ).fetchone()
    return (_row_to_user(row), row["password_hash"]) if row else None


def get_trial(login_id: str) -> tuple[User, str] | None:
    with _db() as conn:
        row = conn.execute(
            "SELECT * FROM users WHERE email = ? AND kind = 'trial'",
            (TRIAL_PREFIX + normalize_email(login_id),),
        ).fetchone()
    return (_row_to_user(row), row["password_hash"]) if row else None


def get_by_id(user_id: str) -> User | None:
    with _db() as conn:
        row = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
    return _row_to_user(row) if row else None


def check_password_strength(password: str) -> None:
    if len(password) > MAX_PASSWORD:
        raise AuthError("password_too_long", f"Mật khẩu tối đa {MAX_PASSWORD} ký tự", max=MAX_PASSWORD)
    if len(password) < MIN_PASSWORD:
        raise AuthError(
            "weak_password",
            f"Mật khẩu phải từ {MIN_PASSWORD} ký tự trở lên",
            min=MIN_PASSWORD,
        )


def check_email(email: str) -> str:
    """Kiểm email đăng ký; trả email đã chuẩn hoá hoặc ném AuthError('bad_email').

    ≤ 254 ký tự, không khoảng trắng/ký tự điều khiển và không có các dấu < > , ; " ( ) [ ] (chống chèn tiêu đề thư/HTML)."""
    email = normalize_email(email)
    if (
        not email or len(email) > MAX_EMAIL or not EMAIL_RE.match(email) or _EMAIL_BAD.search(email)
        or email.startswith(TRIAL_PREFIX)
    ):
        raise AuthError("bad_email", "Email không hợp lệ")
    return email


def create_user(
    email: str, password: str | None = None, *, verified: bool = False, kind: str = "member", display_name: str = "",
) -> User:
    """Tạo tài khoản `member`. Luôn role 'user' — admin chỉ do TSUCHO_ADMIN_EMAILS (xem `apply_admin_emails`).

    Không truyền `password` (đăng ký bằng email) thì `password_hash` = '' — không mật khẩu nào đúng — cho tới khi
    chủ email bấm link xác minh và TỰ ĐẶT mật khẩu ở bước đó (`finish_verification`)."""
    email = check_email(email)
    if password is not None:
        check_password_strength(password)
    user = User(
        id=uuid.uuid4().hex[:12], email=email, role="user", created_at=time.time(),
        kind=kind, email_verified=verified, display_name=display_name,
    )
    try:
        with _db() as conn:
            conn.execute(
                "INSERT INTO users (id, email, password_hash, role, created_at, kind, email_verified, display_name)"
                " VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                (user.id, user.email, hash_password(password) if password is not None else "", user.role, user.created_at,
                 user.kind, int(user.email_verified), user.display_name),
            )
    except sqlite3.IntegrityError as e:
        raise AuthError("email_taken", "Email này đã có tài khoản") from e
    return user


def create_trial_user(login_id: str, password: str) -> User:
    """Tạo tài khoản «お試し»: ID tuỳ ý, mật khẩu ít nhất 1 ký tự. Lưu email = `trial:<id>`, role 'user'."""
    login_id = normalize_email(login_id)
    if not login_id or len(login_id) > OPEN_ID_MAX:
        raise AuthError("bad_id", "Tên đăng nhập không hợp lệ", max=OPEN_ID_MAX)
    if not password:
        raise AuthError("weak_password", "Hãy nhập mật khẩu", min=1)
    if len(password) > MAX_PASSWORD:
        raise AuthError("password_too_long", f"Mật khẩu tối đa {MAX_PASSWORD} ký tự", max=MAX_PASSWORD)
    user = User(
        id=uuid.uuid4().hex[:12], email=TRIAL_PREFIX + login_id, role="user", created_at=time.time(),
        kind="trial",
    )
    try:
        with _db() as conn:
            conn.execute(
                "INSERT INTO users (id, email, password_hash, role, created_at, kind)"
                " VALUES (?, ?, ?, ?, ?, 'trial')",
                (user.id, user.email, hash_password(password), user.role, user.created_at),
            )
    except sqlite3.IntegrityError as e:
        raise AuthError("email_taken", "Tên này đã có tài khoản") from e
    return user


def set_password(user_id: str, password: str) -> None:
    with _db() as conn:
        conn.execute("UPDATE users SET password_hash = ? WHERE id = ?", (hash_password(password), user_id))


def mark_verified(user_id: str) -> None:
    with _db() as conn:
        conn.execute("UPDATE users SET email_verified = 1 WHERE id = ?", (user_id,))


def set_scan_limit(email: str, limit: int | None) -> bool:
    """Đặt hạn mức quét/ngày riêng cho một tài khoản (None = theo mặc định). False nếu không có email."""
    with _db() as conn:
        cur = conn.execute(
            "UPDATE users SET scan_limit = ? WHERE email = ? AND kind != 'trial'",
            (limit, normalize_email(email)),
        )
        return cur.rowcount == 1


def admin_emails() -> set[str]:
    return {normalize_email(e) for e in os.getenv("TSUCHO_ADMIN_EMAILS", "").split(",") if e.strip()}


def apply_admin_emails(user: User) -> User:
    """Member ĐÃ xác minh có email trong TSUCHO_ADMIN_EMAILS → role 'admin'; lần đầu nhận hồ sơ chưa có chủ.

    Gọi sau mỗi lần đăng nhập/xác minh/đặt lại thành công. Admin cũ trong CSDL giữ nguyên.
    """
    if (
        user.role == "admin" or user.kind != "member" or not user.email_verified
        or normalize_email(user.email) not in admin_emails()
    ):
        return user
    with _db() as conn:
        conn.execute("UPDATE users SET role = 'admin' WHERE id = ?", (user.id,))
    _workspace.claim_ownerless(user.id)
    user.role = "admin"
    return user


def _unverified_is_empty(conn, user_id: str) -> bool:
    """Tài khoản email chưa xác minh có xoá được không: chưa mật khẩu, chưa phiên, chưa nối nhà cung cấp, chưa hồ sơ."""
    row = conn.execute("SELECT password_hash FROM users WHERE id = ?", (user_id,)).fetchone()
    if row is None or row["password_hash"]:
        return False
    if conn.execute("SELECT 1 FROM sessions WHERE user_id = ?", (user_id,)).fetchone():
        return False
    if conn.execute("SELECT 1 FROM identities WHERE user_id = ?", (user_id,)).fetchone():
        return False
    for ws_id in _workspace.all_ids():
        ws = _workspace.load(ws_id)
        if ws and ws.owner == user_id:
            return False
    return True


def login_with_identity(provider: str, subject: str, email: str, email_verified: bool, name: str) -> User:
    """Tài khoản cho một danh tính Google/LINE (một transaction). Quy tắc nối (kế hoạch §3.3):

    a. đã có `identities(provider, sub)` → tài khoản đó;
    b. CHỈ Google có email đã xác minh: nối vào `member` đã xác minh, `legacy=0` cùng email. KHÔNG BAO GIỜ nối vào
       trial/demo/legacy/chưa xác minh. Email LINE không dùng để nối hay nâng admin (chỉ lưu để hiển thị);
    c. còn lại tạo `member` mới: email Google nếu CHƯA ai dùng (cột email = Google đã xác minh → `email_verified=1`),
       ngược lại `<provider>:<sub>`. Member chưa xác minh cùng email mà còn trống (xem `_unverified_is_empty`) bị XOÁ
       để nhường email cho người chứng minh được email qua Google; không trống thì dùng `google:<sub>`.
    """
    email = normalize_email(email or "")
    name = (name or "").strip()[:100]
    google_ok = provider == "google" and bool(email_verified) and bool(email) and not email.startswith(TRIAL_PREFIX)
    now = time.time()
    with _db() as conn:
        conn.execute("BEGIN IMMEDIATE")
        row = conn.execute(
            "SELECT u.* FROM identities i JOIN users u ON u.id = i.user_id WHERE i.provider = ? AND i.subject = ?",
            (provider, subject),
        ).fetchone()
        if row:                                                                       # a.
            if email:
                conn.execute("UPDATE identities SET email = ? WHERE provider = ? AND subject = ?", (email, provider, subject))
            user_id = row["id"]
        else:
            link = None
            if google_ok:                                                              # b.
                link = conn.execute(
                    "SELECT id FROM users WHERE email = ? AND kind = 'member' AND email_verified = 1 AND legacy = 0",
                    (email,),
                ).fetchone()
            if link:
                user_id = link["id"]
            else:                                                                      # c.
                use_email = ""
                if google_ok:
                    other = conn.execute("SELECT id, kind, email_verified FROM users WHERE email = ?", (email,)).fetchone()
                    if other is None:
                        use_email = email
                    elif other["kind"] == "member" and not other["email_verified"] and _unverified_is_empty(conn, other["id"]):
                        conn.execute("DELETE FROM email_tokens WHERE user_id = ?", (other["id"],))
                        conn.execute("DELETE FROM users WHERE id = ?", (other["id"],))
                        use_email = email
                user_id = uuid.uuid4().hex[:12]
                conn.execute(
                    "INSERT INTO users (id, email, password_hash, role, created_at, kind, email_verified, display_name)"
                    " VALUES (?, ?, '', 'user', ?, 'member', ?, ?)",
                    (user_id, use_email or f"{provider}:{subject}", now, 1 if use_email else 0, name),
                )
            conn.execute(
                "INSERT INTO identities (provider, subject, user_id, email, created_at) VALUES (?, ?, ?, ?, ?)",
                (provider, subject, user_id, email, now),
            )
        got = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
    return _row_to_user(got)


def providers_of(user_id: str) -> list[str]:
    with _db() as conn:
        rows = conn.execute(
            "SELECT provider FROM identities WHERE user_id = ? ORDER BY provider", (user_id,)
        ).fetchall()
    return [r["provider"] for r in rows]


# ── Link trong thư (xác minh / đặt lại mật khẩu) ─────────────────────

def create_email_token(user_id: str, purpose: str) -> str:
    """Token 32 byte ngẫu nhiên; trong CSDL chỉ có băm SHA-256. Token cũ cùng mục đích chưa dùng bị vô hiệu."""
    token = secrets.token_urlsafe(32)
    now = time.time()
    ttl = VERIFY_HOURS * 3600 if purpose == "verify" else RESET_MINUTES * 60
    with _db() as conn:
        conn.execute(
            "UPDATE email_tokens SET used_at = ? WHERE user_id = ? AND purpose = ? AND used_at IS NULL",
            (now, user_id, purpose),
        )
        conn.execute(
            "INSERT INTO email_tokens (token_hash, user_id, purpose, expires_at) VALUES (?, ?, ?, ?)",
            (_token_hash(token), user_id, purpose, now + ttl),
        )
    return token


def finish_verification(user_id: str, password: str) -> None:
    """Xác minh xong: chủ email đặt mật khẩu, huỷ mọi token verify khác và mọi phiên cũ."""
    with _db() as conn:
        conn.execute("UPDATE users SET password_hash = ? WHERE id = ?", (hash_password(password), user_id))
        conn.execute("UPDATE users SET email_verified = 1 WHERE id = ?", (user_id,))
        conn.execute(
            "UPDATE email_tokens SET used_at = ? WHERE user_id = ? AND purpose = 'verify' AND used_at IS NULL",
            (time.time(), user_id),
        )
    end_all_sessions(user_id)


def consume_email_token(token: str, purpose: str) -> User | None:
    """Dùng token (một lần, còn hạn, đúng mục đích). Hợp lệ → trả người dùng; không thì None."""
    if not token:
        return None
    now = time.time()
    h = _token_hash(token)
    with _db() as conn:
        cur = conn.execute(
            "UPDATE email_tokens SET used_at = ?"
            " WHERE token_hash = ? AND purpose = ? AND used_at IS NULL AND expires_at > ?",
            (now, h, purpose, now),
        )
        if cur.rowcount != 1:
            return None
        row = conn.execute("SELECT user_id FROM email_tokens WHERE token_hash = ?", (h,)).fetchone()
    return get_by_id(row["user_id"])


def end_all_sessions(user_id: str) -> None:
    with _db() as conn:
        conn.execute("DELETE FROM sessions WHERE user_id = ?", (user_id,))


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
