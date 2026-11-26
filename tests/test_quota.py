"""Hạn mức quét chung (api/quota.py) + tools/han-muc.py. Nguyên tắc: giữ chỗ NGUYÊN TỬ trên mọi khoá,
hoàn đúng các khoá đã cộng, mỗi loại tài khoản đúng khoá và đúng trần."""

import importlib.util
import threading
import time
from pathlib import Path

import pytest

from api import auth, demo, main, quota, workspace
from test_api_auth import register  # noqa: F401
from test_scan_estimate import (  # noqa: F401 — fixture + công cụ dùng chung (model giả, hồ sơ có 1 mặt thường 'n')
    MAT_KHAU, _cho_job, _ho_so, _jpeg, _them_mat, _uoc, client, model,
)


def user_of(kind, role="user", scan_limit=None, uid="u1"):
    return auth.User(id=uid, email=f"{uid}@x", role=role, created_at=0, kind=kind, scan_limit=scan_limit)


@pytest.fixture
def db(client):  # noqa: F811 — dùng CSDL tạm của fixture client
    return client


# ── Trần và khoá theo loại tài khoản ──────────────────────────────────

def test_tran_theo_loai_tai_khoan(monkeypatch):
    for k in ("TSUCHO_TRIAL_SCAN_LIMIT", "TSUCHO_MEMBER_SCAN_LIMIT", "TSUCHO_DEMO_SCAN_LIMIT"):
        monkeypatch.delenv(k, raising=False)
    assert quota.limit_for(user_of("trial")) == 5
    assert quota.limit_for(user_of("demo")) == 6
    assert quota.limit_for(user_of("member")) == 30
    assert quota.limit_for(user_of("member", scan_limit=200)) == 200
    assert quota.limit_for(user_of("member", scan_limit=0)) == 0
    assert quota.limit_for(user_of("member", role="admin")) is None
    assert quota.limit_for(user_of("trial", role="admin")) is None
    monkeypatch.setenv("TSUCHO_MEMBER_SCAN_LIMIT", "12")        # đọc MỖI lần gọi
    monkeypatch.setenv("TSUCHO_TRIAL_SCAN_LIMIT", "2")
    assert (quota.limit_for(user_of("member")), quota.limit_for(user_of("trial"))) == (12, 2)
    monkeypatch.setenv("TSUCHO_TRIAL_SCAN_LIMIT", "rac")
    assert quota.limit_for(user_of("trial")) == 5


def test_khoa_ap_dung(monkeypatch):
    assert quota.key_names(user_of("member"), "1.1.1.1") == ["u:u1", "all-real"]
    assert quota.key_names(user_of("demo"), "1.1.1.1") == ["u:u1", "all-real"]
    assert quota.key_names(user_of("trial"), "1.1.1.1") == ["u:u1", "ip:1.1.1.1", "trial-all", "all-real"]
    assert quota.key_names(user_of("member", role="admin"), "1.1.1.1") == []


def test_admin_khong_gioi_han(db):
    a = user_of("member", role="admin")
    assert quota.left(a, "ip") is None and quota.status(a, "ip") is None
    assert quota.reserve(a, "ip", 10_000) is True
    assert quota.used("u1") == 0


# ── Giữ chỗ nguyên tử + hoàn ──────────────────────────────────────────

def test_reserve_cong_dung_va_left_giam(db, monkeypatch):
    monkeypatch.setenv("TSUCHO_MEMBER_SCAN_LIMIT", "5")
    u = user_of("member")
    assert quota.left(u, "ip") == 5
    assert quota.reserve(u, "ip", 3) is True
    assert (quota.used("u1"), quota.left(u, "ip")) == (3, 2)
    assert quota.reserve(u, "ip", 3) is False                   # không đủ → không đổi gì
    assert quota.used("u1") == 3
    assert quota.reserve(u, "ip", 2) is True and quota.left(u, "ip") == 0
    assert quota.reserve(u, "ip", 0) is True                    # 0 trang luôn qua


