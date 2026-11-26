"""Báo trước một lần quét tốn gì (task 4.3) + hạn mức dùng thử công bằng.

Mọi thứ $0: người gọi model là hàm giả, cache trỏ vào thư mục tạm. Không bao giờ gọi Gemini/Claude thật.
"""

import hashlib
import io
import json
import threading
import time
from collections import OrderedDict

import pytest
from fastapi.testclient import TestClient
from PIL import Image

import core
import extract
from api import auth, demo, imgjobs, main, quota, workspace

MODEL = "gemini-3.1-flash-lite"
MAT_KHAU = "matkhau-demo"


def _trial(client, login_id, password="1"):
    """Tạo tài khoản «お試し» (nếu chưa có) rồi vào bằng /api/auth/trial — /trial không còn tự tạo."""
    if not auth.get_trial(login_id):
        auth.create_trial_user(login_id, password)
    return client.post("/api/auth/trial", json={"id": login_id, "password": password})


# ── Dựng môi trường ───────────────────────────────────────────────────

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
def model(tmp_path, monkeypatch):
    """Người gọi model giả (đếm số lần gọi) + cache tạm + khoá/model giả."""
    monkeypatch.setattr(extract, "CACHE_DIR", tmp_path / "cache")
    monkeypatch.setattr(extract, "SAMPLE_DELAY_S", 0)
    monkeypatch.setattr(extract, "_unit_cache", OrderedDict())      # nhớ đệm băm: mỗi test một cái
    monkeypatch.setenv("EXTRACT_MODEL", MODEL)
    monkeypatch.setenv("GEMINI_API_KEY", "khong-dung-toi")
    calls = []

    def gia(model_name, prompt, files, on_progress=None):
        calls.append(model_name)
        text = json.dumps({"accounts": [{
            "bank_name": "福岡銀行", "store_no": "286", "account_no": "615001", "holder": None,
            "transactions": [{
                "date_raw": "07-05-01", "kind": None, "description": None, "extra_text": None,
                "store_code": None, "amount_out": None, "amount_in": 10000, "balance": 10000,
                "low_confidence": False,
            }],
        }]}, ensure_ascii=False)
        return text, {"input_tokens": 10, "output_tokens": 10}

    monkeypatch.setattr(extract, "_call_gemini", gia)
    monkeypatch.setattr(extract, "_call_claude", gia)
    return calls


def _jpeg(mau: int) -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (40, 40), (mau, 200, 200)).save(buf, "JPEG")
    return buf.getvalue()


def _them_mat(ws_id: str, sid: str, data: bytes, ext: str = ".jpg") -> None:
    ws = workspace.load(ws_id)
    s = workspace.Sheet(id=sid, name=f"Mặt {sid}", origin=f"{sid}{ext}", source_ext=ext)
    d = s.dir(ws_id)
    d.mkdir(parents=True, exist_ok=True)
    (d / f"source{ext}").write_bytes(data)
    ws.sheets.append(s)
    ws.save()


def _ho_so(client, email="thuong", demo_acc=False):
    """Đăng nhập, tạo hồ sơ có 1 mặt MẪU (m) + 1 mặt thường chưa quét (n).

    Tài khoản demo vào bằng /login; còn lại là «お試し» (trial) qua /trial."""
    if email == "demo@x.test":
        client.post("/api/auth/login", json={"email": email, "password": MAT_KHAU})
    else:
        _trial(client, email, MAT_KHAU)
    ws_id = client.post("/api/ws").json()["id"]
    _them_mat(ws_id, "m", (extract.SAMPLE_DIR / "yucho.jpg").read_bytes())
    _them_mat(ws_id, "n", _jpeg(10))
    return ws_id


def _dung_thu(client, monkeypatch, limit="6"):
    monkeypatch.setenv("TSUCHO_DEMO_ACCOUNTS", f"demo@x.test:{MAT_KHAU}")
    monkeypatch.setenv("TSUCHO_DEMO_SCAN_LIMIT", limit)
    demo.tao_neu_thieu()
    return _ho_so(client, "demo@x.test")


