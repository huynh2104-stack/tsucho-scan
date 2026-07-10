"""CLI: python main.py input/anh_so.jpg -o output/ket_qua.xlsx"""

import argparse
import sys
from pathlib import Path

from extract import ExtractError, extract_transactions
from export import export_to_excel
from validate import validate_transactions


def main() -> int:
    # Đảm bảo in được tiếng Nhật/Việt trên console Windows
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except AttributeError:
        pass

    parser = argparse.ArgumentParser(
        description="Chuyển ảnh/PDF sổ ngân hàng Nhật (通帳) thành file Excel."
    )
    parser.add_argument("input", help="Đường dẫn ảnh (jpg/png) hoặc PDF")
    parser.add_argument(
        "-o", "--output",
        help="File Excel đầu ra (mặc định: output/<tên file>.xlsx)",
    )
    args = parser.parse_args()

    output = args.output or str(Path("output") / (Path(args.input).stem + ".xlsx"))

    try:
        print(f"Đang đọc và trích xuất: {args.input} ...")
        result = extract_transactions(args.input)

        bank = result.get("bank_name") or "(không rõ ngân hàng)"
        transactions = validate_transactions(result["transactions"])
        n_check = sum(1 for t in transactions if t["status"] == "check")

        path = export_to_excel(transactions, output)

        print(f"Xong! Ngân hàng: {bank}")
        print(f"  - Tổng số giao dịch : {len(transactions)}")
        print(f"  - Dòng cần kiểm tra : {n_check} (tô vàng trong Excel)")
        print(f"  - File kết quả      : {path}")
        return 0
    except ExtractError as e:
        print(f"Lỗi: {e}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
