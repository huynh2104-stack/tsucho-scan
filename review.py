"""MỘT định nghĩa duy nhất của「dòng này có cần người soát không」(task 1.2).

Bản Python của `web/src/lib/review.ts` — cùng hàm, cùng luật. Hai bản cùng đọc bộ ca
`tests/fixtures/review_cases.json` nên không thể lệch nhau mà không có test đỏ.

Vì sao có: trước đây mỗi nơi tự tính một kiểu — bảng (`status === "check"`), bộ đếm
(chuỗi số dư tính lại), phím n, huy hiệu cột trái, file Excel (`status` đóng băng lúc
quét). Kết quả: bảng báo "Đã soát hết" trong khi vẫn còn dòng vàng, và Excel giao khách
vẫn tô vàng những dòng người đã sửa đúng. `status` và `reason` là DỮ KIỆN CỦA MÁY, chụp
lúc quét và không bao giờ bị giao diện sửa; trạng thái hiển thị được SUY RA ở đây từ
(dòng + chuỗi số dư hiện tại + việc người đã làm: sửa, xác nhận ✓).

Chuỗi lý do của engine (`validate.py`), nối bằng「・」, chia thành các loại:

    loại     nhận dạng                           coi là đã giải quyết khi
    balance  bắt đầu bằng 残高不一致              chuỗi số dư hiện tại của dòng = OK
    date     bắt đầu bằng 日付不明                `date` là ISO hợp lệ
    nobal    残高が読取れず検証不可               dòng đã có `balance` và chuỗi = OK
    lowconf  低信頼度                            chỉ khi người bấm ✓
    rowgap   chứa 行抜けの疑い                    chỉ khi người bấm ✓
    fix      ghi chú tự sửa (…補正 / …分離 …)     không phải việc cần soát (chỉ để biết)
    other    chuỗi lạ                            chỉ khi người bấm ✓

`tests/test_review.py` quét `validate.py` và báo đỏ nếu engine sinh thêm một chuỗi lý do
mà bảng này chưa biết (rơi vào `other` ngoài ý muốn).
"""

from __future__ import annotations

import re

NOT_CHECKABLE = "―"      # "―": không kiểm được (dòng đầu khối, ghi chú, dòng không có số dư)
SEP = "・"

# [0-9] chứ không phải \d: \d của Python khớp cả chữ số toàn góc, còn của JS thì không
_ISO = re.compile(r"[0-9]{4}-[0-9]{2}-[0-9]{2}")
_DIFF = re.compile(r"差額\s*([+-]?[0-9,]+)")
_GAP = re.compile(r"行番号\s*([0-9]+)\s*→\s*([0-9]+)\s*:\s*([0-9]+)\s*行抜けの疑い")

# Ghi chú tự sửa của engine. Quy tắc chung「kết thúc bằng 補正 / 分離」đứng đầu để chuỗi tự sửa
# mới theo cùng kiểu vẫn được nhận; các dòng sau liệt kê những chuỗi không theo kiểu đó.
_FIX_PATTERNS = [
    re.compile(r"(補正|分離)$"),
    re.compile(r"^金額を(入金|出金)列へ移動$"),
    re.compile(r"^金額の列を入替$"),
    re.compile(r"^残高を検算で補正(\(.*\))?$"),
    re.compile(r"^日付は前行と同じ(\(.*\))?$"),
    re.compile(r"^年を(前|後)行から補完$"),
]


def is_iso(v) -> bool:
    return isinstance(v, str) and _ISO.fullmatch(v) is not None


# ── Cột 検算 ─────────────────────────────────────────────────────────

def chain_checks(rows: list[dict]) -> list[str]:
    """Cột 検算 của MỘT khối dòng, tính lại từ số đang hiển thị: "OK" | "NG" | "―".

    • dòng có 残高 và có mốc phía trước: trước − 出金 + 入金 == 残高 → OK, lệch → NG;
    • dòng không in 残高: "―", nhưng VẪN cộng dồn để so ở dòng có 残高 kế tiếp (giống engine);
    • dòng ghi chú (繰越…): "―" và không bao giờ NG, nhưng 残高 của nó VẪN là mốc cho dòng sau;
    • dòng đầu khối (chưa có mốc): "―" — không kiểm được.
    """
    running = None
    out = []
    for tx in rows:
        if tx.get("is_note"):
            if tx.get("balance") is not None:
                running = tx["balance"]
            out.append(NOT_CHECKABLE)
            continue
        move = (tx.get("amount_in") or 0) - (tx.get("amount_out") or 0)
        balance = tx.get("balance")
        if balance is None:
            if running is not None:
                running += move
            out.append(NOT_CHECKABLE)
            continue
        if running is None:
            out.append(NOT_CHECKABLE)
        else:
            out.append("OK" if running + move == balance else "NG")
        running = balance
    return out


