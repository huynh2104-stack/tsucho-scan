"""Hạn mức quét thật theo ngày — dùng chung cho mọi loại tài khoản (bảng `usage_counters`).

Mỗi mặt sổ quét thật là một lượt gọi mô hình (gói miễn phí chỉ có ~20 lượt/ngày), nên mọi tài khoản đều có
trần/ngày; chỉ `role='admin'` là không giới hạn. Các khoá áp dụng (xem docs/KE_HOACH_DANG_NHAP.md §1):

    member  → u:<id>                         (users.scan_limit, hoặc TSUCHO_MEMBER_SCAN_LIMIT, mặc định 30)
    demo    → u:<id>                         (TSUCHO_DEMO_SCAN_LIMIT, mặc định 6)
    trial   → u:<id> (TSUCHO_TRIAL_SCAN_LIMIT, 5) + ip:<ip> (TSUCHO_TRIAL_IP_LIMIT, 15)
              + trial-all (TSUCHO_TRIAL_DAILY_TOTAL, 100)

Biến môi trường được đọc MỖI lần gọi (test đổi bằng monkeypatch được). Giữ chỗ (`reserve`) là NGUYÊN TỬ trên
tất cả khoá: khoá nào không đủ thì không cộng khoá nào.

Bảng này cũng đếm số thư gửi theo GIỜ (`m:<email>`, `mi:<ip>`) — xem `mail_allowed`.
"""

from __future__ import annotations

import logging
import os
import threading
import time

from . import auth

DEMO_DEFAULT = 6
TRIAL_DEFAULT = 5
TRIAL_IP_DEFAULT = 15
TRIAL_TOTAL_DEFAULT = 100
MEMBER_DEFAULT = 30
GLOBAL_DEFAULT = 300    # tổng mặt quét thật/ngày của MỌI tài khoản không phải admin (bảo vệ hạn mức gọi mô hình)

MAIL_PER_EMAIL = 3      # thư/giờ cho mỗi email
MAIL_PER_IP = 10        # thư/giờ cho mỗi IP
MAIL_DAILY_DEFAULT = 90  # thư/ngày toàn hệ thống
log = logging.getLogger("tsucho.quota")

_lock = threading.Lock()


def _env_int(name: str, default: int) -> int:
    try:
        return max(0, int(os.environ.get(name, default)))
    except ValueError:
        return default


def today() -> str:
    return time.strftime("%Y-%m-%d", time.localtime())


def demo_limit() -> int:
    return _env_int("TSUCHO_DEMO_SCAN_LIMIT", DEMO_DEFAULT)


def trial_limit() -> int:
    return _env_int("TSUCHO_TRIAL_SCAN_LIMIT", TRIAL_DEFAULT)


def member_default_limit() -> int:
    return _env_int("TSUCHO_MEMBER_SCAN_LIMIT", MEMBER_DEFAULT)


def limit_for(user: auth.User) -> int | None:
    """Trần quét thật/ngày của riêng tài khoản này. `None` = không giới hạn (admin)."""
    if user.role == "admin":
        return None
    if user.kind == "demo":
        return demo_limit()
    if user.kind == "trial":
        return trial_limit()
    return user.scan_limit if user.scan_limit is not None else member_default_limit()


def _items(user: auth.User, ip: str) -> list[tuple[str, int, str]]:
    """Các khoá áp dụng: (khoá, trần, phạm vi 'user'|'ip'|'all'). Admin → rỗng."""
    own = limit_for(user)
    if own is None:
        return []
    items = [(f"u:{user.id}", own, "user")]
    if user.kind == "trial":
        items.append((f"ip:{auth.ip_bucket(ip)}", _env_int("TSUCHO_TRIAL_IP_LIMIT", TRIAL_IP_DEFAULT), "ip"))
        items.append(("trial-all", _env_int("TSUCHO_TRIAL_DAILY_TOTAL", TRIAL_TOTAL_DEFAULT), "all"))
    items.append(("all-real", _env_int("TSUCHO_GLOBAL_DAILY_SCANS", GLOBAL_DEFAULT), "all"))
    return items


def key_names(user: auth.User, ip: str) -> list[str]:
    return [k for k, _, _ in _items(user, ip)]


def _used(conn, key: str, day: str) -> int:
    row = conn.execute("SELECT faces FROM usage_counters WHERE key = ? AND day = ?", (key, day)).fetchone()
    return int(row["faces"]) if row else 0


def used(user_id: str, day: str | None = None) -> int:
    """Số mặt đã quét thật hôm nay của riêng tài khoản (khoá `u:<id>`)."""
    with auth._db() as conn:
        return _used(conn, f"u:{user_id}", day or today())


