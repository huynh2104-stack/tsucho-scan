"""Không gian làm việc: danh sách MẶT SỔ, mỗi mặt là một file độc lập.

Đổi mô hình so với bản đầu (30/07/2026, theo yêu cầu người dùng):
- PDF 24 trang **tách ngay thành 24 file riêng**, mỗi trang sửa được độc lập.
- Người dùng tự chọn mặt nào đem quét, không quăng cả cục.
- Xoay/cắt là thao tác THẬT trên ảnh (thấy ngay), không phải chọn tuỳ chọn mù.

Trạng thái lưu ra `meta.json` nên F5 hay khởi động lại server vẫn còn.
"""

import io
import json
import logging
import os
import shutil
import threading
import time
import uuid
from dataclasses import asdict, dataclass, field
from pathlib import Path

import fitz  # PyMuPDF — render trang PDF thành ảnh
import numpy as np
from PIL import Image, ImageEnhance, ImageOps

from . import autoprep

log = logging.getLogger("tsucho.workspace")

# Đặt TSUCHO_DATA_DIR để chạy trên thư mục dữ liệu RIÊNG (test tự động, thử máy
# chủ mới) — nhờ vậy không bao giờ ghi nhầm vào `.data` đang chứa sổ thật.
# `auth.DB_PATH` suy ra từ đây nên cơ sở dữ liệu tài khoản cũng đi theo.
DATA_DIR = Path(os.getenv("TSUCHO_DATA_DIR") or Path(__file__).resolve().parents[1] / ".data")
WS_DIR = DATA_DIR / "ws"

ALLOWED_SUFFIX = {".jpg", ".jpeg", ".png", ".webp", ".pdf"}
MAX_FILE_MB = 64
THUMB_W = 220
# Ảnh đem quét phải dưới giới hạn 5MB của extract.py — chừa biên an toàn
SCAN_MAX_MB = 4.2
# Cạnh dài tối đa của ảnh LƯU LẠI — chặn hết RAM trên máy chủ nhỏ (xem `_cap`)
MAX_STORE_PX = 2600
# Trang PDF render ở 200 DPI: đủ nét cho model đọc kana nhỏ, chưa nặng quá
PDF_DPI = 200

# Mặt mới nhập còn đang được máy xử lý nền: chưa xem/sửa/quét được
BUSY = ("queued", "rendering", "analyzing")


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
    warped: bool = False         # đã nắn phối cảnh (kéo 4 góc / thanh dọc-ngang)
    scanned: bool = False
    width: int = 0
    height: int = 0
    source_ext: str = ".png"     # đuôi của bản gốc chưa qua chỉnh sửa
    undo: dict | None = None     # trạng thái trước thao tác chỉnh cuối cùng
    # ── Xử lý nền khi nhập file (xem `process_upload`) ──
    # queued → rendering → analyzing → ready | failed. File cũ không có khoá này ⇒ "ready".
    status: str = "ready"
    error: str = ""              # MÃ lỗi khi status == "failed" (giao diện tự dịch)
    auto: dict | None = None     # việc máy đã tự làm khi nhập (xem `autoprep.Plan.as_record`)
    exif_fixed: bool = False     # ảnh đã được xoay theo thẻ EXIF của file gốc

    def dir(self, ws_id: str) -> Path:
        return WS_DIR / ws_id / self.id

    def busy(self) -> bool:
        return self.status in BUSY

    def edited(self) -> bool:
        # exif_fixed: điểm ảnh đã xoay khác file gốc (thẻ EXIF chỉ nằm trong file gốc)
        # nên phải gửi bản đã xoay đi quét, không được gửi lại bytes gốc.
        return self.rotation != 0 or self.cropped or self.adjusted or self.warped or self.exif_fixed

    def scan_path(self, ws_id: str) -> Path:
        """File ĐEM QUÉT.

        Chưa chỉnh gì thì gửi ĐÚNG BYTES GỐC người dùng tải lên — cache của
        extract.py băm theo nội dung, gửi bản PNG render lại là cache trượt và
        mỗi lần quét đều mất tiền. Chỉnh rồi mới buộc phải gửi bản đã sửa.

        Bản đã chỉnh gửi đi là **JPEG** (`scan.jpg`), không phải `current.png`.
        Ảnh chụp điện thoại 3072×4096 nặng 0.4MB ở dạng JPEG nhưng phình lên
        5–7MB khi lưu PNG, vượt giới hạn 5MB của API → cắt/nắn xong là không
        quét được nữa (bug người dùng báo 01/08/2026).
        """
        d = self.dir(ws_id)
        if not self.edited():
            src = d / f"source{self.source_ext}"
            if src.is_file():
                return src
        jpg = d / "scan.jpg"
        return jpg if jpg.is_file() else d / "current.png"


