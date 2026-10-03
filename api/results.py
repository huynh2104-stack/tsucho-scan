"""Kho kết quả quét, lưu theo TỪNG MẶT SỔ và ghi ra đĩa.

Vì sao cần: trước đây frontend giữ kết quả của MỘT lần quét. Quét thêm mặt sổ
mới là ghi đè, làm mất kết quả các mặt đã quét trước đó — người dùng tưởng dữ
liệu bốc hơi. Kho này gom theo `sheet_id`: quét lại mặt nào chỉ thay mặt đó.

Ghi ra `.data/ws/<ws>/results/<sheet_id>.json` nên sống qua F5 và qua cả việc
khởi động lại server. Đó cũng chính là "lịch sử kết quả đã quét".
"""

import json
import os
import secrets
import threading
import time
from pathlib import Path

from . import workspace

# Mã định danh dòng (`rid`) dài tối đa chừng này khi client gửi lên
RID_MAX = 32

# Đọc-sửa-ghi một file kết quả (bổ sung rid, autosave) phải tuần tự: hai yêu cầu chồng nhau thì
# yêu cầu ghi sau có thể đè mất bản sửa của yêu cầu ghi trước. Chỉ một tiến trình (xem Dockerfile).
_LOCK = threading.RLock()


def _dir(ws_id: str) -> Path:
    return workspace.WS_DIR / ws_id / "results"


def _path(ws_id: str, sheet_id: str) -> Path:
    return _dir(ws_id) / f"{sheet_id}.json"


