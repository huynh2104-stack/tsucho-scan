"""Luồng sự kiện của job: nhiều người nghe cùng lúc (F5 giữa lúc quét) + `active_for` (task 4.2)."""

import threading
import time

import pytest
from fastapi.testclient import TestClient

from api import auth, imgjobs, jobs, main, workspace


def make_job(ws_id="w1") -> jobs.Job:
    return jobs.Job(id="j" + ws_id, ws_id=ws_id, sheet_ids=["s1", "s2"],
                    paths=["a", "b"], names=["Mặt 1", "Mặt 2"])


def nghe(job, out: list, **kw):
    """Chạy `stream` trong thread riêng, gom sự kiện vào `out`."""
    def chay():
        for e in jobs.stream(job, **kw):
            out.append(e)
    t = threading.Thread(target=chay, daemon=True)
    t.start()
    return t


def dong(job: jobs.Job, status="done"):
    """Kết thúc job như `_run`: đổi trạng thái + sự kiện cuối trong cùng khoá, rồi đóng."""
    with job._cond:
        job.status = status
        job.emit({"stage": "finished", "message": "ok"})
    with job._cond:
        job._closed = True
        job._cond.notify_all()


def test_hai_nguoi_nghe_song_song_du_va_dung_thu_tu():
    job = make_job()
    job.status = "running"
    a, b = [], []
    ta, tb = nghe(job, a), nghe(job, b)
    for i in range(50):
        job.emit({"stage": "page", "index": i})
        if i % 7 == 0:
            time.sleep(0.01)                     # xen kẽ để hai bên thực sự chờ nhau
    dong(job)
    ta.join(5)
    tb.join(5)
    assert not ta.is_alive() and not tb.is_alive()
    mong_doi = [{"stage": "page", "index": i} for i in range(50)] + [{"stage": "finished", "message": "ok"}]
    assert a == mong_doi and b == mong_doi       # đủ, đúng thứ tự, không trùng, không giành nhau


def test_nguoi_vao_muon_nhan_phat_lai_roi_toi_phan_moi():
    job = make_job()
    job.status = "running"
    for i in range(3):
        job.emit({"stage": "page", "index": i})
    muon = []
    t = nghe(job, muon)
    time.sleep(0.1)
    assert muon == [{"stage": "page", "index": i} for i in range(3)]   # phần đã qua
    job.emit({"stage": "page", "index": 3})
    dong(job)
    t.join(5)
    assert [e.get("index") for e in muon] == [0, 1, 2, 3, None]
    assert muon[-1]["stage"] == "finished"


def test_replay_false_chi_nghe_phan_moi():
    job = make_job()
    job.status = "running"
    job.emit({"stage": "page", "index": 0})
    ra = []
    t = nghe(job, ra, replay=False)
    time.sleep(0.05)
    job.emit({"stage": "page", "index": 1})
    dong(job)
    t.join(5)
    assert [e["stage"] for e in ra] == ["page", "finished"] and ra[0]["index"] == 1


def test_job_da_xong_thi_phat_lai_roi_ket_thuc_ngay():
    job = make_job()
    job.status = "running"
    job.emit({"stage": "page", "index": 0})
    dong(job)
    t0 = time.time()
    assert [e["stage"] for e in jobs.stream(job)] == ["page", "finished"]
    assert time.time() - t0 < 1


def test_im_lang_thi_ping_roi_thoat_khi_job_chet(monkeypatch):
    monkeypatch.setattr(jobs, "PING_S", 0.05)
    job = make_job()
    job.status = "running"
    ra = []
    t = nghe(job, ra)
    time.sleep(0.3)
    assert ra and all(e == {"stage": "ping", "message": ""} for e in ra)   # còn chạy mà im → ping
    assert t.is_alive()
    job.status = "error"                          # luồng nền chết, không kịp đặt cờ đóng
    t.join(2)
    assert not t.is_alive(), "job đã xong mà không có cờ đóng thì luồng nghe phải thoát, không ping mãi"


