"""Thông báo lỗi khi quét nhầm file không phải sổ ngân hàng.

Bug 01/08/2026: người dùng quét nhầm giấy tờ bảo hiểm, màn hình hiện
    'source.jpg' không phải sổ ngân hàng (通帳). The provided image is a
    document about insurance and medical information, not a bankbook.
Hai lỗi trong một câu: tên file NỘI BỘ ('source.jpg' — họ đặt tên mặt sổ khác)
và một câu tiếng Anh của model dán thẳng vào giao diện tiếng Việt/Nhật.
"""

import pytest

from api import jobs
from extract import ExtractError, PageSkipped


def make_job(names: list[str]) -> jobs.Job:
    return jobs.Job(
        id="j1", ws_id="w1",
        sheet_ids=[f"s{i}" for i in range(len(names))],
        paths=["/tmp/source.jpg"] * len(names),
        names=names,
    )


def test_dung_ten_mat_so_khong_dung_ten_file():
    job = make_job(["通帳：みなと工業 tr.2"])
    e = PageSkipped(
        "'source.jpg' không phải sổ ngân hàng (通帳).",
        kind="not_bankbook", label="source.jpg",
        reason="The provided image is a document about insurance.",
    )
    _, _, msg = jobs._friendly(job, e)
    assert "通帳：みなと工業 tr.2" in msg
    assert "source.jpg" not in msg


def test_khong_dan_loi_tieng_anh_cua_model():
    job = make_job(["Mặt 1"])
    e = PageSkipped(
        "...", kind="not_bankbook", label="source.jpg",
        reason="The provided image is a document about insurance and medical "
               "information, not a bankbook.",
    )
    _, _, msg = jobs._friendly(job, e)
    assert "insurance" not in msg
    assert "bankbook" not in msg
    assert "sổ ngân hàng" in msg


@pytest.mark.parametrize(
    "kind,mong_doi",
    [
        ("not_bankbook", "không phải sổ ngân hàng"),
        ("unreadable", "quá mờ"),
        ("no_rows", "không có dòng giao dịch"),
    ],
)
def test_moi_loai_loi_co_cau_rieng(kind, mong_doi):
    _, _, msg = jobs._friendly(make_job(["Mặt 1"]), PageSkipped("x", kind=kind, label="f.jpg"))
    assert mong_doi in msg


def test_quet_nhieu_mat_thi_khong_doan_bua_ten():
    """Không biết chắc mặt nào hỏng thì đừng nêu tên mặt nào cả."""
    _, _, msg = jobs._friendly(
        make_job(["Mặt 1", "Mặt 2", "Mặt 3"]),
        PageSkipped("x", kind="not_bankbook", label="source.jpg"),
    )
    assert "Mặt 1" not in msg
    assert "Ảnh này" in msg


def test_loi_khac_giu_nguyen_message_goc():
    """Lỗi mạng/API key vốn đã là tiếng Việt — không được nuốt mất."""
    _, _, msg = jobs._friendly(make_job(["Mặt 1"]), ExtractError("API key không hợp lệ."))
    assert msg == "API key không hợp lệ."


def test_loi_file_hong_cung_khong_lo_ten_file_noi_bo():
    """Nhánh lỗi khác (file hỏng) vẫn phải gọi đúng tên mặt sổ."""
    _, _, msg = jobs._friendly(
        make_job(["Trang bìa sổ Fukuoka"]),
        ExtractError("Không nhận diện được định dạng của 'source.jpg'."),
    )
    assert "Trang bìa sổ Fukuoka" in msg
    assert "source.jpg" not in msg


# ── Chạy trọn đường: model báo lỗi → sự kiện đẩy ra trình duyệt ───────

def test_tron_duong_tu_model_den_su_kien_SSE(tmp_path, monkeypatch):
    """Giả lập model trả `not_bankbook`, chạy job THẬT, xem câu đẩy ra trình duyệt.

    Chặn ở tầng gọi model nên không tốn lượt API nào — và chắc chắn chạm đúng
    nhánh lỗi, khác với quét thử ảnh thật (model có thể trả về kết quả khác).
    """
    import extract

    from api import results, workspace

    monkeypatch.setattr(workspace, "DATA_DIR", tmp_path)
    monkeypatch.setattr(workspace, "WS_DIR", tmp_path / "ws")
    monkeypatch.setattr(workspace, "_cache", {})
    monkeypatch.setattr(extract, "CACHE_DIR", tmp_path / "cache")

    def gia_lam_model(model, prompt, files, on_progress=None):
        return (
            '{"error": "not_bankbook", "message": "The provided image is a document '
            'about insurance and medical information, not a bankbook."}',
            {"input_tokens": 1, "output_tokens": 1},
        )

    monkeypatch.setattr(extract, "_call_gemini", gia_lam_model)
    monkeypatch.setattr(extract, "_call_claude", gia_lam_model)

    anh = tmp_path / "source.jpg"
    anh.write_bytes(_anh_jpeg_nho())

    ws = workspace.create(owner="u1")
    job = jobs.create(ws.id, ["s1"], [str(anh)], names=["Giấy bảo hiểm của khách"])
    jobs._run(job, use_cache=False)

    assert job.status == "error"
    loi = [e for e in job._log if e["stage"] == "error"]
    assert len(loi) == 1
    msg = loi[0]["message"]
    assert "Giấy bảo hiểm của khách" in msg
    assert "không phải sổ ngân hàng" in msg
    assert "insurance" not in msg and "source.jpg" not in msg
    assert results.load_all(ws.id) == {}, "quét hỏng thì không được ghi kết quả rỗng"

    # Mã + tên mặt sổ phải đi kèm để trình duyệt tự dịch sang Nhật/Anh
    assert loi[0]["code"] == "not_bankbook"
    assert loi[0]["sheet"] == "Giấy bảo hiểm của khách"
    assert jobs.to_json(job)["error_code"] == "not_bankbook"


def test_sse_khong_ping_mai_khi_job_da_chet():
    """Job xong mà hàng đợi rỗng thì luồng SSE phải ĐÓNG, không ping vô tận.

    Ping mãi làm uvicorn không đóng được tiến trình cũ lúc nạp lại code → treo
    cả server (gặp thật 01/08/2026 khi đang thử tính năng).
    """
    job = make_job(["Mặt 1"])
    job.status = "error"          # luồng chạy nền đã chết, không kịp đặt sentinel
    assert list(jobs.stream(job, replay=False)) == []


def _anh_jpeg_nho() -> bytes:
    import io

    from PIL import Image

    buf = io.BytesIO()
    Image.new("RGB", (40, 40), (250, 250, 250)).save(buf, "JPEG")
    return buf.getvalue()
