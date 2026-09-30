"""Tự chỉnh ảnh lúc nhập file: xoay cho chữ đứng, rồi cắt gọn — $0, chạy trên máy.

Module này chỉ PHÂN TÍCH (thuần, không ghi file). Việc ghi ảnh nằm ở
`workspace.auto_apply`, gộp xoay + cắt làm MỘT bước để bấm「Hoàn tác」một lần là về đúng
ảnh gốc.

Vì sao làm ngay lúc nhập chứ không đợi người dùng bấm: ảnh còn lộn ngược/nằm ngang thì
model đọc tệ, khung đỏ khoanh dòng cũng lệch, mà người dùng phải xoay/cắt tay từng trang
(PDF 24 trang = 24 lần). Mặt sổ vừa nhập chưa quét nên chỉnh ảnh không làm mất gì.

Nguyên tắc an toàn (xoay nhầm tệ hơn không xoay):
  • chỉ tự xoay khi đủ chắc (xem `orient`); không chắc thì để nguyên và ghi lại là "chưa chắc"
  • trang ít chữ (trang trắng…) mà tín hiệu yếu nghiêng về CÙNG hướng với đa số trang chắc chắn
    trong cùng một file thì được xoay theo (`consensus`) — cùng một máy scan thường đặt giấy
    cùng chiều. Trang bìa có hướng riêng nên chỉ theo khi CHÍNH nó cũng nghiêng về hướng đó.
  • cắt chỉ bỏ vùng trắng và vệt máy scan, không bao giờ cắt vào chữ (xem `pagecrop`)
"""

from dataclasses import dataclass

import numpy as np
from PIL import Image

from . import orient, pagecrop

STRONG_LINES = 20       # trang có ≥ 20 dòng chữ và chắc chắn mới được tính vào "đa số" của cả file
CONSENSUS_MIN = 3       # cần ít nhất 3 trang mạnh…
CONSENSUS_SHARE = 0.7   # …và ≥ 70% trong số đó cùng một hướng

_TURN = {
    90: Image.Transpose.ROTATE_270,     # PIL: ROTATE_90 là ngược chiều kim đồng hồ
    180: Image.Transpose.ROTATE_180,
    270: Image.Transpose.ROTATE_90,
}


def turn(img: Image.Image, clockwise: int) -> Image.Image:
    """Xoay theo chiều kim đồng hồ, không mất điểm ảnh (chỉ hoán vị)."""
    return img.transpose(_TURN[clockwise % 360]) if clockwise % 360 else img


@dataclass
class Plan:
    rotate: int = 0                 # góc xoay THEO CHIỀU KIM ĐỒNG HỒ sẽ áp (0 nếu không chắc/không cần)
    detected: int = 0               # hướng máy đoán, kể cả khi chưa đủ chắc để áp
    sure: bool = True               # đủ chắc để tự áp `rotate`
    ratio: float = 0.0              # phiếu hướng thắng / á quân
    lines: int = 0                  # số dòng chữ có phiếu
    box: tuple | None = None        # khung cắt (tỉ lệ 0..1, tính TRÊN ẢNH ĐÃ XOAY); None = không cắt
    flat: bool = False              # ảnh scan phẳng (được phép cắt)
    checked: bool = False           # đã thật sự kiểm được hướng (có bộ đọc chữ và thấy chữ)

    def as_record(self, *, propagated: bool = False) -> dict:
        """Phần lưu vào `Sheet.auto` để giao diện hiện nhãn."""
        return {
            "rotate": self.rotate,
            "cropped": self.box is not None,
            "detected": self.detected,
            "sure": self.sure,
            "lines": self.lines,
            "ratio": self.ratio,
            "checked": self.checked,
            "propagated": propagated,
        }


def _crop_plan(rotated_small: Image.Image) -> tuple[tuple | None, bool]:
    gray = np.asarray(rotated_small.convert("L"))
    if not pagecrop.is_flat(gray):
        return None, False
    return pagecrop.content_box(gray), True


def analyze(img: Image.Image, rotate: int | None = None) -> Plan:
    """Xem ảnh và lập kế hoạch. `rotate` cho trước thì bỏ qua bước nhận hướng (dùng khi
    lan hướng từ các trang khác trong file)."""
    small = orient.shrink(img.convert("RGB"))
    plan = Plan()
    if rotate is not None:
        plan.rotate = plan.detected = rotate % 360
    else:
        found = orient.detect(small)
        if found is not None:
            plan.checked = True
            plan.detected, plan.sure, plan.ratio, plan.lines = (
                found.rotate, found.sure, found.ratio, found.lines,
            )
            plan.rotate = found.rotate if found.sure else 0
    plan.box, plan.flat = _crop_plan(turn(small, plan.rotate))
    return plan


def consensus(plans) -> int | None:
    """Hướng chiếm đa số trong các trang MẠNH (chắc chắn, nhiều chữ) của một file.

    None khi không đủ trang mạnh hoặc chúng không đồng thuận. Kết quả 0 cũng là một câu
    trả lời hợp lệ ("file này vốn đã đúng chiều").
    """
    strong = [p.detected for p in plans if p.checked and p.sure and p.lines >= STRONG_LINES]
    if len(strong) < CONSENSUS_MIN:
        return None
    best = max(set(strong), key=strong.count)
    return best if strong.count(best) / len(strong) >= CONSENSUS_SHARE else None


def should_follow(plan: Plan, agreed: int | None) -> bool:
    """Trang chưa đủ chắc có nên xoay theo đa số của file không?

    Đòi CHÍNH trang đó cũng nghiêng về hướng ấy (tín hiệu yếu nhưng cùng chiều): trang bìa
    có hướng riêng và phiếu của nó đã nghiêng về 0, nên không bị kéo theo.
    """
    return agreed is not None and agreed != 0 and not plan.sure and plan.detected == agreed
