"""Tự nhận hướng trang (0/90/180/270) — $0, chạy trên máy, không gửi ảnh đi đâu.

Cách làm: bộ dò dòng chữ của RapidOCR tìm các hộp chữ, rồi bộ phân loại "dòng chữ xuôi
hay lộn ngược" (cũng của RapidOCR, ~0.6MB) cho mỗi hộp một phiếu. KHÔNG đọc chữ nên chỉ
~0.2s mỗi trang. Bốn hướng ứng với bốn loại phiếu:

    hộp ngang + xuôi     → trang đang đúng chiều          (xoay 0)
    hộp ngang + ngược    → trang lộn ngược                (xoay 180)
    hộp dọc  + đọc từ trên xuống → nghiêng 90° thuận kim  (xoay 270 mới đứng)
    hộp dọc  + đọc từ dưới lên  → nghiêng 90° ngược kim   (xoay 90 mới đứng)

Đã thử thay bằng Tesseract OSD (sai ở nửa số trang và báo lỗi ở trang bìa) và bằng cách
chấm điểm chữ đọc được ở 4 hướng (đúng nhưng 4.4s/trang, trang bìa toàn chữ Hán thì hỏng).
Cách này đúng 60/60 ảnh mẫu (PDF 24 trang, 23 ảnh điện thoại, 9 ảnh scan, 4 tệp khác) với cả
RapidOCR 1.2.3 lẫn 1.4.4.

THẬN TRỌNG: xoay nhầm tệ hơn không xoay, nên chỉ coi là chắc chắn (`sure`) khi
  • không cần xoay (hướng thắng là 0), hoặc
  • cần xoay và có ≥ MIN_LINES_TURN dòng bỏ phiếu và hướng thắng hơn á quân ≥ RATIO_TURN lần.
Trang ít chữ (trang trắng, bìa sổ) thường rơi vào "không chắc" — để caller quyết.
"""

from dataclasses import dataclass

import numpy as np
from PIL import Image

from . import ocrengine

WORK_PX = 1200          # cạnh dài của ảnh đem phân tích (ảnh lớn hơn được thu nhỏ)
MIN_ELONG = 1.5         # hộp phải dài hơn rộng ≥ chừng này mới là "dòng chữ"
MIN_LEN = 0.03          # hộp ngắn hơn 3% cạnh dài ảnh là nhiễu hoặc chữ quá nhỏ
MIN_LINES_TURN = 8      # muốn XOAY thì cần ít nhất ngần này dòng cùng bỏ phiếu
RATIO_TURN = 3.0        # …và hướng thắng phải hơn hướng á quân ≥ ngần này lần


@dataclass(frozen=True)
class Orientation:
    rotate: int                 # góc xoay THEO CHIỀU KIM ĐỒNG HỒ để chữ đứng: 0/90/180/270
    sure: bool                  # đủ căn cứ để tự xoay
    ratio: float                # phiếu hướng thắng / phiếu á quân
    lines: int                  # số dòng chữ có phiếu
    votes: dict                 # {0: n, 90: n, 180: n, 270: n}
    # Mọi dòng chữ tìm thấy: (x0, y0, x1, y1, độ dài) theo tỉ lệ 0..1 của ảnh CHƯA xoay. `autoprep` dùng để chắc rằng
    # khung cắt không bỏ sót chữ.
    texts: tuple = ()


def shrink(img: Image.Image, long_side: int = WORK_PX) -> Image.Image:
    k = long_side / max(img.size)
    if k >= 1:
        return img
    return img.resize((max(1, round(img.width * k)), max(1, round(img.height * k))), Image.LANCZOS)


def decide(lines: list[dict], long_side: float) -> Orientation:
    """Từ danh sách dòng chữ (xem `ocrengine.text_lines`) suy ra hướng trang."""
    votes = {0: 0, 90: 0, 180: 0, 270: 0}
    for ln in lines:
        if ln["ratio"] < MIN_ELONG or ln["length"] < MIN_LEN * long_side:
            continue
        angle = (90 if ln["flipped"] else 270) if ln["tall"] else (180 if ln["flipped"] else 0)
        votes[angle] += 1
    n = sum(votes.values())
    order = sorted(votes, key=lambda a: -votes[a])
    best, second = order[0], order[1]
    # Sàn 1 cho mẫu số: á quân 0 phiếu thì tỉ số = số phiếu của hướng thắng (hữu hạn, đưa được vào JSON)
    ratio = votes[best] / max(votes[second], 1) if n else 0.0
    if best == 0 and n:
        sure = True                                # không xoay thì không có gì để nhầm
    else:
        sure = n >= MIN_LINES_TURN and ratio >= RATIO_TURN
    texts = tuple((*ln["box"], ln["length"]) for ln in lines if ln.get("box"))
    return Orientation(rotate=best, sure=sure, ratio=round(ratio, 2), lines=n, votes=votes, texts=texts)


def detect(img: Image.Image) -> Orientation | None:
    """Hướng của trang. None = không có bộ đọc chữ (chưa cài / TSUCHO_LOCAL_OCR=0) hoặc
    không thấy dòng chữ nào (ảnh không phải giấy tờ, trang trắng)."""
    small = shrink(img.convert("RGB"))
    lines = ocrengine.text_lines(np.asarray(small))
    if not lines:
        return None
    result = decide(lines, max(small.size))
    return result if result.lines else None
