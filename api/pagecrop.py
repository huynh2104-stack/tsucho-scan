"""Tìm khung cắt gọn cho ảnh scan PHẲNG (đã xoay đúng chiều) — $0.

Trang scan A4 chứa một cuốn sổ nhỏ ở giữa, quanh là khoảng trắng và vài thứ làm nhiễu:
  • vệt đen của máy scan chạy dọc mép (dài gần hết trang, không dính sát mép ảnh)
  • đốm bụi, dấu chấm lạc ở góc

Cắt sát phần sổ có hai lợi: chữ chiếm nhiều điểm ảnh hơn (model đọc kana nhỏ khá hơn) và
vệt khoanh dòng trên ảnh (`rowmap`) không bị rối bởi vùng trắng thừa.

Cách làm: (1) mực = điểm tối hơn nền cục bộ; (2) bỏ vệt máy scan theo HÌNH DẠNG (dài ≥ 55%,
mảnh ≤ 5%, nằm sát một mép — kiểm theo "dính mép" là hụt vì vệt cách mép vài chục điểm);
(3) gom mực thành cụm bằng giãn nở mạnh, chỉ giữ cụm có khối lượng ≥ 4% cụm lớn nhất để bỏ
đốm lạc; (4) khung = hợp các cụm giữ lại + lề.

Chỉ áp dụng cho ảnh phẳng (`is_flat`): ảnh CHỤP có nền bàn/ghế lộn xộn thì "mực" là cả cái
nền, khung ra vô nghĩa — với ảnh chụp cần tìm 4 góc tờ giấy (việc khác, chưa làm).

Cần OpenCV (có sẵn khi đã cài bộ đọc chữ cục bộ). Thiếu thì không cắt, không báo lỗi.
"""

import numpy as np

FLAT_WHITE = 0.70       # tối thiểu 70% viền ngoài gần như trắng mới coi là scan phẳng
MAX_COVER = 0.92        # khung phủ ≥ 92% diện tích thì cắt chẳng lợi gì
MIN_COVER = 0.06        # nhỏ hơn 6% thì đáng ngờ (trang gần trắng, chỉ có một dấu) — đừng cắt
PAD = 0.03              # lề thêm quanh nội dung (theo kích thước khung), tối thiểu 1.2% cạnh ảnh


def is_flat(gray: np.ndarray) -> bool:
    """Viền ngoài (khung dày 4%) gần như toàn trắng → ảnh scan/PDF phẳng."""
    h, w = gray.shape
    m = max(2, int(0.04 * min(h, w)))
    frame = np.concatenate([gray[:m].ravel(), gray[-m:].ravel(), gray[:, :m].ravel(), gray[:, -m:].ravel()])
    return float((frame > 225).mean()) >= FLAT_WHITE


def _ink(gray: np.ndarray):
    import cv2

    h, w = gray.shape
    blur = cv2.GaussianBlur(gray, (0, 0), 1.2)
    bg = cv2.resize(cv2.medianBlur(cv2.resize(blur, (max(1, w // 4), max(1, h // 4))), 31), (w, h))
    ink = ((bg.astype(np.int16) - blur.astype(np.int16)) > 28) | (blur < 90)
    return ink.astype(np.uint8)


def content_box(gray: np.ndarray) -> tuple[float, float, float, float] | None:
    """Khung nội dung dạng TỈ LỆ 0..1 (trái, trên, phải, dưới). None = không nên cắt."""
    try:
        import cv2
    except ImportError:
        return None

    h, w = gray.shape
    long_side = max(h, w)
    ink = _ink(gray)

    n, lab, stats, _ = cv2.connectedComponentsWithStats(ink, connectivity=8)
    keep = np.zeros(n, bool)
    for i in range(1, n):
        x, y, cw, ch, area = stats[i]
        if area < 5:
            continue                                            # bụi
        near_edge = min(x, y, w - (x + cw), h - (y + ch)) <= 0.06 * long_side
        if near_edge and max(cw, ch) >= 0.55 * long_side and min(cw, ch) <= 0.05 * long_side:
            continue                                            # vệt máy scan
        keep[i] = True
    ink = keep[lab].astype(np.uint8)
    if int(ink.sum()) < 200:
        return None

    k = max(5, int(0.025 * long_side)) | 1
    merged = cv2.dilate(ink, cv2.getStructuringElement(cv2.MORPH_RECT, (k, k)))
    n2, lab2, st2, _ = cv2.connectedComponentsWithStats(merged, connectivity=8)
    mass = np.bincount(lab2.ravel(), weights=ink.ravel(), minlength=n2)
    mass[0] = 0
    big = mass.max()
    boxes = [st2[j] for j in range(1, n2) if mass[j] >= 0.04 * big]
    if not boxes:
        return None
    # cụm đã bị giãn nở k/2 mỗi phía: co lại đúng phần đó rồi mới thêm lề
    x0 = min(b[0] for b in boxes) + k // 2
    y0 = min(b[1] for b in boxes) + k // 2
    x1 = max(b[0] + b[2] for b in boxes) - k // 2
    y1 = max(b[1] + b[3] for b in boxes) - k // 2
    if x1 <= x0 or y1 <= y0:
        return None
    px, py = max(PAD * (x1 - x0), 0.012 * w), max(PAD * (y1 - y0), 0.012 * h)
    box = (max(0.0, (x0 - px) / w), max(0.0, (y0 - py) / h), min(1.0, (x1 + px) / w), min(1.0, (y1 + py) / h))
    cover = (box[2] - box[0]) * (box[3] - box[1])
    if cover >= MAX_COVER or cover < MIN_COVER:
        return None
    return tuple(round(v, 4) for v in box)
