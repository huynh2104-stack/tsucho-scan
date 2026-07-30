"""Kho kết quả quét, lưu theo TỪNG MẶT SỔ và ghi ra đĩa.

Vì sao cần: trước đây frontend giữ kết quả của MỘT lần quét. Quét thêm mặt sổ
mới là ghi đè, làm mất kết quả các mặt đã quét trước đó — người dùng tưởng dữ
liệu bốc hơi. Kho này gom theo `sheet_id`: quét lại mặt nào chỉ thay mặt đó.

Ghi ra `.data/ws/<ws>/results/<sheet_id>.json` nên sống qua F5 và qua cả việc
khởi động lại server. Đó cũng chính là "lịch sử kết quả đã quét".
"""

import json
import time
from pathlib import Path

from . import workspace


def _dir(ws_id: str) -> Path:
    return workspace.WS_DIR / ws_id / "results"


def _path(ws_id: str, sheet_id: str) -> Path:
    return _dir(ws_id) / f"{sheet_id}.json"


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
        _path(ws_id, sid).write_text(
            json.dumps(
                {
                    "sheet_id": sid,
                    "job_id": job_id,
                    "scanned_at": time.time(),
                    "model": payload.get("model"),
                    "cached": payload.get("cached"),
                    "cost_usd": payload.get("cost_usd"),
                    "blocks": blocks_by_sheet[sid],
                },
                ensure_ascii=False,
            ),
            encoding="utf-8",
        )


def load_all(ws_id: str) -> dict[str, dict]:
    """Mọi kết quả đã lưu của workspace, khoá theo sheet_id."""
    d = _dir(ws_id)
    if not d.is_dir():
        return {}
    out: dict[str, dict] = {}
    for f in d.glob("*.json"):
        try:
            data = json.loads(f.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            continue                      # file hỏng thì bỏ qua, không làm chết cả kho
        if data.get("sheet_id"):
            out[data["sheet_id"]] = data
    return out


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
