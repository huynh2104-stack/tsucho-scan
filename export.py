"""Xuất Excel theo form người dùng đã duyệt (học từ skill bank-passbook-to-excel):

- Khối thông tin đầu sheet: 銀行 / 店番号 / 口座番号 / 名義 / 出典 + chú giải màu.
- Cột theo bố cục sổ: 年月日(西暦) | 区分 | 摘要 | (備考) | お支払 | お預り | 差引残高
  | (取扱店) | 残高チェック | 確認メモ — cột 備考/取扱店 chỉ hiện khi sổ có dữ liệu đó.
- 残高チェック: công thức Excel sống từng dòng, tham chiếu dòng có 残高 gần nhất.
- Ô chưa chắc chắn tô FFF2CC; ô được kiểm tra kép tự sửa tô xanh C6EFCE.
- Dòng nào CẦN SOÁT (tô vàng, 要確認) do `review.py` quyết định — cùng một định nghĩa với bảng trên
  web, tính từ chuỗi số dư HIỆN TẠI + việc người đã làm (sửa ô, bấm ✓ 確認済), KHÔNG đọc cờ
  `status` đóng băng lúc quét. Dòng người đã xác nhận không tô vàng; cột 確認メモ ghi rõ lý do.
- Dòng ghi chú (繰越, 未記帳...) in nghiêng xám, không có số tiền.
- Báo cáo 集計レポート + 入金/出金の内訳 bằng công thức COUNTIFS/SUMIFS sống.
"""

import re
from collections import OrderedDict
from datetime import date
from pathlib import Path

from openpyxl import Workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter

import review

UNCERTAIN = PatternFill(start_color="FFF2CC", end_color="FFF2CC", fill_type="solid")
FIXED_FILL = PatternFill(start_color="C6EFCE", end_color="C6EFCE", fill_type="solid")
HEADER_FILL = PatternFill(start_color="2F5B7C", end_color="2F5B7C", fill_type="solid")
REPORT_FILL = PatternFill(start_color="E8EEF4", end_color="E8EEF4", fill_type="solid")
BAND_FILL = PatternFill(start_color="E4EEF6", end_color="E4EEF6", fill_type="solid")  # dòng so le

ARIAL = Font(name="Arial")
ARIAL_BOLD = Font(name="Arial", bold=True)
HEADER_FONT = Font(name="Arial", bold=True, color="FFFFFF")
NOTE_FONT = Font(name="Arial", italic=True, color="808080")
FAINT_FONT = Font(name="Arial", color="9AA5AF")  # OK/NG/― viết nhạt

CENTER = Alignment(horizontal="center")
_ISO_DATE = re.compile(r"^(\d{4})-(\d{2})-(\d{2})$")
# Tên riêng katakana (≥3 ký tự liền) — chỗ model hay sai chính tả mà không tự biết
_KANA_RUN = re.compile(r"[ァ-ヶー]{3,}")

MONEY_FMT = "#,##0"
DATE_FMT = "yyyy-mm-dd"
THIN = Side(style="thin", color="B0B0B0")
BORDER = Border(left=THIN, right=THIN, top=THIN, bottom=THIN)

HEADER_ROW = 8  # bảng bắt đầu dưới khối thông tin (5 dòng info + 1 dòng bảo đảm)
VERIFY_ROW = 6  # dòng "mức độ bảo đảm"

OK_FILL = PatternFill(start_color="D9EAD3", end_color="D9EAD3", fill_type="solid")
WARN_FILL = PatternFill(start_color="FCE5CD", end_color="FCE5CD", fill_type="solid")


def _iso_to_date(value) -> date | None:
    """"YYYY-MM-DD" hợp lệ → date. Mọi thứ khác → None, KHÔNG ném lỗi.

    Người dùng gõ tay vào ô ngày ("2025/4/11", "R7.4.11", "tuần sau") và frontend gửi nguyên
    lên đây; trước đây `date.fromisoformat` ném ValueError → xuất Excel trả 500 và công soát
    của cả buổi không tải về được. Ngày hỏng thì ghi chuỗi gốc và tô vàng (xem `_write_sheet`).
    """
    if isinstance(value, date):
        return value
    m = _ISO_DATE.match(value.strip()) if isinstance(value, str) else None
    if not m:
        return None
    try:
        return date(int(m[1]), int(m[2]), int(m[3]))
    except ValueError:                       # 2025-02-30
        return None


