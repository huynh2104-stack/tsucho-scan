"""Ước lượng dải ảnh của TỪNG DÒNG sổ — để click dòng là khoanh đúng chỗ trên ảnh.

Cách làm: chữ in thành dòng, nên cộng lượng mực theo từng hàng ngang sẽ ra các
"đỉnh" (hàng có chữ) xen "đáy" (khoảng trắng giữa dòng). Mỗi đỉnh liên tục là
một dải dòng.

⚠️ Đây là ƯỚC LƯỢNG từ ảnh, KHÔNG phải toạ độ do model trả về. Nó lệch khi hai
dòng sát nhau bị dính thành một dải, hoặc khi bảng có đường kẻ ngang đậm. Lý do
chọn cách này: hỏi model toạ độ thì phải đổi prompt, mà đổi prompt là **mất toàn
bộ cache** — mọi trang đã quét đều phải quét lại và mất tiền. Cách này chạy trên
ảnh có sẵn nên $0 và dùng được ngay cho những gì đã quét.
"""

import numpy as np
from PIL import Image

WORK_W = 700
INK_RATIO = 0.80


def _profile(img: Image.Image) -> tuple[np.ndarray, int]:
    g = img.convert("L")
    if g.width > WORK_W:
        g = g.resize((WORK_W, max(1, round(g.height * WORK_W / g.width))), Image.BILINEAR)
    a = np.asarray(g, dtype=np.float32)
    mask = a < np.median(a) * INK_RATIO
    return mask.sum(axis=1) / max(1, mask.shape[1]), mask.shape[0]


def _runs(profile: np.ndarray, thresh: float) -> list[tuple[int, int]]:
    """Các đoạn liên tục có lượng mực vượt ngưỡng."""
    on = profile > thresh
    out: list[tuple[int, int]] = []
    start = None
    for i, v in enumerate(on):
        if v and start is None:
            start = i
        elif not v and start is not None:
            out.append((start, i))
            start = None
    if start is not None:
        out.append((start, len(on)))
    return out


def _even(n_rows: int, y0: float, y1: float) -> list[dict]:
    """Chia đều — dùng khi không dò được dải nào đáng tin."""
    h = (y1 - y0) / max(1, n_rows)
    return [{"y0": round(y0 + i * h, 5), "y1": round(y0 + (i + 1) * h, 5)} for i in range(n_rows)]


def bands_for(img: Image.Image, n_rows: int) -> dict:
    """`n_rows` dải, mỗi dải là {y0, y1} theo tỉ lệ 0..1 của chiều cao ảnh.

    `exact=True` nghĩa là dò được đúng số dải cần; False là đã phải chia đều.
    """
    if n_rows <= 0:
        return {"bands": [], "exact": False}

    profile, h = _profile(img)
    if h < 20:
        return {"bands": _even(n_rows, 0.0, 1.0), "exact": False}

    # Vùng có nội dung: bỏ mép trắng trên/dưới
    body = _runs(profile, 0.01)
    top = body[0][0] / h if body else 0.0
    bottom = body[-1][1] / h if body else 1.0

    # Thử vài ngưỡng, lấy ngưỡng cho ra số dải gần n_rows nhất
    best: list[tuple[int, int]] | None = None
    best_gap = None
    for thresh in (0.05, 0.08, 0.12, 0.18, 0.25, 0.34):
        runs = [r for r in _runs(profile, thresh) if r[1] - r[0] >= 2]
        if not runs:
            continue
        gap = abs(len(runs) - n_rows)
        if best_gap is None or gap < best_gap:
            best, best_gap = runs, gap

    # Dò lệch quá 40% số dòng thì đừng gượng, chia đều còn đáng tin hơn
    if not best or best_gap is None or best_gap > max(2, n_rows * 0.4):
        return {"bands": _even(n_rows, top, bottom), "exact": False}

    if len(best) > n_rows:
        # Nhiều dải hơn số dòng (tiêu đề, chân trang, đường kẻ) → chọn CỬA SỔ
        # n_rows dải liên tiếp có khoảng cách đều nhau nhất: phần thân bảng.
        centers = np.array([(a + b) / 2 for a, b in best], dtype=np.float32)
        best_i, best_var = 0, None
        for i in range(len(best) - n_rows + 1):
            d = np.diff(centers[i : i + n_rows])
            var = float(np.var(d)) if d.size else 0.0
            if best_var is None or var < best_var:
                best_i, best_var = i, var
        best = best[best_i : best_i + n_rows]

    if len(best) < n_rows:
        return {"bands": _even(n_rows, top, bottom), "exact": False}

    # Nới mỗi dải ra một chút cho khung đỏ không bó sát chữ
    pad = 0.0035
    return {
        "bands": [
            {
                "y0": round(max(0.0, a / h - pad), 5),
                "y1": round(min(1.0, b / h + pad), 5),
            }
            for a, b in best
        ],
        "exact": True,
    }
