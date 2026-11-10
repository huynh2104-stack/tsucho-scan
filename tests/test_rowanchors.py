import math
import subprocess

import numpy as np
from PIL import Image
import pytest

from api import rowanchors, rowmap


def geometry(n=1, skew=0):
    return {"bands": [{"y0": .6 + i * .03, "y1": .62 + i * .03} for i in range(n)],
            "exact": True, "x0": .1, "x1": .9, "skew_deg": skew}


def token(value, x, y, height=.018):
    return {"value": str(value), "x": x, "y": y, "height": height}


def tx(balance=510893, amount=8373):
    return {"balance": balance, "amount_out": amount, "amount_in": None}


def test_content_anchor_corrects_a_shifted_geometry_band():
    # Count-based geometry marks row 14, while amount+balance are on row 13.
    found = rowanchors.match_rows([tx()], [token(8373,.5,.55),token(510893,.85,.55)], geometry(), 1000, 1400)
    assert found[0]["method"] == "content"
    assert (found[0]["y0"] + found[0]["y1"]) / 2 == pytest.approx(.55)


@pytest.mark.parametrize("words", [
    [token(510893,.85,.55)],  # one matching number is not enough
    [token(8373,.5,.52),token(510893,.85,.55)],  # adjacent rows
    [token(8373,.5,.55),token(510893,.85,.55),token(8373,.5,.7),token(510893,.85,.7)],
])
def test_ambiguous_or_partial_matches_stay_estimated(words):
    band = rowanchors.match_rows([tx()], words, geometry(), 1000, 1400)[0]
    assert band["method"] == "estimated"
    assert band["y0"] == .6


def test_duplicate_transactions_cannot_claim_the_same_physical_line():
    bands = rowanchors.match_rows([tx(),tx()], [token(8373,.5,.55),token(510893,.85,.55)], geometry(2),1000,1400)
    assert all(b["method"] == "estimated" for b in bands)


def test_note_is_not_matched_to_a_transaction_with_the_same_balance():
    band = rowanchors.match_rows([{**tx(),"is_note": True}], [token(8373,.5,.55),token(510893,.85,.55)],geometry(),1000,1400)[0]
    assert band["method"] == "estimated"


def test_skew_uses_original_image_aspect_ratio_and_paper_center():
    slope = math.tan(math.radians(3)) * 1600 / 1000
    words = [token(8373,.45,.5+(.45-.5)*slope),token(510893,.85,.5+(.85-.5)*slope)]
    band = rowanchors.match_rows([tx()],words,geometry(skew=3),1600,1000)[0]
    assert band["method"] == "content"
    assert (band["y0"]+band["y1"])/2 == pytest.approx(.5)


def test_reordered_results_follow_content_not_array_position():
    words = [token(8373,.5,.3),token(510893,.85,.3),token(9410,.5,.4),token(501483,.85,.4)]
    bands = rowanchors.match_rows([tx(501483,9410),tx()],words,geometry(2),1000,1400)
    assert [round((b['y0']+b['y1'])/2,2) for b in bands] == [.4,.3]


def test_numeric_normalization_does_not_invent_digits():
    assert rowanchors._number('*510,893') == '510893'
    assert rowanchors._number(510893.0) == '510893'
    assert rowanchors._number('51O,893') is None
    # Dấu chấm ở đúng chỗ dấu phân cách hàng nghìn là dấu phẩy bị đọc nhầm (sổ chỉ in số yên nguyên)…
    assert rowanchors._number('510.893') == '510893'
    assert rowanchors._number('*1.133，513') == '1133513'
    # …còn chấm ở chỗ khác (số thập phân, ngày tháng) thì không được ghép thành số
    assert rowanchors._number('510.89') is None
    assert rowanchors._number('5108.93') is None
    assert rowanchors._number('04.07.19') is None


def test_missing_ocr_and_timeout_fail_closed(tmp_path,monkeypatch):
    path=tmp_path/'image.png'
    Image.new('RGB',(100,100),'white').save(path)
    def unavailable(*args):
        raise ImportError('optional reader not installed')
    monkeypatch.setattr(rowanchors,'_read_rapid_words',unavailable)
    monkeypatch.setattr(rowanchors,'_executable',lambda:None)
    absent=rowanchors.locate(path,'a',[tx()],geometry())
    assert absent['ocr_status']=='unavailable' and not absent['exact']
    monkeypatch.setattr(rowanchors,'_executable',lambda:'tesseract')
    def fail(*args):
        raise subprocess.TimeoutExpired('tesseract',20)
    monkeypatch.setattr(rowanchors,'_read_words',fail)
    failed=rowanchors.locate(path,'a',[tx()],geometry())
    assert failed['ocr_status']=='failed' and failed['bands'][0]['method']=='estimated'


