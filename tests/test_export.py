"""Test form Excel kiểu Cowork của export.py."""

from datetime import date

from openpyxl import load_workbook

from export import HEADER_ROW, export_accounts, verification_summary


def _tx(out=None, inn=None, bal=None, status="ok", reason="", **kw):
    row = {
        "date": "2025-08-27",
        "date_raw": "07-08-27",
        "kind": "200",
        "description": "テスト",
        "amount_out": out,
        "amount_in": inn,
        "balance": bal,
        "extra_text": None,
        "store_code": None,
        "is_note": False,
        "confidence": "high",
        "status": status,
        "reason": reason,
    }
    row.update(kw)
    return row


def _acc(txs, bank="テスト銀行", **meta):
    acc = {"bank_name": bank, "store_no": None, "account_no": None,
           "holder": None, "transactions": txs}
    acc.update(meta)
    return acc


def _headers(ws):
    return [ws.cell(row=HEADER_ROW, column=c).value
            for c in range(1, ws.max_column + 1)]


def test_khoi_thong_tin_va_cot(tmp_path):
    txs = [
        _tx(out=100, bal=900, extra_text="(282)", store_code="709"),
        _tx(inn=50, bal=950),
    ]
    out = tmp_path / "f.xlsx"
    export_accounts([_acc(txs, store_no="000", account_no="123456",
                          holder="株式会社 見本商事")], str(out), source_name="p1.jpg")
    ws = load_workbook(out).active

    # Khối thông tin
    assert ws["A1"].value == "銀行" and ws["B1"].value == "テスト銀行"
    assert ws["B2"].value == "000"
    assert ws["B3"].value == "123456"
    assert ws["B5"].value == "p1.jpg"

    # Cột động: có cả 備考 và 取扱店 vì dữ liệu có
    hs = _headers(ws)
    assert "備考" in hs and "取扱店" in hs
    assert hs[0] == "年月日(西暦)" and "残高チェック" in hs

    # Ngày là ô date thật
    assert isinstance(ws.cell(row=HEADER_ROW + 1, column=1).value, date)


def test_cot_bien_mat_khi_khong_co_du_lieu(tmp_path):
    out = tmp_path / "f2.xlsx"
    export_accounts([_acc([_tx(out=1, bal=9)])], str(out))
    hs = _headers(load_workbook(out).active)
    assert "備考" not in hs and "取扱店" not in hs


def test_cong_thuc_zandaka_check(tmp_path):
    txs = [_tx(out=100, bal=900), _tx(inn=50, bal=950)]
    out = tmp_path / "f3.xlsx"
    export_accounts([_acc(txs)], str(out))
    ws = load_workbook(out).active
    hs = _headers(ws)
    check_col = hs.index("残高チェック") + 1

    assert ws.cell(row=HEADER_ROW + 1, column=check_col).value == "―"
    formula = ws.cell(row=HEADER_ROW + 2, column=check_col).value
    # Tham chiếu dòng có 残高 phía trên: =IF(E9=E8-N(C9)+N(D9),"OK","NG")
    assert formula.startswith("=IF(") and '"OK"' in formula and '"NG"' in formula


def test_dong_ghi_chu_in_nghieng(tmp_path):
    txs = [
        _tx(out=100, bal=900),
        _tx(is_note=True, status="note", kind=None, date=None, date_raw=None,
            description="新通帳へ繰越しました", bal=None),
    ]
    out = tmp_path / "f4.xlsx"
    export_accounts([_acc(txs)], str(out))
    ws = load_workbook(out).active
    r = HEADER_ROW + 2
    assert ws.cell(row=r, column=1).value == "—"
    assert ws.cell(row=r, column=2).value == "注記"
    assert ws.cell(row=r, column=3).font.italic


def test_bao_cao_va_uchiwake(tmp_path):
    txs = [
        _tx(out=100, bal=900, description="NCB VISA"),
        _tx(inn=50, bal=950, description="ATM入金", kind="100"),
        _tx(inn=70, bal=1020, description="ATM入金", kind="100"),
    ]
    out = tmp_path / "f5.xlsx"
    export_accounts([_acc(txs)], str(out))
    ws = load_workbook(out).active

    vals = {}
    for r in range(HEADER_ROW + len(txs) + 1, ws.max_row + 1):
        label = ws.cell(row=r, column=2).value
        if label:
            vals[label] = (ws.cell(row=r, column=3).value, ws.cell(row=r, column=4).value)

    assert vals["期末残高"][0].startswith("=LOOKUP(9.9E+307")
    assert vals["お預り合計"][0].startswith("=SUM(")
    assert "検算（期首＋預り−支払＝期末）" in vals
    # 内訳 sống bằng COUNTIFS/SUMIFS
    assert vals["ATM入金"][0].startswith("=COUNTIFS(")
    assert vals["ATM入金"][1].startswith("=SUMIFS(")
    assert vals["NCB VISA"][0].startswith("=COUNTIFS(")


