"""Tìm TỜ GIẤY (trang sổ) trong ảnh CHỤP bằng điện thoại để cắt gọn — $0, chạy trên máy.

`pagecrop` chỉ cắt được ảnh scan phẳng (nền trắng). Ảnh chụp thì quanh cuốn sổ là mặt bàn, túi xách, bàn tay: «mực»
là cả cái nền nên cách dò mực vô dụng — trước đây ảnh chụp không được cắt gì cả, mà đó lại là kiểu ảnh hay gặp nhất.

Cách làm: giấy NHẠT MÀU và không quá tối; nền thì hoặc đậm màu (túi đỏ, lon nước xanh) hoặc tối hẳn (mặt bàn đen).
Bản đầu chỉ tách sáng/tối (ngưỡng Otsu) và thua ngay trên ảnh thật: bóng tay, bóng điện thoại đổ lên trang làm nửa
trang «tối» như nền (nhận ra 4/24 ảnh). Mốc sáng ở đây lấy theo phần sáng nhất của chính ảnh rồi hạ xuống 40%, nên
phần giấy nằm trong bóng vẫn được tính. Lấp chữ và nếp gấp bằng phép đóng hình thái, lấy mảng lớn nhất làm tờ giấy,
trả về KHUNG BAO của nó. Chỉ cắt, không nắn — nên không thể làm méo chữ.

Cắt lẹm vào chữ tệ hơn nhiều so với không cắt, nên có ba cổng chặn, không qua là trả None:
  1. Mảng giấy phải ĐẶC (diện tích / diện tích bao lồi ≥ `MIN_SOLID`): bóng quá đậm khoét mất một miếng, hay nền cũng
     nhạt màu làm mảng loang ra, đều làm nó hết đặc.
  2. Giấy chiếm từ `MIN_COVER` tới `MAX_COVER` diện tích ảnh: nhỏ quá là bắt nhầm một vật khác, lớn quá là ảnh vốn đã
     gọn (cắt chẳng lợi gì).
  3. Phần «giống giấy» còn nằm ngoài khung phải rất ít (`MAX_SPILL`): còn nhiều nghĩa là còn giấy ở ngoài khung.
Người gọi (`autoprep`) còn chặn thêm một lớp bằng vị trí các dòng chữ: chữ nằm ngoài khung thì không cắt.

Đo trên 24 ảnh chụp thật đang có (10/11/2026): nhận ra 7, cả 7 khung đều chứa trọn trang sổ (xem bằng mắt), bỏ được
10–20% nền ở phía trên. 17 ảnh còn lại bị cổng chặn — phần lớn là ảnh sổ đã chiếm gần hết khung hình.

Cần OpenCV (đi kèm bộ đọc chữ cục bộ). Thiếu thì trả None, không báo lỗi.
"""

import numpy as np
from PIL import Image

WORK = 720              # cạnh dài của ảnh làm việc (px)
SAT_MAX = 95            # độ đậm màu tối đa của giấy (0..255); nền có màu thì đậm hơn hẳn
MIN_SOLID = 0.90
MIN_COVER = 0.15
MAX_COVER = 0.90
MAX_SPILL = 0.04
MAX_BOX = 0.92          # khung phủ ≥ 92% ảnh thì cắt chẳng lợi gì (cùng mốc với `pagecrop.MAX_COVER`)
PAD = 0.015             # lề chừa quanh tờ giấy khi cắt (theo cạnh ảnh)


def find(img: Image.Image) -> dict | None:
    """Tờ giấy trong ảnh chụp: `{box: (trái, trên, phải, dưới), cover, solid}` theo TỈ LỆ 0..1, hoặc None nếu chưa chắc."""
    try:
        import cv2
    except ImportError:
        return None

    scale = min(1.0, WORK / max(img.size))
    small = img.convert("RGB").resize((max(1, round(img.width * scale)), max(1, round(img.height * scale))), Image.BILINEAR)
    hsv = cv2.cvtColor(np.asarray(small), cv2.COLOR_RGB2HSV)
    h, w = hsv.shape[:2]
    if min(h, w) < 60:
        return None

    sat = cv2.GaussianBlur(hsv[:, :, 1], (0, 0), 2.5)
    val = cv2.GaussianBlur(hsv[:, :, 2], (0, 0), 2.5)
    floor = max(45.0, 0.40 * float(np.percentile(val, 95)))
    paper = ((val > floor) & (sat < SAT_MAX)).astype(np.uint8) * 255
    k = max(5, int(0.03 * max(h, w))) | 1
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (k, k))
    # Đóng: lấp chữ, đường kẻ, nếp gấp giữa trang. Mở: gọt những vệt nhạt màu mảnh dính vào (mép bàn, dây đeo).
    mask = cv2.morphologyEx(cv2.morphologyEx(paper, cv2.MORPH_CLOSE, kernel), cv2.MORPH_OPEN, kernel)

    count, labels, stats, _ = cv2.connectedComponentsWithStats(mask, connectivity=8)
    if count < 2:
        return None
    best = 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))
    area = float(stats[best, cv2.CC_STAT_AREA])
    cover = area / (h * w)
    if not MIN_COVER <= cover <= MAX_COVER:
        return None

    contours, _ = cv2.findContours((labels == best).astype(np.uint8), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    hull = cv2.convexHull(max(contours, key=cv2.contourArea))
    hull_area = float(cv2.contourArea(hull))
    if hull_area <= 0:
        return None
    solid = area / hull_area
    if solid < MIN_SOLID:
        return None

    x, y, bw, bh = cv2.boundingRect(hull)
    outside = paper.copy()
    outside[y:y + bh, x:x + bw] = 0
    if float((outside > 0).sum()) / area > MAX_SPILL:
        return None

    px, py = PAD * w, PAD * h
    box = (max(0.0, (x - px) / w), max(0.0, (y - py) / h), min(1.0, (x + bw + px) / w), min(1.0, (y + bh + py) / h))
    if (box[2] - box[0]) * (box[3] - box[1]) >= MAX_BOX:
        return None
    return {"box": tuple(round(float(v), 4) for v in box), "cover": round(cover, 3), "solid": round(solid, 3)}
