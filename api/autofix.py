"""Cắt nhanh thông minh — chỉnh ảnh bằng THUẬT TOÁN, không gọi model nên $0.

Bốn việc, chạy theo thứ tự:
  1. Cắt viền thừa      — bỏ mép giấy/nền quanh phần có chữ.
  2. Nhận hướng ngang   — sổ chụp nằm ngang thì xoay 90° cho chữ đứng.
  3. Chỉnh nghiêng nhỏ  — bản chụp tay thường lệch vài độ.
  4. Tách 1 ảnh 2 sổ    — cắt theo rãnh trắng dọc ở giữa (nếu có).

Cách nhận biết: chữ in thành DÒNG, nên khi cộng lượng mực theo từng hàng ngang
sẽ ra chuỗi lên-xuống rất mạnh (hàng có chữ đậm, khoảng trắng giữa dòng nhạt).
Phương sai của chuỗi đó lớn ⇒ chữ đang nằm ngang. Xoay thử vài góc rồi chọn góc
có phương sai lớn nhất.

⚠️ KHÔNG phát hiện được ảnh bị LỘN NGƯỢC 180°: cả hai chiều đều cho cùng một
mẫu vạch ngang. Muốn biết đúng chiều thì phải đọc chữ, mà đọc chữ là gọi model.
Nên 180° vẫn để người dùng tự bấm.
"""

import numpy as np
from PIL import Image

# Ảnh sổ thật 2000-4000px; phân tích trên bản thu nhỏ cho nhanh, kết quả không đổi
WORK_W = 900
# Ngưỡng coi là "có mực": tối hơn 78% mức sáng trung vị của ảnh
INK_RATIO = 0.78


def _gray(img: Image.Image, width: int = WORK_W) -> np.ndarray:
    g = img.convert("L")
    if g.width > width:
        g = g.resize((width, max(1, round(g.height * width / g.width))), Image.BILINEAR)
    return np.asarray(g, dtype=np.float32)


def _ink(a: np.ndarray) -> np.ndarray:
    """Mặt nạ nhị phân: True ở chỗ có mực."""
    return a < np.median(a) * INK_RATIO


def _line_score(mask: np.ndarray) -> float:
    """Độ 'giống các dòng chữ nằm ngang' — phương sai của lượng mực từng hàng."""
    rows = mask.sum(axis=1).astype(np.float32)
    if rows.size < 8 or rows.max() == 0:
        return 0.0
    return float(np.var(rows / rows.max()))


def content_box(img: Image.Image, pad: float = 0.012) -> tuple[float, float, float, float] | None:
    """Khung bao phần có chữ, trả về TỈ LỆ 0..1 (kèm chút lề cho dễ đọc).

    None nếu không tìm được (ảnh trắng, hoặc chữ chiếm gần hết → không cần cắt).
    """
    a = _gray(img)
    mask = _ink(a)
    if mask.sum() < mask.size * 0.001:
        return None

    # Bỏ các hàng/cột chỉ có lác đác nhiễu: đòi tối thiểu 1.5% bề rộng có mực
    rows = mask.sum(axis=1) > mask.shape[1] * 0.015
    cols = mask.sum(axis=0) > mask.shape[0] * 0.015
    if not rows.any() or not cols.any():
        return None

    y0, y1 = np.flatnonzero(rows)[[0, -1]]
    x0, x1 = np.flatnonzero(cols)[[0, -1]]
    h, w = mask.shape

    box = (
        max(0.0, x0 / w - pad),
        max(0.0, y0 / h - pad),
        min(1.0, (x1 + 1) / w + pad),
        min(1.0, (y1 + 1) / h + pad),
    )
    # Cắt được ít hơn 4% diện tích thì thôi, đừng chỉnh cho có
    if (box[2] - box[0]) * (box[3] - box[1]) > 0.96:
        return None
    return box


def needs_quarter_turn(img: Image.Image) -> bool:
    """Chữ đang nằm dọc (ảnh chụp ngang) → nên xoay 90°?"""
    a = _gray(img)
    now = _line_score(_ink(a))
    turned = _line_score(_ink(np.rot90(a)))
    # Đòi hơn hẳn 25% mới xoay, tránh xoay bừa ảnh gần vuông
    return turned > now * 1.25


def best_skew(img: Image.Image, limit: float = 6.0, step: float = 0.5) -> float:
    """Góc nghiêng ước lượng (độ, dương = ảnh nghiêng theo chiều kim đồng hồ).

    Thử từng góc trong khoảng ±limit, chọn góc làm các dòng chữ "thẳng" nhất.
    """
    base = Image.fromarray(_gray(img).astype(np.uint8))
    best, best_score = 0.0, _line_score(_ink(np.asarray(base, dtype=np.float32)))

    ang = -limit
    while ang <= limit + 1e-9:
        if abs(ang) > 1e-9:
            rot = base.rotate(ang, resample=Image.BILINEAR, fillcolor=255, expand=False)
            score = _line_score(_ink(np.asarray(rot, dtype=np.float32)))
            if score > best_score * 1.02:      # phải hơn rõ mới nhận
                best, best_score = ang, score
        ang += step
    # PIL rotate(+ang) quay NGƯỢC kim đồng hồ; đổi dấu để trả về theo chiều kim
    return round(-best, 1)


def split_gutter(img: Image.Image) -> float | None:
    """Vị trí rãnh trắng dọc chia 1 ảnh thành 2 sổ, trả về TỈ LỆ 0..1.

    Chỉ tìm trong khoảng giữa 35-65% bề rộng, và đòi rãnh phải thật sạch mực —
    cắt nhầm giữa bảng thì mất cột, tệ hơn là không cắt.
    """
    a = _gray(img)
    mask = _ink(a)
    h, w = mask.shape
    col_ink = mask.sum(axis=0) / h

    lo, hi = int(w * 0.35), int(w * 0.65)
    if hi - lo < 10:
        return None

    window = col_ink[lo:hi]
    x = int(np.argmin(window)) + lo
    # Rãnh: gần như không có mực, và phần còn lại thì có mực rõ rệt
    if col_ink[x] > 0.02 or col_ink.mean() < 0.05:
        return None
    # Rãnh phải rộng tối thiểu ~0.8% bề rộng để không phải là kẽ giữa hai cột số
    band = col_ink[max(0, x - int(w * 0.004)) : x + int(w * 0.004) + 1]
    if band.max() > 0.04:
        return None
    return round(x / w, 4)


def plan(img: Image.Image) -> dict:
    """Xem ảnh rồi đề xuất các bước, KHÔNG tự áp dụng.

    Trả kế hoạch để người dùng thấy trước sẽ làm gì — chỉnh ảnh là thao tác phá
    huỷ (mất cache, phải quét lại), không nên âm thầm.
    """
    steps: list[dict] = []

    quarter = needs_quarter_turn(img)
    if quarter:
        steps.append({"kind": "rotate", "degrees": 90})
        img = img.rotate(-90, expand=True)

    skew = best_skew(img)
    if abs(skew) >= 0.5:
        steps.append({"kind": "tilt", "degrees": skew})
        img = img.rotate(skew, resample=Image.BICUBIC, expand=True, fillcolor=(255, 255, 255))

    box = content_box(img)
    if box:
        steps.append({
            "kind": "crop",
            "box": {"left": box[0], "top": box[1], "right": box[2], "bottom": box[3]},
        })

    gutter = split_gutter(img)
    return {
        "steps": steps,
        "gutter": gutter,          # gợi ý: ảnh này có vẻ chứa 2 sổ
        "note_180": True,          # nhắc: không tự phát hiện được ảnh lộn ngược
    }
