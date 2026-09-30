"""Mọi test chạy trên thư mục dữ liệu tạm — không bao giờ ghi vào `.data` thật.

`api.main` chạy `auth.init_db()` ngay lúc import, nên biến này phải được đặt
TRƯỚC khi test nào import `api`. Các test cần cô lập sâu hơn (mỗi test một thư
mục) vẫn tự `monkeypatch` như cũ.
"""

import os
import shutil
import tempfile

_TMP = None
if "TSUCHO_DATA_DIR" not in os.environ:        # người chạy tự đặt thì tôn trọng
    _TMP = tempfile.mkdtemp(prefix="tsucho-test-")
    os.environ["TSUCHO_DATA_DIR"] = _TMP


def pytest_sessionfinish(session, exitstatus):
    if _TMP:
        shutil.rmtree(_TMP, ignore_errors=True)