@dataclass
class Workspace:
    id: str
    sheets: list[Sheet] = field(default_factory=list)
    book_name: str = ""          # tên sổ người dùng đặt, dùng khi xuất file
    created_at: float = field(default_factory=time.time)
    owner: str = ""              # user.id — chỉ chủ sở hữu mới mở được
    # Các cặp mặt sổ người dùng đã bảo「Không phải trùng」(task 1.7). Mỗi cặp là [id, id] đã SẮP XẾP
    # nên (a,b) và (b,a) là một; xoá mặt sổ thì cặp chứa nó cũng bị xoá.
    dup_ok: list[list[str]] = field(default_factory=list)

    def dir(self) -> Path:
        return WS_DIR / self.id

    def find(self, sheet_id: str) -> Sheet | None:
        return next((s for s in self.sheets if s.id == sheet_id), None)

    def save(self) -> None:
        """Ghi `meta.json` NGUYÊN TỬ (ghi file tạm rồi đổi tên) và tuần tự.

        Từ khi có luồng xử lý nền, yêu cầu của người dùng và luồng nền có thể cùng lưu một
        workspace. Ghi thẳng vào file thì hai lần ghi chồng nhau có thể để lại file cụt.
        """
        self.dir().mkdir(parents=True, exist_ok=True)
        with _SAVE_LOCK:
            text = json.dumps(
                {
                    "id": self.id,
                    "book_name": self.book_name,
                    "created_at": self.created_at,
                    "owner": self.owner,
                    "dup_ok": self.dup_ok,
                    "sheets": [asdict(s) for s in self.sheets],
                },
                ensure_ascii=False,
            )
            target, tmp = self.dir() / "meta.json", self.dir() / "meta.json.tmp"
            tmp.write_text(text, encoding="utf-8")
            for attempt in range(6):
                try:
                    os.replace(tmp, target)
                    return
                except PermissionError:
                    # Windows: chương trình diệt vi-rút hay tiến trình khác đang mở file đích
                    if attempt == 5:
                        raise
                    time.sleep(0.05 * (attempt + 1))


_SAVE_LOCK = threading.Lock()


_cache: dict[str, Workspace] = {}


def create(owner: str = "") -> Workspace:
    ws = Workspace(id=uuid.uuid4().hex[:12], owner=owner)
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
        owner=raw.get("owner", ""),
        dup_ok=[list(p) for p in raw.get("dup_ok", []) if isinstance(p, list) and len(p) == 2],
        sheets=[Sheet(**s) for s in raw.get("sheets", [])],
    )
    # Máy chủ tắt giữa chừng lúc đang xử lý nền: việc đó không còn ai làm tiếp, để nguyên
    # trạng thái "đang xử lý" thì thanh tiến độ quay mãi. Đánh dấu hỏng để người dùng tải lại.
    for s in ws.sheets:
        if s.busy():
            s.status, s.error = "failed", "interrupted"
    _cache[ws.id] = ws
    return ws


def all_ids() -> list[str]:
    if not WS_DIR.is_dir():
        return []
    return [d.name for d in WS_DIR.iterdir() if (d / "meta.json").is_file()]


def list_for(owner: str) -> list[Workspace]:
    """Các không gian làm việc của một người, mới nhất trước."""
    found = [ws for i in all_ids() if (ws := load(i)) and ws.owner == owner]
    return sorted(found, key=lambda w: w.created_at, reverse=True)


def claim_ownerless(owner: str) -> int:
    """Gán những workspace chưa có chủ cho `owner`. Trả về số lượng đã gán.

    Chỉ chạy cho NGƯỜI ĐẦU TIÊN đăng ký: dữ liệu tạo ra hồi app chưa có đăng
    nhập vẫn còn trên đĩa, không nhận thì không ai mở được nữa. Máy mới cài thì
    không có gì để nhận nên vô hại.
    """
    n = 0
    for i in all_ids():
        ws = load(i)
        if ws and not ws.owner:
            ws.owner = owner
            ws.save()
            n += 1
    return n


# ── Thêm file ────────────────────────────────────────────────────────

def _cap(img: Image.Image) -> Image.Image:
    """Thu ảnh về cạnh dài tối đa `MAX_STORE_PX` trước khi lưu.

    Ảnh điện thoại 3072×4096 chiếm ~36MB RAM MỖI BẢN SAO khi mở ra. Máy chủ
    thuê thường chỉ có 512MB, mà một thao tác (mở + xoay + ghi + thumbnail) tạo
    vài bản sao cùng lúc → hết RAM → tiến trình bị giết → trình duyệt thấy 502.
    Đây chính là lỗi 502 chập chờn người dùng gặp khi chạy thật (03/08/2026).

    2600px vẫn dư sức đọc: model tự thu nhỏ ảnh về ~1568px trước khi đọc. Và
    ảnh CHƯA CHỈNH vẫn gửi đúng bytes gốc đi quét (xem `scan_path`), nên phép
    thu này không đụng gì tới chất lượng nhận dạng của luồng thường dùng nhất.
    """
    if max(img.size) <= MAX_STORE_PX:
        return img
    k = MAX_STORE_PX / max(img.size)
    return img.resize(
        (max(1, round(img.width * k)), max(1, round(img.height * k))), Image.LANCZOS
    )