def _cho_job(client, job_id: str) -> dict:
    for _ in range(200):
        j = client.get(f"/api/jobs/{job_id}").json()
        if j["status"] in ("done", "error"):
            return j
        time.sleep(0.05)
    raise AssertionError("quét không xong")


def _quet(client, ws_id, ids, **extra):
    r = client.post(f"/api/ws/{ws_id}/scan", json={"sheet_ids": ids, **extra})
    if r.status_code == 200:
        assert _cho_job(client, r.json()["id"])["status"] == "done"
    return r


def _uoc(client, ws_id, ids, **extra):
    return client.post(f"/api/ws/{ws_id}/scan/estimate", json={"sheet_ids": ids, **extra})


# ── Khoá cache ────────────────────────────────────────────────────────

def test_dong_bang_khoa_cache():
    """Công thức khoá viết cứng ở đây: ai đổi công thức là cache của mọi người mất → test đỏ."""
    assert extract._CACHE_VERSION == "10"
    assert extract._cache_key(b"abc", 90, "gemini-2.5-flash", "PROMPT 通帳") == (
        "f2aa92f8d2d075654fc64045629bf0acaa3dbb1e983d83cdecc9d7e41dc9f1ee"
    )
    tay = hashlib.sha256(b"abc" + b"|v10|90|gemini-2.5-flash|" + "PROMPT 通帳".encode()).hexdigest()
    assert extract._cache_key(b"abc", 90, "gemini-2.5-flash", "PROMPT 通帳") == tay


def test_cache_status_trung_khoa_quet_that(tmp_path, monkeypatch, model):
    f = tmp_path / "a.jpg"
    f.write_bytes(_jpeg(33))
    assert extract.cache_status([f]) == [{"units": 1, "free": 0, "bad": 0, "sample": 0}]

    extract.extract_transactions([f])
    assert len(model) == 1
    prompt = extract._load_system_prompt()
    file_cache = extract.CACHE_DIR / f"{extract._cache_key(f.read_bytes(), 0, MODEL, prompt)}.json"
    assert file_cache.is_file(), "khoá của cache_status phải đúng bằng khoá _extract_single ghi ra"
    assert extract.cache_status([f]) == [{"units": 1, "free": 1, "bad": 0, "sample": 0}]

    # Đổi xoay hoặc model → khoá khác → chưa có sẵn
    assert extract.cache_status([f], rotate=90) == [{"units": 1, "free": 0, "bad": 0, "sample": 0}]
    assert extract.cache_status([f], model="gemini-2.5-flash") == [{"units": 1, "free": 0, "bad": 0, "sample": 0}]
    assert extract.cache_status([f], model=MODEL) == [{"units": 1, "free": 1, "bad": 0, "sample": 0}]


def test_cache_status_model_theo_bien_moi_truong(tmp_path, monkeypatch, model):
    f = tmp_path / "a.jpg"
    f.write_bytes(_jpeg(44))
    extract.extract_transactions([f])
    monkeypatch.setenv("EXTRACT_MODEL", "gemini-2.5-flash")
    assert extract.cache_status([f]) == [{"units": 1, "free": 0, "bad": 0, "sample": 0}]


def test_anh_mau_mien_phi_khi_khong_xoay(tmp_path, model):
    mau = extract.SAMPLE_DIR / "yucho.jpg"
    assert extract.cache_status([mau]) == [{"units": 1, "free": 1, "bad": 0, "sample": 1}]
    assert extract.cache_status([mau], rotate=90) == [{"units": 1, "free": 0, "bad": 0, "sample": 0}]


def test_cache_status_file_hong_khong_no(tmp_path, model):
    xau = tmp_path / "x.jpg"
    xau.write_bytes(b"khong phai anh")
    assert extract.cache_status([xau, tmp_path / "khong-co.jpg"]) == [
        {"units": 1, "free": 0, "bad": 1, "sample": 0}, {"units": 1, "free": 0, "bad": 1, "sample": 0},
    ]


