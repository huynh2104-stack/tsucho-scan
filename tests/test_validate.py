"""Test cho validate.py với dữ liệu giả."""

from validate import convert_wareki, merge_accounts, validate_transactions


# ---------- convert_wareki ----------

def test_wareki_khong_nien_hieu_mac_dinh_reiwa():
    # "6-01-15" → Reiwa 6 = 2024
    assert convert_wareki("6-01-15") == "2024-01-15"


def test_wareki_co_prefix_reiwa():
    assert convert_wareki("R6.1.15") == "2024-01-15"


def test_wareki_kanji_heisei():
    # Heisei 31 = 2019
    assert convert_wareki("平成31年4月30日") == "2019-04-30"


def test_nam_duong_lich_giu_nguyen():
    assert convert_wareki("2024-01-15") == "2024-01-15"


def test_ngay_khong_hop_le_tra_none():
    assert convert_wareki("6-13-45") is None
    assert convert_wareki("abc") is None
    assert convert_wareki("") is None


# ---------- validate_transactions ----------

def _tx(date_raw="6-01-15", out=None, inn=None, bal=None, conf="high", desc="テスト"):
    return {
        "date_raw": date_raw,
        "description": desc,
        "amount_out": out,
        "amount_in": inn,
        "balance": bal,
        "confidence": conf,
    }


def test_checksum_dung_status_ok():
    rows = validate_transactions([
        _tx(bal=100_000, desc="繰越"),
        _tx(inn=50_000, bal=150_000),   # 100000 + 50000 = 150000: đúng
        _tx(out=30_000, bal=120_000),   # 150000 - 30000 = 120000: đúng
    ])
    assert [r["status"] for r in rows] == ["ok", "ok", "ok"]


def test_checksum_sai_status_check():
    rows = validate_transactions([
        _tx(bal=100_000),
        _tx(inn=50_000, bal=999_999),   # lệch → check
    ])
    assert rows[1]["status"] == "check"
    assert "残高不一致" in rows[1]["reason"]


def test_checksum_sai_khong_keo_day_chuyen():
    # Sau dòng lệch, tin số in trên sổ → dòng kế tiếp đúng phải là "ok"
    rows = validate_transactions([
        _tx(bal=100_000),
        _tx(inn=50_000, bal=999_999),          # sai
        _tx(out=99_999, bal=900_000),           # 999999 - 99999 = 900000: đúng
    ])
    assert rows[2]["status"] == "ok"


def test_confidence_low_status_check():
    rows = validate_transactions([_tx(inn=1000, bal=1000, conf="low")])
    assert rows[0]["status"] == "check"
    assert "低信頼度" in rows[0]["reason"]


def test_dong_khong_co_zandaka_van_cong_don():
    # Dòng giữa không in 残高 nhưng vẫn phải cộng dồn vào checksum dòng sau
    rows = validate_transactions([
        _tx(bal=100_000),
        _tx(out=20_000),                 # không có 残高
        _tx(inn=5_000, bal=85_000),      # 100000 - 20000 + 5000 = 85000: đúng
    ])
    assert rows[2]["status"] == "ok"


def test_kiem_tra_kep_chuyen_nham_cot_ra_thanh_vao():
    # Tiền vào 50000 nhưng model ghi nhầm sang cột 出金 → tự sửa, status "fixed"
    rows = validate_transactions([
        _tx(bal=100_000),
        _tx(out=50_000, bal=150_000),   # delta +50000 khớp số đang nằm nhầm cột
    ])
    assert rows[1]["status"] == "fixed"
    assert rows[1]["amount_in"] == 50_000
    assert rows[1]["amount_out"] is None
    assert "入金列" in rows[1]["reason"]


def test_kiem_tra_kep_chuyen_nham_cot_vao_thanh_ra():
    # Tiền ra 30000 nhưng model ghi nhầm sang cột 入金 → tự sửa
    rows = validate_transactions([
        _tx(bal=100_000),
        _tx(inn=30_000, bal=70_000),    # delta -30000
    ])
    assert rows[1]["status"] == "fixed"
    assert rows[1]["amount_out"] == 30_000
    assert rows[1]["amount_in"] is None