@pytest.mark.parametrize("value", ["0", "false", "OFF", " no "])
def test_local_ocr_switch_skips_every_reader(tmp_path, monkeypatch, value):
    path = tmp_path / "image.png"
    Image.new("RGB", (100, 100), "white").save(path)

    def forbidden(*args):
        raise AssertionError("OCR reader must not run when TSUCHO_LOCAL_OCR is off")
    monkeypatch.setattr(rowanchors, "_read_rapid_words", forbidden)
    monkeypatch.setattr(rowanchors, "_read_words", forbidden)
    monkeypatch.setattr(rowanchors, "_executable", lambda: "tesseract")
    monkeypatch.setenv("TSUCHO_LOCAL_OCR", value)
    result = rowanchors.locate(path, "a", [tx()], geometry())
    assert result["ocr_status"] == "unavailable" and not result["exact"]
    assert result["bands"][0]["method"] == "estimated"


@pytest.mark.parametrize("value", [None, "", "1", "true"])
def test_local_ocr_is_on_unless_explicitly_disabled(tmp_path, monkeypatch, value):
    path = tmp_path / "image.png"
    Image.new("RGB", (100, 100), "white").save(path)
    words = [token(8373, .5, .55), token(510893, .85, .55)]
    monkeypatch.setattr(rowanchors, "_read_rapid_words", lambda *args: words)
    monkeypatch.setattr(rowanchors, "_executable", lambda: None)
    if value is None:
        monkeypatch.delenv("TSUCHO_LOCAL_OCR", raising=False)
    else:
        monkeypatch.setenv("TSUCHO_LOCAL_OCR", value)
    result = rowanchors.locate(path, "a", [tx()], geometry())
    assert result["ocr_status"] == "ready" and result["bands"][0]["method"] == "content"


def test_cropped_balance_profile_keeps_full_page_skew_origin():
    mask=np.zeros((250,700),dtype=bool)
    for x in range(540,670):
        mask[100+int((x-350)*.05),x]=True
    full=rowmap._profile_at(mask,.05)
    part=rowmap._profile_at(mask[:,530:680],.05,x_origin=530,center_x=350)
    assert full.argmax()==part.argmax()==100


# ── Ghép dòng bản 2: một con số + thứ tự, suy từ dòng đã khớp, nếp gấp, phối cảnh, hai cuốn sổ ──

def book(n, first_no=1, block=None):
    """n giao dịch số liệu khác nhau hết, có số in ở lề."""
    rows = [{"balance": 500000 + i * 1111, "amount_out": 7000 + i * 13, "amount_in": None, "row_no": first_no + i}
            for i in range(n)]
    return rows if block is None else [{**r, "block": block} for r in rows]


def pair(row, y, x_amount=.5, x_balance=.85):
    return [token(row["amount_out"], x_amount, y), token(row["balance"], x_balance, y)]


def mid(band):
    return (band["y0"] + band["y1"]) / 2


def test_a_single_number_is_accepted_when_it_sits_in_order_between_matched_rows():
    rows = book(4)
    words = pair(rows[0], .30) + pair(rows[1], .33) + pair(rows[3], .39) + [token(rows[2]["balance"], .85, .36)]
    bands = rowanchors.match_rows(rows, words, geometry(4), 1000, 1400)
    assert [b["method"] for b in bands] == ["content"] * 4
    assert mid(bands[2]) == pytest.approx(.36)


def test_a_single_number_out_of_order_is_not_trusted_and_the_row_is_inferred_instead():
    rows = book(4)
    words = pair(rows[0], .30) + pair(rows[1], .33) + pair(rows[3], .39) + [token(rows[2]["balance"], .85, .52)]
    band = rowanchors.match_rows(rows, words, geometry(4), 1000, 1400)[2]
    assert band["method"] == "inferred"
    assert mid(band) == pytest.approx(.36, abs=.002)


