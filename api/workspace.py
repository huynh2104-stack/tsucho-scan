"""Không gian làm việc: danh sách MẶT SỔ, mỗi mặt là một file độc lập.

Đổi mô hình so với bản đầu (30/07/2026, theo yêu cầu người dùng):
- PDF 24 trang **tách ngay thành 24 file riêng**, mỗi trang sửa được độc lập.
- Người dùng tự chọn mặt nào đem quét, không quăng cả cục.
- Xoay/cắt là thao tác THẬT trên ảnh (thấy ngay), không phải chọn tuỳ chọn mù.

Trạng thái lưu ra `meta.json` nên F5 hay khởi động lại server vẫn còn.
"""

import io
import json
import shutil
import time
import uuid
from dataclasses import asdict, dataclass, field
from pathlib import Path

import fitz  # PyMuPDF — render trang PDF thành ảnh
from PIL import Image, ImageEnhance

DATA_DIR = Path(__file__).resolve().parents[1] / ".data"
WS_DIR = DATA_DIR / "ws"

ALLOWED_SUFFIX = {".jpg", ".jpeg", ".png", ".webp", ".pdf"}
MAX_FILE_MB = 64
THUMB_W = 220
# Trang PDF render ở 200 DPI: đủ nét cho model đọc kana nhỏ, chưa nặng quá
PDF_DPI = 200


@dataclass
class Sheet:
    """Một mặt sổ = một ảnh đem quét."""

    id: str
    name: str                    # tên hiển thị, người dùng sửa được
    origin: str                  # tên file gốc người dùng tải lên
    page: int | None = None      # số trang nếu tách từ PDF
    sha256: str = ""
    duplicate_of: str | None = None
    rotation: float = 0.0        # tổng số độ đã xoay (chỉ để hiện lại trên UI)
    cropped: bool = False
    adjusted: bool = False       # đã kéo sáng / tương phản
    scanned: bool = False
    width: int = 0
    height: int = 0
    source_ext: str = ".png"     # đuôi của bản gốc chưa qua chỉnh sửa
    undo: dict | None = None     # trạng thái trước thao tác chỉnh cuối cùng

    def dir(self, ws_id: str) -> Path:
        return WS_DIR / ws_id / self.id

    def edited(self) -> bool:
        return self.rotation != 0 or self.cropped or self.adjusted

    def scan_path(self, ws_id: str) -> Path:
        """File ĐEM QUÉT.

        Chưa chỉnh gì thì gửi ĐÚNG BYTES GỐC người dùng tải lên — cache của
        extract.py băm theo nội dung, gửi bản PNG render lại là cache trượt và
        mỗi lần quét đều mất tiền. Chỉnh rồi mới buộc phải gửi bản đã sửa.
        """
        d = self.dir(ws_id)
        if not self.edited():
            src = d / f"source{self.source_ext}"
            if src.is_file():
                return src
        return d / "current.png"


@dataclass
class Workspace:
    id: str
    sheets: list[Sheet] = field(default_factory=list)
    book_name: str = ""          # tên sổ người dùng đặt, dùng khi xuất file
    created_at: float = field(default_factory=time.time)

    def dir(self) -> Path:
        return WS_DIR / self.id

    def find(self, sheet_id: str) -> Sheet | None:
        return next((s for s in self.sheets if s.id == sheet_id), None)

    def save(self) -> None:
        self.dir().mkdir(parents=True, exist_ok=True)
        (self.dir() / "meta.json").write_text(
            json.dumps(
                {
                    "id": self.id,
                    "book_name": self.book_name,
                    "created_at": self.created_at,
                    "sheets": [asdict(s) for s in self.sheets],
                },
                ensure_ascii=False,
            ),
            encoding="utf-8",
        )


_cache: dict[str, Workspace] = {}


def create() -> Workspace:
    ws = Workspace(id=uuid.uuid4().hex[:12])
    ws.save()
    _cache[ws.id] = ws
    return ws


