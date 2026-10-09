"""Xuất file theo cấu trúc (task 2.4): `per_account` gom các mặt cùng một tài khoản vào một sheet."""

import io

import pytest
from openpyxl import load_workbook

from api import workspace
from api.main import _account_title, _group_by_account
from test_api_auth import client, register  # noqa: F401 — fixture dùng chung: CSDL tạm


def _tx(sheet, desc, bal, out=None, inn=None, **kw):
    return {"date": "2025-04-25", "date_raw": None, "kind": None, "description": desc, "extra_text": None,
            "store_code": None, "amount_out": out, "amount_in": inn, "balance": bal, "status": "ok",
            "reason": "", "sheet_id": sheet, **kw}


def _acc(bank, number, sheet, *descs, **kw):
    """Một «sổ» như client gửi lên: dòng đầu có block_start, số dư giảm dần 1000 mỗi dòng."""
    txs = [_tx(sheet, d, 10_000 - i * 1000, out=1000 if i else None, **({"block_start": True} if i == 0 else {}))
           for i, d in enumerate(descs)]
    return {"bank_name": bank, "store_no": kw.get("store_no"), "account_no": number, "holder": kw.get("holder"),
            "transactions": txs}


NAMES = {"s1": "Mặt 1", "s2": "Mặt 2", "s3": "Mặt 3", "s4": "Mặt 4"}


def _titles(groups):
    return [g["sheet_title"] for g in groups]


def _sheets_of(groups):
    return [sorted({t["sheet_id"] for t in g["transactions"]}) for g in groups]


# ── Quy tắc gom ───────────────────────────────────────────────────────

def test_hai_mat_cung_tai_khoan_thanh_mot_sheet():
    out = _group_by_account([_acc("A銀行", "111", "s1", "a", "b"), _acc("A銀行", "111", "s2", "c", "d")], NAMES)
    assert len(out) == 1
    assert _sheets_of(out) == [["s1", "s2"]]
    assert [t["description"] for t in out[0]["transactions"]] == ["a", "b", "c", "d"]    # đúng thứ tự cột trái
    assert out[0]["sheet_title"] == "A銀行 111"


def test_hai_tai_khoan_khac_nhau_thanh_hai_sheet():
    out = _group_by_account([_acc("A銀行", "111", "s1", "a"), _acc("A銀行", "222", "s2", "b")], NAMES)
    assert _sheets_of(out) == [["s1"], ["s2"]]
    assert _titles(out) == ["A銀行 111", "A銀行 222"]


def test_cung_so_tai_khoan_nhung_khac_ngan_hang_la_hai_tai_khoan():
    out = _group_by_account([_acc("A銀行", "111", "s1", "a"), _acc("B銀行", "111", "s2", "b")], NAMES)
    assert _sheets_of(out) == [["s1"], ["s2"]]


def test_khong_co_so_tai_khoan_thi_moi_mat_mot_sheet_dat_ten_theo_mat_so():
    out = _group_by_account([_acc("A銀行", None, "s1", "a"), _acc("A銀行", None, "s2", "b"), _acc(None, "", "s3", "c")], NAMES)
    assert _sheets_of(out) == [["s1"], ["s2"], ["s3"]]
    assert _titles(out) == ["Mặt 1", "Mặt 2", "Mặt 3"]


def test_mat_cung_tai_khoan_nhung_khong_dung_lien_nhau_van_gom_theo_thu_tu_dau_tien():
    out = _group_by_account([_acc("A", "111", "s1", "a"), _acc("B", "222", "s2", "b"), _acc("A", "111", "s3", "c")], NAMES)
    assert _sheets_of(out) == [["s1", "s3"], ["s2"]]                    # A đứng trước vì mặt ① xuất hiện trước


def test_tai_khoan_co_so_va_mat_khong_so_tron_lan():
    out = _group_by_account([_acc("A", "111", "s1", "a"), _acc("A", None, "s2", "b"), _acc("A", "111", "s3", "c")], NAMES)
    assert _sheets_of(out) == [["s1", "s3"], ["s2"]]
    assert _titles(out) == ["A 111", "Mặt 2"]


