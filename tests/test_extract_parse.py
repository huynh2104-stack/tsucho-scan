"""Test phần parse output nén và nhận diện định dạng file của extract.py."""

import pytest

from extract import (
    ExtractError,
    _detect_media_type,
    _prepare_units,
    _split_pdf_pages,
    parse_model_output,
)


# ---------- parse_model_output ----------

def test_parse_dinh_dang_nen():
    text = (
        '{"accounts":[{"bank":"西日本シティ銀行","rows":['
        '["07-08-27","11,858DF.ﾘﾀﾘｺ",11858,null,138065],'
        '["07-08-29","ＡＴＭ入金",null,"200,000",226583,"L"]]}]}'
    )
    result = parse_model_output(text)
    accounts = result["accounts"]
    assert accounts[0]["bank_name"] == "西日本シティ銀行"
    txs = accounts[0]["transactions"]
    assert txs[0]["amount_out"] == 11858
    assert txs[0]["balance"] == 138065
    assert txs[0]["confidence"] == "high"
    # Số dạng chuỗi có dấu phẩy vẫn chuyển được, cờ "L" → confidence low
    assert txs[1]["amount_in"] == 200000
    assert txs[1]["confidence"] == "low"


def test_parse_dinh_dang_object_cua_gemini():
    # Gemini với response_schema trả rows dạng object có tên trường
    text = (
        '{"error":null,"accounts":[{"bank":"福岡銀行","rows":['
        '{"d":"07.08.22","m":"CDフリコミ テ 055 マツザキ ヨシ","o":20105,"i":null,"b":47809},'
        '{"d":"07.08.22","m":"ADカード (282)","o":null,"i":290000,"b":294119,"L":true}]}]}'
    )
    result = parse_model_output(text)
    txs = result["accounts"][0]["transactions"]
    assert txs[0]["amount_out"] == 20105
    assert txs[0]["balance"] == 47809
    assert txs[0]["confidence"] == "high"
    assert txs[1]["amount_in"] == 290000
    assert txs[1]["confidence"] == "low"  # L=true


def test_parse_truong_x_text_o_cot_tien():
    # Sổ Fukuoka in tên người chuyển vào cột tiền trống → trường x
    text = (
        '{"accounts":[{"bank":"福岡銀行","rows":['
        '{"d":"07.08.22","m":"CDフリコミ","o":20105,"i":null,"b":47809,"x":"テ 055 マツザキ ヨシ"},'
        '{"d":"07.08.25","m":"CDカード","o":260000,"i":null,"b":34119,"x":"(282)"}]}]}'
    )
    txs = parse_model_output(text)["accounts"][0]["transactions"]
    assert txs[0]["extra_text"] == "テ 055 マツザキ ヨシ"
    assert txs[0]["amount_out"] == 20105
    assert txs[1]["extra_text"] == "(282)"


def test_parse_x_khong_bi_cat_so_ben_trong():
    # Bài học: "ﾃ 055" từng bị bộ lọc cắt mất "055" → phải giữ nguyên vẹn
    text = ('{"accounts":[{"bank":null,"rows":['
            '{"d":"6-1-1","m":"CDフリコミ","o":100,"i":null,"b":900,"x":"ﾃ 055"},'
            '{"d":"6-1-2","m":"a","o":10,"i":null,"b":890,"x":"720"}]}]}')
    txs = parse_model_output(text)["accounts"][0]["transactions"]
    assert txs[0]["extra_text"] == "ﾃ 055"
    # x thuần 2-3 chữ số (mã 取扱店 đi lạc) → chuyển sang store_code
    assert txs[1]["extra_text"] is None
    assert txs[1]["store_code"] == "720"


def test_parse_cac_truong_moi_k_t_note_va_meta():
    text = (
        '{"accounts":[{"bank":"西日本シティ銀行","store_no": "000","account_no":"123456",'
        '"holder":"株式会社 見本商事","rows":['
        '{"d":"07-10-10","k":"100","m":"ATM入金","o":null,"i":22000,"b":25866,"t":"720"},'
        '{"d":null,"k":null,"m":null,"o":null,"i":null,"b":506202,'
        '"note":"新通帳へ繰越しました"}]}]}'
    )
    acc = parse_model_output(text)["accounts"][0]
    assert acc["store_no"] == "000"
    assert acc["account_no"] == "123456"
    txs = acc["transactions"]
    assert txs[0]["kind"] == "100"
    assert txs[0]["store_code"] == "720"
    assert txs[0]["is_note"] is False
    assert txs[1]["is_note"] is True
    assert txs[1]["description"] == "新通帳へ繰越しました"
    assert txs[1]["balance"] == 506202


def test_parse_error_null_khong_bi_coi_la_loi():
    # Schema có thể chèn "error": null cạnh accounts → không được coi là lỗi
    text = '{"error":null,"accounts":[{"bank":null,"rows":[{"d":"6-1-1","m":"a","o":1,"i":null,"b":10}]}]}'
    result = parse_model_output(text)
    assert "accounts" in result
    assert result["accounts"][0]["transactions"][0]["amount_out"] == 1