def load(ws_id: str) -> Workspace | None:
    if ws_id in _cache:
        return _cache[ws_id]
    meta = WS_DIR / ws_id / "meta.json"
    if not meta.is_file():
        return None
    raw = json.loads(meta.read_text(encoding="utf-8"))
    ws = Workspace(
        id=raw["id"],
        book_name=raw.get("book_name", ""),
        created_at=raw.get("created_at", time.time()),
        sheets=[Sheet(**s) for s in raw.get("sheets", [])],
    )
    _cache[ws.id] = ws
    return ws


# ── Thêm file ────────────────────────────────────────────────────────

def _write_sheet_images(ws: Workspace, sheet: Sheet, img: Image.Image) -> None:
    """Ghi ảnh gốc + ảnh hiện tại + thumbnail của một mặt sổ."""
    d = sheet.dir(ws.id)
    d.mkdir(parents=True, exist_ok=True)
    if img.mode not in ("RGB", "L"):
        img = img.convert("RGB")

    img.save(d / "original.png")
    img.save(d / "current.png")
    sheet.width, sheet.height = img.size

    thumb = img.copy()
    thumb.thumbnail((THUMB_W, THUMB_W * 3), Image.LANCZOS)
    thumb.save(d / "thumb.png")


def _regen_current(ws: Workspace, sheet: Sheet, img: Image.Image) -> None:
    d = sheet.dir(ws.id)
    if img.mode not in ("RGB", "L"):
        img = img.convert("RGB")
    img.save(d / "current.png")
    sheet.width, sheet.height = img.size
    thumb = img.copy()
    thumb.thumbnail((THUMB_W, THUMB_W * 3), Image.LANCZOS)
    thumb.save(d / "thumb.png")


def add_upload(ws: Workspace, filename: str, data: bytes) -> list[Sheet]:
    """Thêm 1 file tải lên. PDF nhiều trang → tách thành nhiều mặt sổ."""
    suffix = Path(filename).suffix.lower()
    if suffix not in ALLOWED_SUFFIX:
        raise ValueError(f"'{filename}': chỉ nhận {', '.join(sorted(ALLOWED_SUFFIX))}")
    if len(data) > MAX_FILE_MB * 1024 * 1024:
        raise ValueError(f"'{filename}' lớn hơn {MAX_FILE_MB}MB")

    stem = Path(filename).stem
    made: list[Sheet] = []

    if suffix == ".pdf":
        # Ảnh xem/sửa render bằng PyMuPDF, NHƯNG bản đem quét là trang PDF tách
        # bằng pypdf — đúng thứ extract.py vẫn tạo, nên cache cũ dùng lại được.
        from extract import _split_pdf_pages

        pages = _split_pdf_pages(data)
        doc = fitz.open(stream=data, filetype="pdf")
        try:
            for i, page in enumerate(doc):
                pix = page.get_pixmap(dpi=PDF_DPI)
                img = Image.open(io.BytesIO(pix.tobytes("png")))
                sheet = Sheet(
                    id=uuid.uuid4().hex[:10],
                    name=f"{stem} — tr.{i + 1}",
                    origin=filename,
                    page=i + 1,
                    source_ext=".pdf",
                )
                _write_sheet_images(ws, sheet, img)
                if i < len(pages):
                    (sheet.dir(ws.id) / "source.pdf").write_bytes(pages[i])
                made.append(sheet)
        finally:
            doc.close()
    else:
        img = Image.open(io.BytesIO(data))
        img.load()
        sheet = Sheet(
            id=uuid.uuid4().hex[:10], name=stem, origin=filename, source_ext=suffix
        )
        _write_sheet_images(ws, sheet, img)
        (sheet.dir(ws.id) / f"source{suffix}").write_bytes(data)
        made.append(sheet)

    for s in made:
        s.sha256 = _hash_current(ws, s)
    ws.sheets.extend(made)
    mark_duplicates(ws)
    ws.save()
    return made


