"""Test core.scan() — chạy hoàn toàn offline bằng cách thay extract_transactions.

Mục đích: bảo đảm lõi dùng chung của CLI và web giữ đúng THỨ TỰ xử lý
(split_mixed → cover metadata → merge → validate) và không in ra màn hình.
"""

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import core  # noqa: E402


def _tx(date_raw, out=None, inc=None, balance=None, **kw):
    return {
        "date_raw": date_raw, "kind": None, "description": None, "extra_text": None,
        "store_code": None, "amount_out": out, "amount_in": inc, "balance": balance,
        "low_confidence": False, **kw,
    }


def _fake_extract(accounts, **overrides):
    """Trả về hàm thay cho extract_transactions, không gọi API."""
    def _fn(file_paths, rotate=0, use_cache=True, on_progress=None):
        if on_progress:
            for i, p in enumerate(file_paths):
                on_progress({"stage": "page", "message": str(p),
                             "index": i + 1, "total": len(file_paths)})
        return {
            "accounts": [dict(a, transactions=list(a["transactions"])) for a in accounts],
            "model": "gemini-2.5-flash",
            "usage": {"input_tokens": 1000, "output_tokens": 500},
            "cached": False,
            "skipped": [],
            "pages": len(file_paths),
            **overrides,
        }
    return _fn


@pytest.fixture
def one_account():
    return [{
        "bank_name": "福岡銀行", "store_no": "286", "account_no": "615001",
        "holder": None, "source_unit": 0,
        "transactions": [
            _tx("07-05-01", inc=10000, balance=10000),
            _tx("07-05-02", out=3000, balance=7000),
        ],
    }]


def test_scan_chay_het_pipeline(monkeypatch, one_account, tmp_path):
    monkeypatch.setattr(core, "extract_transactions", _fake_extract(one_account))
    result = core.scan([tmp_path / "so.jpg"])

    assert len(result.accounts) == 1
    assert result.model == "gemini-2.5-flash"
    assert result.source_name == "so.jpg"
    # validate_transactions đã chạy: mỗi dòng có status và date đã đổi từ 和暦
    txs = result.accounts[0]["transactions"]
    assert [t["status"] for t in txs] == ["ok", "ok"]
    assert txs[0]["date"] == "2025-05-01"


def test_banks_ghi_de_ten_ngan_hang(monkeypatch, one_account, tmp_path):
    monkeypatch.setattr(core, "extract_transactions", _fake_extract(one_account))

    result = core.scan([tmp_path / "so.jpg"], banks="西日本シティ銀行")
    assert result.accounts[0]["bank_name"] == "西日本シティ銀行"

    # Dạng list và chuỗi rỗng (giữ nguyên tên model đọc được) đều phải đúng
    result = core.scan([tmp_path / "so.jpg"], banks=["", "香川銀行"])
    assert result.accounts[0]["bank_name"] == "福岡銀行"


def test_scan_khong_in_ra_man_hinh(monkeypatch, one_account, tmp_path, capsys):
    monkeypatch.setattr(core, "extract_transactions", _fake_extract(one_account))
    core.scan([tmp_path / "so.jpg"])
    assert capsys.readouterr().out == ""


def test_on_progress_nhan_du_su_kien(monkeypatch, one_account, tmp_path):
    monkeypatch.setattr(core, "extract_transactions", _fake_extract(one_account))
    events = []
    core.scan([tmp_path / "a.jpg", tmp_path / "b.jpg"], on_progress=events.append)

    stages = [e["stage"] for e in events]
    assert stages == ["page", "page", "validate", "done"]
    assert events[-1]["totals"]["rows"] == 2
    assert all("message" in e for e in events)


def test_verification_va_totals(monkeypatch, tmp_path):
    accounts = [{
        "bank_name": "福岡銀行", "store_no": None, "account_no": "1", "holder": None,
        "source_unit": 0,
        "transactions": [
            _tx("07-05-01", inc=10000, balance=10000),
            _tx("07-05-02", out=3000, balance=9999),   # lệch → phải bị cờ
        ],
    }]
    monkeypatch.setattr(core, "extract_transactions", _fake_extract(accounts))
    result = core.scan([tmp_path / "so.jpg"])

    v = result.verification[0]
    assert v["bank_name"] == "福岡銀行"
    assert v["rows"] == 2 and v["need_check"] >= 1
    assert result.totals["chain_ok"] is False
    assert result.totals["accounts"] == 1


def test_gop_2_khoi_cung_mot_so(monkeypatch, tmp_path):
    """2 trang liên tiếp cùng số tài khoản, chuỗi số dư nối được → 1 sheet."""
    accounts = [
        {"bank_name": "福岡銀行", "store_no": None, "account_no": "615001",
         "holder": None, "source_unit": 0,
         "transactions": [_tx("07-05-01", inc=10000, balance=10000),
                          _tx("07-05-02", out=1000, balance=9000)]},
        {"bank_name": "福岡銀行", "store_no": None, "account_no": "615001",
         "holder": None, "source_unit": 1,
         "transactions": [_tx("07-05-03", out=2000, balance=7000),
                          _tx("07-05-04", inc=500, balance=7500)]},
    ]
    monkeypatch.setattr(core, "extract_transactions", _fake_extract(accounts))
    result = core.scan([tmp_path / "a.jpg", tmp_path / "b.jpg"])

    assert len(result.accounts) == 1
    assert len(result.accounts[0]["transactions"]) == 4


def test_chi_phi_va_cache(monkeypatch, one_account, tmp_path):
    monkeypatch.setattr(core, "extract_transactions", _fake_extract(one_account))
    result = core.scan([tmp_path / "so.jpg"])
    # 1000 vào × $0.30/1M + 500 ra × $2.50/1M
    assert result.cost_usd == pytest.approx((1000 * 0.30 + 500 * 2.50) / 1e6)

    monkeypatch.setattr(
        core, "extract_transactions", _fake_extract(one_account, cached=True)
    )
    assert core.scan([tmp_path / "so.jpg"]).cost_usd == 0.0

    assert core.estimate_cost("model-la", {"input_tokens": 9}) is None


def test_to_dict_serialize_duoc(monkeypatch, one_account, tmp_path):
    import json

    monkeypatch.setattr(core, "extract_transactions", _fake_extract(one_account))
    payload = core.scan([tmp_path / "so.jpg"]).to_dict()
    assert json.loads(json.dumps(payload, ensure_ascii=False))["totals"]["rows"] == 2
    assert payload["verification"][0]["level"]


def test_to_excel_ghi_duoc_file(monkeypatch, one_account, tmp_path):
    monkeypatch.setattr(core, "extract_transactions", _fake_extract(one_account))
    out = tmp_path / "ket_qua.xlsx"
    assert core.scan([tmp_path / "so.jpg"]).to_excel(out) == str(out)
    assert out.is_file()


def test_file_don_khong_can_list(monkeypatch, one_account, tmp_path):
    monkeypatch.setattr(core, "extract_transactions", _fake_extract(one_account))
    assert core.scan(str(tmp_path / "so.jpg")).source_name == "so.jpg"
