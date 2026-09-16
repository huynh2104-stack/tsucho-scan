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

HẠN MỨC QUÉT. Tài khoản dùng thử là tài khoản CÔNG KHAI: ai cũng đăng nhập
được. Mỗi mặt sổ quét thật là một lượt gọi mô hình, mà gói miễn phí chỉ có
20 lượt/ngày — một người tò mò bấm quét cả tập là hết sạch phần của người
khác. Nên mỗi tài khoản dùng thử chỉ được quét `TSUCHO_DEMO_SCAN_LIMIT` mặt
mỗi ngày (mặc định 6). Sổ MẪU không tính: nó không gọi mô hình.
"""

from __future__ import annotations

import os
import time
import uuid
from dataclasses import dataclass

from . import auth

ENV_ACCOUNTS = "TSUCHO_DEMO_ACCOUNTS"
ENV_LIMIT = "TSUCHO_DEMO_SCAN_LIMIT"
MAC_DINH_HAN_MUC = 6


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


def han_muc() -> int:
    try:
        return max(0, int(os.environ.get(ENV_LIMIT, MAC_DINH_HAN_MUC)))
    except ValueError:
        return MAC_DINH_HAN_MUC


def la_demo(email: str) -> bool:
    e = auth.normalize_email(email)
    return any(t.email == e for t in danh_sach())


def tao_neu_thieu() -> int:
    """Tạo các tài khoản dùng thử còn thiếu. Gọi lúc máy chủ khởi động.

    KHÔNG dùng `auth.create_user`: hàm đó phong người đăng ký ĐẦU TIÊN làm
    admin. Máy chủ mới tinh mà tài khoản dùng thử chạy trước thì một tài khoản
    công khai sẽ thành admin — luôn ghi thẳng role 'user'.

    Tài khoản đã có thì để nguyên, không đặt lại mật khẩu: người thật có thể
    đang dùng email đó.
    """
    tao = 0
    for t in danh_sach():
        if auth.get_by_email(t.email):
            continue
        with auth._db() as conn:
            conn.execute(
                "INSERT OR IGNORE INTO users (id, email, password_hash, role, created_at)"
                " VALUES (?, ?, ?, 'user', ?)",
                (uuid.uuid4().hex[:12], t.email, auth.hash_password(t.password), time.time()),
            )
        tao += 1
    return tao


def _hom_nay() -> str:
    return time.strftime("%Y-%m-%d", time.localtime())


def da_quet_hom_nay(user_id: str) -> int:
    with auth._db() as conn:
        row = conn.execute(
            "SELECT faces FROM demo_usage WHERE user_id = ? AND day = ?",
            (user_id, _hom_nay()),
        ).fetchone()
    return int(row["faces"]) if row else 0


def ghi_nhan(user_id: str, so_mat: int) -> None:
    with auth._db() as conn:
        conn.execute(
            "INSERT INTO demo_usage (user_id, day, faces) VALUES (?, ?, ?)"
            " ON CONFLICT(user_id, day) DO UPDATE SET faces = faces + excluded.faces",
            (user_id, _hom_nay(), so_mat),
        )


def con_lai(user: auth.User) -> int | None:
    """Số mặt còn được quét hôm nay. `None` = không phải tài khoản dùng thử."""
    if not la_demo(user.email):
        return None
    return max(0, han_muc() - da_quet_hom_nay(user.id))