def test_reserve_nguyen_tu_khi_mot_khoa_het_khoa_khac_khong_bi_cong(db, monkeypatch):
    monkeypatch.setenv("TSUCHO_TRIAL_SCAN_LIMIT", "5")
    monkeypatch.setenv("TSUCHO_TRIAL_IP_LIMIT", "3")
    monkeypatch.setenv("TSUCHO_TRIAL_DAILY_TOTAL", "100")
    u = user_of("trial")
    assert quota.reserve(u, "9.9.9.9", 2) is True
    assert quota.reserve(u, "9.9.9.9", 2) is False              # ip: 2+2 > 3
    with auth._db() as conn:
        rows = {r["key"]: r["faces"] for r in conn.execute("SELECT key, faces FROM usage_counters")}
    assert rows == {"u:u1": 2, "ip:9.9.9.9": 2, "trial-all": 2, "all-real": 2}  # khoá user/all KHÔNG bị cộng thêm 2

    # khoá ngược lại: tổng ngày hết, user & ip còn nhiều
    monkeypatch.setenv("TSUCHO_TRIAL_DAILY_TOTAL", "3")
    monkeypatch.setenv("TSUCHO_TRIAL_IP_LIMIT", "50")
    assert quota.reserve(user_of("trial", uid="u2"), "8.8.8.8", 2) is False
    with auth._db() as conn:
        assert conn.execute("SELECT COUNT(*) AS n FROM usage_counters WHERE key IN ('u:u2', 'ip:8.8.8.8')").fetchone()["n"] == 0


def test_status_chi_khoa_chat_nhat_va_hoa_thi_uu_tien_user(db, monkeypatch):
    monkeypatch.setenv("TSUCHO_TRIAL_SCAN_LIMIT", "5")
    monkeypatch.setenv("TSUCHO_TRIAL_IP_LIMIT", "15")
    monkeypatch.setenv("TSUCHO_TRIAL_DAILY_TOTAL", "100")
    u = user_of("trial")
    assert quota.status(u, "ip") == {"scope": "user", "limit": 5, "left": 5}
    monkeypatch.setenv("TSUCHO_TRIAL_IP_LIMIT", "2")
    assert quota.status(u, "ip") == {"scope": "ip", "limit": 2, "left": 2}
    monkeypatch.setenv("TSUCHO_TRIAL_DAILY_TOTAL", "1")
    assert quota.status(u, "ip") == {"scope": "all", "limit": 1, "left": 1}
    assert quota.left(u, "ip") == 1


def test_tong_ngay_cua_moi_tai_khoan_thu_cong_lai(db, monkeypatch):
    """Người tạo vô số ID thử cũng không quét quá trần chung `trial-all`."""
    monkeypatch.setenv("TSUCHO_TRIAL_SCAN_LIMIT", "5")
    monkeypatch.setenv("TSUCHO_TRIAL_IP_LIMIT", "1000")
    monkeypatch.setenv("TSUCHO_TRIAL_DAILY_TOTAL", "7")
    ok = [quota.reserve(user_of("trial", uid=f"t{i}"), f"10.0.0.{i}", 3) for i in range(5)]
    assert ok == [True, True, False, False, False]
    assert quota.left(user_of("trial", uid="moi"), "10.9.9.9") == 1


def test_trial_chung_ip_bi_chan_theo_ip(db, monkeypatch):
    monkeypatch.setenv("TSUCHO_TRIAL_IP_LIMIT", "6")
    assert quota.reserve(user_of("trial", uid="a"), "5.5.5.5", 5) is True
    assert quota.reserve(user_of("trial", uid="b"), "5.5.5.5", 2) is False
    assert quota.reserve(user_of("trial", uid="b"), "6.6.6.6", 2) is True         # IP khác thì được


def test_refund_dung_cac_khoa_va_khong_am(db, monkeypatch):
    u = user_of("trial")
    keys = quota.key_names(u, "7.7.7.7")
    assert quota.reserve(u, "7.7.7.7", 4) is True
    quota.refund(keys, 3)
    with auth._db() as conn:
        rows = {r["key"]: r["faces"] for r in conn.execute("SELECT key, faces FROM usage_counters")}
    assert rows == {"u:u1": 1, "ip:7.7.7.7": 1, "trial-all": 1, "all-real": 1}
    quota.refund(keys, 50)                                       # hoàn quá tay: không âm
    with auth._db() as conn:
        assert {r["faces"] for r in conn.execute("SELECT faces FROM usage_counters")} == {0}
    quota.refund([], 5)
    quota.refund(keys, 0)


