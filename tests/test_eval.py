"""Test cho eval.py — thước đo phải đúng, nếu không mọi kết luận đều sai."""

from eval import _align, _find_columns, _row_key


class _FakeWs:
    """Sheet giả: chỉ cần .cell(row, column).value và max_row/max_column."""

    def __init__(self, grid):
        self.grid = grid
        self.max_row = len(grid)
        self.max_column = max(len(r) for r in grid)
        self.title = "test"

    def cell(self, row, column):
        r = self.grid[row - 1] if row - 1 < len(self.grid) else []
        value = r[column - 1] if column - 1 < len(r) else None
        return type("C", (), {"value": value})()


def _row(bal, date="2025-01-01", out=None, inn=None):
    return {"date": date, "desc": "", "out": out, "in": inn, "bal": bal}


# ---------- căn chuỗi khi máy sót/thêm dòng ----------

def test_can_chuoi_khi_may_sot_mot_dong_o_giua():
    # Ca thật 百十四銀行: máy sót 1 dòng giữa chừng. Ghép theo vị trí sẽ làm mọi
    # dòng SAU đó lệch một bậc và bị chấm sai hàng loạt (147/208 thay vì 203/208).
    gt = [_row(100), _row(200), _row(300), _row(400), _row(500)]
    out = [_row(100), _row(200), _row(400), _row(500)]   # thiếu 300
    pairs = _align(gt, out)
    assert pairs == [(0, 0), (1, 1), (2, None), (3, 2), (4, 3)]


def test_can_chuoi_khi_may_thua_mot_dong():
    gt = [_row(100), _row(200), _row(300)]
    out = [_row(100), _row(999), _row(200), _row(300)]   # thừa 999
    pairs = _align(gt, out)
    assert [p[0] for p in pairs] == [0, 1, 2]
    assert out[pairs[1][1]]["bal"] == 200      # dòng 200 vẫn ghép đúng
    assert out[pairs[2][1]]["bal"] == 300


def test_dong_sai_so_du_van_duoc_ghep_de_cham_diem():
    # Dòng máy đọc sai 残高 vẫn phải được ghép (để còn chấm ngày/摘要), không
    # được tính là "mất dòng"
    gt = [_row(100), _row(200), _row(300)]
    out = [_row(100), _row(999), _row(300)]
    pairs = _align(gt, out)
    assert all(j is not None for _, j in pairs)


def test_khoa_ghep_dung_so_du_khi_co():
    assert _row_key(_row(12345))[0] == "b"
    assert _row_key(_row(None))[0] == "x"


# ---------- dò cột ----------

def test_nhan_dien_cot_o_hikidashi_cua_tokushima():
    # 徳島大正 dùng「お引き出し金額」thay vì「お支払金額」— trước đây eval không
    # nhận ra nên đọc nhầm cả sheet thành 4 dòng rác
    ws = _FakeWs([
        ["銀行", "徳島大正銀行"],
        [],
        ["年月日(西暦)", "摘要", "お引き出し金額 (円)", "お預り金額 (円)",
         "差引残高 (円)", "備考(店番)", "残高チェック"],
    ])
    header_row, cols = _find_columns(ws)
    assert header_row == 3
    assert cols["out"] == 3
    assert cols["in"] == 4
    assert cols["bal"] == 5
