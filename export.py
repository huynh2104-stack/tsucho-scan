"""Xuất danh sách giao dịch ra file Excel (.xlsx) bằng openpyxl."""

from pathlib import Path

from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill

HEADERS = ["日付", "摘要", "お支払金額", "お預り金額", "残高", "確認"]
YELLOW = PatternFill(start_color="FFFF00", end_color="FFFF00", fill_type="solid")
HEADER_FILL = PatternFill(start_color="D9E1F2", end_color="D9E1F2", fill_type="solid")
MONEY_FMT = "#,##0"
COL_WIDTHS = {"A": 12, "B": 24, "C": 14, "D": 14, "E": 14, "F": 20}


def export_to_excel(transactions: list[dict], output_path: str) -> str:
    """Ghi file .xlsx: dòng "check" tô vàng, cuối bảng có 出金合計・入金合計 bằng =SUM."""
    wb = Workbook()
    ws = wb.active
    ws.title = "取引明細"

    # Dòng tiêu đề
    ws.append(HEADERS)
    for cell in ws[1]:
        cell.font = Font(bold=True)
        cell.fill = HEADER_FILL
        cell.alignment = Alignment(horizontal="center")

    # Các dòng giao dịch
    for tx in transactions:
        is_check = tx.get("status") == "check"
        note = f"要確認: {tx.get('reason', '')}" if is_check else ""
        ws.append([
            tx.get("date") or tx.get("date_raw") or "",
            tx.get("description") or "",
            tx.get("amount_out"),
            tx.get("amount_in"),
            tx.get("balance"),
            note,
        ])
        row = ws.max_row
        for col in ("C", "D", "E"):
            ws[f"{col}{row}"].number_format = MONEY_FMT
        if is_check:
            for cell in ws[row]:
                cell.fill = YELLOW

    # Dòng tổng: công thức =SUM thật, không phải giá trị cứng
    first, last = 2, ws.max_row
    total_out_row = last + 2
    total_in_row = last + 3
    ws[f"B{total_out_row}"] = "出金合計"
    ws[f"C{total_out_row}"] = f"=SUM(C{first}:C{last})"
    ws[f"B{total_in_row}"] = "入金合計"
    ws[f"D{total_in_row}"] = f"=SUM(D{first}:D{last})"
    for r in (total_out_row, total_in_row):
        ws[f"B{r}"].font = Font(bold=True)
        for col in ("C", "D"):
            ws[f"{col}{r}"].number_format = MONEY_FMT
            ws[f"{col}{r}"].font = Font(bold=True)

    for col, width in COL_WIDTHS.items():
        ws.column_dimensions[col].width = width

    out = Path(output_path)
    out.parent.mkdir(parents=True, exist_ok=True)
    wb.save(out)
    return str(out)