def test_refund_dung_ngay_da_giu(db, monkeypatch):
    u = user_of("member")
    assert quota.reserve(u, "i", 2, day="2001-01-01") is True
    quota.refund(quota.key_names(u, "i"), 2, day="2001-01-01")
    assert quota.used("u1", "2001-01-01") == 0 and quota.used("u1") == 0


def test_dong_thoi_khong_vuot_tran(db, monkeypatch):
    monkeypatch.setenv("TSUCHO_MEMBER_SCAN_LIMIT", "5")
    u = user_of("member")
    kq = []
    ts = [threading.Thread(target=lambda: kq.append(quota.reserve(u, "i", 1))) for _ in range(20)]
    [t.start() for t in ts]
    [t.join(10) for t in ts]
    assert kq.count(True) == 5 and quota.used("u1") == 5


def test_ngay_moi_la_bo_dem_moi(db, monkeypatch):
    monkeypatch.setenv("TSUCHO_MEMBER_SCAN_LIMIT", "2")
    u = user_of("member")
    assert quota.reserve(u, "i", 2) is True and quota.left(u, "i") == 0
    with auth._db() as conn:
        conn.execute("UPDATE usage_counters SET day = '2000-01-01'")
    assert quota.left(u, "i") == 2


# ── Qua API quét ──────────────────────────────────────────────────────

def test_trial_quet_bi_chan_theo_tung_pham_vi_va_ma_loi(client, model, monkeypatch):
    ws_id = _ho_so(client, "kh")
    _them_mat(ws_id, "p", _jpeg(99))
    monkeypatch.setenv("TSUCHO_TRIAL_IP_LIMIT", "1")
    r = client.post(f"/api/ws/{ws_id}/scan", json={"sheet_ids": ["n", "p"]})
    assert r.status_code == 429
    assert r.json()["detail"] == {"kind": "demo_quota", "limit": 1, "left": 1, "scope": "ip"}

    monkeypatch.setenv("TSUCHO_TRIAL_IP_LIMIT", "50")
    monkeypatch.setenv("TSUCHO_TRIAL_DAILY_TOTAL", "1")
    r = client.post(f"/api/ws/{ws_id}/scan", json={"sheet_ids": ["n", "p"]})
    assert r.status_code == 429 and r.json()["detail"]["scope"] == "all"

    monkeypatch.setenv("TSUCHO_TRIAL_DAILY_TOTAL", "100")
    monkeypatch.setenv("TSUCHO_TRIAL_SCAN_LIMIT", "1")
    r = client.post(f"/api/ws/{ws_id}/scan", json={"sheet_ids": ["n", "p"]})
    assert r.status_code == 429 and r.json()["detail"] == {"kind": "demo_quota", "limit": 1, "left": 1, "scope": "user"}
    assert model == []
    assert quota.used(auth.get_trial("kh")[0].id) == 0


def test_trial_mat_thu_6_bi_chan_mau_van_quet_duoc(client, model):
    ws_id = _ho_so(client, "kh")
    for i in range(5):
        _them_mat(ws_id, f"z{i}", _jpeg(40 + i))
    r = client.post(f"/api/ws/{ws_id}/scan", json={"sheet_ids": [f"z{i}" for i in range(5)]})
    assert r.status_code == 200
    _cho_job(client, r.json()["id"])
    me = client.get("/api/auth/me").json()["quota"]
    assert me == {"limit": 5, "used": 5, "left": 0}
    _them_mat(ws_id, "sau", _jpeg(200))
    assert client.post(f"/api/ws/{ws_id}/scan", json={"sheet_ids": ["sau"]}).status_code == 429
    assert client.post(f"/api/ws/{ws_id}/scan", json={"sheet_ids": ["m"]}).status_code == 200   # sổ mẫu: miễn phí


