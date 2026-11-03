"""Bản demo cho khách Nhật (03/11/2026): đăng nhập mở, cài đặt theo máy cho tài khoản chung, sổ mẫu thật.

- Đăng nhập mở: tên tuỳ ý + mật khẩu tuỳ ý; tên mới tự tạo tài khoản (role user), tên cũ vẫn phải đúng mật khẩu.
- Tài khoản dùng thử là tài khoản CHUNG ⇒ ngôn ngữ/giao diện không lưu lên máy chủ (người trước không áp lên người sau).
- Sổ mẫu thật (samples/*.jpg): thêm vào chưa quét; quét đúng ảnh mẫu thì dùng kết quả đọc sẵn, KHÔNG gọi mô hình,
  không tính vào hạn mức dùng thử.
"""

import time

import pytest
from fastapi.testclient import TestClient

import extract
from api import auth, demo, imgjobs, main, workspace


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(workspace, "DATA_DIR", tmp_path)
    monkeypatch.setattr(workspace, "WS_DIR", tmp_path / "ws")
    monkeypatch.setattr(workspace, "_cache", {})
    monkeypatch.setattr(auth, "DB_PATH", tmp_path / "app.db")
    monkeypatch.setattr(auth, "OPEN_LOGIN", True)
    auth.init_db()
    with TestClient(main.app) as c:
        yield c
    imgjobs.wait_idle()


@pytest.fixture
def no_model(monkeypatch):
    """Gọi mô hình là test đỏ: sổ mẫu phải đi đường đọc sẵn."""
    def boom(*a, **k):
        raise AssertionError("sổ mẫu không được gọi mô hình")

    monkeypatch.setattr(extract, "_call_gemini", boom)
    monkeypatch.setattr(extract, "_call_claude", boom)
    monkeypatch.setattr(extract, "SAMPLE_DELAY_S", 0)
    monkeypatch.setenv("EXTRACT_MODEL", "gemini-3.1-flash-lite")
    monkeypatch.setenv("GEMINI_API_KEY", "khong-dung-toi")


# ── Đăng nhập mở ──────────────────────────────────────────────────────

def test_ten_moi_tu_tao_tai_khoan_va_vao_luon(client):
    r = client.post("/api/auth/login", json={"email": " Tanaka ", "password": "1"})
    assert r.status_code == 200, r.text
    assert r.json()["created"] is True
    assert r.json()["role"] == "user"                  # không bao giờ thành admin dù là người đầu tiên
    assert client.get("/api/auth/me").json()["email"] == "tanaka"

    client.post("/api/auth/logout")
    r = client.post("/api/auth/login", json={"email": "TANAKA", "password": "1"})
    assert r.status_code == 200 and "created" not in r.json()


def test_ten_da_co_van_phai_dung_mat_khau(client):
    assert client.post("/api/auth/login", json={"email": "sato", "password": "abc"}).status_code == 200
    client.post("/api/auth/logout")
    r = client.post("/api/auth/login", json={"email": "sato", "password": "sai"})
    assert r.status_code == 401
    assert client.get("/api/auth/me").status_code == 401


def test_khong_nhan_ten_hoac_mat_khau_rong(client):
    r = client.post("/api/auth/login", json={"email": "   ", "password": "1"})
    assert r.status_code == 400 and r.json()["detail"]["kind"] == "bad_id"
    r = client.post("/api/auth/login", json={"email": "abc", "password": ""})
    assert r.status_code == 400 and r.json()["detail"]["kind"] == "weak_password"
    assert auth.count_users() == 0


def test_trang_dang_nhap_biet_dang_mo(client, monkeypatch):
    assert client.get("/api/auth/demo").json()["open_login"] is True
    monkeypatch.setattr(auth, "OPEN_LOGIN", False)
    assert client.get("/api/auth/demo").json()["open_login"] is False
    r = client.post("/api/auth/login", json={"email": "nguoi-la", "password": "1"})
    assert r.status_code == 401 and auth.count_users() == 0


# ── Tài khoản chung: ngôn ngữ / giao diện theo từng máy ───────────────