def test_a_number_shared_by_two_rows_is_never_used_alone():
    rows = book(4)
    rows[2]["balance"] = rows[1]["balance"]         # hai dòng cùng số dư: một con số không nói được là dòng nào
    words = pair(rows[0], .30) + pair(rows[3], .39) + [token(rows[1]["balance"], .85, .33)]
    bands = rowanchors.match_rows(rows, words, geometry(4), 1000, 1400)
    assert [b["method"] for b in bands] == ["content", "inferred", "inferred", "content"]


def test_unread_rows_are_placed_between_their_matched_neighbours_and_snap_to_ink():
    rows = book(5)
    words = pair(rows[0], .30) + pair(rows[1], .33) + pair(rows[4], .42)
    plain = rowanchors.match_rows(rows, words, geometry(5), 1000, 1400)
    assert [round(mid(b), 3) for b in plain] == [.30, .33, .36, .39, .42]
    assert [b["method"] for b in plain] == ["content", "content", "inferred", "inferred", "content"]
    inked = rowanchors.match_rows(rows, words, {**geometry(5), "peaks": [.358, .392]}, 1000, 1400)
    assert [round(mid(b), 3) for b in inked][2:4] == [.358, .392]


def test_rows_beside_the_centre_fold_hang_from_their_own_half_of_the_page():
    # Dòng 10, 11 ở nửa trên; 14, 15 ở nửa dưới; nếp gấp sau dòng 12. Chia đều thì 12 và 13 rơi vào giữa nếp gấp.
    rows = book(6, first_no=10)
    words = pair(rows[0], .40) + pair(rows[1], .43) + pair(rows[4], .60) + pair(rows[5], .63)
    bands = rowanchors.match_rows(rows, words, geometry(6), 1000, 1400)
    assert round(mid(bands[2]), 3) == .46 and round(mid(bands[3]), 3) == .57
    assert bands[2]["method"] == bands[3]["method"] == "inferred"


def test_rows_past_the_last_match_follow_the_ink_and_lose_confidence_far_away():
    rows = book(14)
    words = pair(rows[0], .10) + pair(rows[1], .13) + pair(rows[2], .16)
    bands = rowanchors.match_rows(rows, words, {**geometry(14), "peaks": [.191, .221]}, 1000, 1400)
    assert [round(mid(b), 3) for b in bands[3:5]] == [.191, .221]
    assert bands[3]["method"] == "inferred" and bands[-1]["method"] == "estimated"


def test_each_row_gets_its_own_tilt_on_a_perspective_photo():
    rows = book(6)
    words = []
    for i, row in enumerate(rows):
        y, slope = .2 + .1 * i, -.02 + .01 * i          # dòng trên dốc lên, dòng dưới dốc xuống
        words += [token(row["amount_out"], .3, y + (.3 - .5) * slope), token(row["balance"], .8, y + (.8 - .5) * slope)]
    bands = rowanchors.match_rows(rows, words, geometry(6), 1000, 1000)
    assert all(b["method"] == "content" for b in bands)
    for i, band in enumerate(bands[:5]):
        assert mid(band) == pytest.approx(.2 + .1 * i, abs=.001)
        assert band["skew_deg"] == pytest.approx(math.degrees(math.atan(-.02 + .01 * i)), abs=.02)


def test_two_books_side_by_side_each_keep_to_their_own_half():
    left, right = book(3, block=0), [{**r, "balance": r["balance"] + 77, "amount_out": r["amount_out"] + 5}
                                    for r in book(3, block=1)]
    words = []
    for i in range(3):
        words += pair(left[i], .30 + .03 * i, .15, .40) + pair(right[i], .31 + .03 * i, .65, .90)
    flat = {**geometry(6), "x0": 0., "x1": 1.}
    bands = rowanchors.match_rows(left + right, words, flat, 1000, 1400)
    assert all(b["x1"] == pytest.approx(.475) and b["x0"] == 0 for b in bands[:3])
    assert all(b["x0"] == pytest.approx(.475) and b["x1"] == 1 for b in bands[3:])
    asked = []
    bands = rowanchors.match_rows(left + right, words, flat, 1000, 1400,
                                  gutter_fn=lambda a, b: asked.append((a, b)) or .52)
    assert asked == [pytest.approx((.42, .63))] and bands[0]["x1"] == bands[3]["x0"] == .52


