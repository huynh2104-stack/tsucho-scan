"""Tài khoản DÙNG THỬ — để người lạ xem được sản phẩm mà không phải đăng ký.

Vì sao cần: người xem (nhất là dân IT hoặc kế toán cẩn thận) rất ngại tạo tài
khoản trên một trang lạ. Cho sẵn vài tài khoản dùng chung thì họ bấm một cái là
vào xem được. Cách tự đăng ký vẫn giữ nguyên, không bỏ.

Khai báo bằng BIẾN MÔI TRƯỜNG, không viết thẳng vào mã:

    TSUCHO_DEMO_ACCOUNTS="demo01@tsucho.test:xem-thu-2026:Tài khoản dùng thử 1|
                          demo02@tsucho.test:xem-thu-2026:Tài khoản dùng thử 2"

    (dạng  email:mật_khẩu:nhãn  ngăn nhau bằng dấu |, nhãn có thể bỏ trống)

Không đặt biến này thì mọi thứ ở đây im lặng: không tạo tài khoản nào, trang
đăng nhập không hiện khối dùng thử. Nhờ vậy máy phát triển và máy thật tự do
khác nhau, và mật khẩu dùng thử không nằm trong kho mã nguồn công khai.

HẠN MỨC QUÉT của tài khoản dùng thử (`TSUCHO_DEMO_SCAN_LIMIT`, mặc định 6) nay do `api/quota.py` lo
chung với mọi loại tài khoản; ở đây chỉ còn danh sách và việc tạo tài khoản.
"""

from __future__ import annotations

import os
import time
import uuid
from dataclasses import dataclass

from . import auth

ENV_ACCOUNTS = "TSUCHO_DEMO_ACCOUNTS"


@dataclass(frozen=True)
class TaiKhoan:
    email: str
    password: str
    label: str


def danh_sach() -> list[TaiKhoan]:
    """Đọc khai báo từ biến môi trường. Dòng nào hỏng thì bỏ qua, không làm sập."""
    tho = os.environ.get(ENV_ACCOUNTS, "").strip()
    if not tho:
        return []
    ra: list[TaiKhoan] = []
    for phan in tho.split("|"):
        phan = phan.strip()
        if not phan:
            continue
        manh = [x.strip() for x in phan.split(":")]
        if len(manh) < 2 or not manh[0] or not manh[1]:
            continue
        email = auth.normalize_email(manh[0])
        nhan = manh[2] if len(manh) > 2 and manh[2] else email
        ra.append(TaiKhoan(email=email, password=manh[1], label=nhan))
    return ra


def la_demo(email: str) -> bool:
    e = auth.normalize_email(email)
    return any(t.email == e for t in danh_sach())


def tao_neu_thieu() -> int:
    """Tạo các tài khoản dùng thử còn thiếu. Gọi lúc máy chủ khởi động.

    Luôn ghi thẳng role 'user', kind 'demo', đã xác minh (tài khoản công khai tuyệt đối không là admin).

    Tài khoản đã có thì để nguyên mật khẩu (người thật có thể đang dùng email đó), chỉ bảo đảm nó mang
    kind 'demo' để hạn mức đúng loại.
    """
    tao = 0
    for t in danh_sach():
        if auth.get_by_email(t.email):
            with auth._db() as conn:
                conn.execute(
                    "UPDATE users SET kind = 'demo', email_verified = 1 WHERE email = ? AND kind = 'member'",
                    (t.email,),
                )
            continue
        with auth._db() as conn:
            conn.execute(
                "INSERT OR IGNORE INTO users (id, email, password_hash, role, created_at, kind, email_verified)"
                " VALUES (?, ?, ?, 'user', ?, 'demo', 1)",
                (uuid.uuid4().hex[:12], t.email, auth.hash_password(t.password), time.time()),
            )
        tao += 1
    return tao
