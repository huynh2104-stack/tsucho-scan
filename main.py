"""CLI: python main.py input/anh_so.jpg -o output/ket_qua.xlsx [--rotate 270]

Chỉ lo đọc tham số và in kết quả. Toàn bộ xử lý nằm ở core.scan() để web dùng
lại được y hệt.
"""

import argparse
import sys
from pathlib import Path

from core import ExtractError, scan


def _cost_line(result) -> str:
    if result.cached:
        return "kết quả lấy từ cache — miễn phí, không gọi API"
    usage = result.usage
    tokens = f"token vào {usage['input_tokens']:,} / ra {usage['output_tokens']:,}"
    cost = result.cost_usd
    if cost is None:
        return tokens
    line = f"{tokens}  (~${cost:.4f})"
    if result.model.startswith("gemini"):
        line += " — $0 nếu dùng bậc miễn phí AI Studio"
    return line


def _print_progress(event: dict) -> None:
    stage = event["stage"]
    if stage == "page" and event.get("total", 1) > 1:
        print(f"  {event['message']} ...")
    elif stage == "skip":
        print(f"      → {event['message']}")
    elif stage == "retry":
        print(f"      {event['message']}")


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
        help="Xoay ảnh/trang PDF N độ theo chiều kim đồng hồ trước khi gửi "
             "(dùng khi bản scan bị nằm ngang hoặc lộn ngược)",
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
        result = scan(
            args.input,
            rotate=args.rotate,
            use_cache=not args.no_cache,
            banks=args.banks,
            on_progress=_print_progress,
        )
        path = result.to_excel(output)

        print(f"Xong! ({result.model}, {_cost_line(result)})")
        for acc in result.accounts:
            # Đếm theo status thô để khớp đúng số ô được tô màu trong Excel;
            # dòng 検証レベル trong file chỉ tính giao dịch thật nên có thể lệch
            # vài dòng ghi chú (繰越...) — đó là khác biệt có chủ ý.
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
