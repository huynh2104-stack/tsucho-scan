"""Mọi test chạy trên thư mục dữ liệu tạm — không bao giờ ghi vào `.data` thật.

`api.main` chạy `auth.init_db()` ngay lúc import, nên biến này phải được đặt
TRƯỚC khi test nào import `api`. Các test cần cô lập sâu hơn (mỗi test một thư
mục) vẫn tự `monkeypatch` như cũ.
"""

import os
import shutil
import tempfile

import pytest

_TMP = None
if "TSUCHO_DATA_DIR" not in os.environ:        # người chạy tự đặt thì tôn trọng
    _TMP = tempfile.mkdtemp(prefix="tsucho-test-")
    os.environ["TSUCHO_DATA_DIR"] = _TMP


# Khoá thật trong `.env` của máy dev KHÔNG được lọt vào test: `extract._resolve_model()` gọi `load_dotenv()` giữa chừng,
# và nó chỉ bỏ qua biến ĐÃ CÓ (kể cả rỗng). Đặt rỗng sẵn ⇒ test không gửi thư thật, không đòi Turnstile, không
# bật Google/LINE trừ khi chính test đó monkeypatch.setenv.
for _k in ("TURNSTILE_SITE_KEY", "TURNSTILE_SECRET_KEY", "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET",
           "LINE_CHANNEL_ID", "LINE_CHANNEL_SECRET", "RESEND_API_KEY", "TSUCHO_PUBLIC_URL", "TSUCHO_ADMIN_EMAILS"):
    os.environ.setdefault(_k, "")


def pytest_sessionfinish(session, exitstatus):
    if _TMP:
        shutil.rmtree(_TMP, ignore_errors=True)


@pytest.fixture(autouse=True)
def _fast_scrypt_in_tests(monkeypatch):
    """(Audit 3) Hạ chi phí scrypt trong pytest để chạy nhanh; sản phẩm giữ p=5 (test_hardening_r3 kiểm riêng)."""
    from api import auth

    monkeypatch.setattr(auth, "_SCRYPT", {"n": 2**10, "r": 8, "p": 1})
    monkeypatch.setattr(auth, "_DUMMY_HASH", None)