def _write_sheet_images(ws: Workspace, sheet: Sheet, img: Image.Image) -> None:
    """Ghi ảnh gốc + ảnh hiện tại + thumbnail của một mặt sổ."""
    d = sheet.dir(ws.id)
    d.mkdir(parents=True, exist_ok=True)
    if img.mode not in ("RGB", "L"):
        img = img.convert("RGB")
    img = _cap(img)

    img.save(d / "original.png")
    # current.png lúc mới nhập giống hệt original.png: chép file, khỏi mã hoá PNG lần hai
    shutil.copyfile(d / "original.png", d / "current.png")
    sheet.width, sheet.height = img.size

    thumb = img.copy()
    thumb.thumbnail((THUMB_W, THUMB_W * 3), Image.LANCZOS)
    thumb.save(d / "thumb.png")


def _write_scan_jpeg(path: Path, img: Image.Image) -> None:
    """Ảnh ĐEM QUÉT của mặt sổ đã chỉnh — JPEG và luôn dưới ngưỡng gửi API.

    Hạ chất lượng trước, cùng lắm mới thu nhỏ: chữ kana trong sổ rất nhỏ, mất
    độ phân giải là model đọc sai, còn nén JPEG mạnh tay thì hầu như không ảnh
    hưởng vì nền giấy vốn phẳng.
    """
    rgb = img.convert("RGB") if img.mode != "RGB" else img
    for quality in (92, 85, 75):
        rgb.save(path, "JPEG", quality=quality, optimize=True)
        if path.stat().st_size <= SCAN_MAX_MB * 1024 * 1024:
            return
    while path.stat().st_size > SCAN_MAX_MB * 1024 * 1024 and min(rgb.size) > 900:
        rgb = rgb.resize((rgb.width * 4 // 5, rgb.height * 4 // 5), Image.LANCZOS)
        rgb.save(path, "JPEG", quality=85, optimize=True)


def _regen_current(ws: Workspace, sheet: Sheet, img: Image.Image) -> None:
    d = sheet.dir(ws.id)
    if img.mode not in ("RGB", "L"):
        img = img.convert("RGB")
    img = _cap(img)
    img.save(d / "current.png")
    _write_scan_jpeg(d / "scan.jpg", img)
    sheet.width, sheet.height = img.size
    thumb = img.copy()
    thumb.thumbnail((THUMB_W, THUMB_W * 3), Image.LANCZOS)
    thumb.save(d / "thumb.png")


def _unique_name(ws: Workspace, base: str, page: int | None) -> str:
    """Tên hiển thị không trùng: thêm (1), (2)... khi đã có tên y hệt.

    Khoá so trùng là CẶP (tên, số trang) — nhờ vậy thêm lại đúng file PDF cũ thì
    cả 24 trang đều thành "ten(1)" chứ không lẫn với trang khác. Tên file gốc
    (`origin`) không bao giờ bị đổi.
    """
    taken = {(s.name, s.page) for s in ws.sheets}
    if (base, page) not in taken:
        return base
    n = 1
    while (f"{base}({n})", page) in taken:
        n += 1
    return f"{base}({n})"


# Nhập file gồm HAI pha (xem imgjobs.py):
#   • `prepare_upload` — nhanh, chạy ngay trong yêu cầu HTTP: kiểm file, lập sẵn các thẻ mặt
#     sổ ở trạng thái "queued" để giao diện hiện ra tức thì, lưu file tải lên vào đĩa.
#   • `process_upload` — chậm, chạy ở luồng nền: tách trang, lưu ảnh, kiểm hướng, cắt gọn.

def _new_sheet(ws: Workspace, filename: str, stem: str, page: int | None, ext: str) -> Sheet:
    sheet = Sheet(
        id=uuid.uuid4().hex[:10],
        # Không nhét "tr.N" vào tên: chữ đó phải dịch theo ngôn ngữ giao diện, nên để
        # frontend ghép từ `page`.
        name=_unique_name(ws, stem, page),
        origin=filename,
        page=page,
        source_ext=ext,
        status="queued",
    )
    ws.sheets.append(sheet)              # để _unique_name của trang kế thấy ngay
    return sheet


def prepare_upload(
    ws: Workspace, filename: str, data: bytes, auto: bool = True
) -> tuple[list[Sheet], dict]:
    """Pha nhanh: kiểm file, lập thẻ mặt sổ "queued", lưu file. Trả (các mặt sổ, việc nền)."""
    suffix = Path(filename).suffix.lower()
    if suffix not in ALLOWED_SUFFIX:
        raise ValueError(f"'{filename}': chỉ nhận {', '.join(sorted(ALLOWED_SUFFIX))}")
    if len(data) > MAX_FILE_MB * 1024 * 1024:
        raise ValueError(f"'{filename}' lớn hơn {MAX_FILE_MB}MB")

    stem = Path(filename).stem
    if suffix == ".pdf":
        try:
            doc = fitz.open(stream=data, filetype="pdf")
            try:
                pages = len(doc)
                locked = doc.needs_pass
            finally:
                doc.close()
        except Exception as e:  # noqa: BLE001 — PyMuPDF ném nhiều loại lỗi khác nhau
            raise ValueError(f"'{filename}': không mở được file PDF") from e
        if locked:
            raise ValueError(f"'{filename}': PDF có đặt mật khẩu")
        if pages == 0:
            raise ValueError(f"'{filename}': PDF không có trang nào")
        made = [_new_sheet(ws, filename, stem, i + 1, ".pdf") for i in range(pages)]
    else:
        try:
            Image.open(io.BytesIO(data))          # chỉ đọc phần đầu file: đủ để biết có phải ảnh
        except Exception as e:  # noqa: BLE001
            raise ValueError(f"'{filename}': không đọc được ảnh") from e
        made = [_new_sheet(ws, filename, stem, None, suffix)]

    up = ws.dir() / "uploads"
    up.mkdir(parents=True, exist_ok=True)
    path = up / f"{uuid.uuid4().hex[:10]}{suffix}"
    path.write_bytes(data)
    ws.save()
    job = {
        "ws_id": ws.id,
        "path": str(path),
        "filename": filename,
        "suffix": suffix,
        "sheet_ids": [s.id for s in made],
        "auto": bool(auto),
    }
    return made, job


def _fail(sheet: Sheet, code: str) -> None:
    sheet.status, sheet.error = "failed", code


def _gone(ws: Workspace, sheet: Sheet) -> bool:
    """Người dùng đã xoá mặt sổ này trong lúc nền đang xử lý → dọn tàn dư và bỏ qua."""
    if ws.find(sheet.id) is not None:
        return False
    shutil.rmtree(sheet.dir(ws.id), ignore_errors=True)
    return True


def _finish_sheet(ws: Workspace, sheet: Sheet, auto: bool, plans: dict) -> None:
    """Ảnh đã lưu xong: cho đi tiếp sang bước phân tích (nếu bật) hoặc sẵn sàng."""
    if not auto:
        sheet.status = "ready"
        return
    sheet.status = "analyzing"
    ws.save()
    try:
        img = Image.open(sheet.dir(ws.id) / "current.png")
        img.load()
        plan = autoprep.analyze(img)
    except Exception:  # noqa: BLE001 — phân tích hỏng thì cứ để ảnh nguyên, đừng chặn người dùng
        log.exception("phân tích ảnh %s lỗi", sheet.id)
        sheet.status = "ready"
        return
    plans[sheet.id] = plan
    if plan.sure:
        _apply_plan(ws, sheet, plan)
    # Chưa đủ chắc: giữ "analyzing" tới cuối file, xem các trang khác có cùng hướng không


def _apply_plan(ws: Workspace, sheet: Sheet, plan, propagated: bool = False) -> None:
    try:
        if plan.rotate or plan.box:
            auto_apply(ws, sheet, plan.rotate, plan.box)
        sheet.auto = plan.as_record(propagated=propagated)
    except Exception:  # noqa: BLE001
        log.exception("tự chỉnh ảnh %s lỗi", sheet.id)
    sheet.status = "ready"


def _settle_uncertain(ws: Workspace, sheet_ids: list[str], plans: dict) -> None:
    """Cuối một file: các trang chưa đủ chắc thì xoay theo đa số nếu chính nó cũng nghiêng
    về hướng đó; còn lại chỉ cắt gọn và ghi rõ "chưa chắc hướng"."""
    agreed = autoprep.consensus(plans.values())
    for sid in sheet_ids:
        sheet = ws.find(sid)
        if sheet is None or sheet.status != "analyzing":
            continue
        plan = plans.get(sid)
        if plan is None:
            sheet.status = "ready"
            continue
        if autoprep.should_follow(plan, agreed):
            try:
                img = Image.open(sheet.dir(ws.id) / "current.png")
                img.load()
                _apply_plan(ws, sheet, autoprep.analyze(img, rotate=agreed), propagated=True)
                continue
            except Exception:  # noqa: BLE001
                log.exception("xoay theo đa số cho %s lỗi", sid)
        _apply_plan(ws, sheet, plan)


def auto_apply(
    ws: Workspace,
    sheet: Sheet,
    rotate_cw: int = 0,
    box: tuple[float, float, float, float] | None = None,
) -> None:
    """Máy tự chỉnh: xoay (nếu cần) rồi cắt (nếu có) — GỘP MỘT bước, chỉ một lần chụp hoàn tác.

    Nên bấm「Hoàn tác ảnh」một lần là về đúng ảnh trước khi máy chỉnh, không phải về giữa
    chừng (đã xoay mà chưa cắt).
    """
    d = sheet.dir(ws.id)
    _snapshot(ws, sheet)
    img = Image.open(d / "current.png")
    img.load()
    if rotate_cw % 360:
        img = autoprep.turn(img, rotate_cw)
    cropped = False
    if box:
        w, h = img.size
        left, top, right, bottom = box
        px = (max(0, int(left * w)), max(0, int(top * h)), min(w, int(right * w)), min(h, int(bottom * h)))
        if px[2] - px[0] >= 20 and px[3] - px[1] >= 20:
            img = img.crop(px)
            cropped = True
    _regen_current(ws, sheet, img)
    sheet.rotation = round((sheet.rotation + rotate_cw) % 360, 1)
    sheet.cropped = sheet.cropped or cropped
    sheet.sha256 = _hash_current(ws, sheet)
    sheet.scanned = False


def autoprep_sheets(ws_id: str, sheet_ids: list[str]) -> None:
    """Việc nền: cho máy tự xoay/cắt các mặt sổ ĐÃ có ảnh (endpoint `/autoprep`). Người gọi
    đã đặt status "analyzing" cho từng mặt để giao diện thấy ngay."""
    ws = load(ws_id)
    if ws is None:
        return
    plans: dict = {}
    try:
        for sid in sheet_ids:
            sheet = ws.find(sid)
            if sheet is None or sheet.status != "analyzing":
                continue
            _finish_sheet(ws, sheet, True, plans)
            ws.save()
        _settle_uncertain(ws, sheet_ids, plans)
    except Exception:  # noqa: BLE001
        log.exception("tự căn chỉnh lỗi")
        for sid in sheet_ids:                    # đừng để mặt nào kẹt ở "đang phân tích"
            sheet = ws.find(sid)
            if sheet is not None and sheet.status == "analyzing":
                sheet.status = "ready"
    mark_duplicates(ws)
    ws.save()


def process_upload(job: dict) -> None:
    """Pha chậm, chạy ở luồng nền (xem `imgjobs`). Không ném lỗi ra ngoài: mặt sổ hỏng thì
    tự đánh dấu "failed" kèm mã lỗi để giao diện báo."""
    ws = load(job["ws_id"])
    path = Path(job["path"])
    try:
        if ws is None:
            return                              # workspace đã bị xoá
        data = path.read_bytes()
        if job["suffix"] == ".pdf":
            _process_pdf(ws, data, job)
        else:
            _process_image(ws, data, job)
    except Exception:  # noqa: BLE001
        log.exception("xử lý file %s lỗi", job.get("filename"))
        if ws is not None:
            for sid in job["sheet_ids"]:
                sheet = ws.find(sid)
                if sheet is not None and sheet.busy():
                    _fail(sheet, "unexpected")
            ws.save()
    finally:
        path.unlink(missing_ok=True)
        try:
            path.parent.rmdir()                 # thư mục uploads rỗng thì bỏ
        except OSError:
            pass


def _process_pdf(ws: Workspace, data: bytes, job: dict) -> None:
    # Ảnh xem/sửa render bằng PyMuPDF, NHƯNG bản đem quét là trang PDF tách bằng pypdf —
    # đúng thứ extract.py vẫn tạo, nên cache cũ dùng lại được.
    from extract import _split_pdf_pages

    try:
        pages = _split_pdf_pages(data)
    except Exception:  # noqa: BLE001 — không tách được thì quét bằng ảnh đã render
        log.exception("tách PDF bằng pypdf lỗi")
        pages = []
    plans: dict = {}
    doc = fitz.open(stream=data, filetype="pdf")
    try:
        for i, sid in enumerate(job["sheet_ids"]):
            sheet = ws.find(sid)
            if sheet is None or sheet.status != "queued":
                continue
            sheet.status = "rendering"
            try:
                pix = doc[i].get_pixmap(dpi=PDF_DPI)
                if pix.n == 3 and not pix.alpha:
                    img = Image.frombytes("RGB", (pix.width, pix.height), pix.samples)
                else:                           # hiếm: ảnh xám / có alpha
                    img = Image.open(io.BytesIO(pix.tobytes("png")))
                    img.load()
                _write_sheet_images(ws, sheet, img)
                if i < len(pages):
                    (sheet.dir(ws.id) / "source.pdf").write_bytes(pages[i])
                sheet.sha256 = _hash_current(ws, sheet)
            except Exception:  # noqa: BLE001
                log.exception("render trang %d lỗi", i + 1)
                _fail(sheet, "render")
                ws.save()
                continue
            if _gone(ws, sheet):
                continue
            _finish_sheet(ws, sheet, job["auto"], plans)
            ws.save()
    finally:
        doc.close()
    _settle_uncertain(ws, job["sheet_ids"], plans)
    mark_duplicates(ws)
    ws.save()


def _process_image(ws: Workspace, data: bytes, job: dict) -> None:
    sheet = ws.find(job["sheet_ids"][0])
    if sheet is None or sheet.status != "queued":
        return
    sheet.status = "rendering"
    try:
        img = Image.open(io.BytesIO(data))
        img.load()
        # Điện thoại/máy scan ghi hướng chụp vào thẻ EXIF; mọi trình xem ảnh đều xoay theo nó.
        # Bỏ qua thì ảnh trong app nằm ngang trong khi ở Windows lại đứng.
        exif = img.getexif().get(0x0112, 1)
        if exif not in (0, 1):
            img = ImageOps.exif_transpose(img)
            sheet.exif_fixed = True
        _write_sheet_images(ws, sheet, img)
        d = sheet.dir(ws.id)
        (d / f"source{job['suffix']}").write_bytes(data)
        if sheet.exif_fixed:
            # Bản đem quét phải là điểm ảnh ĐÃ xoay (xem Sheet.edited)
            fixed = Image.open(d / "current.png")
            fixed.load()
            _write_scan_jpeg(d / "scan.jpg", fixed)
        sheet.sha256 = _hash_current(ws, sheet)
    except Exception:  # noqa: BLE001
        log.exception("đọc ảnh %s lỗi", job.get("filename"))
        _fail(sheet, "decode")
        ws.save()
        return
    plans: dict = {}
    if not _gone(ws, sheet):
        _finish_sheet(ws, sheet, job["auto"], plans)
        _settle_uncertain(ws, job["sheet_ids"], plans)
    mark_duplicates(ws)
    ws.save()


def add_upload(ws: Workspace, filename: str, data: bytes, auto: bool = False) -> list[Sheet]:
    """Thêm 1 file và xử lý XONG ngay tại chỗ (đồng bộ). Dùng cho test và tiện ích; đường
    dùng thật là `prepare_upload` + `imgjobs.submit(process_upload, …)`."""
    made, job = prepare_upload(ws, filename, data, auto=auto)
    process_upload(job)
    bad = [s for s in made if s.status == "failed"]
    if bad:
        raise ValueError(f"'{filename}': không xử lý được ({bad[0].error})")
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
    # Sắp đổi ảnh nên nhãn "máy đã tự chỉnh" hết đúng. `auto_apply` tự ghi lại nhãn sau khi gọi.
    sheet.auto = None


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
    sheet.auto = None                    # ảnh không còn là bản máy đã chỉnh
    sheet.undo = None                    # chỉ hoàn tác được một bước
    prev.unlink(missing_ok=True)


def rotate(ws: Workspace, sheet: Sheet, degrees_cw: int, snapshot: bool = True) -> None:
    """Xoay THẬT trên ảnh — người dùng thấy ngay, model cũng nhận ảnh đã xoay."""
    d = sheet.dir(ws.id)
    if snapshot:
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
    snapshot: bool = True,
) -> None:
    """Chỉnh nghiêng vài độ + độ sáng + độ tương phản.

    Mục đích là làm ảnh DỄ ĐỌC HƠN cho model: bản chụp bằng tay hay nghiêng
    vài độ, bản scan cũ hay bị mờ hoặc bạc màu. Áp lên bản ĐANG hiển thị.
    """
    d = sheet.dir(ws.id)
    if snapshot:
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


def crop(ws: Workspace, sheet: Sheet, box: tuple[float, float, float, float],
         snapshot: bool = True) -> None:
    """Cắt theo tỉ lệ 0..1 (trái, trên, phải, dưới) so với ảnh hiện tại."""
    d = sheet.dir(ws.id)
    if snapshot:
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


def _perspective_coeffs(
    quad: list[tuple[float, float]], w: int, h: int
) -> tuple[float, ...]:
    """8 hệ số cho `Image.transform(PERSPECTIVE)`.

    PIL đi NGƯỢC: với mỗi điểm của ảnh ĐÍCH nó hỏi "lấy màu ở đâu trong ảnh
    nguồn". Nên phải giải phép biến đổi từ 4 góc ảnh đích (hình chữ nhật đầy
    khung) về 4 góc `quad` mà người dùng khoanh trên ảnh nguồn.

    Mỗi cặp điểm cho 2 phương trình tuyến tính; 4 cặp là 8 phương trình, vừa
    đủ cho 8 ẩn.
    """
    dst = [(0.0, 0.0), (float(w), 0.0), (float(w), float(h)), (0.0, float(h))]
    A, B = [], []
    for (dx, dy), (sx, sy) in zip(dst, quad):
        A.append([dx, dy, 1, 0, 0, 0, -sx * dx, -sx * dy])
        A.append([0, 0, 0, dx, dy, 1, -sy * dx, -sy * dy])
        B += [sx, sy]
    sol = np.linalg.solve(np.array(A, dtype=np.float64), np.array(B, dtype=np.float64))
    return tuple(sol)


def _apply_h(coeffs: tuple[float, ...], x: float, y: float) -> tuple[float, float]:
    """Điểm (x,y) của ảnh ĐÍCH → điểm tương ứng trong ảnh NGUỒN.

    ⚠ Nhận toạ độ PIXEL, không phải tỉ lệ 0..1 — vì `_perspective_coeffs` giải
    hệ trên toạ độ pixel của ảnh đích. Gọi nhầm bằng 0..1 thì mọi điểm dồn về
    góc trên-trái (đã dính đúng lỗi này khi làm phần uốn cong cạnh).
    """
    a, b, c, d, e, f, g, hh = coeffs
    z = g * x + hh * y + 1.0
    return ((a * x + b * y + c) / z, (d * x + e * y + f) / z)


def _mesh(
    coeffs: tuple[float, ...],
    lech: list[tuple[float, float]],
    w: int,
    h: int,
    n: int = 14,
) -> list:
    """Lưới ô cho `Image.transform(MESH)` — phối cảnh CỘNG độ cong của cạnh.

    Mỗi cạnh có một điểm giữa kéo được. `lech[i]` là ĐỘ LỆCH của điểm giữa cạnh
    i so với chỗ mà phép phối cảnh thuần tuý đặt nó (thứ tự: trên, phải, dưới,
    trái). Lệch bằng 0 nghĩa là cạnh thẳng.

    Trộn bằng hàm trọng số hình chuông `4u(1-u)`: đúng bằng độ lệch tại chính
    điểm giữa cạnh, bằng 0 ở hai góc, và tắt dần khi đi sang cạnh đối diện.
    Nhờ vậy kéo điểm giữa chỉ uốn cong cạnh đó, không xô lệch cả trang.
    """
    def src(u: float, v: float) -> tuple[float, float]:
        x, y = _apply_h(coeffs, u * w, v * h)      # u,v là 0..1 → đổi ra pixel
        bu, bv = 4 * u * (1 - u), 4 * v * (1 - v)
        for (dx, dy), wt in zip(
            lech, ((1 - v) * bu, u * bv, v * bu, (1 - u) * bv)
        ):
            x += dx * wt
            y += dy * wt
        return x, y

    pts = [[src(i / n, j / n) for i in range(n + 1)] for j in range(n + 1)]
    out = []
    for j in range(n):
        for i in range(n):
            box = (
                round(i * w / n), round(j * h / n),
                round((i + 1) * w / n), round((j + 1) * h / n),
            )
            tl, tr = pts[j][i], pts[j][i + 1]
            bl, br = pts[j + 1][i], pts[j + 1][i + 1]
            # Thứ tự PIL: trái-trên, trái-dưới, phải-dưới, phải-trên
            out.append((box, (*tl, *bl, *br, *tr)))
    return out


def perspective(
    ws: Workspace,
    sheet: Sheet,
    quad: list[tuple[float, float]],
    mids: list[tuple[float, float]] | None = None,
    snapshot: bool = True,
) -> None:
    """Nắn `quad` (tỉ lệ 0..1) thành hình chữ nhật đầy khung.

    Dùng cho ảnh chụp bằng điện thoại: cầm máy chếch xuống thì trang sổ ra hình
    thang, dòng chữ ở xa xích lại gần nhau. Xoay ảnh không cứu được vì đó là
    biến dạng phối cảnh, không phải phép quay.

    `quad` theo thứ tự trái-trên, phải-trên, phải-dưới, trái-dưới — đúng thứ tự
    4 tay nắm trên giao diện.

    `mids` là 4 điểm giữa cạnh (trên, phải, dưới, trái) cho những cuốn sổ KHÔNG
    BẸT PHẲNG — mở ra vẫn còn cong sấp, nên cạnh trang là đường cong chứ không
    phải đoạn thẳng. Bỏ trống (hoặc để đúng trung điểm) thì dùng phép phối cảnh
    thuần tuý như cũ.
    """
    if len(quad) != 4:
        raise ValueError("Cần đúng 4 góc")
    if mids is not None and len(mids) not in (0, 4):
        raise ValueError("Cần đúng 4 điểm giữa cạnh")

    d = sheet.dir(ws.id)
    img = Image.open(d / "current.png")
    img.load()
    w, h = img.size

    px = [(max(-0.5, min(1.5, x)) * w, max(-0.5, min(1.5, y)) * h) for x, y in quad]
    # Tứ giác bẹp thì ma trận suy biến, ảnh ra một vệt vô nghĩa
    rong = min(abs(px[1][0] - px[0][0]), abs(px[2][0] - px[3][0]))
    cao = min(abs(px[3][1] - px[0][1]), abs(px[2][1] - px[1][1]))
    if rong < w * 0.2 or cao < h * 0.2:
        raise ValueError("Vùng nắn quá hẹp — hãy kéo 4 góc ra rộng hơn")

    if snapshot:
        _snapshot(ws, sheet)
    try:
        coeffs = _perspective_coeffs(px, w, h)
    except np.linalg.LinAlgError as e:
        raise ValueError("Bốn góc này không tạo thành tứ giác hợp lệ") from e

    # Điểm giữa cạnh lệch khỏi TRUNG ĐIỂM HAI GÓC → cạnh cong.
    #
    # Mốc phải là trung điểm hai góc, KHÔNG phải chỗ phép phối cảnh đặt điểm
    # (u=0.5): phối cảnh không giữ trung điểm, nên lấy mốc đó thì để yên tay
    # nắm cũng sinh ra một vết uốn không ai yêu cầu — test bắt được đúng cảnh
    # này. Mốc "trung điểm hai góc" cũng chính là thứ giao diện vẽ, nên nhìn
    # sao ra vậy.
    lech = [(0.0, 0.0)] * 4
    if mids:
        for k, (mx, my) in enumerate(mids):
            a, b = px[k], px[(k + 1) % 4]
            gx, gy = (a[0] + b[0]) / 2, (a[1] + b[1]) / 2
            px_m = (max(-0.5, min(1.5, mx)) * w, max(-0.5, min(1.5, my)) * h)
            lech[k] = (px_m[0] - gx, px_m[1] - gy)

    cong = any(abs(dx) > 0.5 or abs(dy) > 0.5 for dx, dy in lech)
    out = (
        img.transform((w, h), Image.MESH, _mesh(coeffs, lech, w, h), Image.BICUBIC)
        if cong
        # Cạnh thẳng thì dùng phép phối cảnh thuần — chính xác tuyệt đối, không
        # phải xấp xỉ từng ô lưới.
        else img.transform((w, h), Image.PERSPECTIVE, coeffs, Image.BICUBIC)
    )
    _regen_current(ws, sheet, out)
    sheet.warped = True
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
    sheet.warped = False
    sheet.sha256 = _hash_current(ws, sheet)
    sheet.scanned = False


def split_at(ws: Workspace, sheet: Sheet, x_ratio: float) -> Sheet:
    """Cắt một mặt sổ thành HAI theo đường dọc tại `x_ratio` (0..1).

    Ảnh chụp 2 sổ cạnh nhau đọc rất tệ (model hay trộn hai sổ vào một). Tách ra
    trước khi quét là đòn hiệu quả nhất cho phần tên katakana.
    Mặt bên trái ghi đè mặt hiện tại; mặt bên phải thành mặt sổ MỚI ngay sau nó.
    """
    if not 0.1 <= x_ratio <= 0.9:
        raise ValueError("Đường cắt phải nằm trong khoảng 10%–90% bề rộng")

    d = sheet.dir(ws.id)
    img = Image.open(d / "current.png")
    img.load()
    w, h = img.size
    x = int(w * x_ratio)
    if x < 20 or w - x < 20:
        raise ValueError("Một bên sau khi tách quá nhỏ")

    left, right = img.crop((0, 0, x, h)), img.crop((x, 0, w, h))

    # Mặt phải: mặt sổ mới, chèn ngay sau mặt hiện tại
    new = Sheet(
        id=uuid.uuid4().hex[:10],
        name=_unique_name(ws, f"{sheet.name} R", sheet.page),
        origin=sheet.origin,
        page=sheet.page,
        source_ext=".png",
        rotation=sheet.rotation,
        cropped=True,
    )
    _write_sheet_images(ws, new, right)
    new.sha256 = _hash_current(ws, new)
    ws.sheets.insert(ws.sheets.index(sheet) + 1, new)

    # Mặt trái: ghi đè mặt đang xem (vẫn hoàn tác được một bước)
    _snapshot(ws, sheet)
    _regen_current(ws, sheet, left)
    sheet.name = _unique_name(ws, f"{sheet.name} L", sheet.page)
    sheet.cropped = True
    sheet.sha256 = _hash_current(ws, sheet)
    sheet.scanned = False

    mark_duplicates(ws)
    return new


def remove(ws: Workspace, sheet_id: str) -> None:
    sheet = ws.find(sheet_id)
    if not sheet:
        return
    shutil.rmtree(sheet.dir(ws.id), ignore_errors=True)
    ws.sheets = [s for s in ws.sheets if s.id != sheet_id]
    ws.dup_ok = [p for p in ws.dup_ok if sheet_id not in p]
    mark_duplicates(ws)
    ws.save()


def mark_not_duplicate(ws: Workspace, a: str, b: str) -> None:
    """Ghi nhận người dùng đã xem và bảo hai mặt sổ này KHÔNG phải cùng một trang (task 1.7).

    Raise ValueError nếu một trong hai id không phải mặt sổ của workspace, hoặc a == b. Gọi lại với
    cùng cặp (kể cả đảo thứ tự) thì không làm gì thêm.
    """
    if a == b or not ws.find(a) or not ws.find(b):
        raise ValueError("Mặt sổ không hợp lệ")
    pair = sorted([a, b])
    if pair not in ws.dup_ok:
        ws.dup_ok.append(pair)
        ws.save()


def to_json(ws: Workspace) -> dict:
    return {
        "id": ws.id,
        "book_name": ws.book_name,
        "dup_ok": ws.dup_ok,
        "sheets": [asdict(s) for s in ws.sheets],
    }