def test_o_khong_chac_chan_to_vang(tmp_path):
    txs = [_tx(out=100, bal=900, confidence="low"),
           _tx(inn=50, bal=999, status="check", reason="残高不一致(差額 +49)")]
    out = tmp_path / "f6.xlsx"
    export_accounts([_acc(txs)], str(out))
    ws = load_workbook(out).active
    hs = _headers(ws)

    desc_col = hs.index("摘要") + 1
    bal_col = hs.index("差引残高 (円)") + 1
    assert str(ws.cell(row=HEADER_ROW + 1, column=desc_col).fill.start_color.rgb).endswith("FFF2CC")
    assert str(ws.cell(row=HEADER_ROW + 2, column=bal_col).fill.start_color.rgb).endswith("FFF2CC")


# ---------- mức độ bảo đảm ----------

def test_muc_do_bao_dam_toan_bo_khop():
    v = verification_summary([_tx(out=100, bal=900), _tx(inn=50, bal=950)])
    assert v["chain_ok"] is True
    assert v["need_check"] == 0
    assert "残高チェーン検証済" in v["level"]


def test_muc_do_bao_dam_con_dong_can_soat():
    v = verification_summary([
        _tx(out=100, bal=900),
        _tx(inn=50, bal=999, status="check", reason="残高不一致"),
    ])
    assert v["chain_ok"] is False
    assert v["need_check"] == 1
    assert "1行が要確認" in v["level"]


def test_muc_do_bao_dam_khong_doc_duoc_so_du():
    # Không có 残高 nào → "sạch" là ảo, phải nói rõ chưa kiểm chứng được
    v = verification_summary([_tx(out=100), _tx(inn=50)])
    assert v["chain_ok"] is False
    assert "未検証" in v["level"]


def test_ghi_muc_do_bao_dam_bang_GIA_TRI_khong_phai_cong_thuc(tmp_path):
    # Phải là giá trị tính sẵn: công thức chưa tính thì chương trình khác đọc ra rỗng
    out = tmp_path / "v.xlsx"
    export_accounts([_acc([_tx(out=100, bal=900), _tx(inn=50, bal=950)])], str(out))
    ws = load_workbook(out, data_only=True).active
    assert ws["A6"].value == "検証レベル"
    assert "残高チェーン検証済" in str(ws["B6"].value)
    assert "取引 2行" in str(ws["F6"].value)

# ── Ngày người dùng gõ tay không được làm xuất file lỗi (task 0.3) ──────────

def _yellow(cell):
    return str(cell.fill.start_color.rgb).endswith("FFF2CC")


def test_ngay_hong_khong_lam_xuat_excel_do(tmp_path):
    txs = [
        _tx(bal=100, date="2025-04-11"),                                  # ngày đúng
        _tx(bal=100, date="2025/4/11", date_raw="07-04-11"),              # kiểu cũ trước khi sửa frontend
        _tx(bal=100, date="R7.4.11"),
        _tx(bal=100, date=None, date_raw="tuần sau"),                     # không đọc được
        _tx(bal=100, date="2025-02-30"),                                  # ISO đúng dạng nhưng ngày không tồn tại
        _tx(bal=100, date=20250411),                                      # kiểu dữ liệu lạ
        _tx(bal=100, date="", date_raw=None),
    ]
    out = tmp_path / "f.xlsx"
    export_accounts([_acc(txs)], str(out))                                # không được ném lỗi
    ws = load_workbook(out).active
    cells = [ws.cell(row=HEADER_ROW + 1 + i, column=1) for i in range(len(txs))]

    assert cells[0].value.date() == date(2025, 4, 11) and not _yellow(cells[0])
    assert [c.value for c in cells[1:6]] == ["2025/4/11", "R7.4.11", "tuần sau", "2025-02-30", "20250411"]
    assert all(_yellow(c) for c in cells[1:])                             # mọi ô hỏng đều tô vàng
    assert cells[6].value in (None, "")