def verification_summary(txs: list[dict]) -> dict:
    """Mức độ bảo đảm của sheet — nói rõ dữ liệu này được kiểm chứng tới đâu.

    Chuỗi 残高 chỉ chứng minh tính NHẤT QUÁN NỘI BỘ: nó không phát hiện được
    dòng bị bỏ sót hay tên đối tác đọc sai. Vì vậy phải ghi thẳng ra file, để
    người xem biết còn phải soát gì chứ không tưởng "không có ô vàng là xong".

    Đếm theo trạng thái của `review.py` (không theo `status` đóng băng của máy):
    rows = need + confirmed + verified; verified gồm dòng khớp, tự sửa và người đã sửa tay.
    Các khoá cũ (rows, verified, fixed, need_check, level, chain_ok) được giữ vì
    `core.ScanResult` và test đang dùng; thêm `confirmed`, `edited`.
    """
    pairs = [(t, i) for t, i in zip(txs, review.analyze_account(txs)) if i["state"] != "note"]
    n = len(pairs)
    count = lambda state: sum(1 for _, i in pairs if i["state"] == state)  # noqa: E731
    need, confirmed, fixed, edited = count("review"), count("confirmed"), count("fixed"), count("edited")
    # Dòng người đã ✓ dù chuỗi số dư vẫn lệch: không được nói "残高一致" như thể chuỗi khớp hết
    confirmed_ng = sum(1 for _, i in pairs if i["state"] == "confirmed" and i["chk"] == "NG")
    has_bal = any(t.get("balance") is not None for t, _ in pairs)

    if not has_bal:
        level = "未検証（残高が読取れず検算不可）"
    elif need > 0:
        level = f"一部未検証（{need}行が要確認）"
    elif confirmed == 0:
        level = "残高チェーン検証済（全行一致）"
    elif confirmed_ng == 0:
        level = f"検証済（残高一致・人手確認 {confirmed}行）"
    else:
        level = f"検証済（人手確認 {confirmed}行・うち残高不一致 {confirmed_ng}行）"
    return {
        "rows": n, "verified": n - need - confirmed, "fixed": fixed, "confirmed": confirmed,
        "edited": edited, "need_check": need, "level": level, "chain_ok": has_bal and need == 0,
    }


def _fmt_value(v) -> str:
    if v is None:
        return "空欄"
    if isinstance(v, (int, float)) and not isinstance(v, bool):
        return f"{v:,}"
    return str(v)


def _memo(tx: dict, info: dict) -> str:
    """Nội dung cột 確認メモ theo trạng thái dòng (bảng ở task 1.4)."""
    state, chk = info["state"], info["chk"]
    if state == "review":
        parts = [r["text"] for r in review.open_reasons(tx, chk)]
        if chk == "NG" and not any(p.startswith("残高不一致") for p in parts):
            parts.append("残高不一致（検算NG）")        # chuỗi lệch do người sửa nên máy không ghi lý do
        if tx.get("added"):
            parts.append("手入力行（未確認）")
        return "要確認: " + "・".join(parts) if parts else "要確認"
    if state == "fixed":
        return f"自動修正: {tx.get('reason', '')}"

    # Ô sửa theo TỪ ĐIỂN SỬA LỖI (task 3.3) ghi riêng là 辞書で補正 — người đọc file biết chữ đó không do người gõ tay
    in_dict = set(tx.get("dict_fixed") or [])

    def _list(items) -> str:
        return "、".join(
            f"{review.FIELD_LABEL[c['field']]} {_fmt_value(c['from'])}→{_fmt_value(c['to'])}" for c in items
        )

    all_changes = review.edit_changes(tx)
    changes = _list(c for c in all_changes if c["field"] not in in_dict)
    dict_changes = _list(c for c in all_changes if c["field"] in in_dict)
    inferred = ""
    if tx.get("inferred"):
        what = "残高から計算" if "balance" in tx["inferred"] else "、".join(
            review.FIELD_LABEL.get(f, f) for f in tx["inferred"])
        inferred = f"推定値（{what}）"
    if state == "confirmed":
        memo = "確認済"
        if tx.get("reason"):
            memo += f"（元: {tx['reason']}）"
        if changes:
            memo += f"（修正: {changes}）"
        if dict_changes:
            memo += f"（辞書で補正: {dict_changes}）"
        return memo + inferred
    if state == "edited":
        return "／".join(
            p for p in ([f"手修正: {changes}"] if changes else [])
            + ([f"辞書で補正: {dict_changes}"] if dict_changes else [])
            + ([inferred] if inferred else [])
        )
    return ""


