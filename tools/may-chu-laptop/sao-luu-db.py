"""Chụp CSDL tài khoản (app.db) thành MỘT file nhất quán, dùng cho sao-luu.ps1.

CSDL chạy chế độ WAL: phần ghi mới nằm ở app.db-wal cho tới khi được gộp, nên chép file thô lúc máy chủ đang chạy
có thể ra bản thiếu hoặc lệch. API backup của SQLite đọc đúng một thời điểm, kết quả không cần file -wal/-shm đi kèm.

Cách dùng: python -I sao-luu-db.py <app.db nguồn> <file đích>
"""

import sqlite3
import sys


def main() -> int:
    src, dst = sys.argv[1], sys.argv[2]
    s = sqlite3.connect(src, timeout=30)
    d = sqlite3.connect(dst)
    try:
        s.backup(d)
        ok = d.execute("PRAGMA integrity_check").fetchone()[0] == "ok"
    finally:
        d.close()
        s.close()
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
