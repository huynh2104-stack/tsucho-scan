"""Nhớ chữ đã đọc ra đĩa (words.json) + đọc trước sau khi quét. $0: bộ đọc giả, không chạy RapidOCR/Tesseract thật."""

import json
import threading
import time
from types import SimpleNamespace

import pytest
from PIL import Image

from api import imgjobs, jobs, main, rowanchors, workspace
from test_scan_estimate import _ho_so, _quet, client, model  # noqa: F401 — fixture dùng chung

RAPID = [{"value": "1000", "x": .5, "y": .2, "height": .01}]
TESS = [{"value": "2000", "x": .6, "y": .3, "height": .01}]
GEOMETRY = {"x0": 0., "x1": 1., "skew_deg": 0., "peaks": [],
            "bands": [{"y0": .1, "y1": .2}, {"y0": .2, "y1": .3}]}
ROWS = [{"balance": "1000"}, {"balance": "2000"}]


@pytest.fixture
def anh(tmp_path):
    path = tmp_path / "current.png"
    Image.new("RGB", (40, 60), "white").save(path)
    return path


@pytest.fixture
def doc(monkeypatch):
    """Hai bộ đọc giả đếm số lần chạy; `loi` chứa tên bộ đọc phải ném lỗi."""
    st = SimpleNamespace(rapid=0, tess=0, loi=set())

    def rapid(path, revision):
        st.rapid += 1
        if "rapid" in st.loi:
            raise RuntimeError("hỏng")
        return list(RAPID)

    def tess(path, revision, executable):
        st.tess += 1
        if "tess" in st.loi:
            raise RuntimeError("hỏng")
        return list(TESS)

    monkeypatch.setattr(rowanchors, "_read_rapid_words", rapid)
    monkeypatch.setattr(rowanchors, "_read_words", tess)
    monkeypatch.setattr(rowanchors, "_executable", lambda: "tesseract")
    monkeypatch.setenv("TSUCHO_LOCAL_OCR", "1")
    return st


def store(anh):
    return json.loads((anh.parent / "words.json").read_text(encoding="utf-8"))


def test_ghi_roi_doc_lai_khong_goi_bo_doc(anh, doc):
    assert rowanchors._gather(anh, "r1", "tesseract") == (RAPID + TESS, True, False)
    assert store(anh) == {"v": rowanchors.WORDS_VERSION, "rev": "r1", "rapid": RAPID, "tess": TESS}
    assert rowanchors._gather(anh, "r1", "tesseract") == (RAPID + TESS, True, False)
    assert (doc.rapid, doc.tess) == (1, 1)


def test_rev_lech_thi_doc_lai(anh, doc):
    rowanchors._gather(anh, "r1", "tesseract")
    rowanchors._gather(anh, "r2", "tesseract")
    assert (doc.rapid, doc.tess) == (2, 2) and store(anh)["rev"] == "r2"


def test_version_lech_thi_doc_lai(anh, doc, monkeypatch):
    rowanchors._gather(anh, "r1", "tesseract")
    monkeypatch.setattr(rowanchors, "WORDS_VERSION", rowanchors.WORDS_VERSION + 1)
    rowanchors._gather(anh, "r1", "tesseract")
    assert (doc.rapid, doc.tess) == (2, 2)


def test_mot_bo_doc_loi_thi_bo_kia_van_duoc_nho_va_bo_loi_thu_lai(anh, doc):
    doc.loi = {"rapid"}
    words, available, failed = rowanchors._gather(anh, "r1", "tesseract")
    assert (words, available, failed) == (TESS, True, True)
    assert store(anh)["rapid"] is None and store(anh)["tess"] == TESS
    doc.loi = set()
    assert rowanchors._gather(anh, "r1", "tesseract") == (RAPID + TESS, True, False)
    assert (doc.rapid, doc.tess) == (2, 1)           # Tesseract dùng lại từ đĩa, RapidOCR thử lại


def test_bo_doc_vang_mat_thi_khong_nho(anh, doc, monkeypatch):
    def thieu(path, revision):
        raise ImportError("không cài")
    monkeypatch.setattr(rowanchors, "_read_rapid_words", thieu)
    words, available, failed = rowanchors._gather(anh, "r1", None)
    assert (words, available, failed) == ([], False, False)
    assert not (anh.parent / "words.json").exists()