def test_one_book_keeps_the_page_wide_frame():
    rows = book(3)
    bands = rowanchors.match_rows(rows, sum((pair(r, .3 + .03 * i) for i, r in enumerate(rows)), []), geometry(3), 1000, 1400)
    assert all("x0" not in b and "skew_deg" not in b for b in bands)


def test_a_lone_pair_across_the_fold_does_not_set_the_row_pitch():
    # Chỉ khớp được dòng 12 và 13, cách nhau cả nếp gấp (0.10) trong khi nhịp thật 0.03: không được lấy 0.10 làm nhịp
    rows = book(4, first_no=11)
    words = pair(rows[1], .46) + pair(rows[2], .56)
    bands = rowanchors.match_rows(rows, words, {**geometry(4), "peaks": [.40, .43, .46, .56, .59, .62, .65]}, 1000, 1400)
    assert round(mid(bands[0]), 3) == .43 and round(mid(bands[3]), 3) == .59


@pytest.mark.parametrize("numbers, notes, expected", [
    ([1, 2, None], [], ([1, 2, 3], True)),              # giao dịch cuối không có số: dòng in kế tiếp
    ([1, None, 2], [1], ([1, 1, 2], True)),             # ghi chú không còn ô trống: dùng chung dòng trên
    ([1, None, 3], [1], ([1, 2, 3], True)),             # ghi chú vào ô trống
    ([None, 2, 3], [], ([1, 2, 3], True)),
    ([1, None, 2], [], ([0, 1, 2], False)),             # giao dịch không số mà hết ô: số ở lề không khớp bảng
    ([3, 2, 1], [], ([0, 1, 2], False)),
    ([None, None], [], ([0, 1], False)),
])
def test_printed_line_order(numbers, notes, expected):
    rows = [{"row_no": n, "is_note": i in notes} for i, n in enumerate(numbers)]
    assert rowanchors._indices(rows) == expected


def test_rapidocr_scores_given_as_text_are_still_read(tmp_path, monkeypatch):
    # RapidOCR 1.2.3 (Python 3.14) trả điểm dạng chữ; trước đây TypeError bị nuốt và bộ đọc chính không chạy
    path = tmp_path / "scores.png"
    Image.new("RGB", (200, 100), "white").save(path)
    quad = [[20, 10], [80, 10], [80, 30], [20, 30]]
    monkeypatch.setattr(rowanchors.ocrengine, "engine",
                        lambda: lambda p: ([[quad, "*510,893", "0.63"], [quad, "8,373", "0.41"]], None))
    words = rowanchors._read_rapid_words(str(path), "text-scores")
    assert [w["value"] for w in words] == ["510893"]
    assert words[0]["x"] == pytest.approx(.25) and words[0]["y"] == pytest.approx(.2)


def test_locate_hides_internal_peaks_and_keeps_estimates_when_matching_breaks(tmp_path, monkeypatch):
    path = tmp_path / "image.png"
    Image.new("RGB", (100, 100), "white").save(path)
    monkeypatch.setattr(rowanchors, "_read_rapid_words", lambda *args: [token(8373, .5, .55), token(510893, .85, .55)])
    monkeypatch.setattr(rowanchors, "_executable", lambda: None)
    found = rowanchors.locate(path, "a", [tx()], {**geometry(), "peaks": [.5]})
    assert "peaks" not in found and found["ocr_status"] == "ready" and found["exact"]

    def broken(*args, **kwargs):
        raise RuntimeError("boom")
    monkeypatch.setattr(rowanchors, "match_rows", broken)
    failed = rowanchors.locate(path, "a", [tx()], {**geometry(), "peaks": [.5]})
    assert failed["ocr_status"] == "failed" and failed["bands"][0]["method"] == "estimated" and not failed["exact"]


def test_inferred_rows_count_as_located_for_the_whole_sheet(tmp_path, monkeypatch):
    path = tmp_path / "image.png"
    Image.new("RGB", (100, 100), "white").save(path)
    rows = book(3)
    monkeypatch.setattr(rowanchors, "_read_rapid_words", lambda *args: pair(rows[0], .30) + pair(rows[2], .36))
    monkeypatch.setattr(rowanchors, "_executable", lambda: None)
    found = rowanchors.locate(path, "b", rows, geometry(3))
    assert [b["method"] for b in found["bands"]] == ["content", "inferred", "content"] and found["exact"]
