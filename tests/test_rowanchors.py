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
    assert rowanchors._number('510.893') is None


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


def test_cropped_balance_profile_keeps_full_page_skew_origin():
    mask=np.zeros((250,700),dtype=bool)
    for x in range(540,670):
        mask[100+int((x-350)*.05),x]=True
    full=rowmap._profile_at(mask,.05)
    part=rowmap._profile_at(mask[:,530:680],.05,x_origin=530,center_x=350)
    assert full.argmax()==part.argmax()==100