def test_kiem_tra_kep_khong_sua_bua_khi_so_khong_khop():
    # Chênh lệch không khớp số nào → không tự sửa, báo kèm 差額
    rows = validate_transactions([
        _tx(bal=100_000),
        _tx(out=50_000, bal=160_000),   # delta +60000 ≠ 50000
    ])
    assert rows[1]["status"] == "check"
    assert "差額 +60,000" in rows[1]["reason"]
    assert rows[1]["amount_out"] == 50_000  # giữ nguyên số gốc


def test_dong_dau_tien_khong_du_du_lieu_thi_khong_sua():
    # Chưa có prev_balance → không thể kiểm tra kép, giữ nguyên
    rows = validate_transactions([_tx(out=50_000, bal=150_000)])
    assert rows[0]["status"] == "ok"
    assert rows[0]["amount_out"] == 50_000


def test_ngay_khong_parse_duoc_status_check():
    rows = validate_transactions([_tx(date_raw="???", bal=1000)])
    assert rows[0]["status"] == "check"
    assert rows[0]["date"] is None


def test_chuyen_ngay_gan_vao_ket_qua():
    rows = validate_transactions([_tx(date_raw="6-01-15", bal=1000)])
    assert rows[0]["date"] == "2024-01-15"


def test_dong_ghi_chu_khong_bi_bat_loi_ngay():
    # Dòng note (繰越...) không có ngày → không được báo 日付不明,
    # 残高 của nó (nếu khớp) vẫn dùng làm mốc nối chuỗi
    rows = validate_transactions([
        _tx(bal=506_202),
        {"date_raw": "", "description": "新通帳へ繰越しました", "amount_out": None,
         "amount_in": None, "balance": 506_202, "confidence": "high", "is_note": True},
        _tx(out=100_000, bal=406_202),
    ])
    assert rows[1]["status"] == "note"
    assert rows[2]["status"] == "ok"  # chuỗi nối qua dòng note


def test_ca_so_khong_co_zandaka_thi_tat_ca_phai_check():
    # Model đọc mất toàn bộ 残高 → checksum không chạy được, không được báo "sạch"
    rows = validate_transactions([
        _tx(inn=1000),
        _tx(out=500),
    ])
    assert all(r["status"] == "check" for r in rows)
    assert all("残高が読取れず検証不可" in r["reason"] for r in rows)


def test_co_it_nhat_mot_zandaka_thi_khong_danh_dau_toan_bo():
    rows = validate_transactions([
        _tx(bal=100_000),
        _tx(inn=1000),  # dòng lẻ không có 残高 vẫn ok (được cộng dồn kiểm sau)
    ])
    assert rows[0]["status"] == "ok"
    assert rows[1]["status"] == "ok"


def test_tach_zandaka_dinh_ma_toriatsukaiten():
    # Lỗi thật ở trang 3: 残高 189 dính mã 取扱店 709 thành 189709
    rows = validate_transactions([
        _tx(out=38, bal=189),
        _tx(inn=202_000, bal=202_189_720),   # thật ra là 202,189 + mã 720
        _tx(out=201_524, bal=665),           # 202,189 - 201,524 = 665: khớp sau khi tách
    ])
    assert rows[1]["balance"] == 202_189
    assert rows[1]["store_code"] == "720"
    assert rows[1]["status"] == "fixed"
    assert "残高から取扱店を分離" in rows[1]["reason"]
    assert rows[2]["status"] == "ok"


def test_tach_zandaka_dinh_ma_sua_lui_dong_dau():
    # Dòng ĐẦU dính mã (chưa kiểm chứng được) → dòng sau phát hiện và sửa lùi
    rows = validate_transactions([
        _tx(bal=189_709),                    # thật ra 189 + mã 709
        _tx(inn=202_000, bal=202_189),       # 189 + 202,000 = 202,189: khớp khi tách dòng đầu
    ])
    assert rows[0]["balance"] == 189
    assert rows[0]["store_code"] == "709"
    assert rows[0]["status"] == "fixed"
    assert rows[1]["status"] == "ok"