def test_parse_bank_chuoi_null_thanh_none():
    # Model đôi khi trả về chuỗi "null" thay vì JSON null
    text = '{"accounts":[{"bank":"null","rows":[["6-1-1","a",1,null,10]]}]}'
    result = parse_model_output(text)
    assert result["accounts"][0]["bank_name"] is None


def test_parse_bo_markdown_fence():
    text = '```json\n{"accounts":[{"bank":null,"rows":[["6-1-1","a",1,null,10]]}]}\n```'
    result = parse_model_output(text)
    assert result["accounts"][0]["transactions"][0]["amount_out"] == 1


def test_parse_error_cua_model_duoc_giu_nguyen():
    result = parse_model_output('{"error":"not_bankbook","message":"通帳ではない"}')
    assert result["error"] == "not_bankbook"


def test_parse_dong_sai_dinh_dang_bi_bo_qua():
    text = '{"accounts":[{"bank":"X","rows":[["6-1-1","a",1,null,10],["thieu"],"xxx"]}]}'
    result = parse_model_output(text)
    assert len(result["accounts"][0]["transactions"]) == 1


def test_parse_khong_co_json_bao_loi_than_thien():
    with pytest.raises(ExtractError):
        parse_model_output("xin loi, toi khong doc duoc")


def test_parse_so_thu_tu_dong_in_tren_so():
    # n = số in sẵn ở lề trái (01..24); dùng để phát hiện dòng bị bỏ sót
    text = '{"accounts":[{"rows":[{"n":"01","d":"07-03-19","m":"ATM","i":1000,"b":5000}]}]}'
    tx = parse_model_output(text)["accounts"][0]["transactions"][0]
    assert tx["row_no"] == 1


def test_parse_khong_co_so_thu_tu_thi_none():
    text = '{"accounts":[{"rows":[{"d":"07-03-19","m":"ATM","i":1000,"b":5000}]}]}'
    tx = parse_model_output(text)["accounts"][0]["transactions"][0]
    assert tx["row_no"] is None


# ---------- _detect_media_type ----------

def test_nhan_dien_jpeg():
    assert _detect_media_type(b"\xff\xd8\xff\xe0xxxx") == "image/jpeg"


def test_nhan_dien_png():
    assert _detect_media_type(b"\x89PNG\r\n\x1a\nxxxx") == "image/png"


def test_nhan_dien_webp_du_duoi_file_la_jpg():
    # File WebP đổi tên thành .jpg vẫn phải nhận ra là webp (lỗi 400 trước đây)
    data = b"RIFF\xde\xb8\x02\x00WEBPVP8 "
    assert _detect_media_type(data) == "image/webp"


def test_nhan_dien_pdf():
    assert _detect_media_type(b"%PDF-1.7 xxxx") == "application/pdf"


def test_dinh_dang_la_khong_biet_tra_none():
    assert _detect_media_type(b"hello world!") is None


# ---------- tách trang PDF ----------

def _pdf_bytes(n_pages: int) -> bytes:
    import io

    from pypdf import PdfWriter

    writer = PdfWriter()
    for _ in range(n_pages):
        writer.add_blank_page(width=200, height=300)
    buf = io.BytesIO()
    writer.write(buf)
    return buf.getvalue()


def test_pdf_nhieu_trang_duoc_tach_tung_trang():
    # Gửi gộp nhiều trang làm model trả lời quá dài rồi bị cắt (MAX_TOKENS)
    pages = _split_pdf_pages(_pdf_bytes(3))
    assert len(pages) == 3
    assert all(p.startswith(b"%PDF-") for p in pages)


def test_pdf_mot_trang_giu_nguyen_bytes():
    # Giữ nguyên bytes gốc để cache của file 1 trang không bị mất hiệu lực
    data = _pdf_bytes(1)
    assert _split_pdf_pages(data) == [data]


def test_pdf_xoay_180_cho_ban_scan_lon_nguoc(tmp_path):
    # Bản scan PDF lộn ngược (PDF scan mẫu) — trước đây --rotate bị cấm với PDF
    from pypdf import PdfReader

    path = tmp_path / "so.pdf"
    path.write_bytes(_pdf_bytes(2))
    units = _prepare_units(path, rotate=180)
    for _label, _mtype, blob in units:
        import io

        assert PdfReader(io.BytesIO(blob)).pages[0].get("/Rotate") == 180


def test_prepare_units_tach_pdf_va_dat_nhan_theo_trang(tmp_path):
    path = tmp_path / "so.pdf"
    path.write_bytes(_pdf_bytes(2))
    units = _prepare_units(path)
    assert [u[0] for u in units] == ["so.pdf (trang 1)", "so.pdf (trang 2)"]
    assert all(u[1] == "application/pdf" for u in units)