def test_that_ra_job_chay_that_gui_du_su_kien(tmp_path, monkeypatch):
    """Chạy `_run` thật (scan giả) với hai người nghe — kết thúc bằng cờ đóng, cả hai nhận đủ."""
    def scan_gia(paths, rotate=0, use_cache=True, on_progress=None):
        for i in range(3):
            on_progress({"stage": "page", "index": i + 1})
            time.sleep(0.02)
        raise jobs.ExtractError("hỏng giữa chừng")

    monkeypatch.setattr(jobs, "scan", scan_gia)
    job = make_job()
    job.status = "running"
    a, b = [], []
    ta, tb = nghe(job, a), nghe(job, b)
    jobs._run(job, use_cache=True)
    ta.join(5)
    tb.join(5)
    assert a == b == job._log
    assert [e["stage"] for e in a] == ["start", "page", "page", "page", "error"]
    assert job._closed and job.status == "error"


# ── active_for + route ────────────────────────────────────────────────

@pytest.fixture
def sach_jobs(monkeypatch):
    monkeypatch.setattr(jobs, "_jobs", {})


def test_active_for_chi_tra_job_dang_chay(sach_jobs):
    assert jobs.active_for("w1") is None
    cu = jobs.create("w1", ["s1"], ["a"], names=["Mặt 1"])
    cu.status = "done"
    assert jobs.active_for("w1") is None
    chay = jobs.create("w1", ["s2"], ["b"], names=["Mặt 2"])
    chay.status = "running"
    chay.created_at += 5
    assert jobs.active_for("w1") is chay
    assert jobs.active_for("w-khac") is None
    chay.status = "done"
    assert jobs.active_for("w1") is None


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


def test_route_jobs_active(client, sach_jobs):
    client.post("/api/auth/login", json={"email": "chu", "password": "1"})
    ws_id = client.post("/api/ws").json()["id"]
    url = f"/api/ws/{ws_id}/jobs/active"
    assert client.get(url).json() == {"job": None}

    job = jobs.create(ws_id, ["s1", "s2"], ["a", "b"], names=["Mặt 1", "Mặt 2"])
    job.status = "running"
    got = client.get(url).json()["job"]
    assert got["id"] == job.id and got["status"] == "running"
    assert got["names"] == ["Mặt 1", "Mặt 2"] and got["sheet_ids"] == ["s1", "s2"]
    assert got["created_at"] == job.created_at

    job.status = "done"
    assert client.get(url).json() == {"job": None}


def test_route_jobs_active_nguoi_khac_404(client, sach_jobs):
    client.post("/api/auth/login", json={"email": "chu", "password": "1"})
    ws_id = client.post("/api/ws").json()["id"]
    client.post("/api/auth/logout")
    client.post("/api/auth/login", json={"email": "ke-la", "password": "1"})
    assert client.get(f"/api/ws/{ws_id}/jobs/active").status_code == 404
    client.post("/api/auth/logout")
    assert client.get(f"/api/ws/{ws_id}/jobs/active").status_code == 401


def test_luong_chet_bang_base_exception_khong_con_job_ma(sach_jobs, monkeypatch):
    """Luồng nền bị giết (ngoại lệ không phải Exception): job phải thành lỗi, người nghe thoát."""
    def scan_chet(paths, rotate=0, use_cache=True, on_progress=None):
        raise SystemExit("bị giết")

    monkeypatch.setattr(jobs, "scan", scan_chet)
    job = jobs.create("w9", ["s1"], ["a"], names=["Mặt 1"])
    job.status = "running"
    ra = []
    t = nghe(job, ra)
    def chay():
        try:
            jobs._run(job, True)
        except SystemExit:
            pass                      # luồng chết thật; chỉ nuốt để pytest khỏi cảnh báo

    th = threading.Thread(target=chay, daemon=True)
    th.start()
    th.join(5)
    t.join(5)
    assert not t.is_alive()
    assert job.status == "error" and job._closed and job.error
    assert ra[-1]["stage"] == "error"
    assert jobs.active_for("w9") is None