def test_estimate_tra_han_muc_that_cho_member_va_none_cho_admin(client, model, monkeypatch):
    register(client, "mem@vd.com")
    ws_id = client.post("/api/ws").json()["id"]
    _them_mat(ws_id, "n", _jpeg(10))
    body = _uoc(client, ws_id, ["n"]).json()
    assert (body["demo_left"], body["demo_limit"]) == (30, 30)
    monkeypatch.setenv("TSUCHO_ADMIN_EMAILS", "mem@vd.com")
    client.post("/api/auth/logout")
    client.post("/api/auth/login", json={"email": "mem@vd.com", "password": "Matkhau123"})
    ws_id = client.post("/api/ws").json()["id"]
    _them_mat(ws_id, "n", _jpeg(10))
    body = _uoc(client, ws_id, ["n"]).json()
    assert body["demo_left"] is None and body["demo_limit"] is None


def test_loi_som_thi_job_hoan_dung_ca_ba_khoa_cua_trial(client, model, monkeypatch):
    import extract
    ws_id = _ho_so(client, "kh")
    monkeypatch.setattr(extract, "load_dotenv", lambda *a, **k: None)
    monkeypatch.delenv("GEMINI_API_KEY")                  # thiếu key → báo lỗi trước khi vào trang đầu
    r = client.post(f"/api/ws/{ws_id}/scan", json={"sheet_ids": ["n"]})
    assert r.status_code == 200
    assert _cho_job(client, r.json()["id"])["status"] == "error"
    time.sleep(0.2)
    with auth._db() as conn:
        rows = {r["key"]: r["faces"] for r in conn.execute("SELECT key, faces FROM usage_counters WHERE key NOT LIKE 'tn:%'")}
    assert rows and set(rows.values()) == {0} and {"trial-all"} <= set(rows)
    assert any(k.startswith("ip:") for k in rows) and any(k.startswith("u:") for k in rows)


def test_quet_dung_ip_that_tu_cloudflare(client, model, monkeypatch):
    """Hạn mức IP dùng `auth.client_ip` (CF-Connecting-IP khi TSUCHO_TRUST_PROXY=cloudflare)."""
    monkeypatch.setenv("TSUCHO_TRUST_PROXY", "cloudflare")
    monkeypatch.setenv("TSUCHO_TRIAL_IP_LIMIT", "1")
    ws_id = _ho_so(client, "kh")
    r = client.post(f"/api/ws/{ws_id}/scan", json={"sheet_ids": ["n"]}, headers={"CF-Connecting-IP": "203.0.113.9"})
    assert r.status_code == 200
    _cho_job(client, r.json()["id"])
    with auth._db() as conn:
        assert conn.execute("SELECT faces FROM usage_counters WHERE key = 'ip:203.0.113.9'").fetchone()["faces"] == 1


def test_demo_van_thay_gioi_han_rieng(client, model, monkeypatch):
    monkeypatch.setenv("TSUCHO_DEMO_ACCOUNTS", f"demo@x.test:{MAT_KHAU}")
    monkeypatch.setenv("TSUCHO_DEMO_SCAN_LIMIT", "4")
    demo.tao_neu_thieu()
    ws_id = _ho_so(client, "demo@x.test")
    assert quota.key_names(auth.get_by_email("demo@x.test")[0], "x") == [f"u:{auth.get_by_email('demo@x.test')[0].id}", "all-real"]
    body = _uoc(client, ws_id, ["n"]).json()
    assert (body["demo_left"], body["demo_limit"]) == (4, 4)
    assert client.get("/api/auth/demo").json()["scan_limit"] == 4


# ── tools/han-muc.py ──────────────────────────────────────────────────