def test_tesseract_tra_rong_khong_duoc_nho(anh, doc, monkeypatch):
    monkeypatch.setattr(rowanchors, "_read_words", lambda *a: [])
    rowanchors._gather(anh, "r1", "tesseract")
    assert store(anh)["rapid"] == RAPID and store(anh)["tess"] is None


@pytest.mark.parametrize("noi_dung", ["{không phải json", "[]", '{"v": 1, "rev": "r1", "rapid": "x"}', ""])
def test_file_hong_thi_bo_qua_va_ghi_de(anh, doc, noi_dung):
    (anh.parent / "words.json").write_text(noi_dung, encoding="utf-8")
    assert rowanchors._gather(anh, "r1", "tesseract") == (RAPID + TESS, True, False)
    assert store(anh)["rapid"] == RAPID


def test_ocr_tat_thi_khong_doc_khong_tao_file(anh, doc, monkeypatch):
    monkeypatch.setenv("TSUCHO_LOCAL_OCR", "0")
    out = rowanchors.locate(anh, "r1", ROWS, GEOMETRY)
    rowanchors.warm(anh, "r1")
    assert out["ocr_status"] == "unavailable"
    assert (doc.rapid, doc.tess) == (0, 0) and not (anh.parent / "words.json").exists()


def test_locate_lan_hai_tu_dia_cho_ket_qua_y_het(anh, doc, monkeypatch):
    seen = []

    def ghep(rows, words, geometry, width, height, **kw):
        seen.append(sorted(w["value"] for w in words))
        return [{**b, "method": "content"} for b in geometry["bands"]]

    monkeypatch.setattr(rowanchors, "match_rows", ghep)
    first = rowanchors.locate(anh, "r1", ROWS, GEOMETRY)
    for ten in ("_read_rapid_words", "_read_words"):
        monkeypatch.setattr(rowanchors, ten, lambda *a: pytest.fail("không được đọc lại"))
    second = rowanchors.locate(anh, "r1", ROWS, GEOMETRY)
    assert first == second and first["ocr_status"] == "ready" and first["exact"] is True
    assert seen[0] == seen[1] == ["1000", "2000"]


def test_warm_nuot_loi_va_ghi_file(anh, doc, monkeypatch):
    doc.loi = {"rapid", "tess"}
    rowanchors.warm(anh, "r1")                                   # không ném lỗi
    assert not (anh.parent / "words.json").exists()
    monkeypatch.setattr(rowanchors, "_gather", lambda *a: 1 / 0)
    rowanchors.warm(anh, "r1")                                   # lỗi bất ngờ cũng nuốt


def test_warm_ghi_words_json(anh, doc):
    rowanchors.warm(anh, "r1")
    assert store(anh)["rapid"] == RAPID


# ── Sau khi quét xong ────────────────────────────────────────────────

def mat_gia(tmp_path, n=3):
    out = []
    for i in range(n):
        d = tmp_path / f"s{i}"
        d.mkdir()
        Image.new("RGB", (40, 60), "white").save(d / "current.png")
        out.append(SimpleNamespace(dir=lambda ws_id, d=d: d, sha256=f"sha{i}"))
    return out


def job_gia(after):
    job = jobs.Job(id="j", ws_id="w", sheet_ids=["s"], paths=["a"], after=after)
    job.status = "running"
    return job


@pytest.fixture
def quet_gia(monkeypatch):
    ket_qua = SimpleNamespace(totals={}, cost_usd=0, cached=False)
    monkeypatch.setattr(jobs, "scan", lambda *a, **k: ket_qua)
    monkeypatch.setattr(jobs, "_payload", lambda job, result: {})
    monkeypatch.setattr(jobs.results, "save_job", lambda *a, **k: None)


def test_quet_xong_thi_xep_dung_so_viec_warm_va_ghi_file(tmp_path, doc, quet_gia, monkeypatch):
    mat = mat_gia(tmp_path)
    xep = []
    goc = imgjobs.submit
    monkeypatch.setattr(imgjobs, "submit", lambda fn, *a, **k: (xep.append(fn), goc(fn, *a, **k))[1])
    job = job_gia([lambda: main._warm_words("w", mat)])
    jobs._run(job, True)
    imgjobs.wait_idle()
    assert job.status == "done" and xep == [rowanchors.warm] * 3
    assert all((s.dir("w") / "words.json").is_file() for s in mat)
    assert store(mat[1].dir("w") / "current.png")["rev"] == "sha1"


