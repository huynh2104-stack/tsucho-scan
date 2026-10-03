"""Định nghĩa「cần soát」dùng chung (task 1.2) — bản Python.

Cùng bộ ca `tests/fixtures/review_cases.json` với `web/src/lib/review.test.ts`: hai bản
review.py / review.ts chỉ cần một trong hai lệch luật là một trong hai test này đỏ.
"""

import ast
import json
from pathlib import Path

import pytest

import review
from api import results, sample, workspace

FIXTURE = json.loads((Path(__file__).parent / "fixtures" / "review_cases.json").read_text(encoding="utf-8"))
DEFAULTS = FIXTURE["defaults"]
ROOT = Path(__file__).resolve().parents[1]


def _blocks(case: dict) -> list[list[dict]]:
    blocks = case.get("blocks") or [case["rows"]]
    return [[{**DEFAULTS, **r} for r in b] for b in blocks]


def _ids(cases):
    return [f"{i:02d}" for i, _ in enumerate(cases, 1)]


def test_bo_ca_du_lon_va_phu_cac_tinh_huong_bat_buoc():
    """Kế hoạch đòi ≥ 14 ca; tên ca là cách đọc nhanh xem còn thiếu tình huống nào."""
    assert len(FIXTURE["cases"]) >= 14
    names = " ".join(c["name"] for c in FIXTURE["cases"])
    for must in ("NG", "reviewed", "繰越", "đầu khối", "fixed", "edited", "nobal", "inferred", "added", "check"):
        assert must in names, f"thiếu ca về: {must}"


@pytest.mark.parametrize("case", FIXTURE["cases"], ids=_ids(FIXTURE["cases"]))
def test_bo_ca_chung(case):
    blocks = _blocks(case)
    rows = [r for b in blocks for r in b]
    infos = [i for b in blocks for i in review.analyze_rows(b)]
    expect = case["expect"]
    name = case["name"]

    for key in ("chk", "need", "state", "focus", "open"):
        if key in expect:
            assert len(expect[key]) == len(rows), f"[{name}] expect.{key} có {len(expect[key])} phần tử, ca có {len(rows)} dòng"

    assert [i["chk"] for i in infos] == expect["chk"], f"[{name}] chk"
    assert [i["need"] for i in infos] == expect["need"], f"[{name}] need"
    assert [i["state"] for i in infos] == expect["state"], f"[{name}] state"
    # need và state phải nói cùng một chuyện
    assert [i["need"] for i in infos] == [i["state"] == "review" for i in infos]

    for k, want in enumerate(expect.get("focus", [])):
        if want is not None:
            assert infos[k]["field"] == want, f"[{name}] focus dòng {k}"

    if "open" in expect:
        got, k = [], 0
        for b in blocks:
            chks = review.chain_checks(b)
            for tx, chk in zip(b, chks):
                got.append([r["kind"] for r in review.open_reasons(tx, chk)])
                k += 1
        for k, want in enumerate(expect["open"]):
            if want is not None:
                assert got[k] == want, f"[{name}] open dòng {k}"

    if "stats" in expect:
        assert review.sheet_stats([{"rows": b} for b in blocks]) == expect["stats"], f"[{name}] stats"


@pytest.mark.parametrize("case", FIXTURE["reasons"], ids=_ids(FIXTURE["reasons"]))
def test_phan_loai_chuoi_ly_do(case):
    got = review.parse_reasons(case["reason"])
    assert [r["kind"] for r in got] == case["kinds"], case["reason"]
    if "params" in case:
        assert [r["params"] for r in got] == case["params"], case["reason"]


def test_parse_reasons_giu_nguyen_chu_tung_phan():
    got = review.parse_reasons(" 低信頼度 ・日付不明 ")
    assert [r["text"] for r in got] == ["低信頼度", "日付不明"]


# ── Mọi chuỗi lý do engine có thể sinh đều phải có chỗ đứng trong bảng ──────────────────