def test_so_tai_khoan_co_khoang_trang_van_la_cung_tai_khoan():
    out = _group_by_account([_acc(" A銀行 ", " 111 ", "s1", "a"), _acc("A銀行", "111", "s2", "b")], NAMES)
    assert len(out) == 1


def test_mot_mat_hai_so_cung_so_tai_khoan_van_la_mot_sheet_nhung_tach_khoi():
    sau = _acc("A", "111", "s1", "c")
    sau["transactions"][0].pop("block_start")                            # client cũ không đánh dấu
    out = _group_by_account([_acc("A", "111", "s1", "a"), _acc("B", "222", "s1", "b"), sau], NAMES)
    assert _sheets_of(out) == [["s1"], ["s1"]]
    a = out[0]["transactions"]
    assert [t["description"] for t in a] == ["a", "c"] and a[1].get("block_start") is True


def test_cho_noi_giua_hai_mat_luon_co_block_start_ke_ca_khi_client_khong_gui():
    thieu = _acc("A", "111", "s2", "c", "d")
    for t in thieu["transactions"]:
        t.pop("block_start", None)                                       # client cũ không đánh dấu
    out = _group_by_account([_acc("A", "111", "s1", "a", "b"), thieu], NAMES)
    rows = out[0]["transactions"]
    assert [bool(t.get("block_start")) for t in rows] == [True, False, True, False]
    assert not thieu["transactions"][0].get("block_start"), "không được sửa dữ liệu đầu vào"


def test_thong_tin_phu_lay_tu_mat_sau_neu_mat_dau_thieu():
    out = _group_by_account([_acc("A", "111", "s1", "a"), _acc("A", "111", "s2", "b", holder="ヤマダ", store_no="007")], NAMES)
    assert out[0]["holder"] == "ヤマダ" and out[0]["store_no"] == "007"
    out = _group_by_account([_acc("A", "111", "s1", "a", holder="ĐẦU"), _acc("A", "111", "s2", "b", holder="SAU")], NAMES)
    assert out[0]["holder"] == "ĐẦU"                                      # mặt đầu đã có thì giữ


def test_danh_sach_rong_va_so_dong_khong_mat():
    assert _group_by_account([], NAMES) == []
    accs = [_acc("A", "111", "s1", "a", "b", "c"), _acc("B", "222", "s2", "d"), _acc("A", "111", "s3", "e", "f")]
    out = _group_by_account(accs, NAMES)
    assert sum(len(g["transactions"]) for g in out) == 6


def test_ten_tab_cat_ten_ngan_hang_chu_khong_cat_so_tai_khoan():
    assert _account_title("見本シティ銀行", "0000001") == "見本シティ銀行 0000001"
    dai = _account_title("あ" * 40, "1234567")
    assert len(dai) <= 28 and dai.endswith(" 1234567")
    assert _account_title(None, "1234567") == "1234567"
    assert _account_title("銀行", "9" * 40) == "9" * 40                    # số quá dài: bỏ tên, để export tự cắt


# ── Qua route /export ─────────────────────────────────────────────────

def _ho_so(client, *sheet_ids):
    register(client)
    wid = client.post("/api/ws").json()["id"]
    w = workspace.load(wid)
    for sid in sheet_ids:
        w.sheets.append(workspace.Sheet(id=sid, name=NAMES[sid], origin=f"{sid}.png"))
    w.save()
    return wid


def _xuat(client, wid, accounts, **body):
    r = client.post(f"/api/ws/{wid}/export", json={"format": "xlsx", "name": "t", "accounts": accounts, **body})
    assert r.status_code == 200, r.text
    return load_workbook(io.BytesIO(r.content), data_only=False)