def annotate(txs: list[dict]) -> list[dict]:
    """Mỗi dòng của một sổ xuất file → `{state, chk, memo}` — dùng chung cho Excel và CSV
    để hai định dạng không thể nói hai điều khác nhau về cùng một dòng."""
    return [
        {"state": i["state"], "chk": i["chk"], "memo": _memo(tx, i)}
        for tx, i in zip(txs, review.analyze_account(txs))
    ]


def _sheet_title(bank_name: str | None, index: int) -> str:
    """Tên sheet hợp lệ cho Excel (bỏ ký tự cấm, tối đa 31 ký tự)."""
    name = bank_name or f"口座{index + 1}"
    name = re.sub(r"[\\/*?:\[\]]", "", name).strip() or f"口座{index + 1}"
    return name[:28]


def _escape_countif(key: str) -> str:
    """Escape cho COUNTIFS/SUMIFS: nhân đôi nháy kép, vô hiệu wildcard * ? ~."""
    s = key.replace("~", "~~").replace("*", "~*").replace("?", "~?")
    return s.replace('"', '""')


def _set(ws, row: int, col: int, value, font=ARIAL, fill=None, fmt=None, border=None):
    cell = ws.cell(row=row, column=col, value=value)
    cell.font = font
    if fill:
        cell.fill = fill
    if fmt:
        cell.number_format = fmt
    if border:
        cell.border = border
    return cell