def test_csv_voi_ngay_hong_van_xuat_duoc():
    from api.export_csv import accounts_to_csv

    txs = [_tx(bal=100, date="2025/4/11"), _tx(bal=100, date=None, date_raw="tuần sau")]
    text = accounts_to_csv([_acc(txs)]).decode("utf-8-sig")
    assert "2025/4/11" in text and "tuần sau" in text


# ── Task 1.4: Excel/CSV theo định nghĩa «cần soát» dùng chung (review.py) ───────────────────

import re  # noqa: E402

from api.export_csv import accounts_to_csv  # noqa: E402
from export import annotate  # noqa: E402

# Ký tự có dấu RIÊNG của tiếng Việt (không có trong tiếng Nhật/Anh)
_VIET = re.compile("[ăâđêôơưĂÂĐÊÔƠƯàáảãạằắẳẵặầấẩẫậèéẻẽẹềếểễệìíỉĩịòóỏõọồốổỗộờớởỡợùúủũụừứửữựỳýỷỹỵ]")


def _sheet(tmp_path, txs, **meta):
    out = tmp_path / "x.xlsx"
    export_accounts([_acc(txs, **meta)], str(out))
    return load_workbook(out).active


def _col(ws, name):
    return _headers(ws).index(name) + 1


def _row_cells(ws, i):
    """Các ô của dòng dữ liệu thứ i (0 = dòng đầu), theo tên cột."""
    return {h: ws.cell(row=HEADER_ROW + 1 + i, column=c) for c, h in enumerate(_headers(ws), 1)}


def test_dong_review_to_vang_con_dong_confirmed_thi_khong(tmp_path):
    txs = [
        _tx(bal=1000, description="ヨキンキ"),
        _tx(out=100, bal=999, description="フリコミ", status="check", reason="残高不一致(差額 +99)"),   # NG, chưa ✓
        _tx(out=100, bal=799, description="フリコミ", status="check", reason="残高不一致(差額 +99)",
            reviewed=True, reviewed_at=1700000000),                                                 # NG nhưng đã ✓
        _tx(out=1, bal=798, description="カ）タナカ", date=None, date_raw="???", reviewed=True),       # ngày hỏng nhưng đã ✓
    ]
    ws = _sheet(tmp_path, txs)
    nghi = _row_cells(ws, 1)
    assert all(_yellow(nghi[h]) for h in ("お支払金額 (円)", "お預り金額 (円)", "差引残高 (円)", "摘要"))
    assert nghi["確認メモ"].value.startswith("要確認: 残高不一致(差額 +99)")

    for i in (2, 3):                                     # đã ✓ ⇒ không còn ô vàng nào, kể cả 摘要 katakana
        assert not any(_yellow(c) for c in _row_cells(ws, i).values()), f"dòng {i} còn ô vàng"
    assert _row_cells(ws, 2)["確認メモ"].value == "確認済（元: 残高不一致(差額 +99)）"
    assert _row_cells(ws, 3)["確認メモ"].value == "確認済"
    assert _row_cells(ws, 3)["年月日(西暦)"].value == "???"          # vẫn ghi chuỗi gốc, chỉ không tô


def test_dong_chua_xac_nhan_van_to_vang_ten_katakana(tmp_path):
    ws = _sheet(tmp_path, [_tx(bal=1000, description="ヨキンキ"),
                           _tx(out=1, bal=999, description="カ）タナカ", reviewed=True)])
    assert _yellow(_row_cells(ws, 0)["摘要"]) and not _yellow(_row_cells(ws, 1)["摘要"])


def test_nguoi_sua_dung_thi_het_vang_va_memo_ghi_may_doc_den_hien_tai(tmp_path):
    # Máy đọc 残高 1,340 (lệch) → người sửa thành 900 (đúng): cờ cũ của máy còn nguyên nhưng dòng hết vàng
    txs = [
        _tx(bal=1000),
        _tx(out=100, bal=900, status="check", reason="残高不一致(差額 +440)", orig={"balance": 1340},
            description="ATM"),
    ]
    ws = _sheet(tmp_path, txs)
    c = _row_cells(ws, 1)
    assert not any(_yellow(x) for x in c.values())
    assert c["確認メモ"].value == "手修正: 差引残高 1,340→900"


def test_nguoi_sua_sai_chuoi_lech_thi_vang_du_may_khong_ghi_ly_do(tmp_path):
    ws = _sheet(tmp_path, [_tx(bal=1000), _tx(out=100, bal=999, orig={"balance": 900})])
    c = _row_cells(ws, 1)
    assert _yellow(c["差引残高 (円)"]) and c["確認メモ"].value == "要確認: 残高不一致（検算NG）"