def test_chuoi_dinh_ma_lien_tiep_duoc_go_het():
    # Cả dãy dính mã liên tiếp (F8-F14 của user) → gỡ dây chuyền
    rows = validate_transactions([
        _tx(bal=189_709),                    # 189|709
        _tx(inn=202_000, bal=202_189_720),   # 202,189|720
        _tx(out=201_524, bal=665_709),       # 665|709
        _tx(inn=216_489, bal=217_154),       # dòng sạch
    ])
    assert [r["balance"] for r in rows] == [189, 202_189, 665, 217_154]
    assert all("残高不一致" not in r["reason"] for r in rows)


def test_noi_so_qua_dong_mikichou_cuoi_so_cu():
    # Sổ cũ kết thúc: ...506,202 rồi dòng 未記帳 in số dư 406,202 (đã trừ giao
    # dịch chưa ghi). Sổ mới ghi lại giao dịch đó: -100,000 → 406,202.
    # Mốc nối đúng là 506,202 (mốc áp cuối) chứ không phải 406,202.
    accounts = merge_accounts([
        _acc("福岡銀行", [
            _tx(out=49_455, bal=506_202),
            _tx(bal=406_202),                  # dòng 未記帳/ザンダカ
        ]),
        _acc(None, [
            _tx(out=100_000, bal=406_202),     # giao dịch thiếu, ghi ở sổ mới
            _tx(out=11_913, bal=394_289),
        ]),
    ])
    assert len(accounts) == 1
    assert accounts[0]["bank_name"] == "福岡銀行"


def test_noi_so_bao_dung_khi_dong_dau_so_moi_bi_doc_sai():
    # 口座2→口座3: dòng đầu sổ mới không có 残高/đọc sai nhưng dòng 2 khớp → vẫn nối
    accounts = merge_accounts([
        _acc("福岡銀行", [_tx(bal=506_202)]),
        _acc(None, [
            _tx(out=100_000),                 # dòng đầu sổ mới không in 残高
            _tx(out=11_913, bal=394_289),     # 506,202-100,000-11,913 = 394,289 ✓
        ]),
    ])
    assert len(accounts) == 1


def test_doi_cho_zandaka_va_toriatsukaiten():
    # Lỗi thật dòng 33: 残高=209, 取扱店=717 nhưng đúng phải ngược lại
    rows = validate_transactions([
        _tx(bal=276_717),
        {**_tx(out=276_000), "balance": 209, "store_code": "717"},
        _tx(inn=130_920, bal=131_637),  # 717 + 130,920 = 131,637: xác nhận
    ])
    assert rows[1]["balance"] == 717
    assert rows[1]["store_code"] == "209"
    assert rows[1]["status"] == "fixed"
    assert "残高と取扱店を入替補正" in rows[1]["reason"]
    assert rows[2]["status"] == "ok"


def test_suy_ra_zandaka_va_doi_cot_bang_kiem_chung_dong_sau():
    # Lỗi thật F10-F12: dòng NCB VISA nhận nhầm 残高 của dòng sau (217,154),
    # dòng 振込 216,489 nằm nhầm cột 出金 và 残高 in rác 1,114,709.
    # Chuỗi đúng: 202,189 → 665 → 217,154 → 211,154
    rows = validate_transactions([
        _tx(inn=202_000, bal=202_189),
        {**_tx(out=201_524), "balance": 217_154},          # đúng ra 665
        {**_tx(out=216_489), "balance": 1_114_709},        # đúng: +216,489 → 217,154
        _tx(out=6_000, bal=211_154),
    ])
    assert rows[1]["balance"] == 665            # sửa lùi bằng giả thuyết dẫn xuất
    assert rows[2]["balance"] == 217_154        # suy ra + kiểm chứng dòng sau
    assert rows[2]["amount_in"] == 216_489      # 振込 đã về đúng cột tiền vào
    assert rows[2]["amount_out"] is None
    assert rows[3]["status"] == "ok"
    assert not any("残高不一致" in r["reason"] for r in rows)


def test_chuan_hoa_ma_te_ve_bikou():
    # Sổ Fukuoka: mã ﾃ055 bị model nhét sang 取扱店 (mất chữ ﾃ) → trả về 備考
    rows = validate_transactions([
        {**_tx(out=20_105, bal=47_809), "extra_text": "ﾃ 055", "kind": "CDフリコミ"},
        {**_tx(out=23_635, bal=24_174), "extra_text": None, "store_code": "165",
         "kind": "CDフリコミ"},
    ])
    assert rows[1]["extra_text"] == "ﾃ165"
    assert rows[1]["store_code"] is None


