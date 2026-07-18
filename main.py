"""CLI: python main.py input/anh_so.jpg -o output/ket_qua.xlsx [--rotate 270]"""

import argparse
import sys
from pathlib import Path

from extract import ExtractError, extract_transactions
from export import export_accounts
from validate import merge_accounts, validate_transactions

# Giá USD / 1 triệu token (input, output) để ước tính chi phí mỗi lần chạy
# (sonnet-5: giá khuyến mãi đến 31/08/2026, sau đó 3/15)
PRICES = {
    "claude-sonnet-5": (2.0, 10.0),
    "claude-sonnet-4-6": (3.0, 15.0),
    "claude-haiku-4-5": (1.0, 5.0),
    "gemini-2.5-flash": (0.30, 2.50),
    "gemini-3.1-flash-lite": (0.25, 1.50),
}


def _cost_line(model: str, usage: dict) -> str:
    tokens = f"token vào {usage['input_tokens']:,} / ra {usage['output_tokens']:,}"
    price = PRICES.get(model)
    if not price:
        return tokens
    cost = (usage["input_tokens"] * price[0] + usage["output_tokens"] * price[1]) / 1e6
    line = f"{tokens}  (~${cost:.4f})"
    if model.startswith("gemini"):
        line += " — $0 nếu dùng bậc miễn phí AI Studio"
    return line


def main() -> int:
    # Đảm bảo in được tiếng Nhật/Việt trên console Windows
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except AttributeError:
        pass

    parser = argparse.ArgumentParser(
        description="Chuyển ảnh/PDF sổ ngân hàng Nhật (通帳) thành file Excel."
    )
    parser.add_argument(
        "input", nargs="+",
        help="Ảnh (jpg/png/webp) hoặc PDF. Nhiều trang của cùng sổ thì đưa "
             "hết vào 1 lệnh để chuỗi số dư nối liền giữa các trang",
    )
    parser.add_argument(
        "-o", "--output",
        help="File Excel đầu ra (mặc định: output/<tên file>.xlsx)",
    )
    parser.add_argument(
        "--rotate", type=int, choices=[0, 90, 180, 270], default=0,
        help="Xoay ảnh N độ theo chiều kim đồng hồ trước khi gửi "
             "(dùng khi trang giao dịch bị nằm ngang trong bản scan)",
    )
    parser.add_argument(
        "--no-cache", action="store_true",
        help="Bỏ qua cache, luôn gọi API (mặc định: cùng ảnh chạy lại = miễn phí)",
    )
    parser.add_argument(
        "--banks",
        help='Tên ngân hàng cho các sổ model không tự nhận ra, theo thứ tự, '
             'cách nhau dấu phẩy (vd: --banks "福岡銀行,西日本シティ銀行")',
    )
    args = parser.parse_args()

    output = args.output or str(Path("output") / (Path(args.input[0]).stem + ".xlsx"))

    try:
        print(f"Đang đọc và trích xuất: {', '.join(args.input)} ...")
        result = extract_transactions(
            args.input, rotate=args.rotate, use_cache=not args.no_cache
        )

        # Gộp các account thực chất là 1 sổ bị tách nhầm (chuỗi 残高 nối tiếp khớp)
        merged = merge_accounts(result["accounts"])

        # --banks ghi đè tên sổ theo thứ tự sheet (kể cả khi model tự đọc ra tên khác)
        bank_names = [b.strip() for b in args.banks.split(",")] if args.banks else []
        for i, acc in enumerate(merged):
            if i < len(bank_names) and bank_names[i]:
                acc["bank_name"] = bank_names[i]

        accounts = []
        for acc in merged:
            acc["transactions"] = validate_transactions(acc["transactions"])
            accounts.append(acc)

        source_name = ", ".join(Path(p).name for p in args.input)
        path = export_accounts(accounts, output, source_name=source_name)

        if result.get("cached"):
            cost = "kết quả lấy từ cache — miễn phí, không gọi API"
        else:
            cost = _cost_line(result["model"], result["usage"])
        print(f"Xong! ({result['model']}, {cost})")
        for acc in accounts:
            txs = acc["transactions"]
            n_fixed = sum(1 for t in txs if t["status"] == "fixed")
            n_check = sum(1 for t in txs if t["status"] == "check")
            bank = acc["bank_name"] or "(không rõ ngân hàng)"
            print(f"  [{bank}]")
            print(f"    - Số giao dịch      : {len(txs)}")
            print(f"    - Tự sửa cột        : {n_fixed} (tô xanh trong Excel)")
            print(f"    - Dòng cần kiểm tra : {n_check} (tô vàng trong Excel)")
        print(f"  File kết quả: {path}")
        return 0
    except PermissionError:
        print(
            f"Lỗi: file '{output}' đang được mở (thường là trong Excel). "
            "Hãy đóng file rồi chạy lại — kết quả đã lưu cache nên không tốn phí.",
            file=sys.stderr,
        )
        return 1
    except ExtractError as e:
        print(f"Lỗi: {e}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