def _hash_current(ws: Workspace, sheet: Sheet) -> str:
    import hashlib

    return hashlib.sha256((sheet.dir(ws.id) / "current.png").read_bytes()).hexdigest()


def mark_duplicates(ws: Workspace) -> None:
    """Đánh dấu mặt sổ trùng hệt mặt trước đó — quét trùng = cộng đôi giao dịch."""
    seen: dict[str, str] = {}
    for s in ws.sheets:
        first = seen.get(s.sha256)
        if first is None:
            seen[s.sha256] = s.id
            s.duplicate_of = None
        else:
            s.duplicate_of = first


# ── Chỉnh ảnh ────────────────────────────────────────────────────────

def _snapshot(ws: Workspace, sheet: Sheet) -> None:
    """Lưu trạng thái TRƯỚC khi đổi ảnh, để hoàn tác được một bước.

    Quan trọng nhất là cứu cú bấm nhầm「Về ảnh gốc」sau khi đã xoay/cắt/chỉnh
    xong — không có cái này thì người dùng phải làm lại từ đầu.
    """
    d = sheet.dir(ws.id)
    cur = d / "current.png"
    if cur.is_file():
        shutil.copy2(cur, d / "prev.png")
    sheet.undo = {
        "rotation": sheet.rotation,
        "cropped": sheet.cropped,
        "adjusted": sheet.adjusted,
        "width": sheet.width,
        "height": sheet.height,
        "sha256": sheet.sha256,
    }


def undo(ws: Workspace, sheet: Sheet) -> None:
    """Trả ảnh về trạng thái ngay trước thao tác chỉnh cuối cùng."""
    d = sheet.dir(ws.id)
    prev = d / "prev.png"
    if not prev.is_file() or not sheet.undo:
        raise ValueError("Không có bước nào để hoàn tác")

    img = Image.open(prev)
    img.load()
    _regen_current(ws, sheet, img)

    snap = sheet.undo
    sheet.rotation = snap.get("rotation", 0)
    sheet.cropped = bool(snap.get("cropped"))
    sheet.adjusted = bool(snap.get("adjusted"))
    sheet.sha256 = _hash_current(ws, sheet)
    sheet.scanned = False
    sheet.undo = None                    # chỉ hoàn tác được một bước
    prev.unlink(missing_ok=True)


def rotate(ws: Workspace, sheet: Sheet, degrees_cw: int) -> None:
    """Xoay THẬT trên ảnh — người dùng thấy ngay, model cũng nhận ảnh đã xoay."""
    d = sheet.dir(ws.id)
    _snapshot(ws, sheet)
    img = Image.open(d / "current.png")
    img.load()
    # PIL xoay ngược chiều kim đồng hồ nên đổi dấu
    _regen_current(ws, sheet, img.rotate(-degrees_cw, expand=True))
    sheet.rotation = round((sheet.rotation + degrees_cw) % 360, 1)
    sheet.sha256 = _hash_current(ws, sheet)
    sheet.scanned = False       # ảnh đổi thì kết quả cũ không còn đúng


def adjust(
    ws: Workspace,
    sheet: Sheet,
    *,
    fine_deg: float = 0.0,
    brightness: float = 1.0,
    contrast: float = 1.0,
) -> None:
    """Chỉnh nghiêng vài độ + độ sáng + độ tương phản.

    Mục đích là làm ảnh DỄ ĐỌC HƠN cho model: bản chụp bằng tay hay nghiêng
    vài độ, bản scan cũ hay bị mờ hoặc bạc màu. Áp lên bản ĐANG hiển thị.
    """
    d = sheet.dir(ws.id)
    _snapshot(ws, sheet)
    img = Image.open(d / "current.png")
    img.load()

    if abs(fine_deg) > 0.01:
        # fillcolor trắng: viền thêm ra phải giống nền giấy, không phải đen
        img = img.convert("RGB").rotate(
            -fine_deg, expand=True, resample=Image.BICUBIC, fillcolor=(255, 255, 255)
        )
    if abs(brightness - 1.0) > 0.01:
        img = ImageEnhance.Brightness(img).enhance(brightness)
    if abs(contrast - 1.0) > 0.01:
        img = ImageEnhance.Contrast(img).enhance(contrast)

    _regen_current(ws, sheet, img)
    sheet.rotation = round((sheet.rotation + fine_deg) % 360, 1)
    sheet.adjusted = True
    sheet.sha256 = _hash_current(ws, sheet)
    sheet.scanned = False