def test_gia_uoc_tinh_theo_bang():
    assert core.estimate_pages_usd("gemini-3.1-flash-lite", 2) == pytest.approx(0.008)
    assert core.estimate_pages_usd("gemini-2.5-flash", 0) == 0
    assert core.estimate_pages_usd("model-la", 3) is None


# ── Route ước tính ────────────────────────────────────────────────────

def test_uoc_tinh_mot_mau_mot_thuong(client, model):
    ws_id = _ho_so(client)
    r = _uoc(client, ws_id, ["n", "m"])             # gửi lộn thứ tự: phải được sắp lại
    assert r.status_code == 200, r.text
    body = r.json()
    assert (body["pages"], body["free"], body["new"]) == (2, 1, 1)
    assert body["est_usd"] == 0.004 and body["model"] == MODEL
    assert (body["demo_left"], body["demo_limit"]) == (5, 5)             # tài khoản «お試し»: 5 mặt/ngày
    assert body["bad"] == 0
    assert body["per_sheet"] == [
        {"id": "m", "pages": 1, "free": 1, "bad": 0}, {"id": "n", "pages": 1, "free": 0, "bad": 0},
    ]
    assert model == []                                                  # không gọi model


def test_uoc_tinh_khong_doi_du_lieu(client, model):
    ws_id = _ho_so(client)
    truoc = (workspace.WS_DIR / ws_id / "meta.json").read_bytes()
    _uoc(client, ws_id, ["m", "n"])
    assert (workspace.WS_DIR / ws_id / "meta.json").read_bytes() == truoc
    assert not extract.CACHE_DIR.exists()


def test_uoc_tinh_sau_khi_quet_thi_het_moi(client, model):
    ws_id = _ho_so(client)
    assert _quet(client, ws_id, ["n"]).status_code == 200
    body = _uoc(client, ws_id, ["m", "n"]).json()
    assert (body["pages"], body["free"], body["new"], body["est_usd"]) == (2, 2, 0, 0)
    # bỏ cache → mặt thường lại tốn tiền, mặt mẫu vẫn miễn phí
    body = _uoc(client, ws_id, ["m", "n"], no_cache=True).json()
    assert (body["free"], body["new"]) == (1, 1)


def test_uoc_tinh_model_la_thi_khong_co_gia(client, model, monkeypatch):
    monkeypatch.setenv("EXTRACT_MODEL", "model-la")
    ws_id = _ho_so(client)
    body = _uoc(client, ws_id, ["n"]).json()
    assert body["est_usd"] is None and body["new"] == 1


def test_uoc_tinh_dung_thu_co_so_luot(client, model, monkeypatch):
    ws_id = _dung_thu(client, monkeypatch, "4")
    body = _uoc(client, ws_id, ["m", "n"]).json()
    assert (body["demo_left"], body["demo_limit"]) == (4, 4)


def test_uoc_tinh_bo_id_la_va_rong_thi_400(client, model):
    ws_id = _ho_so(client)
    body = _uoc(client, ws_id, ["n", "id-la"]).json()
    assert [x["id"] for x in body["per_sheet"]] == ["n"]
    assert _uoc(client, ws_id, []).status_code == 400
    r = client.post(f"/api/ws/{ws_id}/scan/estimate", json={})
    assert r.status_code == 400
    # id lạ hết → danh sách rỗng sau khi lọc: vẫn chỉ ra 0 trang (giống start_scan: không lỗi)
    assert _uoc(client, ws_id, ["id-la"]).json()["pages"] == 0


def test_uoc_tinh_ho_so_nguoi_khac_thi_404(client, model):
    ws_id = _ho_so(client, "chu")
    client.post("/api/auth/logout")
    _trial(client, "ke-la", MAT_KHAU)
    assert _uoc(client, ws_id, ["n"]).status_code == 404
    client.post("/api/auth/logout")
    assert _uoc(client, ws_id, ["n"]).status_code == 401


