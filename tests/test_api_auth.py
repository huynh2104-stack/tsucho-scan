"""Đăng nhập & tách dữ liệu theo người dùng.

Bài test quan trọng nhất ở đây là `test_moi_route_du_lieu_deu_doi_dang_nhap`:
nó tự quét MỌI route trong app, nên thêm route mới mà quên khoá là test đỏ
ngay — không phải nhớ bằng đầu.
"""

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
