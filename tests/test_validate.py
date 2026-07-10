"""Test cho validate.py với dữ liệu giả."""

from validate import convert_wareki, validate_transactions


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


def test_ngay_khong_parse_duoc_status_check():
    rows = validate_transactions([_tx(date_raw="???", bal=1000)])
    assert rows[0]["status"] == "check"
    assert rows[0]["date"] is None


def test_chuyen_ngay_gan_vao_ket_qua():
    rows = validate_transactions([_tx(date_raw="6-01-15", bal=1000)])
    assert rows[0]["date"] == "2024-01-15"
