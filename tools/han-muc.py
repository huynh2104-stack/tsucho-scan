"""Đặt hạn mức quét thật/ngày cho MỘT thành viên.

    python tools/han-muc.py ten@congty.jp 200         # tối đa 200 mặt sổ/ngày
    python tools/han-muc.py ten@congty.jp mac-dinh    # về mức mặc định (TSUCHO_MEMBER_SCAN_LIMIT, 30)

Chạy trên máy chủ (cùng thư mục dữ liệu với app: biến TSUCHO_DATA_DIR nếu có đặt). Chỉ áp cho tài khoản
thành viên (đăng ký email / Google / LINE); tài khoản «お試し» và admin không dùng cột này.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from api import auth  # noqa: E402


def main(argv: list[str]) -> int:
    if len(argv) != 3:
        print("Cách dùng: python tools/han-muc.py <email> <số|mac-dinh>")
        return 2
    email, raw = argv[1], argv[2].strip().lower()
    if raw in ("mac-dinh", "default", "none", "null"):
        limit = None
    else:
        try:
            limit = int(raw)
        except ValueError:
            print(f"LỖI: '{argv[2]}' không phải số nguyên (hoặc 'mac-dinh').")
            return 2
        if limit < 0:
            print("LỖI: hạn mức không được âm.")
            return 2

    auth.init_db()
    if not auth.set_scan_limit(email, limit):
        print(f"LỖI: không có thành viên nào dùng email '{auth.normalize_email(email)}'.")
        return 1
    print(f"Đã đặt hạn mức của {auth.normalize_email(email)}: "
          + ("mặc định" if limit is None else f"{limit} mặt/ngày"))
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
