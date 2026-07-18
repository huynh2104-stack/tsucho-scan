"""Thước đo độ chính xác: so file kết quả với file chuẩn (do người nhìn sổ tự viết).

Cách dùng:
    python eval.py output/ket_qua.xlsx file_chuan.xlsx

Sheet ghép theo thứ tự (sheet 1 chuẩn ↔ sheet 1 kết quả...). Mỗi dòng chuẩn được
tìm trong kết quả theo 残高 (gần như duy nhất), không thấy → tính là "mất dòng".
Chấm điểm: ngày / 出金 / 入金 / 残高 (đúng-sai), 摘要 (đúng / gần đúng / sai),
text phụ ở cột tiền (tên người chuyển...) có được giữ lại hay không.
"""

import sys
import unicodedata
from datetime import date, datetime
from difflib import SequenceMatcher

from openpyxl import load_workbook


def _norm_text(s) -> str:
    """Chuẩn hóa để so chữ: NFKC (kana nửa/full → full), bỏ khoảng trắng và ký hiệu."""
    if s is None:
        return ""
    s = unicodedata.normalize("NFKC", str(s))
    return "".join(ch for ch in s if ch not in " 　*※¥,()（）.-")


def _cell_amount(v):
    """Ô cột tiền của file chuẩn: số → int; text (tên người chuyển...) → ("text", str)."""
    if v is None or v == "":
        return None
    if isinstance(v, (int, float)):
        return int(v)
    s = str(v).strip().strip("※*¥ ").replace(",", "")
    try:
        return int(s)
    except ValueError:
        return ("text", str(v).strip())


def _cell_date(v) -> str:
    if isinstance(v, (datetime, date)):
        return v.isoformat()[:10]
    return str(v or "").strip()


def _find_columns(ws):
    """Dò dòng tiêu đề và ánh xạ cột theo tên (chịu được cả form cũ lẫn mới)."""
    for r in range(1, min(ws.max_row, 12) + 1):
        headers = {}
        for c in range(1, min(ws.max_column, 12) + 1):
            v = str(ws.cell(row=r, column=c).value or "")
            if "年月日" in v or v == "日付":
                headers["date"] = c
            elif v == "区分":
                headers["kind"] = c
            elif "摘要" in v:
                headers["desc"] = c
            elif "備考" in v:
                headers["remark"] = c
            elif v.startswith("お支払"):
                headers["out"] = c
            elif v.startswith("お預り"):
                headers["in"] = c
            elif "残高" in v and "チェック" not in v:
                headers["bal"] = c
        if {"date", "desc", "out", "in", "bal"} <= set(headers):
            return r, headers
    return 1, {"date": 1, "desc": 2, "out": 3, "in": 4, "bal": 5}  # form cũ


def _read_rows(ws):
    header_row, cols = _find_columns(ws)
    rows = []
    for r in range(header_row + 1, ws.max_row + 1):
        get = lambda key: ws.cell(row=r, column=cols[key]).value if key in cols else None
        raw_date = get("date")
        desc_parts = [str(get(k) or "") for k in ("kind", "desc", "remark")]
        if raw_date in (None, "") and not any(desc_parts):
            break  # hết bảng giao dịch (xuống vùng tổng/báo cáo)
        if str(raw_date or "").strip() in ("—", "―", "-"):
            continue  # dòng ghi chú (繰越...) — không phải giao dịch
        row = {
            "date": _cell_date(raw_date),
            "desc": " ".join(p for p in desc_parts if p),
            "out": _cell_amount(get("out")),
            "in": _cell_amount(get("in")),
            "bal": _cell_amount(get("bal")),
        }
        if not row["date"] and row["out"] is None and row["in"] is None and row["bal"] is None:
            continue  # dòng chú thích ※ không có ngày/số
        rows.append(row)
    return rows


import re as _re


def _desc_score(gt: str, out: str) -> str:
    def _judge(a: str, b: str) -> str | None:
        if a == b:
            return "ĐÚNG"
        if (a in b or b in a) and min(len(a), len(b)) / max(len(a), len(b)) >= 0.5:
            return "ĐÚNG"
        return None

    a, b = _norm_text(gt), _norm_text(out)
    if not a:
        return "－"
    verdict = _judge(a, b)
    if verdict:
        return verdict
    # File chuẩn có thể chép cả số tiền vào 摘要 ("200 *24,060NCB VISA") trong khi
    # form mới tách số ra cột riêng → so thêm biến thể đã bỏ chữ số
    a2, b2 = _re.sub(r"\d+", "", a), _re.sub(r"\d+", "", b)
    if a2 and _judge(a2, b2):
        return "ĐÚNG"
    if SequenceMatcher(None, a, b).ratio() >= 0.7 or (
        a2 and SequenceMatcher(None, a2, b2).ratio() >= 0.7
    ):
        return "gần"
    return "SAI"


def _amount_marks(gt, out, row_texts: list[str]) -> tuple[str, str | None]:
    """So 1 ô tiền → (điểm số học, điểm text hoặc None).

    Ô chuẩn là text (tên người chuyển...) → về số học kỳ vọng là "không có số",
    còn phần text được chấm riêng: có được giữ lại đâu đó trong dòng không.
    """
    text_mark = None
    if isinstance(gt, tuple):  # ("text", ...)
        want = _norm_text(gt[1])
        kept = any(
            want and _norm_text(t)
            and (want in _norm_text(t) or _norm_text(t) in want
                 or SequenceMatcher(None, want, _norm_text(t)).ratio() >= 0.7)
            for t in row_texts
        )
        text_mark = "ĐÚNG" if kept else "MẤT-TEXT"
        gt_num = None
    else:
        gt_num = gt
    got_num = out if not isinstance(out, tuple) else None
    return ("ĐÚNG" if gt_num == got_num else "SAI"), text_mark