def test_viec_noi_duoi_chay_sau_khi_da_bao_xong(quet_gia):
    luc_chay = []
    job = job_gia([])
    job.after.append(lambda: luc_chay.append((job.status, job._closed, job._log[-1]["stage"])))
    jobs._run(job, True)
    assert luc_chay == [("done", True, "finished")]


def test_viec_noi_duoi_loi_khong_doi_trang_thai_job(quet_gia):
    job = job_gia([lambda: 1 / 0])
    jobs._run(job, True)
    assert job.status == "done" and job.error is None


def test_job_loi_thi_khong_co_viec_warm(tmp_path, doc, monkeypatch):
    def scan_hong(*a, **k):
        raise jobs.ExtractError("hỏng")

    monkeypatch.setattr(jobs, "scan", scan_hong)
    xep = []
    monkeypatch.setattr(imgjobs, "submit", lambda fn, *a, **k: xep.append(fn))
    job = job_gia([lambda: main._warm_words("w", mat_gia(tmp_path))])
    jobs._run(job, True)
    assert job.status == "error" and xep == []


# ── Vòng sửa ─────────────────────────────────────────────────────────

def test_hai_luong_cung_anh_moi_bo_doc_chi_chay_mot_lan(anh, doc, monkeypatch):
    dem = {"rapid": 0, "tess": 0}

    def cham(ten, ra):
        def doc_gia(*a):
            dem[ten] += 1
            time.sleep(.2)
            return list(ra)
        return doc_gia

    monkeypatch.setattr(rowanchors, "_read_rapid_words", cham("rapid", RAPID))
    monkeypatch.setattr(rowanchors, "_read_words", cham("tess", TESS))
    out = []
    luong = [threading.Thread(target=lambda: out.append(rowanchors._gather(anh, "r1", "tesseract"))) for _ in range(2)]
    for t in luong:
        t.start()
    for t in luong:
        t.join(10)
    assert dem == {"rapid": 1, "tess": 1}
    assert out == [(RAPID + TESS, True, False)] * 2


def test_ghi_khong_de_null_len_phan_da_co(anh, doc):
    rowanchors._gather(anh, "r1", "tesseract")
    doc.loi = {"rapid", "tess"}                      # lần sau bộ đọc nào cũng hỏng, nhưng đã có đủ trên đĩa
    rowanchors._gather(anh, "r1", "tesseract")
    assert store(anh)["rapid"] == RAPID and store(anh)["tess"] == TESS


def test_hang_doi_viec_thuong_chay_truoc_viec_thap():
    chay, mo = [], threading.Event()
    imgjobs.wait_idle()
    imgjobs.submit(lambda: (mo.wait(5), chay.append("thap1")), low=True)
    time.sleep(.1)                                   # luồng đang bận việc thấp đầu tiên
    imgjobs.submit(chay.append, "thap2", low=True)
    imgjobs.submit(chay.append, "thap3", low=True)
    imgjobs.submit(chay.append, "thuong")
    imgjobs.submit(chay.append, "thuong2")
    mo.set()
    imgjobs.wait_idle()
    assert chay == ["thap1", "thuong", "thuong2", "thap2", "thap3"]


def test_warm_words_mat_so_da_bi_xoa_thi_bo_qua_im_lang(tmp_path, doc):
    ma = SimpleNamespace(dir=lambda ws_id: tmp_path / "da-xoa", sha256="r")
    main._warm_words("w", [ma])
    imgjobs.wait_idle()
    assert not (tmp_path / "da-xoa").exists()


def test_quet_qua_route_thi_co_words_json_cho_tung_mat(client, model, doc):
    ws_id = _ho_so(client)
    ws = workspace.load(ws_id)
    for sh in ws.sheets:
        Image.new("RGB", (40, 60), "white").save(sh.dir(ws_id) / "current.png")
        sh.sha256 = "rev-" + sh.id
    ws.save()
    assert _quet(client, ws_id, ["m", "n"]).status_code == 200
    imgjobs.wait_idle()
    for sh in ws.sheets:
        p = sh.dir(ws_id) / "words.json"
        assert p.is_file() and json.loads(p.read_text(encoding="utf-8"))["rev"] == "rev-" + sh.id