def test_route_per_account_hai_mat_cung_tai_khoan_mot_sheet(client):
    wid = _ho_so(client, "s1", "s2")
    wb = _xuat(client, wid, [_acc("A銀行", "111", "s1", "a", "b"), _acc("A銀行", "111", "s2", "c", "d")], structure="per_account")
    assert len(wb.worksheets) == 1
    ws = wb.worksheets[0]
    assert ws["B1"].value == "A銀行" and ws["B3"].value == "111"
    assert [ws.cell(row=r, column=3).value for r in range(9, 13)] == ["a", "b", "c", "d"]   # 4 dòng dữ liệu, theo thứ tự cột trái


def test_route_per_account_khac_tai_khoan_hai_sheet_va_khong_so_moi_mat_mot_sheet(client):
    wid = _ho_so(client, "s1", "s2", "s3")
    wb = _xuat(client, wid, [_acc("A", "111", "s1", "a"), _acc("A", "222", "s2", "b"), _acc("A", None, "s3", "c")],
               structure="per_account")
    assert len(wb.worksheets) == 3
    assert [w["B3"].value for w in wb.worksheets] == ["111", "222", "―"]
    assert wb.worksheets[2].title == "Mặt 3"


def test_route_per_account_loc_theo_pham_vi_truoc_khi_gom(client):
    wid = _ho_so(client, "s1", "s2", "s3")
    accs = [_acc("A", "111", "s1", "a"), _acc("A", "111", "s2", "b"), _acc("B", "222", "s3", "c")]
    wb = _xuat(client, wid, accs, structure="per_account", sheet_ids=["s2", "s3"])
    assert len(wb.worksheets) == 2
    assert [w["B3"].value for w in wb.worksheets] == ["111", "222"]
    assert wb.worksheets[0].cell(row=9, column=3).value == "b"             # mặt ① (ngoài phạm vi) không lẫn vào


def test_route_per_account_csv_van_chay(client):
    wid = _ho_so(client, "s1", "s2")
    r = client.post(f"/api/ws/{wid}/export", json={
        "format": "csv", "name": "t", "structure": "per_account",
        "accounts": [_acc("A", "111", "s1", "a"), _acc("A", "111", "s2", "b")]})
    assert r.status_code == 200 and "text/csv" in r.headers["content-type"]
    text = r.content.decode("utf-8-sig")
    assert "a" in text and "b" in text


def test_route_cau_truc_cu_van_chay_va_cau_truc_la_bi_tu_choi(client):
    wid = _ho_so(client, "s1", "s2")
    accs = [_acc("A", "111", "s1", "a"), _acc("A", "111", "s2", "b")]
    assert len(_xuat(client, wid, accs, structure="per_sheet").worksheets) == 2
    assert len(_xuat(client, wid, accs, structure="merged").worksheets) == 1
    assert len(_xuat(client, wid, accs).worksheets) == 2                  # không gửi structure: như cũ, mỗi «sổ» client gửi một sheet
    r = client.post(f"/api/ws/{wid}/export", json={"format": "xlsx", "accounts": accs, "structure": "per_nguoi"})
    assert r.status_code == 400 and "structure" in r.json()["detail"]


def test_route_per_account_junction_khong_noi_ngam_va_khong_bao_ng_gia(client):
    """Dòng đầu mặt sau (số dư KHÔNG nối với cuối mặt trước) không được thành ô NG: chỗ nối do web kiểm riêng."""
    wid = _ho_so(client, "s1", "s2")
    truoc = _acc("A", "111", "s1", "a", "b")                              # số dư 10,000 → 9,000
    sau = _acc("A", "111", "s2", "c", "d")                                # số dư 10,000 → 9,000 (không nối với 9,000 → 10,000)
    ws = _xuat(client, wid, [truoc, sau], structure="per_account").worksheets[0]
    chk_col = next(c for c in range(1, ws.max_column + 1) if ws.cell(row=8, column=c).value == "残高チェック")
    rows = [ws.cell(row=r, column=chk_col).value for r in range(9, 13)]
    assert rows[0] == "―" and rows[2] == "―", f"dòng đầu mỗi mặt không có công thức: {rows}"
    assert all(str(v).startswith("=IF(") for v in (rows[1], rows[3]))