def _tool():
    spec = importlib.util.spec_from_file_location("han_muc", Path(__file__).resolve().parent.parent / "tools" / "han-muc.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def test_cong_cu_han_muc(client, capsys):
    register(client, "khach@congty.jp")
    tool = _tool()
    uid = auth.get_by_email("khach@congty.jp")[0].id
    assert tool.main(["han-muc.py", "Khach@Congty.jp", "200"]) == 0
    assert "200" in capsys.readouterr().out
    assert quota.limit_for(auth.get_by_id(uid)) == 200
    assert client.get("/api/auth/me").json()["quota"]["limit"] == 200
    assert tool.main(["han-muc.py", "khach@congty.jp", "mac-dinh"]) == 0
    assert quota.limit_for(auth.get_by_id(uid)) == 30


def test_cong_cu_han_muc_bao_loi_ro(client, capsys):
    tool = _tool()
    assert tool.main(["han-muc.py", "khong-co@vd.com", "5"]) == 1
    assert "khong-co@vd.com" in capsys.readouterr().out
    assert tool.main(["han-muc.py", "a@b.c", "nhieu"]) == 2
    assert tool.main(["han-muc.py", "a@b.c", "-3"]) == 2
    assert tool.main(["han-muc.py"]) == 2


# ── Khoá toàn cục all-real, gom IPv6 ──────────────────────────────────

def test_khoa_toan_cuc_all_real_ap_cho_moi_tai_khoan_tru_admin(db, monkeypatch):
    monkeypatch.setenv("TSUCHO_GLOBAL_DAILY_SCANS", "5")
    monkeypatch.setenv("TSUCHO_MEMBER_SCAN_LIMIT", "100")
    a, b = user_of("member", uid="a"), user_of("member", uid="b")
    assert quota.reserve(a, "i", 3) is True
    assert quota.status(b, "i") == {"scope": "all", "limit": 5, "left": 2}
    assert quota.reserve(b, "i", 3) is False
    with auth._db() as conn:
        assert conn.execute("SELECT COUNT(*) AS n FROM usage_counters WHERE key = 'u:b'").fetchone()["n"] == 0
    assert quota.reserve(b, "i", 2) is True
    assert quota.left(user_of("member", uid="c"), "i") == 0
    adm = user_of("member", role="admin", uid="adm")
    assert quota.reserve(adm, "i", 50) is True and quota.left(adm, "i") is None


def test_ma_loi_429_khi_het_phan_chung_hom_nay(client, model, monkeypatch):
    monkeypatch.setenv("TSUCHO_GLOBAL_DAILY_SCANS", "0")
    ws_id = _ho_so(client, "kh")
    r = client.post(f"/api/ws/{ws_id}/scan", json={"sheet_ids": ["n"]})
    assert r.status_code == 429 and r.json()["detail"] == {"kind": "demo_quota", "limit": 0, "left": 0, "scope": "all"}
    assert model == []


def test_ip_bucket_ipv6_gom_64_ipv4_va_chuoi_la_giu_nguyen():
    assert auth.ip_bucket("203.0.113.7") == "203.0.113.7"
    assert auth.ip_bucket("testclient") == "testclient" and auth.ip_bucket("?") == "?"
    a = auth.ip_bucket("2001:db8:1:2:aaaa:bbbb:cccc:dddd")
    assert a == auth.ip_bucket("2001:db8:1:2:1::1") == "2001:db8:1:2::/64"
    assert auth.ip_bucket("2001:db8:1:3::1") != a
    assert auth.ip_bucket("::ffff:203.0.113.7") == "203.0.113.7"


def test_moi_khoa_theo_ip_dung_bucket_ipv6(client, monkeypatch):
    monkeypatch.setenv("TSUCHO_TRIAL_IP_LIMIT", "3")
    monkeypatch.setattr(auth, "OPEN_LOGIN", True)
    u = user_of("trial")
    assert quota.reserve(u, "2001:db8:1:2::1", 2) is True
    assert quota.reserve(user_of("trial", uid="b"), "2001:db8:1:2:ffff::9", 2) is False     # cùng /64
    assert quota.reserve(user_of("trial", uid="c"), "2001:db8:1:9::9", 2) is True
    assert "i:2001:db8:1:2::/64" in auth.attempt_keys("a", "2001:db8:1:2::7")
    monkeypatch.setenv("TSUCHO_TRIAL_NEW_PER_IP", "2")
    assert [quota.trial_new_allowed(f"2001:db8:5:5::{i}") for i in range(1, 4)] == [True, True, False]
    assert quota.mail_allowed("a@b.c", "2001:db8:7:7::1", "verify")
    with auth._db() as conn:
        keys = {r["key"] for r in conn.execute("SELECT key FROM usage_counters")}
    assert {"ip:2001:db8:1:2::/64", "tn:2001:db8:5:5::/64", "mi:2001:db8:7:7::/64"} <= keys