def _write_sheet(ws, acc: dict, source_name: str, add_total: bool = False) -> None:
    txs = acc.get("transactions", [])
    has_x = any(t.get("extra_text") for t in txs)
    has_t = any(t.get("store_code") for t in txs)

    # ---- Khối thông tin đầu sheet
    info = [
        ("銀行", acc.get("bank_name")),
        ("店番号", acc.get("store_no")),
        ("口座番号", acc.get("account_no")),
        ("名義", acc.get("holder")),
        ("出典", source_name),
    ]
    for r, (label, val) in enumerate(info, start=1):
        _set(ws, r, 1, label, font=ARIAL_BOLD)
        _set(ws, r, 2, val or "―")
    # File giao cho khách Nhật: chú thích hoàn toàn bằng tiếng Nhật
    _set(ws, 1, 6, "黄色＝要確認（読取り・検算で疑わしい箇所。カタカナ名は原本と照合してください）",
         fill=UNCERTAIN)
    _set(ws, 2, 6, "緑＝残高検算で自動修正", fill=FIXED_FILL)
    _set(ws, 3, 6, "確認メモ『確認済』＝利用者が原本と照合済み")

    # ---- Mức độ bảo đảm: giá trị tính sẵn (KHÔNG dùng công thức) để cả người
    # đọc lẫn chương trình khác đều lấy được — công thức Excel chưa tính thì
    # đọc bằng thư viện sẽ ra rỗng.
    v = verification_summary(txs)
    _set(ws, VERIFY_ROW, 1, "検証レベル", font=ARIAL_BOLD)
    _set(ws, VERIFY_ROW, 2, v["level"], font=ARIAL_BOLD,
         fill=OK_FILL if v["chain_ok"] else WARN_FILL)
    _set(ws, VERIFY_ROW, 6,
         f"取引 {v['rows']}行 / 残高検算OK {v['verified']}行 / 自動修正 {v['fixed']}行 "
         f"/ 人手確認 {v['confirmed']}行 / 要確認 {v['need_check']}行",
         fill=OK_FILL if v["chain_ok"] else WARN_FILL)
    _set(ws, VERIFY_ROW, 7, None)
    # Cảnh báo giới hạn của phép kiểm: người dùng phải tự soát số DÒNG và tên
    _set(ws, VERIFY_ROW + 0, 8,
         "※ 残高チェーンは行の抜け・摘要の誤読を検出できません。行数と名前は原本と照合してください。",
         font=NOTE_FONT)

    # ---- Cột động theo bố cục sổ
    headers = ["年月日(西暦)", "区分", "摘要"]
    if has_x:
        headers.append("備考")
    headers += ["お支払金額 (円)", "お預り金額 (円)", "差引残高 (円)"]
    if has_t:
        headers.append("取扱店")
    headers += ["残高チェック", "確認メモ"]

    col = {name: i + 1 for i, name in enumerate(headers)}
    letter = {name: get_column_letter(i) for name, i in col.items()}
    out_l, in_l, bal_l = letter["お支払金額 (円)"], letter["お預り金額 (円)"], letter["差引残高 (円)"]

    for name, c in col.items():
        _set(ws, HEADER_ROW, c, name, font=HEADER_FONT, fill=HEADER_FILL, border=BORDER)
        ws.cell(row=HEADER_ROW, column=c).alignment = Alignment(horizontal="center")
    ws.freeze_panes = f"A{HEADER_ROW + 1}"

    # ---- Dòng dữ liệu
    notes = annotate(txs)
    prev_bal_row = None
    r = HEADER_ROW
    for tx, note in zip(txs, notes):
        r += 1
        is_note = tx.get("is_note")
        state, chk = note["state"], note["chk"]
        if tx.get("block_start"):
            prev_bal_row = None            # dòng đầu mỗi khối không có mốc phía trước (như bảng trên web)

        # Ngày: ô date thật (yyyy-mm-dd); không đọc được thì giữ chuỗi gốc + tô vàng
        date_cell = _set(ws, r, col["年月日(西暦)"], None, border=BORDER)
        if is_note:
            date_cell.value = "—"
        elif _iso_to_date(tx.get("date")) is not None:
            date_cell.value = _iso_to_date(tx["date"])
            date_cell.number_format = DATE_FMT
        else:
            # Không có ngày, hoặc ngày không đọc được: giữ chuỗi người dùng/máy ghi. Tô vàng trừ khi
            # người đã bấm ✓ dòng này (đã nhìn và chấp nhận).
            date_cell.value = str(tx.get("date") or tx.get("date_raw") or "")
            if state != "confirmed":
                date_cell.fill = UNCERTAIN

        _set(ws, r, col["区分"], tx.get("kind") or ("注記" if is_note else None), border=BORDER)
        desc_cell = _set(ws, r, col["摘要"], tx.get("description") or None, border=BORDER)
        if has_x:
            _set(ws, r, col["備考"], tx.get("extra_text") or None, border=BORDER)

        out_cell = _set(ws, r, col["お支払金額 (円)"], tx.get("amount_out"),
                        fmt=MONEY_FMT, border=BORDER)
        in_cell = _set(ws, r, col["お預り金額 (円)"], tx.get("amount_in"),
                       fmt=MONEY_FMT, border=BORDER)
        bal_cell = _set(ws, r, col["差引残高 (円)"], tx.get("balance"),
                        fmt=MONEY_FMT, border=BORDER)
        if has_t:
            _set(ws, r, col["取扱店"], tx.get("store_code") or None, border=BORDER)

        # 残高チェック: công thức sống, tham chiếu dòng có 残高 gần nhất phía trên. Có công thức hay
        # «―» là do review.py quyết định (dòng đầu khối, dòng ghi chú, dòng không in 残高 → «―»),
        # để cột này, ô vàng và 検証レベル luôn nói cùng một chuyện.
        if chk != "―" and prev_bal_row is not None:
            if prev_bal_row == r - 1:
                moves = f"-N({out_l}{r})+N({in_l}{r})"
            else:
                # Giữa hai dòng có 残高 còn dòng không in 残高 (dòng phí...): cộng dồn như engine
                lo = prev_bal_row + 1
                moves = f"-SUM({out_l}{lo}:{out_l}{r})+SUM({in_l}{lo}:{in_l}{r})"
            check = f'=IF({bal_l}{r}={bal_l}{prev_bal_row}{moves},"OK","NG")'
        else:
            check = "―"
        check_cell = _set(ws, r, col["残高チェック"], check, font=FAINT_FONT, border=BORDER)
        check_cell.alignment = CENTER
        if tx.get("balance") is not None:
            prev_bal_row = r

        # Căn giữa các cột mã/ngày cho dễ đọc
        date_cell.alignment = CENTER
        ws.cell(row=r, column=col["区分"]).alignment = CENTER
        if has_t:
            ws.cell(row=r, column=col["取扱店"]).alignment = CENTER
        if has_x:
            ws.cell(row=r, column=col["備考"]).alignment = CENTER

        # Ghi chú xác nhận + tô màu theo trạng thái (review.py):
        #   review → vàng 出金/入金/残高 · fixed → xanh 出金/入金 · confirmed/edited/ok → không tô
        _set(ws, r, col["確認メモ"], note["memo"] or None, border=BORDER)
        if state == "review":
            for cell in (out_cell, in_cell, bal_cell):
                cell.fill = UNCERTAIN
        elif state == "fixed":
            for cell in (out_cell, in_cell):
                cell.fill = FIXED_FILL

        # Tên katakana (model hay sai chính tả mà không tự biết) → tô nhạt để soát. CHỈ với dòng
        # chưa xác nhận: soát bằng mắt xong thì file không còn ô vàng.
        if state != "confirmed" and (tx.get("confidence") == "low" or (
            not is_note and _KANA_RUN.search(str(tx.get("description") or ""))
        )):
            desc_cell.fill = UNCERTAIN

        if is_note:
            for c in range(1, len(headers) + 1):
                ws.cell(row=r, column=c).font = NOTE_FONT
        else:
            # Dòng so le màu nền nhẹ cho dễ dò ngang (không đè lên ô đã tô màu)
            if (r - HEADER_ROW) % 2 == 0:
                for c in range(1, len(headers) + 1):
                    cell = ws.cell(row=r, column=c)
                    if cell.fill is None or cell.fill.fill_type is None:
                        cell.fill = BAND_FILL

    first, last = HEADER_ROW + 1, r
    bal_rows = [
        HEADER_ROW + 1 + i for i, t in enumerate(txs) if t.get("balance") is not None
    ]

    # ---- Dòng 合計 ngay dưới bảng (tuỳ chọn) — công thức sống như các ô khác
    if add_total and last >= first:
        r += 1
        _set(ws, r, col["摘要"], "合計", font=ARIAL_BOLD, fill=REPORT_FILL, border=BORDER)
        # KHÔNG đặt tên biến vòng lặp là `letter` — trùng dict `letter` dùng ở dưới
        for key, col_letter in (("お支払金額 (円)", out_l), ("お預り金額 (円)", in_l)):
            _set(ws, r, col[key], f"=SUM({col_letter}{first}:{col_letter}{last})",
                 font=ARIAL_BOLD, fill=REPORT_FILL, fmt=MONEY_FMT, border=BORDER)
        # 差引残高 không cộng được (là số dư, không phải số phát sinh) → ghi số dư cuối
        _set(ws, r, col["差引残高 (円)"],
             f"=LOOKUP(9.9E+307,{bal_l}{first}:{bal_l}{last})" if bal_rows else None,
             font=ARIAL_BOLD, fill=REPORT_FILL, fmt=MONEY_FMT, border=BORDER)
        for c in range(1, len(headers) + 1):
            cell = ws.cell(row=r, column=c)
            if cell.fill is None or cell.fill.fill_type is None:
                cell.fill = REPORT_FILL
            cell.border = BORDER
        last_written = r
    else:
        last_written = last

    # ---- 集計レポート (công thức sống)
    r = last_written + 2
    _set(ws, r, 2, f"■ 集計レポート（{acc.get('bank_name') or 'この口座'}）", font=ARIAL_BOLD)
    report_rows = {}
    items = []
    if bal_rows:
        f_b = bal_rows[0]
        items.append(("期首残高（初回取引前）",
                      f"={bal_l}{f_b}+N({out_l}{f_b})-N({in_l}{f_b})"))
        items.append(("期末残高", f"=LOOKUP(9.9E+307,{bal_l}{first}:{bal_l}{last})"))
    items += [
        ("お預り件数", f"=COUNT({in_l}{first}:{in_l}{last})"),
        ("お預り合計", f"=SUM({in_l}{first}:{in_l}{last})"),
        ("お支払件数", f"=COUNT({out_l}{first}:{out_l}{last})"),
        ("お支払合計", f"=SUM({out_l}{first}:{out_l}{last})"),
    ]
    for label, formula in items:
        r += 1
        report_rows[label] = r
        _set(ws, r, 2, label, fill=REPORT_FILL)
        _set(ws, r, 3, formula, fill=REPORT_FILL, fmt=MONEY_FMT)
    if bal_rows:
        r += 1
        _set(ws, r, 2, "増減（期末－期首）", fill=REPORT_FILL)
        _set(ws, r, 3, f"=C{report_rows['期末残高']}-C{report_rows['期首残高（初回取引前）']}",
             fill=REPORT_FILL, fmt=MONEY_FMT)
        r += 1
        _set(ws, r, 2, "検算（期首＋預り−支払＝期末）", fill=REPORT_FILL)
        _set(ws, r, 3,
             f"=IF(C{report_rows['期首残高（初回取引前）']}"
             f"+C{report_rows['お預り合計']}-C{report_rows['お支払合計']}"
             f"=C{report_rows['期末残高']},\"一致 ✓\",\"不一致 ✗\")",
             fill=REPORT_FILL)
    else:
        r += 1
        _set(ws, r, 2, "検算", fill=REPORT_FILL)
        _set(ws, r, 3, "残高が読取れず検算不可", fill=REPORT_FILL)

    # ---- 入金・出金の内訳 theo đối tác (COUNTIFS/SUMIFS sống)
    for title, amount_key, amt_l in (
        ("― 入金の内訳", "amount_in", in_l),
        ("― 出金の内訳", "amount_out", out_l),
    ):
        keys: "OrderedDict[tuple, int]" = OrderedDict()
        for t in txs:
            if t.get("is_note") or not t.get(amount_key):
                continue
            name = (t.get("description") or "").strip()
            match_col = "摘要"
            if not name:
                name = (t.get("kind") or "").strip()
                match_col = "区分"
            if not name:
                continue
            keys[(name, match_col)] = keys.get((name, match_col), 0) + t[amount_key]
        if not keys:
            continue

        r += 2
        _set(ws, r, 2, title, font=ARIAL_BOLD)
        r += 1
        for c, label in ((2, "相手先 / 種類"), (3, "件数"), (4, "合計 (円)")):
            _set(ws, r, c, label, font=HEADER_FONT, fill=HEADER_FILL)
        for (name, match_col), _total in sorted(keys.items(), key=lambda kv: -kv[1]):
            r += 1
            m_l = letter[match_col]
            key = _escape_countif(name)
            _set(ws, r, 2, name)
            _set(ws, r, 3,
                 f'=COUNTIFS({m_l}{first}:{m_l}{last},"{key}",'
                 f'{amt_l}{first}:{amt_l}{last},">0")')
            _set(ws, r, 4,
                 f'=SUMIFS({amt_l}{first}:{amt_l}{last},'
                 f'{m_l}{first}:{m_l}{last},"{key}")', fmt=MONEY_FMT)

    # ---- Độ rộng cột
    widths = {"年月日(西暦)": 12, "区分": 14, "摘要": 26, "備考": 10,
              "お支払金額 (円)": 14, "お預り金額 (円)": 14, "差引残高 (円)": 14,
              "取扱店": 8, "残高チェック": 12, "確認メモ": 30}
    for name, c in col.items():
        ws.column_dimensions[get_column_letter(c)].width = widths.get(name, 12)


def export_accounts(
    accounts: list[dict],
    output_path: str,
    source_name: str = "",
    add_total: bool = False,
) -> str:
    """Ghi file .xlsx, mỗi tài khoản (sổ) một sheet riêng theo form đã duyệt.

    `acc["sheet_title"]` (nếu có) ghi đè tên tab — web dùng để tách tab theo
    MẶT SỔ thay vì theo tài khoản.
    """
    wb = Workbook()
    used_titles = set()
    for i, acc in enumerate(accounts):
        title = _sheet_title(acc.get("sheet_title") or acc.get("bank_name"), i)
        if title in used_titles:
            title = f"{title[:25]}({i + 1})"
        used_titles.add(title)

        ws = wb.active if i == 0 else wb.create_sheet()
        ws.title = title
        _write_sheet(ws, acc, source_name, add_total=add_total)

    out = Path(output_path)
    out.parent.mkdir(parents=True, exist_ok=True)
    wb.save(out)
    return str(out)


def export_to_excel(transactions: list[dict], output_path: str) -> str:
    """Giữ tương thích: xuất 1 danh sách giao dịch thành 1 sheet."""
    return export_accounts(
        [{"bank_name": None, "transactions": transactions}], output_path
    )