def test_hai_duong_scan_toi_dung_ham():
    """/scan/estimate và /scan là hai đường riêng, không nuốt nhau."""
    ham = {(r.path, tuple(sorted(r.methods))): r.endpoint.__name__
           for r in main.app.routes if hasattr(r, "endpoint")}
    assert ham[("/api/ws/{ws_id}/scan/estimate", ("POST",))] == "estimate_scan"
    assert ham[("/api/ws/{ws_id}/scan", ("POST",))] == "start_scan"


# ── Hạn mức dùng thử công bằng ────────────────────────────────────────

def _da_quet(email="demo@x.test") -> int:
    return quota.used(auth.get_by_email(email)[0].id)


def test_dung_thu_quet_mat_da_co_cache_khong_tru_luot(client, model, monkeypatch):
    ws_id = _dung_thu(client, monkeypatch, "6")
    assert _quet(client, ws_id, ["n"]).status_code == 200
    assert _da_quet() == 1 and len(model) == 1
    assert _quet(client, ws_id, ["n"]).status_code == 200          # lần hai: đã có cache
    assert _da_quet() == 1 and len(model) == 1


def test_dung_thu_mat_moi_tru_dung_mot(client, model, monkeypatch):
    ws_id = _dung_thu(client, monkeypatch, "6")
    assert _quet(client, ws_id, ["m", "n"]).status_code == 200      # mẫu miễn phí, n tốn 1
    assert _da_quet() == 1 and len(model) == 1


def test_dung_thu_no_cache_van_tru_luot(client, model, monkeypatch):
    ws_id = _dung_thu(client, monkeypatch, "6")
    _quet(client, ws_id, ["n"])
    assert _da_quet() == 1
    _quet(client, ws_id, ["n"], no_cache=True)                      # bỏ cache → gọi model lại
    assert _da_quet() == 2 and len(model) == 2


def test_dung_thu_het_luot_thi_429_nhung_mat_co_san_van_quet(client, model, monkeypatch):
    ws_id = _dung_thu(client, monkeypatch, "1")
    assert _quet(client, ws_id, ["n"]).status_code == 200           # dùng hết 1 lượt
    _them_mat(ws_id, "p", _jpeg(99))
    r = _quet(client, ws_id, ["p"])
    assert r.status_code == 429
    assert r.json()["detail"] == {"kind": "demo_quota", "limit": 1, "left": 0, "scope": "user"}
    assert _quet(client, ws_id, ["m", "n"]).status_code == 200      # mẫu + đã cache: không cần lượt
    assert _da_quet() == 1
    # bỏ cache cũng cần lượt → bị chặn
    assert _quet(client, ws_id, ["n"], no_cache=True).status_code == 429


# ── Vòng sửa sau kiểm duyệt ───────────────────────────────────────────

def _pdf(so_trang: int) -> bytes:
    import fitz

    doc = fitz.open()
    for i in range(so_trang):
        doc.new_page().insert_text((72, 72), f"07-05-0{i + 1} trang {i}")
    return doc.tobytes()


def test_pdf_nhieu_trang_units_bang_so_trang(tmp_path, model):
    f = tmp_path / "so.pdf"
    f.write_bytes(_pdf(3))
    assert extract.cache_status([f]) == [{"units": 3, "free": 0, "bad": 0, "sample": 0}]


def test_pdf_nhieu_trang_tinh_han_muc_theo_trang(client, model, monkeypatch):
    ws_id = _dung_thu(client, monkeypatch, "2")
    _them_mat(ws_id, "pdf", _pdf(3), ".pdf")
    body = _uoc(client, ws_id, ["pdf"]).json()
    assert (body["pages"], body["new"], body["demo_left"]) == (3, 3, 2)
    r = client.post(f"/api/ws/{ws_id}/scan", json={"sheet_ids": ["pdf"]})
    assert r.status_code == 429 and r.json()["detail"] == {"kind": "demo_quota", "limit": 2, "left": 2, "scope": "user"}
    assert _da_quet() == 0