def test_tai_khoan_dung_thu_khong_luu_ngon_ngu_giao_dien(client, monkeypatch):
    monkeypatch.setenv("TSUCHO_DEMO_ACCOUNTS", "demo@x.test:matkhau-demo")
    demo.tao_neu_thieu()
    client.post("/api/auth/login", json={"email": "demo@x.test", "password": "matkhau-demo"})

    r = client.put("/api/me/prefs", json={"lang": "vi", "theme": "dark", "fontScale": 1.15})
    assert r.status_code == 200, r.text
    assert r.json()["lang"] is None and r.json()["theme"] is None
    assert r.json()["fontScale"] == 1.15              # cài đặt khác vẫn lưu bình thường
    got = client.get("/api/me/prefs").json()
    assert got["lang"] is None and got["theme"] is None


def test_tai_khoan_rieng_van_luu_ngon_ngu(client):
    client.post("/api/auth/login", json={"email": "rieng", "password": "1"})
    client.put("/api/me/prefs", json={"lang": "vi", "theme": "dark"})
    got = client.get("/api/me/prefs").json()
    assert got["lang"] == "vi" and got["theme"] == "dark"


# ── Sổ mẫu thật ───────────────────────────────────────────────────────

def test_doc_san_khong_goi_mo_hinh(no_model):
    out = extract.extract_transactions([extract.SAMPLE_DIR / "yucho.jpg"])
    assert out["cached"] is True
    assert out["usage"] == {"input_tokens": 0, "output_tokens": 0}
    assert sum(len(a["transactions"]) for a in out["accounts"]) == 24
    assert extract.is_sample_file(extract.SAMPLE_DIR / "fukuoka.jpg")


def test_anh_mau_bi_sua_thi_khong_con_la_mau(tmp_path):
    f = tmp_path / "x.jpg"
    f.write_bytes((extract.SAMPLE_DIR / "fukuoka.jpg").read_bytes() + b"\0")
    assert not extract.is_sample_file(f)


def _wait_job(client, job_id: str) -> dict:
    for _ in range(200):
        j = client.get(f"/api/jobs/{job_id}").json()
        if j["status"] in ("done", "error"):
            return j
        time.sleep(0.05)
    raise AssertionError("quét sổ mẫu không xong")


def test_them_so_mau_roi_quet_khong_tinh_han_muc(client, monkeypatch, no_model):
    monkeypatch.setenv("TSUCHO_DEMO_ACCOUNTS", "demo@x.test:matkhau-demo")
    monkeypatch.setenv("TSUCHO_DEMO_SCAN_LIMIT", "0")          # hết sạch lượt quét thật
    demo.tao_neu_thieu()
    client.post("/api/auth/login", json={"email": "demo@x.test", "password": "matkhau-demo"})
    ws_id = client.post("/api/ws").json()["id"]

    r = client.post(f"/api/ws/{ws_id}/sample-books")
    assert r.status_code == 200, r.text
    body = r.json()
    assert len(body["added"]) == 2
    sheets = {s["id"]: s for s in body["sheets"]}
    assert [sheets[i]["name"] for i in body["added"]] == ["福岡銀行通帳", "ゆうちょ銀行通帳"]
    assert all(sheets[i]["status"] == "ready" and not sheets[i]["scanned"] for i in body["added"])

    r = client.post(f"/api/ws/{ws_id}/scan", json={"sheet_ids": body["added"]})
    assert r.status_code == 200, r.text                         # hạn mức 0 mà vẫn quét được sổ mẫu
    assert _wait_job(client, r.json()["id"])["status"] == "done"

    res = client.get(f"/api/ws/{ws_id}").json()["results"]
    rows = {sid: sum(len(b["rows"]) for b in res[sid]["blocks"]) for sid in body["added"]}
    assert rows[body["added"][1]] == 24
    assert rows[body["added"][0]] >= 24
    user = auth.get_by_email("demo@x.test")[0]
    assert demo.da_quet_hom_nay(user.id) == 0                  # không trừ lượt nào