def test_o_may_tu_tinh_va_dong_them_tay(tmp_path):
    txs = [
        _tx(bal=1000),
        _tx(out=100, bal=900, inferred=["balance"]),
        _tx(out=100, bal=800, added=True),
        _tx(out=100, bal=700, added=True, reviewed=True, inferred=["balance"]),
    ]
    ws = _sheet(tmp_path, txs)
    assert _row_cells(ws, 1)["確認メモ"].value == "推定値（残高から計算）"
    assert not _yellow(_row_cells(ws, 1)["差引残高 (円)"])
    assert _row_cells(ws, 2)["確認メモ"].value == "要確認: 手入力行（未確認）"
    assert _yellow(_row_cells(ws, 2)["お支払金額 (円)"])
    assert _row_cells(ws, 3)["確認メモ"].value == "確認済推定値（残高から計算）"


def test_dong_tu_sua_van_xanh_va_ghi_tu_dong_sua(tmp_path):
    ws = _sheet(tmp_path, [_tx(bal=1000),
                           _tx(out=100, bal=900, status="fixed", reason="残高を検算で補正(印字読取 910)")])
    c = _row_cells(ws, 1)
    assert str(c["お支払金額 (円)"].fill.start_color.rgb).endswith("C6EFCE")
    assert c["確認メモ"].value == "自動修正: 残高を検算で補正(印字読取 910)"


def test_dong_ghi_chu_khong_bao_gio_to_vang_du_engine_ghi_status_check(tmp_path):
    txs = [_tx(bal=1000), _tx(is_note=True, status="check", reason="残高不一致(差額 +5)", kind=None,
                              date=None, date_raw=None, description="繰越", bal=1005, confidence="high")]
    ws = _sheet(tmp_path, txs)
    c = _row_cells(ws, 1)
    assert not any(_yellow(x) for x in c.values()) and c["確認メモ"].value is None
    assert c["残高チェック"].value == "―"


# ── 検証レベル ──

def test_muc_do_bao_dam_khi_da_xac_nhan_het():
    v = verification_summary([_tx(bal=1000), _tx(out=100, bal=900, reviewed=True),
                              _tx(out=1, bal=899, reviewed=True)])
    assert (v["rows"], v["confirmed"], v["need_check"], v["verified"]) == (3, 2, 0, 1)
    assert v["level"] == "検証済（残高一致・人手確認 2行）" and v["chain_ok"] is True


def test_muc_do_bao_dam_xac_nhan_ca_dong_van_lech_thi_khong_noi_khop():
    # ✓ thắng NG, nhưng 検証レベル không được nói "残高一致" khi chuỗi vẫn lệch ở dòng đã ✓
    v = verification_summary([_tx(bal=1000), _tx(out=100, bal=999, reviewed=True)])
    assert v["need_check"] == 0 and v["confirmed"] == 1
    assert v["level"] == "検証済（人手確認 1行・うち残高不一致 1行）"


def test_muc_do_bao_dam_con_dong_can_soat_thi_van_noi_chua_xong_du_co_dong_da_xac_nhan():
    v = verification_summary([_tx(bal=1000), _tx(out=100, bal=900, reviewed=True), _tx(out=1, bal=5)])
    assert v["level"] == "一部未検証（1行が要確認）" and v["chain_ok"] is False


def test_muc_do_bao_dam_dem_dong_nguoi_sua_va_giu_khoa_cu():
    v = verification_summary([_tx(bal=1000), _tx(out=100, bal=900, orig={"description": "x"}),
                              _tx(out=1, bal=899, status="fixed", reason="金額の列を入替")])
    assert (v["edited"], v["fixed"], v["verified"], v["rows"]) == (1, 1, 3, 3)
    assert {"rows", "verified", "fixed", "need_check", "level", "chain_ok"} <= v.keys()


def test_dong_6_ghi_so_dong_nguoi_da_xac_nhan(tmp_path):
    out = tmp_path / "v.xlsx"
    export_accounts([_acc([_tx(bal=1000), _tx(out=100, bal=900, reviewed=True), _tx(out=1, bal=5)])], str(out))
    ws = load_workbook(out, data_only=True).active
    assert ws["F6"].value == "取引 3行 / 残高検算OK 1行 / 自動修正 0行 / 人手確認 1行 / 要確認 1行"
    assert ws["B6"].value.startswith("一部未検証")


# ── Chú thích tiếng Nhật, không còn chữ Việt ──