def test_pdf_nhieu_trang_quet_tru_dung_so_trang(client, model, monkeypatch):
    ws_id = _dung_thu(client, monkeypatch, "3")
    _them_mat(ws_id, "pdf", _pdf(3), ".pdf")
    r = client.post(f"/api/ws/{ws_id}/scan", json={"sheet_ids": ["pdf"]})
    assert r.status_code == 200, r.text
    _cho_job(client, r.json()["id"])
    assert _da_quet() == 3 and len(model) == 3


def test_hai_mat_giong_het_nhau_uoc_tinh_tinh_ca_hai(client, model):
    """CHỦ Ý: trang thứ hai sẽ trúng cache của trang thứ nhất lúc quét, nhưng ước tính (và hạn
    mức) coi cả hai là trang mới — tính DƯ chấp nhận được, còn tính THIẾU thì không."""
    ws_id = _ho_so(client)
    _them_mat(ws_id, "n2", _jpeg(10))
    body = _uoc(client, ws_id, ["n", "n2"]).json()
    assert (body["pages"], body["free"], body["new"]) == (2, 0, 2)


def test_bad_file_hong_hoac_qua_lon_khong_tinh_la_trang_moi(client, model, monkeypatch):
    ws_id = _dung_thu(client, monkeypatch, "6")
    _them_mat(ws_id, "x", b"khong phai anh")
    body = _uoc(client, ws_id, ["x", "n"]).json()
    assert (body["pages"], body["free"], body["bad"], body["new"]) == (2, 0, 1, 1)
    assert {x["id"]: x["bad"] for x in body["per_sheet"]} == {"n": 0, "x": 1}
    r = client.post(f"/api/ws/{ws_id}/scan", json={"sheet_ids": ["x"]})
    assert r.status_code == 200
    assert _cho_job(client, r.json()["id"])["status"] == "error"
    assert _da_quet() == 0                          # không gọi model, không trừ lượt

    monkeypatch.setattr(extract, "MAX_IMAGE_MB", 0.00001)       # giờ ảnh nào cũng "quá lớn"
    extract._unit_cache.clear()                                  # (giới hạn là hằng số; xoá đệm cho test)
    assert _uoc(client, ws_id, ["n"]).json()["bad"] == 1
    r = client.post(f"/api/ws/{ws_id}/scan", json={"sheet_ids": ["n"]})
    assert _cho_job(client, r.json()["id"])["status"] == "error" and _da_quet() == 0


def test_loi_som_truoc_khi_goi_model_thi_hoan_luot(client, model, monkeypatch):
    ws_id = _dung_thu(client, monkeypatch, "6")
    monkeypatch.setattr(extract, "load_dotenv", lambda *a, **k: None)
    monkeypatch.delenv("GEMINI_API_KEY")            # thiếu key → báo lỗi trước khi vào trang đầu
    r = client.post(f"/api/ws/{ws_id}/scan", json={"sheet_ids": ["n"]})
    assert r.status_code == 200
    assert _cho_job(client, r.json()["id"])["status"] == "error"
    time.sleep(0.2)
    assert _da_quet() == 0 and model == []


def test_loi_sau_khi_da_vao_trang_dau_thi_khong_hoan(client, model, monkeypatch):
    ws_id = _dung_thu(client, monkeypatch, "6")

    def hong(*a, **k):
        raise extract.ExtractError("mạng đứt")

    monkeypatch.setattr(extract, "_call_gemini", hong)
    r = client.post(f"/api/ws/{ws_id}/scan", json={"sheet_ids": ["n"]})
    assert _cho_job(client, r.json()["id"])["status"] == "error"
    time.sleep(0.2)
    assert _da_quet() == 1                          # không chắc chưa gọi model → giữ nguyên


def test_tra_lai_khong_am(client, monkeypatch):
    _dung_thu(client, monkeypatch, "6")
    user = auth.get_by_email("demo@x.test")[0]
    keys = quota.key_names(user, "1.1.1.1")
    quota.refund(keys, 5)
    assert _da_quet() == 0
    assert quota.reserve(user, "1.1.1.1", 4) is True
    quota.refund(keys, 9)
    assert _da_quet() == 0