def crop(ws: Workspace, sheet: Sheet, box: tuple[float, float, float, float]) -> None:
    """Cắt theo tỉ lệ 0..1 (trái, trên, phải, dưới) so với ảnh hiện tại."""
    d = sheet.dir(ws.id)
    _snapshot(ws, sheet)
    img = Image.open(d / "current.png")
    img.load()
    w, h = img.size
    left, top, right, bottom = box
    px = (
        max(0, int(left * w)),
        max(0, int(top * h)),
        min(w, int(right * w)),
        min(h, int(bottom * h)),
    )
    if px[2] - px[0] < 20 or px[3] - px[1] < 20:
        raise ValueError("Vùng cắt quá nhỏ")
    _regen_current(ws, sheet, img.crop(px))
    sheet.cropped = True
    sheet.sha256 = _hash_current(ws, sheet)
    sheet.scanned = False


def adjust(
    ws: Workspace,
    sheet: Sheet,
    fine_deg: float = 0.0,
    brightness: float = 1.0,
    contrast: float = 1.0,
) -> None:
    """Xoay tinh vài độ + kéo sáng/tương phản.

    Ảnh chụp tay hay nghiêng 1-3 độ làm model đọc lệch dòng; bản scan mờ thì
    tăng tương phản đọc rõ hơn hẳn. Ghi thẳng vào ảnh hiện tại để model nhận
    đúng thứ người dùng đang nhìn.
    """
    from PIL import ImageEnhance

    d = sheet.dir(ws.id)
    img = Image.open(d / "current.png")
    img.load()

    if abs(fine_deg) > 0.01:
        # fillcolor trắng: nền giấy, không phải viền đen làm model tưởng là mép sổ
        img = img.rotate(-fine_deg, expand=True, resample=Image.BICUBIC, fillcolor="white")
        sheet.rotation = round((sheet.rotation + fine_deg) % 360, 1)
    if abs(brightness - 1.0) > 0.01:
        img = ImageEnhance.Brightness(img.convert("RGB")).enhance(brightness)
    if abs(contrast - 1.0) > 0.01:
        img = ImageEnhance.Contrast(img.convert("RGB")).enhance(contrast)

    _regen_current(ws, sheet, img)
    sheet.adjusted = True
    sheet.sha256 = _hash_current(ws, sheet)
    sheet.scanned = False


def reset_sheet(ws: Workspace, sheet: Sheet) -> None:
    """Trả về ảnh gốc — hoàn tác mọi lần xoay/cắt."""
    d = sheet.dir(ws.id)
    _snapshot(ws, sheet)
    img = Image.open(d / "original.png")
    img.load()
    _regen_current(ws, sheet, img)
    sheet.rotation = 0
    sheet.cropped = False
    sheet.adjusted = False
    sheet.sha256 = _hash_current(ws, sheet)
    sheet.scanned = False


def remove(ws: Workspace, sheet_id: str) -> None:
    sheet = ws.find(sheet_id)
    if not sheet:
        return
    shutil.rmtree(sheet.dir(ws.id), ignore_errors=True)
    ws.sheets = [s for s in ws.sheets if s.id != sheet_id]
    mark_duplicates(ws)
    ws.save()


def to_json(ws: Workspace) -> dict:
    return {
        "id": ws.id,
        "book_name": ws.book_name,
        "sheets": [asdict(s) for s in ws.sheets],
    }