def status(user: auth.User, ip: str) -> dict | None:
    """Khoá đang chặt nhất: `{scope, limit, left}`. `None` = không giới hạn.

    Hoà thì lấy khoá đứng trước (user trước ip trước all) — người dùng hiểu «phần của tôi» trước.
    """
    items = _items(user, ip)
    if not items:
        return None
    day = today()
    best = None
    with auth._db() as conn:
        for key, limit, scope in items:
            left = max(0, limit - _used(conn, key, day))
            if best is None or left < best["left"]:
                best = {"scope": scope, "limit": limit, "left": left}
    return best


def left(user: auth.User, ip: str) -> int | None:
    """Còn quét được bao nhiêu mặt hôm nay (nhỏ nhất của các khoá áp dụng). `None` = không giới hạn."""
    st = status(user, ip)
    return None if st is None else st["left"]


def _reserve_items(items: list[tuple], n: int, day: str) -> bool:
    """Cộng `n` vào MỌI khoá nếu tất cả còn đủ; không thì không đổi gì. Mục có thể là (khoá, trần) hoặc
    (khoá, trần, kỳ) khi khoá đó đếm theo kỳ riêng (vd. `mail-all` theo ngày trong khi `m:` theo giờ)."""
    with _lock, auth._db() as conn:
        conn.execute("BEGIN IMMEDIATE")
        full = [(it[0], it[1], it[2] if len(it) > 2 else day) for it in items]
        for key, limit, d in full:
            if _used(conn, key, d) + n > limit:
                conn.rollback()
                return False
        for key, _, d in full:
            conn.execute(
                "INSERT INTO usage_counters (key, day, faces) VALUES (?, ?, ?)"
                " ON CONFLICT(key, day) DO UPDATE SET faces = faces + excluded.faces",
                (key, d, n),
            )
        return True


def reserve(user: auth.User, ip: str, n: int, day: str | None = None) -> bool:
    """Giữ chỗ `n` lượt NGUYÊN TỬ trên tất cả khoá áp dụng. True = đã cộng; False = không đổi gì."""
    if n <= 0:
        return True
    items = [(k, lim) for k, lim, _ in _items(user, ip)]
    if not items:
        return True
    return _reserve_items(items, n, day or today())


def refund(keys: list[str], n: int, day: str | None = None) -> None:
    """Hoàn `n` lượt đã giữ trên các khoá `keys` (danh sách `key_names`). Không cho âm."""
    if n <= 0 or not keys:
        return
    with _lock, auth._db() as conn:
        for key in keys:
            conn.execute(
                "UPDATE usage_counters SET faces = MAX(0, faces - ?) WHERE key = ? AND day = ?",
                (n, key, day or today()),
            )


def trial_new_allowed(ip: str) -> bool:
    """Mỗi IP tạo tối đa TSUCHO_TRIAL_NEW_PER_IP (mặc định 10) tài khoản trial MỚI/ngày (khoá `tn:<ip>`)."""
    return _reserve_items([(f"tn:{auth.ip_bucket(ip)}", _env_int("TSUCHO_TRIAL_NEW_PER_IP", 10))], 1, today())


# ── Hạn mức gửi thư (theo GIỜ) ───────────────────────────────────────

def mail_allowed(email: str, ip: str, purpose: str) -> bool:
    """Tính một thư vào hạn mức: MAIL_PER_EMAIL/giờ mỗi (mục đích, email) và MAIL_PER_IP/giờ mỗi IP.

    Đếm theo mục đích ('verify' | 'reset' | 'exists') để kẻ xấu spam /register không chặn được thư đặt lại mật khẩu.

    True = được gửi (đã ghi nhận); False = vượt → im lặng không gửi (người gọi vẫn trả 200).
    """
    hour = time.strftime("%Y-%m-%dT%H", time.localtime())
    limit_all = _env_int("TSUCHO_MAIL_DAILY_LIMIT", MAIL_DAILY_DEFAULT)
    ok = _reserve_items([
        (f"m:{purpose}:{auth.normalize_email(email)}", MAIL_PER_EMAIL), (f"mi:{auth.ip_bucket(ip)}", MAIL_PER_IP),
        ("mail-all", limit_all, today()),                  # trần toàn hệ thống/ngày (Resend miễn phí 100 thư/ngày)
    ], 1, hour)
    if not ok:
        with auth._db() as conn:
            if _used(conn, "mail-all", today()) >= limit_all:
                log.warning("ĐÃ ĐẠT trần %d thư/ngày toàn hệ thống (TSUCHO_MAIL_DAILY_LIMIT): không gửi thêm", limit_all)
    # Dọn hàng quá 2 ngày (khoá ngày dạng 'YYYY-MM-DD', khoá giờ 'YYYY-MM-DDTHH': cùng so sánh theo chuỗi)
    old = time.strftime("%Y-%m-%d", time.localtime(time.time() - 2 * 86400))
    with auth._db() as conn:
        conn.execute("DELETE FROM usage_counters WHERE day < ?", (old,))
    return ok