def compare_sheet(gt_ws, out_ws) -> dict:
    gt_rows = _read_rows(gt_ws)
    out_rows = _read_rows(out_ws)
    stats = {"rows": len(gt_rows), "missing": 0, "date": 0, "out": 0, "in": 0,
             "bal": 0, "desc_ok": 0, "desc_near": 0, "text_kept": 0, "text_total": 0}

    print(f"\n=== Sheet chuẩn「{gt_ws.title.strip()}」 ↔ kết quả「{out_ws.title.strip()}」"
          f" (chuẩn {len(gt_rows)} dòng / kết quả {len(out_rows)} dòng) ===")
    used = set()
    for i, g in enumerate(gt_rows):
        # Tìm dòng kết quả có cùng 残高 (ưu tiên), không có thì theo vị trí
        match = None
        for j, o in enumerate(out_rows):
            if j not in used and g["bal"] is not None and o["bal"] == g["bal"]:
                match = j
                break
        if match is None and i < len(out_rows) and i not in used:
            match = i
        if match is None:
            stats["missing"] += 1
            print(f"  dòng {i + 2}: MẤT DÒNG ({g['date']} {g['desc'][:20]})")
            continue
        used.add(match)
        o = out_rows[match]

        row_texts = [o["desc"]] + [x[1] for x in (o["out"], o["in"]) if isinstance(x, tuple)]
        out_mark, out_text = _amount_marks(g["out"], o["out"], row_texts)
        in_mark, in_text = _amount_marks(g["in"], o["in"], row_texts)
        marks = {
            "date": "ĐÚNG" if g["date"] == o["date"] else "SAI",
            "out": out_mark,
            "in": in_mark,
            "bal": "ĐÚNG" if g["bal"] == o["bal"] else "SAI",
            "desc": _desc_score(g["desc"], o["desc"]),
        }
        for k in ("date", "out", "in", "bal"):
            if marks[k] == "ĐÚNG":
                stats[k] += 1
        for text_mark in (out_text, in_text):
            if text_mark is not None:
                stats["text_total"] += 1
                if text_mark == "ĐÚNG":
                    stats["text_kept"] += 1
        if marks["desc"] == "ĐÚNG":
            stats["desc_ok"] += 1
        elif marks["desc"] == "gần":
            stats["desc_near"] += 1

        bad = [f"{k}={v}" for k, v in marks.items() if v not in ("ĐÚNG", "－")]
        if out_text == "MẤT-TEXT":
            bad.append("text-out=MẤT")
        if in_text == "MẤT-TEXT":
            bad.append("text-in=MẤT")
        if bad:
            print(f"  dòng {i + 2}: {'; '.join(bad)}  | chuẩn: {g['desc'][:24]} | máy: {o['desc'][:24]}")
    return stats


def main() -> int:
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except AttributeError:
        pass
    if len(sys.argv) != 3:
        print("Cách dùng: python eval.py <ket_qua.xlsx> <file_chuan.xlsx>")
        return 2

    out_wb = load_workbook(sys.argv[1])
    gt_wb = load_workbook(sys.argv[2])

    def _match_sheet(gt_title: str, used: set):
        """Ghép sheet theo tên (chuẩn có thể là file Cowork với tên 西銀/福銀...)."""
        want = gt_title.strip()
        for ws in out_wb.worksheets:
            if ws.title.strip() == want and ws.title not in used:
                return ws
        for ws in out_wb.worksheets:  # chứa nhau (西銀 ⊂ 西日本シティ銀行 thì không, nhưng ngược lại có)
            t = ws.title.strip()
            if (want in t or t in want) and ws.title not in used:
                return ws
        return None

    totals = []
    used: set = set()
    for idx, gt_ws in enumerate(gt_wb.worksheets):
        out_ws = _match_sheet(gt_ws.title, used)
        if out_ws is None and idx < len(out_wb.worksheets):
            out_ws = out_wb.worksheets[idx]  # dự phòng: ghép theo thứ tự
        if out_ws is None:
            print(f"THIẾU SHEET: chuẩn có「{gt_ws.title}」nhưng kết quả không có")
            continue
        used.add(out_ws.title)
        totals.append(compare_sheet(gt_ws, out_ws))

    n = sum(t["rows"] for t in totals) or 1
    print("\n===== TỔNG KẾT =====")
    print(f"  Số dòng chuẩn      : {n}")
    print(f"  Mất dòng           : {sum(t['missing'] for t in totals)}")
    for label, key in (("Ngày", "date"), ("出金", "out"), ("入金", "in"), ("残高", "bal")):
        print(f"  {label:<19}: {sum(t[key] for t in totals)}/{n} đúng")
    ok = sum(t["desc_ok"] for t in totals)
    near = sum(t["desc_near"] for t in totals)
    print(f"  摘要 đúng          : {ok}/{n} (gần đúng thêm {near})")
    tt = sum(t["text_total"] for t in totals)
    if tt:
        print(f"  Text cột tiền giữ  : {sum(t['text_kept'] for t in totals)}/{tt}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
