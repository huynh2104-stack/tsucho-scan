"""Cài đặt của từng người dùng (task 3.1) — lưu THEO TÀI KHOẢN để đổi máy vẫn giữ.

Là nền cho mọi tính năng `Tuỳ chọn` (xem docs/KE_HOACH_NANG_CAP_WEB.md mục 2): tắt sẵn, người dùng tự bật
trong ⚙ Cài đặt. Lưu thành MỘT chuỗi JSON ở cột `users.prefs`; chỉ ghi những khoá người dùng đã đổi, khoá nào
chưa đổi thì lấy mặc định ở đây — nhờ vậy đổi mặc định sau này không cần di trú dữ liệu.

Danh sách trắng + kiểu chặt: khoá lạ hoặc sai kiểu là 400 chứ không lặng lẽ nhận. Ghi cả một object lạ vào CSDL
thì mai mốt đọc ra không biết ai ghi, mà cũng là chỗ để nhét dữ liệu rác không giới hạn.
"""

import json

from . import auth

# Mặc định của MỌI khoá. `lang`/`theme` mặc định None = «chưa chọn»: máy mới thì để trình duyệt tự đoán,
# chỉ khi người dùng từng bấm chọn mới ghi lại. Bản sao phía web: `web/src/lib/prefs.tsx` (DEFAULT_PREFS);
# hai bên được kiểm cùng một file `tests/fixtures/prefs_defaults.json`.
DEFAULTS: dict = {
    "fontScale": 1,               # 3.4 — cỡ chữ lớn
    "dictMode": "suggest",        # 3.3 — từ điển sửa lỗi: gợi ý / tự áp / tắt
    "showCost": False,            # 4.3 — hiện chi phí ước tính
    "autoRotate": False,          # 5.3 — tự xoay trang chưa quét khi máy chắc chắn về hướng
    "autoFixOnUpload": False,     # 5.4 — tự căn chỉnh ảnh mới tải lên (chỉ các bước «chắc chắn»)
    "accountingMode": False,      # 6.x — chế độ kế toán 仕訳
    "lang": None,                 # đồng bộ thêm; localStorage vẫn giữ để khung hình đầu không nháy
    "theme": None,
}

_CHOICES: dict[str, tuple] = {
    "fontScale": (1, 1.15, 1.3),
    "dictMode": ("suggest", "auto", "off"),
    "lang": ("vi", "en", "ja"),
    "theme": ("light", "dark", "system"),
}
_BOOLS = {"showCost", "autoRotate", "autoFixOnUpload", "accountingMode"}
_NULLABLE = {"lang", "theme"}


def _valid(key: str, value) -> bool:
    if key in _BOOLS:
        return isinstance(value, bool)
    if value is None:
        return key in _NULLABLE
    # `type(...)` chặn True/False: trong Python True == 1, nên `True in (1, 1.15, 1.3)` sẽ đúng nếu không chặn
    return type(value) in (int, float, str) and value in _CHOICES[key]


def validate(patch) -> dict:
    """Trả lại `patch` nếu hợp lệ, không thì ném ValueError (route đổi thành 400)."""
    if not isinstance(patch, dict):
        raise ValueError("Cài đặt phải là một object")
    for key, value in patch.items():
        if key not in DEFAULTS:
            raise ValueError(f"Khoá cài đặt lạ: {str(key)[:40]}")
        if not _valid(key, value):
            raise ValueError(f"Giá trị không hợp lệ cho {key}")
    return patch


def _load(raw: str | None) -> dict:
    """Chuỗi đã lưu → dict các khoá HỢP LỆ. Hỏng hoặc có khoá thừa/sai kiểu thì bỏ phần đó, không nổ:
    cột này có thể do bản cũ/mới hơn ghi, không được làm người dùng không vào được app."""
    try:
        data = json.loads(raw or "{}")
    except (TypeError, ValueError):
        return {}
    if not isinstance(data, dict):
        return {}
    return {k: v for k, v in data.items() if k in DEFAULTS and _valid(k, v)}


def get(user_id: str) -> dict:
    """Cài đặt đầy đủ của một người: mặc định đè bằng những gì người đó đã đổi."""
    with auth._db() as conn:
        row = conn.execute("SELECT prefs FROM users WHERE id = ?", (user_id,)).fetchone()
    return {**DEFAULTS, **_load(row["prefs"] if row else None)}


def update(user_id: str, patch) -> dict:
    """Gộp `patch` (chỉ các khoá cần đổi) vào cài đặt đã lưu rồi trả bản đầy đủ.

    Đọc–sửa–ghi trong MỘT giao dịch khoá ghi (`BEGIN IMMEDIATE`): hai tab cùng đổi hai khoá khác nhau thì
    không được ghi đè mất khoá của nhau.
    """
    validate(patch)
    with auth._db() as conn:
        conn.execute("BEGIN IMMEDIATE")
        row = conn.execute("SELECT prefs FROM users WHERE id = ?", (user_id,)).fetchone()
        if row is None:
            raise ValueError("Không có người dùng này")
        stored = {**_load(row["prefs"]), **patch}
        conn.execute("UPDATE users SET prefs = ? WHERE id = ?", (json.dumps(stored, ensure_ascii=False), user_id))
    return {**DEFAULTS, **stored}