def test_zandaka_lech_mot_hang_duoc_tu_sua():
    # Mẫu lỗi trang 0003: model gán 残高 của dòng trên cho dòng dưới (lệch 1 hàng)
    # Chuỗi đúng: 100000 →(+10000) 110000 →(-5000) 105000 →(+20000) 125000 →(-25000) 100000
    # Model trả: mỗi dòng nhận 残高 của dòng TRÊN nó
    rows = validate_transactions([
        _tx(inn=10_000, bal=100_000),   # đúng ra là 110000
        _tx(out=5_000, bal=110_000),    # đúng ra là 105000
        _tx(inn=20_000, bal=105_000),   # đúng ra là 125000
        _tx(out=25_000, bal=125_000),   # đúng ra là 100000
        _tx(inn=1_000, bal=100_000),    # đúng ra là 101000 (mất sau khi dịch)
    ])
    # Sau khi dịch 残高 lên 1 hàng, chuỗi khớp → không còn dòng 残高不一致
    assert not any("残高不一致" in r["reason"] for r in rows)
    assert any("残高の行ずれを自動補正" in r["reason"] for r in rows)
    assert rows[0]["balance"] == 110_000
    assert rows[-1]["balance"] is None  # dòng cuối không còn 残高 để đối chiếu


def test_khong_dich_zandaka_khi_khong_cai_thien():
    # Lệch lung tung (không phải mẫu lệch 1 hàng) → giữ nguyên, báo vàng
    rows = validate_transactions([
        _tx(bal=100_000),
        _tx(inn=5_000, bal=999_999),
        _tx(out=3_000, bal=555_555),
        _tx(inn=2_000, bal=111_111),
    ])
    assert sum(1 for r in rows if "残高不一致" in r["reason"]) == 3
    assert not any("行ずれ" in r["reason"] for r in rows)
    assert rows[1]["balance"] == 999_999  # số gốc giữ nguyên


# ---------- merge_accounts ----------

def _acc(bank, txs):
    return {"bank_name": bank, "transactions": txs}


def test_gop_hai_nua_cua_cung_mot_so():
    # 2 nửa trang cùng 1 sổ: 残高 cuối nửa 1 nối tiếp khớp nửa 2 → gộp làm 1
    accounts = merge_accounts([
        _acc(None, [_tx(bal=100_000)]),
        _acc("西日本シティ銀行", [_tx(out=20_000, bal=80_000)]),  # 100000-20000 khớp
    ])
    assert len(accounts) == 1
    assert accounts[0]["bank_name"] == "西日本シティ銀行"
    assert len(accounts[0]["transactions"]) == 2


def test_khong_gop_khi_so_du_khong_noi_tiep():
    # 2 sổ khác nhau: số dư không nối tiếp → giữ nguyên 2 account
    accounts = merge_accounts([
        _acc(None, [_tx(bal=100_000)]),
        _acc(None, [_tx(out=20_000, bal=500_000)]),
    ])
    assert len(accounts) == 2


def test_gop_khi_khac_ten_nhung_chuoi_khop_uu_tien_ten_khoi_sau():
    # Khối đầu bị gán nhầm tên từ bìa sổ bên cạnh, nhưng chuỗi 残高 khớp
    # → vẫn là 1 sổ, gộp lại và lấy tên khối sau (tên in ở footer trang)
    accounts = merge_accounts([
        _acc("福岡銀行", [_tx(bal=100_000)]),
        _acc("西日本シティ銀行", [_tx(out=20_000, bal=80_000)]),
    ])
    assert len(accounts) == 1
    assert accounts[0]["bank_name"] == "西日本シティ銀行"


def test_khong_gop_hai_so_that_su_khac_nhau():
    # 2 sổ thật (như trang 0002): tên khác nhau VÀ số dư không nối tiếp
    accounts = merge_accounts([
        _acc("福岡銀行", [_tx(bal=130_280)]),
        _acc("西日本シティ銀行", [_tx(inn=22_000, bal=25_866)]),
    ])
    assert len(accounts) == 2