# ── Lý do ────────────────────────────────────────────────────────────

def _kind_of(text: str) -> str:
    if text.startswith("残高不一致"):
        return "balance"
    if text.startswith("残高が読取れず検証不可"):
        return "nobal"
    if text.startswith("日付不明"):
        return "date"
    if text.startswith("低信頼度"):
        return "lowconf"
    if "行抜けの疑い" in text:
        return "rowgap"
    if any(p.search(text) for p in _FIX_PATTERNS):
        return "fix"
    return "other"


def _params_of(kind: str, text: str) -> dict:
    if kind == "balance":
        m = _DIFF.search(text)
        if m:
            try:
                return {"diff": int(m.group(1).replace(",", ""))}
            except ValueError:
                return {}
    if kind == "rowgap":
        m = _GAP.search(text)
        if m:
            return {"from": int(m.group(1)), "to": int(m.group(2)), "missing": int(m.group(3))}
    return {}


def parse_reasons(reason) -> list[dict]:
    """Chuỗi `reason` của máy → danh sách `{kind, text, params}` (bỏ phần tử rỗng)."""
    out = []
    for part in (reason or "").split(SEP):
        text = part.strip()
        if not text:
            continue
        kind = _kind_of(text)
        out.append({"kind": kind, "text": text, "params": _params_of(kind, text)})
    return out


def _resolved(r: dict, tx: dict, chk: str) -> bool:
    kind = r["kind"]
    if kind == "balance":
        return chk == "OK"
    if kind == "date":
        return is_iso(tx.get("date"))
    if kind == "nobal":
        return tx.get("balance") is not None and chk == "OK"
    return kind == "fix"          # lowconf / rowgap / other: chỉ ✓ mới gỡ được


def open_reasons(tx: dict, chk: str) -> list[dict]:
    """Các lý do CHƯA được giải quyết của dòng (thứ cần hiện ở cột 確認メモ).

    Chỉ xét lý do của máy khi `status == "check"`. Riêng ngày: dòng thường mà `date` không phải
    ISO (người xoá hoặc gõ hỏng — giao diện không còn gắn lý do vào dòng) thì thêm một lý do
    `date` tổng hợp để cột 確認メモ vẫn giải thích được vì sao dòng đang vàng.
    """
    if tx.get("is_note"):
        return []
    out = []
    if tx.get("status") == "check":
        out = [r for r in parse_reasons(tx.get("reason")) if not _resolved(r, tx, chk)]
    if not is_iso(tx.get("date")) and not any(r["kind"] == "date" for r in out):
        out.insert(0, {"kind": "date", "text": "日付不明", "params": {}})
    return out


# ── Trạng thái dòng ──────────────────────────────────────────────────

def needs_review(tx: dict, chk: str) -> bool:
    """Dòng này còn cần người soát không. Thứ tự luật (dừng ở luật đầu tiên khớp):

    1. dòng ghi chú                                → không
    2. người đã bấm ✓ (`reviewed`)                  → không   (✓ thắng mọi cờ, kể cả NG)
    3. chuỗi số dư hiện tại lệch (NG)               → có
    4. dòng người thêm tay (`added`), chưa ✓        → có      (máy chưa từng kiểm dòng này)
    5. ngày trống / không phải ISO                  → có
    6. `status != "check"`                          → không
    7. còn lý do chưa giải quyết (bảng ở đầu file)  → có
    8. `status == "check"` mà không có lý do nào    → có
    """
    if tx.get("is_note"):
        return False
    if tx.get("reviewed"):
        return False
    if chk == "NG":
        return True
    if tx.get("added"):
        return True
    if open_reasons(tx, chk):
        return True
    return tx.get("status") == "check" and not parse_reasons(tx.get("reason"))