def test_hai_ho_so_quet_cung_luc_khong_vuot_han_muc(client, model, monkeypatch):
    ws1 = _dung_thu(client, monkeypatch, "2")
    ws2 = client.post("/api/ws").json()["id"]
    for ws, base in ((ws1, 50), (ws2, 70)):
        for k in range(2):
            _them_mat(ws, f"z{k}", _jpeg(base + k))
    # Làm chậm SAU bước tính để hai yêu cầu cùng qua phép kiểm sơ bộ rồi mới giữ chỗ
    goc = main._scan_units

    def cham(paths, no_cache):
        kq = goc(paths, no_cache)
        time.sleep(0.3)
        return kq

    monkeypatch.setattr(main, "_scan_units", cham)
    codes, job_ids = {}, {}

    def quet(ws):
        r = client.post(f"/api/ws/{ws}/scan", json={"sheet_ids": ["z0", "z1"]})
        codes[ws] = r.status_code
        if r.status_code == 200:
            job_ids[ws] = r.json()["id"]

    ts = [threading.Thread(target=quet, args=(w,)) for w in (ws1, ws2)]
    [t.start() for t in ts]
    [t.join(10) for t in ts]
    assert sorted(codes.values()) == [200, 429]
    assert _da_quet() == 2
    for jid in job_ids.values():
        _cho_job(client, jid)
    assert _da_quet() == 2


def test_sheet_ids_sai_kieu_thi_400_ca_hai_route(client, model):
    ws_id = _ho_so(client)
    for xau in ("abc", [1], [{"a": 1}], ["n", 5], None, {"n": 1}):
        for duong in ("scan", "scan/estimate"):
            r = client.post(f"/api/ws/{ws_id}/{duong}", json={"sheet_ids": xau})
            assert r.status_code == 400, (duong, xau, r.text)


def test_sonnet_5_khong_co_gia_uoc_tinh():
    assert core.estimate_pages_usd("claude-sonnet-5", 2) is None


# ── Nhớ đệm băm ───────────────────────────────────────────────────────

def test_khoa_ghep_tu_hasher_bang_cache_key(model):
    data = _jpeg(7)
    prompt = extract._load_system_prompt()
    h = hashlib.sha256(data)
    c = h.copy()
    c.update(f"|v{extract._CACHE_VERSION}|0|{MODEL}|".encode() + prompt.encode())
    assert c.hexdigest() == extract._cache_key(data, 0, MODEL, prompt)
    assert h.hexdigest() == hashlib.sha256(data).hexdigest()     # .copy() không làm hỏng bản gốc


def test_cache_status_lan_hai_khong_doc_lai_file(tmp_path, model, monkeypatch):
    f = tmp_path / "a.jpg"
    f.write_bytes(_jpeg(21))
    dem = []
    goc = extract._prepare_units
    monkeypatch.setattr(extract, "_prepare_units", lambda p, r=0: dem.append(1) or goc(p, r))

    assert extract.cache_status([f])[0]["free"] == 0
    assert extract.cache_status([f])[0]["free"] == 0
    assert len(dem) == 1

    # file cache vừa xuất hiện giữa hai lần gọi → phản ánh ngay, vẫn không đọc lại file
    extract.extract_transactions([f])
    dem.clear()
    assert extract.cache_status([f])[0]["free"] == 1
    # ... và biến mất
    for j in extract.CACHE_DIR.glob("*.json"):
        j.unlink()
    assert extract.cache_status([f])[0]["free"] == 0
    assert dem == []

    # sửa file (size/mtime đổi) → tính lại
    f.write_bytes(_jpeg(22) + b"\0")
    extract.cache_status([f])
    assert len(dem) == 1


def test_nho_dem_co_gioi_han(tmp_path, model, monkeypatch):
    monkeypatch.setattr(extract, "_UNIT_CACHE_MAX", 2)
    for k in range(3):
        f = tmp_path / f"{k}.jpg"
        f.write_bytes(_jpeg(100 + k))
        extract.cache_status([f])
    assert len(extract._unit_cache) == 2
