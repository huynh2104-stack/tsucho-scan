"""Từ điển sửa lỗi học từ chỉnh sửa của người dùng (task 3.3).

Vì sao: tên đối tác katakana là điểm yếu lớn nhất của máy (đọc đúng 60–95%), mà khách kế toán quét sổ CỦA CÙNG MỘT
công ty hằng tháng nên tên đối tác lặp lại. Người sửa một lần «ｶ)ﾘﾀﾘｺ → カ）リタリコ» thì lần sau (và các dòng giống
hệt trong cùng sổ) máy gợi ý sẵn. Làm bằng code thuần nên **$0 và không đụng cache** quét.

Dữ liệu là TÊN ĐỐI TÁC của khách (dữ liệu tài chính) nên lưu THEO TỪNG NGƯỜI DÙNG, không bao giờ dùng chung; mọi hàm ở
đây đều nhận `user_id` và chỉ chạm đúng hàng của người đó.

`wrong_key` chỉ dùng để SO KHỚP (NFKC + bỏ khoảng trắng: «ｶ) ﾘﾀﾘｺ» và «カ)リタリコ» là cùng một khoá); giá trị thay vào
là đúng chữ người gõ — không «chuẩn hoá» chữ hiển thị (giữ kana chữ to như sổ in). Bản TS của hàm khoá:
`web/src/lib/corrections.ts`; hai bên cùng đọc `tests/fixtures/dict_keys.json`.
"""

import time
import unicodedata

from . import auth

# Chỉ học hai ô chữ do máy đọc; ô tiền/ngày đã có luật riêng (chuỗi số dư, parseDateInput)
FIELDS = ("description", "kind")
TEXT_MAX = 200
MAX_ENTRIES = 5000          # mỗi người; chặn dữ liệu phình vô hạn

# Khoảng trắng bị bỏ khi so khớp. Liệt kê TƯỜNG MINH theo mã ký tự (không dùng str.isspace / \s) để Python và JavaScript cho
# CÙNG kết quả: `\s` của JS có U+FEFF mà `isspace` của Python thì không, `isspace` có U+0085/U+001C–1F mà `\s` thì không.
# Viết bằng mã số vì nhiều ký tự trong nhóm này vô hình trong trình soạn thảo.
_WS_CODES = [0x09, 0x0A, 0x0B, 0x0C, 0x0D, 0x20, 0xA0, 0x1680, *range(0x2000, 0x200B), 0x2028, 0x2029, 0x202F, 0x205F, 0x3000]
_STRIP = {c: None for c in _WS_CODES}


def wrong_key(text: str) -> str:
    """Khoá so khớp: NFKC rồi bỏ mọi khoảng trắng."""
    return unicodedata.normalize("NFKC", text).translate(_STRIP)


class DictError(ValueError):
    """Lỗi dữ liệu gửi lên (route đổi thành 400)."""


def _clean(value, what: str) -> str:
    if not isinstance(value, str):
        raise DictError(f"{what} phải là chuỗi")
    value = value.strip()
    if not value:
        raise DictError(f"{what} đang trống")
    if len(value) > TEXT_MAX:
        raise DictError(f"{what} quá dài (tối đa {TEXT_MAX} ký tự)")
    return value


def _entry(row) -> dict:
    return {
        "id": row["id"],
        "field": row["field"],
        "key": row["wrong_key"],
        "wrong": row["wrong"],
        "right": row["right"],
        "hits": row["hits"],
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
    }


_SELECT = 'SELECT rowid AS id, field, wrong_key, wrong, "right", hits, created_at, updated_at FROM dict_entries'


def list_entries(user_id: str) -> list[dict]:
    """Từ điển của một người, cái mới dùng gần đây nhất lên đầu."""
    with auth._db() as conn:
        rows = conn.execute(f"{_SELECT} WHERE user_id = ? ORDER BY updated_at DESC, rowid DESC", (user_id,)).fetchall()
    return [_entry(r) for r in rows]


def learn(user_id: str, field, wrong, right) -> dict:
    """Học «`wrong` → `right`» cho ô `field`. Đã có cùng khoá thì cập nhật `right` và tăng `hits`.

    KHÔNG học khi: ô không thuộc `FIELDS`, một trong hai chuỗi trống (người xoá trắng ô, hoặc máy không đọc ra gì thì
    không có cặp sai→đúng), hai chuỗi y hệt nhau, hoặc từ điển của người đó đã đầy.
    """
    if field not in FIELDS:
        raise DictError("Ô này không có từ điển")
    wrong = _clean(wrong, "Chữ máy đọc")
    right = _clean(right, "Chữ đã sửa")
    if wrong == right:
        raise DictError("Hai chuỗi giống hệt nhau, không có gì để học")
    key = wrong_key(wrong)
    now = time.time()
    with auth._db() as conn:
        conn.execute("BEGIN IMMEDIATE")
        have = conn.execute(
            "SELECT 1 FROM dict_entries WHERE user_id = ? AND field = ? AND wrong_key = ?", (user_id, field, key)
        ).fetchone()
        if not have:
            n = conn.execute("SELECT COUNT(*) AS n FROM dict_entries WHERE user_id = ?", (user_id,)).fetchone()["n"]
            if n >= MAX_ENTRIES:
                raise DictError("Từ điển đã đầy, hãy xoá bớt")
        conn.execute(
            'INSERT INTO dict_entries (user_id, field, wrong_key, wrong, "right", hits, created_at, updated_at)'
            " VALUES (?, ?, ?, ?, ?, 1, ?, ?)"
            ' ON CONFLICT(user_id, field, wrong_key) DO UPDATE SET wrong = excluded.wrong, "right" = excluded."right",'
            " hits = hits + 1, updated_at = excluded.updated_at",
            (user_id, field, key, wrong, right, now, now),
        )
        row = conn.execute(f"{_SELECT} WHERE user_id = ? AND field = ? AND wrong_key = ?", (user_id, field, key)).fetchone()
    return _entry(row)


def delete(user_id: str, entry_id: int) -> bool:
    """Xoá một mục (chỉ của chính người đó). Trả False nếu không có."""
    with auth._db() as conn:
        cur = conn.execute("DELETE FROM dict_entries WHERE user_id = ? AND rowid = ?", (user_id, entry_id))
        return cur.rowcount > 0


def clear(user_id: str) -> int:
    """Xoá cả từ điển của một người. Trả số mục đã xoá."""
    with auth._db() as conn:
        return conn.execute("DELETE FROM dict_entries WHERE user_id = ?", (user_id,)).rowcount