def row_state(tx: dict, chk: str) -> str:
    """note > confirmed > review > fixed > edited > ok  (đúng thứ tự ưu tiên của kế hoạch)."""
    if tx.get("is_note"):
        return "note"
    if tx.get("reviewed"):
        return "confirmed"
    if needs_review(tx, chk):
        return "review"
    if tx.get("status") == "fixed":
        return "fixed"
    if tx.get("orig") or tx.get("inferred"):
        return "edited"
    return "ok"


def focus_field(tx: dict, chk: str) -> str:
    """Ô mà phím n đặt con trỏ vào: "balance" | "date" | "description"."""
    if chk == "NG":
        return "balance"
    kinds = {r["kind"] for r in open_reasons(tx, chk)}
    if "balance" in kinds:
        return "balance"
    if "date" in kinds:
        return "date"
    if "nobal" in kinds:
        return "balance"
    return "description"


def analyze_rows(rows: list[dict]) -> list[dict]:
    """Mỗi dòng của một khối → `{chk, state, need, field}` (một lượt tính chuỗi số dư)."""
    chks = chain_checks(rows)
    return [
        {
            "chk": c,
            "state": row_state(tx, c),
            "need": needs_review(tx, c),
            "field": focus_field(tx, c),
        }
        for tx, c in zip(rows, chks)
    ]


def sheet_stats(blocks: list[dict]) -> dict:
    """Thống kê một mặt sổ (các khối `{"rows": [...]}`): dòng ghi chú không được tính."""
    s = {"rows": 0, "need": 0, "fixed": 0, "confirmed": 0, "edited": 0}
    for block in blocks:
        for info in analyze_rows(block.get("rows", [])):
            state = info["state"]
            if state == "note":
                continue
            s["rows"] += 1
            if state == "review":
                s["need"] += 1
            elif state in ("fixed", "confirmed", "edited"):
                s[state] += 1
    return s


# ── Nhiều khối trong một sổ xuất ra (task 1.4) ───────────────────────

def split_blocks(rows: list[dict]) -> list[list[dict]]:
    """Cắt danh sách dòng của một sổ xuất file thành các KHỐI, đúng như trên màn hình.

    Bảng trên web tính chuỗi số dư theo từng khối (mỗi khối = một mặt sổ × một sổ ngân hàng) và
    dòng đầu khối luôn là «―». Khi xuất file, web gộp các khối cùng sổ làm một danh sách và đánh
    dấu `block_start: true` ở dòng đầu mỗi khối; không có dấu thì cả danh sách là MỘT khối
    (đúng với kết quả quét trực tiếp từ engine / CLI)."""
    blocks: list[list[dict]] = []
    for tx in rows:
        if not blocks or tx.get("block_start"):
            blocks.append([])
        blocks[-1].append(tx)
    return blocks


def analyze_account(rows: list[dict]) -> list[dict]:
    """`analyze_rows` cho cả sổ xuất file (nhiều khối): một phần tử cho mỗi dòng, giữ thứ tự."""
    return [info for block in split_blocks(rows) for info in analyze_rows(block)]


# ── Người đã sửa gì (task 1.3 / 1.4) ─────────────────────────────────

# Bản Python của FIELD_LABEL trong review.ts (test_review.py so hai bản với nhau)
FIELD_LABEL = {
    "date": "年月日",
    "kind": "区分",
    "description": "摘要",
    "amount_out": "お支払",
    "amount_in": "お預り",
    "balance": "差引残高",
    "store_code": "取扱店",
    "extra_text": "備考",
}


def _norm(v):
    return None if v == "" else v


def shown(tx: dict, field: str):
    """Giá trị đang HIỆN trên ô `field`. Ô ngày hiện `date`, không đọc được thì hiện chữ gốc."""
    if field == "date":
        d = tx.get("date")
        return _norm(d if d is not None else tx.get("date_raw"))
    return _norm(tx.get(field))


def edit_changes(tx: dict) -> list[dict]:
    """Các ô người đã sửa: `{field, from, to}` = giá trị MÁY ĐỌC → giá trị đang hiện, theo thứ tự cột."""
    orig = tx.get("orig") or {}
    return [
        {"field": f, "from": _norm(orig[f]), "to": shown(tx, f)}
        for f in FIELD_LABEL
        if f in orig
    ]