def test_chu_thich_hoan_toan_tieng_nhat(tmp_path):
    txs = [_tx(bal=1000), _tx(inn=50, bal=1050), _tx(out=1, bal=5)]
    ws = _sheet(tmp_path, txs)
    assert ws["F1"].value == "黄色＝要確認（読取り・検算で疑わしい箇所。カタカナ名は原本と照合してください）"
    assert ws["F2"].value == "緑＝残高検算で自動修正"
    assert ws["F3"].value == "確認メモ『確認済』＝利用者が原本と照合済み"
    xau = [(c.coordinate, c.value) for row in ws.iter_rows() for c in row
           if isinstance(c.value, str) and _VIET.search(c.value)]
    assert not xau, f"còn chữ Việt trong file: {xau}"


def test_cau_canh_bao_gioi_han_van_con(tmp_path):
    ws = _sheet(tmp_path, [_tx(bal=1000)])
    assert "残高チェーンは行の抜け・摘要の誤読を検出できません" in ws["H6"].value


# ── Nhiều khối trong một sổ ──

def test_dong_dau_khoi_la_gach_ngang_khong_to_vang_va_khong_co_cong_thuc(tmp_path):
    txs = [
        _tx(bal=1000, description="ATM"), _tx(out=100, bal=900, description="ATM"),
        _tx(bal=5000, block_start=True, description="ATM"), _tx(out=100, bal=4900, description="ATM"),  # khối 2: số dư đầu khác hẳn
    ]
    ws = _sheet(tmp_path, txs)
    chk = _col(ws, "残高チェック")
    assert [ws.cell(row=HEADER_ROW + 1 + i, column=chk).value for i in (0, 2)] == ["―", "―"]
    assert ws.cell(row=HEADER_ROW + 4, column=chk).value.startswith("=IF(")
    assert not any(_yellow(c) for i in (2, 3) for c in _row_cells(ws, i).values())
    assert verification_summary(txs)["need_check"] == 0


def test_cong_thuc_cong_don_qua_dong_khong_in_so_du(tmp_path):
    ws = _sheet(tmp_path, [_tx(bal=1000), _tx(out=100), _tx(out=50, bal=850)])
    f = ws.cell(row=HEADER_ROW + 3, column=_col(ws, "残高チェック")).value
    assert f == '=IF(F11=F9-SUM(D10:D11)+SUM(E10:E11),"OK","NG")'


# ── CSV cùng một nguồn với Excel ──

def test_csv_dung_cung_trang_thai_va_memo_voi_excel():
    txs = [
        _tx(bal=1000),
        _tx(out=100, bal=999, status="check", reason="残高不一致(差額 +99)"),
        _tx(out=100, bal=799, reviewed=True, reviewed_at=1),
        _tx(bal=5000, block_start=True),
    ]
    import csv
    import io

    rows = list(csv.reader(io.StringIO(accounts_to_csv([_acc(txs)]).decode("utf-8-sig"))))[3:]
    notes = annotate(txs)
    assert [r[-2] for r in rows] == [n["chk"] for n in notes] == ["―", "NG", "NG", "―"]
    assert [r[-1] for r in rows] == ["", "要確認: 残高不一致(差額 +99)", "確認済", ""]


def test_csv_dong_ghi_chu_khong_con_bi_ghi_yeu_cau_xac_nhan():
    txs = [_tx(bal=1000), _tx(is_note=True, status="check", reason="残高不一致(差額 +5)", bal=1005, kind=None)]
    last = accounts_to_csv([_acc(txs)]).decode("utf-8-sig").splitlines()[-1]
    assert "要確認" not in last


# ── Số liệu theo mặt sổ của một lần quét (api/jobs.py) ──

def test_per_sheet_cua_lan_quet_dung_dinh_nghia_chung():
    from types import SimpleNamespace

    from api import jobs

    rows = [_tx(bal=1000, source_unit=0), _tx(out=100, bal=999, source_unit=0),          # NG
            _tx(bal=5000, source_unit=1), _tx(out=1, bal=4999, source_unit=1, status="fixed", reason="金額の列を入替")]
    result = SimpleNamespace(to_dict=lambda: {"accounts": [_acc(rows)]})
    data = jobs._payload(SimpleNamespace(sheet_ids=["a", "b"]), result)
    por = {p["sheet_id"]: p for p in data["per_sheet"]}
    assert (por["a"]["rows"], por["a"]["need_check"], por["a"]["fixed"]) == (2, 1, 0)
    assert (por["b"]["rows"], por["b"]["need_check"], por["b"]["fixed"]) == (2, 0, 1)
