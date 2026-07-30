"""Xuất CSV — lựa chọn thứ hai bên cạnh Excel.

CSV phải có **BOM UTF-8**: Excel bản tiếng Nhật mở CSV không BOM sẽ đọc theo
Shift-JIS và toàn bộ 摘要 (katakana) biến thành ký tự rác. Đây là lỗi kinh điển
khi giao file cho khách Nhật.
"""

import csv
import io

# Giữ đúng tên cột của sổ, không dịch — xem WEB_PLAN §8
BASE_COLS = ["行", "年月日", "区分", "摘要", "お支払金額", "お預り金額", "差引残高"]
OPT_COLS = {"store_code": "取扱店", "extra_text": "備考"}
TAIL_COLS = ["残高チェック", "確認メモ"]


def accounts_to_csv(
    accounts: list[dict], book_name: str = "", add_total: bool = False
) -> bytes:
    buf = io.StringIO(newline="")
    w = csv.writer(buf, lineterminator="\r\n")

    for ai, acc in enumerate(accounts):
        txs = acc["transactions"]
        has_store = any(t.get("store_code") for t in txs)
        has_extra = any(t.get("extra_text") for t in txs)

        cols = list(BASE_COLS)
        if has_store:
            cols.append(OPT_COLS["store_code"])
        if has_extra:
            cols.append(OPT_COLS["extra_text"])
        cols += TAIL_COLS

        if ai > 0:
            w.writerow([])
        w.writerow([book_name or "通帳明細", acc.get("bank_name") or f"口座{ai + 1}"])
        w.writerow([
            f"店番 {acc.get('store_no') or '—'}",
            f"口座番号 {acc.get('account_no') or '—'}",
            f"名義 {acc.get('holder') or '—'}",
        ])
        w.writerow(cols)

        total_out = sum(t.get("amount_out") or 0 for t in txs if not t.get("is_note"))
        total_in = sum(t.get("amount_in") or 0 for t in txs if not t.get("is_note"))
        last_bal = next(
            (t["balance"] for t in reversed(txs) if t.get("balance") is not None), None
        )

        prev_bal = None
        for i, t in enumerate(txs, 1):
            bal = t.get("balance")
            if t.get("is_note"):
                check = "―"
            elif bal is not None and prev_bal is not None:
                want = prev_bal - (t.get("amount_out") or 0) + (t.get("amount_in") or 0)
                check = "OK" if want == bal else "NG"
            else:
                check = "―"
            if bal is not None:
                prev_bal = bal

            memo = ""
            if t.get("status") == "check":
                memo = f"要確認: {t.get('reason', '')}"
            elif t.get("status") == "fixed":
                memo = f"自動修正: {t.get('reason', '')}"

            row = [
                t.get("row_no") or i,
                t.get("date") or t.get("date_raw") or "",
                t.get("kind") or ("注記" if t.get("is_note") else ""),
                t.get("description") or "",
                t.get("amount_out") if t.get("amount_out") is not None else "",
                t.get("amount_in") if t.get("amount_in") is not None else "",
                bal if bal is not None else "",
            ]
            if has_store:
                row.append(t.get("store_code") or "")
            if has_extra:
                row.append(t.get("extra_text") or "")
            row += [check, memo]
            w.writerow(row)

        if add_total:
            total = ["", "", "", "合計", total_out, total_in,
                     last_bal if last_bal is not None else ""]
            if has_store:
                total.append("")
            if has_extra:
                total.append("")
            w.writerow(total + ["", ""])

    return b"\xef\xbb\xbf" + buf.getvalue().encode("utf-8")
