"""Đăng nhập & tách dữ liệu theo người dùng.

Bài test quan trọng nhất ở đây là `test_moi_route_du_lieu_deu_doi_dang_nhap`:
nó tự quét MỌI route trong app, nên thêm route mới mà quên khoá là test đỏ
ngay — không phải nhớ bằng đầu.
"""

import time

import pytest
from fastapi.testclient import TestClient

from api import auth, main, workspace

# Route ai cũng gọi được — số còn lại bắt buộc phải đăng nhập
PUBLIC = {
    "/api/health",
    "/api/auth/register",
    "/api/auth/login",
    "/api/auth/logout",
    "/docs",
    "/docs/oauth2-redirect",
    "/openapi.json",
    "/redoc",
    # Trang web tĩnh: phải với tới được /login thì mới đăng nhập được.
    # Chỉ có ở bản đã build (`npm run build` sinh ra web/out).
    "/{path:path}",
}


@pytest.fixture
def client(tmp_path, monkeypatch):
    """App chạy trên thư mục dữ liệu tạm — không đụng `.data` thật."""
    monkeypatch.setattr(workspace, "DATA_DIR", tmp_path)
    monkeypatch.setattr(workspace, "WS_DIR", tmp_path / "ws")
    monkeypatch.setattr(workspace, "_cache", {})
    monkeypatch.setattr(auth, "DB_PATH", tmp_path / "app.db")
    auth.init_db()
    with TestClient(main.app) as c:
        yield c


def register(client, email="a@b.com", password="matkhau123"):
    r = client.post("/api/auth/register", json={"email": email, "password": password})
    assert r.status_code == 200, r.text
    return r.json()


# ── Khoá cửa ─────────────────────────────────────────────────────────

def test_moi_route_du_lieu_deu_doi_dang_nhap(client):
    """Không route nào chạm dữ liệu sổ mà chưa đăng nhập."""
    sot = []
    for route in main.app.routes:
        path = getattr(route, "path", "")
        if path in PUBLIC or not hasattr(route, "methods"):
            continue
        url = path.replace("{ws_id}", "x").replace("{sheet_id}", "y").replace(
            "{job_id}", "z"
        )
        for method in route.methods - {"HEAD", "OPTIONS"}:
            r = client.request(method, url, json={})
            if r.status_code != 401:
                sot.append(f"{method} {path} → {r.status_code}")
    assert not sot, "route chưa khoá: " + ", ".join(sot)


def test_khong_xem_duoc_workspace_cua_nguoi_khac(client):
    register(client, "an@vd.com")
    ws_id = client.post("/api/ws").json()["id"]
    assert client.get(f"/api/ws/{ws_id}").status_code == 200

    client.post("/api/auth/logout")
    register(client, "binh@vd.com")
    # 404 chứ không phải 403: nói "có nhưng không cho xem" đã là tiết lộ
    assert client.get(f"/api/ws/{ws_id}").status_code == 404
    assert client.get("/api/ws").json()["workspaces"] == []


# ── Đăng ký / đăng nhập ──────────────────────────────────────────────

def test_dang_ky_roi_dang_nhap_lai(client):
    register(client, "an@vd.com", "matkhau123")
    client.post("/api/auth/logout")
    assert client.get("/api/auth/me").status_code == 401

    r = client.post(
        "/api/auth/login", json={"email": "AN@VD.com", "password": "matkhau123"}
    )
    assert r.status_code == 200, "email phải không phân biệt hoa thường"
    assert client.get("/api/auth/me").json()["email"] == "an@vd.com"


def test_dang_xuat_huy_phien_that_su(client):
    register(client)
    token = client.cookies.get(auth.COOKIE)
    client.post("/api/auth/logout")
    # Dùng lại token cũ cũng vô ích — phiên đã bị xoá khỏi CSDL
    client.cookies.set(auth.COOKIE, token)
    assert client.get("/api/auth/me").status_code == 401


def test_sai_mat_khau_va_sai_email_bao_giong_nhau(client):
    register(client, "an@vd.com", "matkhau123")
    sai_mk = client.post(
        "/api/auth/login", json={"email": "an@vd.com", "password": "sai-be-bet"}
    )
    khong_co = client.post(
        "/api/auth/login", json={"email": "chua@co.com", "password": "matkhau123"}
    )
    assert sai_mk.status_code == khong_co.status_code == 401
    assert sai_mk.json()["detail"] == khong_co.json()["detail"]


def test_tu_choi_email_hong_va_mat_khau_ngan(client):
    assert client.post(
        "/api/auth/register", json={"email": "khong-phai-email", "password": "matkhau123"}
    ).status_code == 400
    assert client.post(
        "/api/auth/register", json={"email": "an@vd.com", "password": "ngan"}
    ).status_code == 400


def test_khong_dang_ky_trung_email(client):
    register(client, "an@vd.com")
    r = client.post("/api/auth/register", json={"email": "AN@vd.com", "password": "matkhau123"})
    assert r.status_code == 400


# ── Chống dò mật khẩu ────────────────────────────────────────────────

def sai_mat_khau(client, email="an@vd.com", lan=1):
    for _ in range(lan):
        r = client.post("/api/auth/login", json={"email": email, "password": "sai-be-bet"})
    return r