def _engine_strings() -> tuple[set[str], set[str], set[str]]:
    """Quét validate.py: (lý do cần soát, ghi chú tự sửa, các chuỗi khác trong list truyền cho filter).

    f-string được thay mọi biểu thức bằng số 1 — đủ để chuỗi vẫn khớp mẫu số liệu của review.py.
    """
    tree = ast.parse((ROOT / "validate.py").read_text(encoding="utf-8"))

    def text(node):
        if isinstance(node, ast.Constant) and isinstance(node.value, str):
            return node.value
        if isinstance(node, ast.JoinedStr):
            return "".join(v.value if isinstance(v, ast.Constant) else "1" for v in node.values)
        return None

    checks, fixes, other = set(), set(), set()

    for node in ast.walk(tree):
        if isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute) and node.func.attr == "append":
            owner = node.func.value
            if isinstance(owner, ast.Name) and owner.id in ("reasons", "fixes") and node.args:
                s = text(node.args[0])
                if s:
                    (checks if owner.id == "reasons" else fixes).add(s)
        elif isinstance(node, ast.Assign) and any(isinstance(t, ast.Name) and t.id == "note" for t in node.targets):
            s = text(node.value)
            if s:
                other.add(s)
        elif isinstance(node, ast.Call) and isinstance(node.func, ast.Name):
            if node.func.id in ("_apply", "_clear_mismatch") and node.args:
                s = text(node.args[-1])
                if s:
                    fixes.add(s)
            elif node.func.id == "filter":
                for arg in node.args:
                    if isinstance(arg, ast.List):
                        for el in arg.elts:
                            s = text(el)
                            if s:
                                other.add(s)
    return checks, fixes, other


def test_moi_ly_do_engine_deu_duoc_phan_loai():
    checks, fixes, other = _engine_strings()
    # Không để test rỗng ruột khi validate.py được viết lại theo kiểu khác
    assert len(checks) >= 3 and len(fixes) >= 8 and len(other) >= 3, (checks, fixes, other)

    for s in checks:
        kind = review.parse_reasons(s)[0]["kind"]
        assert kind not in ("fix", "other"), f"lý do cần soát chưa có trong bảng: {s!r} → {kind}"
    for s in fixes:
        kind = review.parse_reasons(s)[0]["kind"]
        assert kind == "fix", f"ghi chú tự sửa chưa được nhận là fix: {s!r} → {kind}"
    for s in other:
        kind = review.parse_reasons(s)[0]["kind"]
        assert kind != "other", f"chuỗi lý do lạ trong validate.py: {s!r} — thêm vào bảng ở review.py và review.ts"

    kinds = {review.parse_reasons(s)[0]["kind"] for s in checks | fixes | other}
    assert {"balance", "date", "nobal", "lowconf", "rowgap", "fix"} <= kinds, kinds


# ── Sổ mẫu: mặt ① sạch, mặt ② có đúng MỘT dòng vàng thật (行抜けの疑い) ─────────────────

@pytest.fixture
def ws(tmp_path, monkeypatch):
    monkeypatch.setattr(workspace, "DATA_DIR", tmp_path)
    monkeypatch.setattr(workspace, "WS_DIR", tmp_path / "ws")
    monkeypatch.setattr(workspace, "_cache", {})
    return workspace.create(owner="u1")


def test_so_mau_mat_1_sach_mat_2_co_dung_mot_dong_vang(ws):
    sample.add_to(ws)
    saved = results.load_all(ws.id)
    by_name = {s.name: saved[s.id] for s in ws.sheets}
    a = review.sheet_stats(by_name["サンプル通帳 1"]["blocks"])
    b = review.sheet_stats(by_name["サンプル通帳 2"]["blocks"])
    assert a["need"] == 0 and a["rows"] == 11, a
    assert b["need"] == 1 and b["rows"] == 7 and b["fixed"] == 2, b

    rows = by_name["サンプル通帳 2"]["blocks"][0]["rows"]
    infos = review.analyze_rows(rows)
    vang = [(r, i) for r, i in zip(rows, infos) if i["state"] == "review"]
    assert len(vang) == 1
    row, info = vang[0]
    assert row["description"] == "証貸 5月" and "行抜けの疑い" in row["reason"]
    assert info["chk"] == "OK", "số dư vẫn khớp: chỉ người bấm ✓ mới gỡ được cờ này"
    assert info["field"] == "description"
    assert [r["row_no"] for r in rows] == [1, 2, 3, 4, 5, 7, 8, 9]       # số nguyên, có nhảy 5 → 7


def test_so_mau_xac_nhan_dong_vang_thi_het_vang(ws):
    sample.add_to(ws)
    saved = results.load_all(ws.id)
    sheet2 = next(saved[s.id] for s in ws.sheets if s.name == "サンプル通帳 2")
    for row in sheet2["blocks"][0]["rows"]:
        if "行抜け" in row.get("reason", ""):
            row["reviewed"] = True
    assert review.sheet_stats(sheet2["blocks"])["need"] == 0
    assert review.sheet_stats(sheet2["blocks"])["confirmed"] == 1