def _write_atomic(path: Path, data: dict) -> None:
    """Ghi ra file tạm rồi mới đổi tên.

    Đây là công soát bằng tay của người dùng — mất điện đúng lúc đang ghi mà
    file bị cắt cụt thì họ mất trắng. `os.replace` là thao tác nguyên tử: hoặc
    còn bản cũ nguyên vẹn, hoặc đã là bản mới, không có ở giữa.
    """
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(path.name + ".tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
    os.replace(tmp, path)


def new_rid() -> str:
    """12 ký tự hex — cùng độ dài với `newRid()` bên web."""
    return secrets.token_hex(6)


def ensure_rids(blocks: list[dict]) -> bool:
    """Gán `rid` cho mọi dòng chưa có (hoặc trùng với dòng trước trong cùng mặt sổ).

    `rid` là danh tính BỀN của dòng: chỉ số (khối, dòng) trượt khi xoá/thêm dòng, còn `rid` thì
    không bao giờ đổi — nhờ đó biết "người đã soát dòng này chưa" và "máy đọc ra gì trước khi
    bị sửa" (task 1.1). Trả về True nếu đã thêm/đổi gì đó (để người gọi biết có cần ghi lại).
    """
    seen: set[str] = set()
    changed = False
    for block in blocks:
        for row in block.get("rows", []):
            if not isinstance(row, dict):
                continue
            rid = row.get("rid")
            if not isinstance(rid, str) or not rid or rid in seen:
                row["rid"] = rid = new_rid()
                changed = True
            seen.add(rid)
    return changed


def validate_rows(blocks: list[dict]) -> None:
    """Kiểm tối thiểu dữ liệu người dùng gửi lên. Mọi khoá khác của dòng được GIỮ NGUYÊN
    (orig, reviewed, inferred…, kể cả khoá của phiên bản sau này) để không mất công soát."""
    for block in blocks:
        for row in block["rows"]:
            if not isinstance(row, dict):
                raise ValueError("Dòng không đúng định dạng")
            rid = row.get("rid")
            if rid is not None and (not isinstance(rid, str) or len(rid) > RID_MAX):
                raise ValueError("Mã dòng (rid) không hợp lệ")


def save_job(ws_id: str, sheet_ids: list[str], payload: dict, job_id: str) -> None:
    """Cắt kết quả một lần quét thành từng mặt sổ rồi lưu riêng.

    Một mặt sổ có thể chứa nhiều sổ khác nhau (ảnh 2 sổ) → giữ thành nhiều
    "khối", mỗi khối là metadata sổ + các dòng của nó, đúng thứ tự xuất hiện.
    """
    d = _dir(ws_id)
    d.mkdir(parents=True, exist_ok=True)

    blocks_by_sheet: dict[str, list[dict]] = {sid: [] for sid in sheet_ids}
    for acc in payload.get("accounts", []):
        meta = {k: acc.get(k) for k in ("bank_name", "store_no", "account_no", "holder")}
        for tx in acc["transactions"]:
            sid = tx.get("sheet_id")
            if sid not in blocks_by_sheet:
                continue
            blocks = blocks_by_sheet[sid]
            # Dòng liền nhau cùng một sổ thì nối vào khối đang mở
            if blocks and blocks[-1]["meta"] == meta:
                blocks[-1]["rows"].append(tx)
            else:
                blocks.append({"meta": meta, "rows": [tx]})

    for sid in sheet_ids:
        ensure_rids(blocks_by_sheet[sid])
        with _LOCK:
            _write_atomic(
                _path(ws_id, sid),
                {
                    "sheet_id": sid,
                    "job_id": job_id,
                    "scanned_at": time.time(),
                    "model": payload.get("model"),
                    "cached": payload.get("cached"),
                    "cost_usd": payload.get("cost_usd"),
                    "blocks": blocks_by_sheet[sid],
                },
            )


def save_edits(ws_id: str, sheet_id: str, blocks: list[dict]) -> dict:
    """Ghi đè các dòng của MỘT mặt sổ bằng bản người dùng đang thấy trên màn hình.

    Giữ nguyên phần metadata của lần quét (model, chi phí, thời điểm quét) và
    chỉ thay `blocks` — người dùng sửa chữ chứ không quét lại, nên nói rằng nó
    vừa được quét lại là sai sự thật.

    Không có hàm này thì công soát chỉ nằm trong bộ nhớ trình duyệt: F5, đăng
    xuất, hay rớt mạng là mất sạch (bug người dùng báo 31/07/2026).
    """
    validate_rows(blocks)
    ensure_rids(blocks)                    # client cũ chưa gửi rid thì bù ở đây
    path = _path(ws_id, sheet_id)
    with _LOCK:
        base: dict = {}
        if path.is_file():
            try:
                base = json.loads(path.read_text(encoding="utf-8"))
            except (OSError, json.JSONDecodeError):
                base = {}

        data = {
            **base,
            "sheet_id": sheet_id,
            "blocks": blocks,
            "edited_at": time.time(),
        }
        _write_atomic(path, data)
    return data


def load_all(ws_id: str) -> dict[str, dict]:
    """Mọi kết quả đã lưu của workspace, khoá theo sheet_id."""
    d = _dir(ws_id)
    if not d.is_dir():
        return {}
    out: dict[str, dict] = {}
    for f in d.glob("*.json"):
        data = _read_with_rids(f)
        if data and data.get("sheet_id"):
            out[data["sheet_id"]] = data
    return out


def _read_with_rids(path: Path) -> dict | None:
    """Đọc một file kết quả; dòng nào thiếu `rid` (file cũ) thì bổ sung rồi GHI LẠI — một lần
    duy nhất, lần đọc sau thấy đủ rid là không ghi nữa. File hỏng thì trả None."""
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None                       # file hỏng thì bỏ qua, không làm chết cả kho
    blocks = data.get("blocks")
    if not isinstance(blocks, list) or not any(
        isinstance(b, dict) and any(isinstance(r, dict) and not r.get("rid") for r in b.get("rows", []))
        for b in blocks
    ):
        return data
    with _LOCK:
        # Đọc lại TRONG khoá: có thể autosave vừa ghi bản mới hơn giữa chừng, ghi đè bằng
        # bản cũ đọc ở trên là mất công soát.
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            return None
        if ensure_rids([b for b in data.get("blocks", []) if isinstance(b, dict)]):
            _write_atomic(path, data)
    return data


def drop(ws_id: str, sheet_id: str) -> None:
    _path(ws_id, sheet_id).unlink(missing_ok=True)


def to_accounts(ws: workspace.Workspace, saved: dict[str, dict]) -> list[dict]:
    """Dựng lại danh sách sổ để XUẤT FILE, theo đúng thứ tự mặt sổ trên màn hình.

    Hai khối liền nhau cùng ngân hàng + cùng số tài khoản được gộp làm một sổ —
    nhờ vậy quét 2 trang của cùng một sổ (dù quét riêng từng lần) vẫn ra một
    sheet Excel liền mạch, giống như quét chung một lượt.
    """
    accounts: list[dict] = []
    for sheet in ws.sheets:
        data = saved.get(sheet.id)
        if not data:
            continue
        for block in data["blocks"]:
            meta = block["meta"]
            last = accounts[-1] if accounts else None
            same = (
                last is not None
                and last["bank_name"] == meta.get("bank_name")
                and last["account_no"] == meta.get("account_no")
                and meta.get("account_no") is not None
            )
            if same:
                last["transactions"].extend(block["rows"])
            else:
                accounts.append({**meta, "transactions": list(block["rows"])})
    return accounts