def test_sai_qua_nguong_thi_bi_khoa(client):
    register(client, "an@vd.com", "matkhau123")
    client.post("/api/auth/logout")

    assert sai_mat_khau(client, lan=auth.MAX_FAILS_EMAIL - 1).status_code == 401
    assert sai_mat_khau(client).status_code == 401, "lần chạm ngưỡng vẫn là 401"

    # Đã khoá: lần sau bị chặn NGAY, kể cả mật khẩu ĐÚNG — có thế mới chặn được
    # dò, vì nếu vẫn kiểm tra thì kẻ dò vẫn biết lần nào đoán trúng.
    r = client.post("/api/auth/login", json={"email": "an@vd.com", "password": "matkhau123"})
    assert r.status_code == 429
    assert r.json()["detail"]["kind"] == "locked"
    assert r.json()["detail"]["seconds"] > 0


def test_dang_nhap_dung_xoa_bo_dem(client):
    register(client, "an@vd.com", "matkhau123")
    client.post("/api/auth/logout")

    sai_mat_khau(client, lan=auth.MAX_FAILS_EMAIL - 1)
    assert client.post(
        "/api/auth/login", json={"email": "an@vd.com", "password": "matkhau123"}
    ).status_code == 200
    client.post("/api/auth/logout")

    # Bộ đếm đã về 0 → lại được sai đủ ngưỡng lần nữa mà chưa bị khoá
    assert sai_mat_khau(client, lan=auth.MAX_FAILS_EMAIL - 1).status_code == 401


def test_khoa_het_han_thi_vao_lai_duoc(client):
    register(client, "an@vd.com", "matkhau123")
    client.post("/api/auth/logout")
    sai_mat_khau(client, lan=auth.MAX_FAILS_EMAIL)

    # Dời hạn khoá về quá khứ thay vì chờ thật 15 phút
    with auth._db() as conn:
        conn.execute("UPDATE login_fails SET locked_until = ?", (time.time() - 1,))

    assert client.post(
        "/api/auth/login", json={"email": "an@vd.com", "password": "matkhau123"}
    ).status_code == 200


def test_email_khong_ton_tai_cung_bi_khoa(client):
    """Nếu chỉ khoá email CÓ THẬT thì chính cái khoá lại tố cáo tài khoản nào tồn tại."""
    register(client, "an@vd.com", "matkhau123")
    client.post("/api/auth/logout")

    sai_mat_khau(client, email="chua@co.com", lan=auth.MAX_FAILS_EMAIL)
    r = client.post("/api/auth/login", json={"email": "chua@co.com", "password": "x"})
    assert r.status_code == 429


def test_khoa_theo_email_khong_lam_ket_nguoi_khac(client):
    """Người dùng khác trên cùng máy vẫn vào được, miễn chưa chạm ngưỡng IP."""
    register(client, "an@vd.com", "matkhau123")
    client.post("/api/auth/logout")
    register(client, "binh@vd.com", "matkhau456")
    client.post("/api/auth/logout")

    sai_mat_khau(client, email="an@vd.com", lan=auth.MAX_FAILS_EMAIL)
    assert client.post(
        "/api/auth/login", json={"email": "binh@vd.com", "password": "matkhau456"}
    ).status_code == 200


def test_khoa_theo_ip_khi_rai_qua_nhieu_email(client):
    """Đổi email mỗi lần đoán thì khoá theo email không bắt được — cần khoá IP."""
    for i in range(auth.MAX_FAILS_IP):
        client.post("/api/auth/login", json={"email": f"ai{i}@vd.com", "password": "x"})

    r = client.post("/api/auth/login", json={"email": "moi-tinh@vd.com", "password": "x"})
    assert r.status_code == 429


def test_khong_tin_x_forwarded_for_khi_chua_bat(client, monkeypatch):
    """Header giả được. Chưa bật TSUCHO_TRUST_PROXY thì đổi header không thoát khoá."""
    monkeypatch.delenv("TSUCHO_TRUST_PROXY", raising=False)
    register(client, "an@vd.com", "matkhau123")
    client.post("/api/auth/logout")
    sai_mat_khau(client, lan=auth.MAX_FAILS_EMAIL)

    r = client.post(
        "/api/auth/login",
        json={"email": "an@vd.com", "password": "matkhau123"},
        headers={"X-Forwarded-For": "9.9.9.9"},
    )
    assert r.status_code == 429


# ── Mật khẩu ─────────────────────────────────────────────────────────

def test_mat_khau_khong_luu_tho(client):
    register(client, "an@vd.com", "matkhau123")
    _, stored = auth.get_by_email("an@vd.com")
    assert "matkhau123" not in stored
    assert stored.startswith("scrypt$")
    assert auth.verify_password("matkhau123", stored)
    assert not auth.verify_password("matkhau124", stored)


def test_hai_lan_bam_cung_mat_khau_ra_khac_nhau():
    """Có muối riêng từng tài khoản: hai người trùng mật khẩu vẫn khác hash."""
    assert auth.hash_password("matkhau123") != auth.hash_password("matkhau123")


# ── Người đầu tiên ───────────────────────────────────────────────────

def test_nguoi_dau_tien_la_admin_va_nhan_du_lieu_cu(client):
    cu = workspace.create()          # workspace tạo từ hồi chưa có đăng nhập
    assert cu.owner == ""

    dau = register(client, "an@vd.com")
    assert dau["role"] == "admin"
    assert dau["claimed_workspaces"] == 1
    assert client.get(f"/api/ws/{cu.id}").status_code == 200

    client.post("/api/auth/logout")
    sau = register(client, "binh@vd.com")
    assert sau["role"] == "user"
    assert sau["claimed_workspaces"] == 0
    assert client.get(f"/api/ws/{cu.id}").status_code == 404
