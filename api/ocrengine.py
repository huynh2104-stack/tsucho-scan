"""Bộ đọc chữ cục bộ (RapidOCR) DÙNG CHUNG cho khung đỏ (`rowanchors`) và tự nhận hướng
trang (`orient`).

Vì sao tách riêng: hai nơi cùng cần RapidOCR. Mỗi nơi tự dựng một bản thì mô hình bị nạp
hai lần — tốn thêm RAM đúng lúc máy chủ thuê chỉ có vài trăm MB (xem mục 9 của
docs/KE_HOACH_NANG_CAP_WEB.md). RapidOCR còn giữ trạng thái riêng giữa các lần gọi nên
mọi lần dùng phải qua `LOCK`.

Chạy được cả RapidOCR 1.2.3 (Python 3.14 trên máy phát triển) lẫn 1.4.4 (Python 3.12 trong
Docker): hai bản đặt tên khác nhau (`text_detector` / `text_det`), nên truy cập qua đây.

`TSUCHO_LOCAL_OCR=0` tắt hẳn: `engine()` trả None, mọi chỗ dùng phải chịu được điều đó.
"""

import os
import threading

import numpy as np

LOCK = threading.Lock()
_engine = None
_missing = False


def enabled() -> bool:
    return os.getenv("TSUCHO_LOCAL_OCR", "1").strip().lower() not in ("0", "false", "no", "off")


def engine():
    """Bản RapidOCR dùng chung, dựng lười ở lần gọi đầu. None nếu bị tắt hoặc chưa cài.

    Gọi hàm này KHÔNG cần giữ `LOCK`; nhưng dùng engine thì phải giữ.
    """
    global _engine, _missing
    if not enabled() or _missing:
        return None
    if _engine is None:
        with LOCK:
            if _engine is None:
                try:
                    from rapidocr_onnxruntime import RapidOCR
                except ImportError:
                    _missing = True
                    return None
                _engine = RapidOCR(intra_op_num_threads=2, inter_op_num_threads=1)
    return _engine


def text_lines(arr_rgb: np.ndarray) -> list[dict] | None:
    """Tìm các dòng chữ trong ảnh RGB và cho mỗi dòng biết chữ đang XUÔI hay LỘN NGƯỢC.

    Không đọc chữ (bỏ hẳn bước nhận dạng nên nhanh, ~0.2s cho ảnh 1200px).
    Mỗi dòng: `{"tall": bool, "flipped": bool, "score": float, "length": float, "box": (x0, y0, x1, y1)}`.
      • tall    — hộp cao hơn rộng (dòng chữ chạy dọc). RapidOCR tự xoay hộp kiểu này
                  về ngang trước khi phân loại, nên "flipped" của dòng dọc mang nghĩa
                  "đọc từ dưới lên" chứ không phải lộn ngược.
      • length  — cạnh dài của hộp (pixel), để người gọi tự đặt trọng số.
      • box     — khung bao của hộp theo TỈ LỆ 0..1 của ảnh đưa vào (để biết chữ nằm ở đâu trong ảnh).
    Trả None khi không có bộ đọc; danh sách rỗng khi không thấy dòng chữ nào.
    """
    eng = engine()
    if eng is None:
        return None
    det = getattr(eng, "text_det", None) or getattr(eng, "text_detector")
    with LOCK:
        img = eng.load_img(arr_rgb)
        boxes, _ = det(img)
        if boxes is None or len(boxes) == 0:
            return []
        crops = eng.get_crop_img_list(img, boxes)
        _, cls_res, _ = eng.text_cls(crops)
    out = []
    high, wide = arr_rgb.shape[:2]
    for box, (label, score) in zip(boxes, cls_res):
        w = float(np.linalg.norm(box[1] - box[0]))
        h = float(np.linalg.norm(box[2] - box[1]))
        xs, ys = [float(p[0]) / wide for p in box], [float(p[1]) / high for p in box]
        out.append({
            "box": (min(xs), min(ys), max(xs), max(ys)),
            "tall": h > w,
            "flipped": int(label) == 180,
            "score": float(score),
            "length": max(w, h),
            "ratio": max(w, h) / max(1.0, min(w, h)),
        })
    return out
