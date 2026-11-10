"""Cắt gọn ảnh CHỤP theo tờ giấy (api/pagequad.py) và lớp chặn bằng vị trí dòng chữ (api/autoprep.py).

Ảnh giả tái hiện đúng những thứ làm hỏng bản đầu trên ảnh thật: nền đậm màu, bóng đổ lên trang, trang đã chiếm hết
khung hình, nền cũng nhạt màu như giấy.
"""

import numpy as np
import pytest
from PIL import Image, ImageDraw

from api import autoprep, ocrengine, orient, pagequad

pytest.importorskip("cv2")

PAGE = (80, 220, 520, 760)          # trái, trên, phải, dưới của trang sổ trong ảnh 600×800


def photo(background=(150, 30, 40), page=PAGE, shadow=True, bite=False):
    """Trang sổ màu kem có chữ, nằm trên nền `background`; `shadow` = bóng đổ ngang trang; `bite` = khuyết một góc."""
    img = Image.new("RGB", (600, 800), background)
    draw = ImageDraw.Draw(img)
    draw.rectangle(page, fill=(238, 232, 215))
    left, top, right, bottom = page
    for y in range(top + 30, bottom - 20, 22):
        draw.rectangle([left + 25, y, right - 25, y + 7], fill=(40, 40, 45))
    if shadow:                                          # bóng điện thoại: tối đi 45% nhưng vẫn là giấy
        box = (left, top + 150, right, top + 300)
        img.paste(Image.eval(img.crop(box), lambda v: int(v * .55)), box)
    if bite:
        draw.rectangle([left + 220, top + 270, right, bottom], fill=background)
    return img


def test_finds_the_page_on_a_coloured_background_even_under_a_shadow():
    found = pagequad.find(photo())
    assert found is not None
    left, top, right, bottom = found["box"]
    assert left <= PAGE[0] / 600 and top <= PAGE[1] / 800 and right >= PAGE[2] / 600 and bottom >= PAGE[3] / 800
    assert left == pytest.approx(PAGE[0] / 600, abs=.04) and top == pytest.approx(PAGE[1] / 800, abs=.04)
    assert right == pytest.approx(PAGE[2] / 600, abs=.04) and bottom == pytest.approx(PAGE[3] / 800, abs=.04)


def test_dark_background_works_too():
    found = pagequad.find(photo(background=(18, 18, 22)))
    assert found is not None and found["box"][1] == pytest.approx(PAGE[1] / 800, abs=.04)


@pytest.mark.parametrize("picture", [
    photo(page=(8, 8, 592, 792)),                       # sổ đã chiếm hết khung hình: cắt chẳng lợi gì
    photo(background=(235, 235, 230)),                  # nền cũng nhạt màu như giấy: không tách được
    photo(bite=True),                                   # mảng giấy khuyết một miếng lớn: không đủ chắc
    Image.new("RGB", (600, 800), (150, 30, 40)),        # không có tờ giấy nào
    Image.new("RGB", (40, 50), "white"),                # ảnh quá nhỏ
])
def test_refuses_when_not_sure(picture):
    assert pagequad.find(picture) is None


def lines(*boxes):
    return tuple((x0, y0, x1, y1, 100.0) for x0, y0, x1, y1 in boxes)


def reading(texts):
    return orient.Orientation(rotate=0, sure=True, ratio=9.0, lines=len(texts), votes={0: len(texts)}, texts=texts)


def inside(n=8):
    return [(.2, .32 + .05 * i, .8, .34 + .05 * i) for i in range(n)]


def test_a_photo_is_cropped_to_its_page_when_the_text_sits_inside(monkeypatch):
    monkeypatch.setattr(orient, "detect", lambda img: reading(lines(*inside())))
    plan = autoprep.analyze(photo())
    assert not plan.flat and plan.box == pagequad.find(orient.shrink(photo()))["box"]
    assert plan.as_record()["cropped"] is True


def test_text_left_outside_the_frame_stops_the_crop(monkeypatch):
    # Một dòng chữ nằm DƯỚI khung (trang sổ thật dài hơn mảng giấy máy thấy): cắt là mất chữ → không cắt
    monkeypatch.setattr(orient, "detect", lambda img: reading(lines(*inside(), (.2, .97, .8, .99))))
    assert autoprep.analyze(photo()).box is None


def test_too_little_text_is_not_enough_evidence(monkeypatch):
    monkeypatch.setattr(orient, "detect", lambda img: reading(lines(*inside(3))))
    assert autoprep.analyze(photo()).box is None
    monkeypatch.setattr(orient, "detect", lambda img: None)                 # không có bộ đọc chữ: không cắt ảnh chụp
    assert autoprep.analyze(photo()).box is None


@pytest.mark.parametrize("turn", [0, 90, 180, 270])
def test_text_boxes_turn_with_the_page(turn):
    img = Image.new("L", (200, 100), 0)
    ImageDraw.Draw(img).rectangle([20, 10, 79, 29], fill=255)               # khối sáng ở góc trên-trái
    arr = np.asarray(autoprep.turn(img, turn))
    ys, xs = np.nonzero(arr)
    h, w = arr.shape
    seen = (xs.min() / w, ys.min() / h, (xs.max() + 1) / w, (ys.max() + 1) / h)
    assert autoprep._turn_box((.1, .1, .4, .3), turn) == pytest.approx(seen)


def test_text_lines_report_where_each_line_is(monkeypatch):
    class Fake:
        text_det = staticmethod(lambda img: (np.array([[[20, 10], [120, 10], [120, 30], [20, 30]]], dtype=np.float32), 0))
        load_img = staticmethod(lambda arr: arr)
        get_crop_img_list = staticmethod(lambda img, boxes: [img] * len(boxes))
        text_cls = staticmethod(lambda crops: (crops, [("0", 0.99)] * len(crops), 0))
    monkeypatch.setattr(ocrengine, "engine", lambda: Fake)
    found = ocrengine.text_lines(np.zeros((100, 200, 3), dtype=np.uint8))
    assert found[0]["box"] == pytest.approx((.1, .1, .6, .3)) and found[0]["length"] == pytest.approx(100)
    assert orient.decide(found, 200).texts == (pytest.approx((.1, .1, .6, .3, 100.0)),)
