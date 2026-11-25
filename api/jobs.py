"""Job quét chạy nền + hàng đợi sự kiện để đẩy tiến độ ra SSE.

`core.scan()` là hàm ĐỒNG BỘ và chạy lâu (24 mặt sổ ≈ 4 phút), nên phải chạy
trong thread riêng, không được chặn vòng lặp async của FastAPI. Mỗi job có một
nhật ký sự kiện (`_log`); endpoint SSE đọc nhật ký theo CON TRỎ RIÊNG của từng
người nghe rồi đẩy về trình duyệt.

Lưu trong BỘ NHỚ — khởi động lại server là mất kết quả (ảnh thì vẫn còn trong
workspace). Đủ cho giai đoạn 2; giai đoạn 3 có CSDL thì chuyển vào đó.
"""

import threading
import time
import traceback
import uuid
from dataclasses import dataclass, field
from itertools import groupby
from pathlib import Path
from typing import Any

import review
from core import ExtractError, scan

from . import quota, results

# Chờ sự kiện mới tối đa bấy nhiêu giây thì ping giữ kết nối (hằng số để test thu nhỏ)
PING_S = 25


@dataclass
class Job:
    id: str
    ws_id: str
    sheet_ids: list[str]                 # theo ĐÚNG thứ tự đem quét
    paths: list[str]
    names: list[str] = field(default_factory=list)   # tên mặt sổ NGƯỜI DÙNG thấy
    status: str = "pending"              # pending | running | done | error
    error: str | None = None
    error_code: str = ""              # mã lỗi để trình duyệt tự dịch
    error_sheet: str = ""             # tên mặt sổ hỏng, để ghép vào câu dịch
    error_info: dict = field(default_factory=dict)   # con số ghép vào câu dịch
    result: dict | None = None
    created_at: float = field(default_factory=time.time)
    _log: list[dict] = field(default_factory=list)
    # Người nghe chờ ở đây; `_closed` = luồng nền đã chạy xong hẳn (không còn sự kiện nào nữa)
    _cond: threading.Condition = field(
        default_factory=threading.Condition, repr=False, compare=False)
    _closed: bool = False
    # Hạn mức đã giữ cho lần quét này (xem `start_scan`); lỗi sớm thì hoàn lại đúng các khoá đã cộng
    reserved: int = 0
    reserved_for: list[str] | None = None     # danh sách khoá `quota.key_names`
    reserved_day: str | None = None
    _result_obj: Any = None              # ScanResult, giữ để xuất file
    # Việc nối đuôi sau khi quét xong thành công (ví dụ đọc trước chữ cho khung đỏ). Truyền callable vào để jobs.py
    # khỏi import workspace/rowanchors.
    after: list = field(default_factory=list, repr=False, compare=False)

    def emit(self, event: dict) -> None:
        """Ghi sự kiện vào nhật ký rồi đánh thức mọi người đang nghe.

        `_log` để trình duyệt nối lại giữa chừng vẫn thấy các bước đã qua — F5
        lúc đang quét trang 12/24 mà mất sạch tiến độ thì rất khó chịu.

        Không dùng một hàng đợi chung: F5 mở kết nối thứ hai khi kết nối cũ chưa
        kịp đóng thì hai bên giành nhau sự kiện (người này lấy mất của người kia)
        và phần phát lại còn gây trùng. Mỗi người nghe tự giữ con trỏ trên `_log`.
        """
        with self._cond:
            self._log.append(event)
            self._cond.notify_all()


_jobs: dict[str, Job] = {}
_lock = threading.Lock()


def create(
    ws_id: str,
    sheet_ids: list[str],
    paths: list[str],
    names: list[str] | None = None,
) -> Job:
    job = Job(
        id=uuid.uuid4().hex[:12], ws_id=ws_id, sheet_ids=sheet_ids,
        paths=paths, names=names or [],
    )
    with _lock:
        _jobs[job.id] = job
    return job


def get(job_id: str) -> Job | None:
    with _lock:
        return _jobs.get(job_id)


def latest_for(ws_id: str) -> Job | None:
    with _lock:
        done = [j for j in _jobs.values() if j.ws_id == ws_id and j.status == "done"]
    return max(done, key=lambda j: j.created_at, default=None)


def active_for(ws_id: str) -> Job | None:
    """Lần quét mới nhất của hồ sơ mà còn đang chạy — để F5 nối lại tiến độ."""
    with _lock:
        live = [j for j in _jobs.values()
                if j.ws_id == ws_id and j.status in ("pending", "running") and not j._closed]
    return max(live, key=lambda j: j.created_at, default=None)


def start(job: Job, use_cache: bool = True) -> None:
    """Chạy quét trong thread nền. Trả về ngay, không chờ."""
    if job.status == "running":
        return
    job.status = "running"
    threading.Thread(target=_run, args=(job, use_cache), daemon=True).start()


def _run(job: Job, use_cache: bool) -> None:
    try:
        job.emit({
            "stage": "start",
            "message": f"Bắt đầu quét {len(job.paths)} mặt sổ",
            "total": len(job.paths),
        })

        # rotate=0: ảnh đã được xoay THẬT trong workspace trước khi tới đây
        result = scan(job.paths, rotate=0, use_cache=use_cache, on_progress=job.emit)

        job._result_obj = result
        job.result = _payload(job, result)
        # Lưu ra đĩa theo TỪNG mặt sổ: quét mặt mới không xoá kết quả mặt cũ,
        # và F5 / khởi động lại server vẫn còn (đây cũng là lịch sử quét).
        results.save_job(job.ws_id, job.sheet_ids, job.result, job.id)
        # Đổi trạng thái VÀ phát sự kiện cuối trong cùng một khoá: người nghe thấy
        # "done" thì chắc chắn đã có sự kiện cuối trong nhật ký (không bỏ sót).
        with job._cond:
            job.status = "done"
            job.emit({
                "stage": "finished",
                "message": "Hoàn tất",
                "totals": result.totals,
                "cost_usd": result.cost_usd,
                "cached": result.cached,
            })
    except ExtractError as e:
        job.error_code, job.error_sheet, job.error = _friendly(job, e)
        job.error_info = getattr(e, "info", {})
        with job._cond:                  # cùng lý do với nhánh "done" ở trên
            job.status = "error"
            job.emit({
                "stage": "error",
                "message": job.error,        # dự phòng khi trình duyệt chưa dịch mã
                "code": job.error_code,
                "sheet": job.error_sheet,
                "info": getattr(e, "info", {}),   # con số ghép vào câu đã dịch
            })
    except Exception as e:                                   # lỗi ngoài dự tính
        job.error = f"Lỗi không mong đợi: {e}"
        traceback.print_exc()
        with job._cond:
            job.status = "error"
            job.emit({"stage": "error", "message": job.error})
    finally:
        with job._cond:
            # Luồng chết bằng ngoại lệ không phải Exception (hoặc bị giết) mà status còn
            # "running" → job "ma": active_for trả mãi, F5 nối vào luồng đã đóng. Chốt lỗi.
            if job.status in ("pending", "running"):
                job.error = "Lần quét bị dừng đột ngột"
                job.status = "error"
                job.emit({"stage": "error", "message": job.error})
        _refund_if_early(job)
        with job._cond:                  # báo "hết sự kiện" cho mọi người đang nghe
            job._closed = True
            job._cond.notify_all()
        # Việc nối đuôi chỉ chạy khi quét THÀNH CÔNG, và SAU khi đã báo xong: lỗi ở đây không được đổi trạng thái job
        if job.status == "done":
            for task in job.after:
                try:
                    task()
                except Exception:
                    traceback.print_exc()


def _refund_if_early(job: Job) -> None:
    """Lỗi trước khi gọi mô hình lần nào thì hoàn lượt (hạn mức) đã giữ.

    Sự kiện "page" phát NGAY TRƯỚC lời gọi mô hình của trang đó (extract_transactions),
    nên chưa có "page" nào = chưa gọi gì (thiếu API key, file hỏng...). Có rồi thì không
    chắc → không hoàn (nghiêng về phía giữ hạn mức công khai).
    """
    if job.status != "error" or not job.reserved or not job.reserved_for:
        return
    if any(e.get("stage") == "page" for e in list(job._log)):
        return
    n, job.reserved = job.reserved, 0
    try:
        quota.refund(job.reserved_for, n, job.reserved_day)
    except Exception:                                    # hoàn lượt hỏng không được che lỗi gốc
        traceback.print_exc()


def _friendly(job: Job, e: ExtractError) -> tuple[str, str, str]:
    """(mã lỗi, tên mặt sổ, câu tiếng Việt dự phòng).

    Trả về **mã** chứ không chỉ câu chữ: giao diện có 3 thứ tiếng, mà server thì
    không biết người dùng đang xem tiếng nào. Server gửi mã, trình duyệt tự
    dịch — đúng chỗ duy nhất biết ngôn ngữ hiện tại.

    Câu tiếng Việt vẫn trả kèm để làm dự phòng (CLI, mã lạ chưa kịp dịch).

    Hai thứ nữa phải sửa so với `str(e)` thô:
    - Tên file nội bộ ('source.jpg') → tên mặt sổ họ nhìn thấy ở cột trái.
    - Bỏ lời model giải thích (thường là tiếng Anh, kiểu "The provided image is
      a document about insurance...") — người dùng Nhật/Việt đọc không nổi, mà
      biết thêm cũng không làm gì khác đi. Lời đó vẫn được in ra log server.
    """
    kind = getattr(e, "kind", "")
    reason = getattr(e, "reason", "")
    if reason:
        print(f"[scan] {kind or 'error'}: {reason}")

    ten = job.names[0] if len(job.names) == 1 else ""
    nhan = f"「{ten}」" if ten else "Ảnh này"
    if kind == "not_bankbook":
        return kind, ten, (
            f"{nhan} không phải sổ ngân hàng (通帳) nên không quét được."
            " Hãy kiểm tra lại xem có chọn nhầm file không."
        )
    if kind == "unreadable":
        return kind, ten, (
            f"{nhan} quá mờ nên không đọc được."
            " Hãy chụp/scan lại rõ hơn, hoặc thử cắt sát vào phần bảng giao dịch."
        )
    if kind == "no_rows":
        return kind, ten, (
            f"{nhan} không có dòng giao dịch nào"
            " (có thể là trang bìa hoặc trang trắng)."
        )
    if kind == "too_large":
        info = getattr(e, "info", {})
        return kind, ten, (
            f"{nhan} quá lớn ({info.get('size_mb')}MB, giới hạn"
            f" {info.get('limit_mb')}MB). Hãy giảm kích thước ảnh."
        )

    # Lỗi khác (mạng, API key, file hỏng...) — message gốc vốn đã tiếng Việt,
    # nhưng vẫn có thể lỡ nhắc tên file nội bộ ('source.png'). Đổi nốt.
    msg = str(e)
    if ten and job.paths:
        msg = msg.replace(Path(job.paths[0]).name, ten)
    return "", ten, msg


def _payload(job: Job, result) -> dict:
    """Kết quả + ánh xạ dòng → mặt sổ, để click ảnh là cuộn tới đúng phần."""
    data = result.to_dict()

    # extract.py đánh source_unit theo thứ tự file gửi đi; đổi lại thành sheet_id
    for acc in data["accounts"]:
        for tx in acc["transactions"]:
            unit = tx.get("source_unit")
            tx["sheet_id"] = (
                job.sheet_ids[unit] if isinstance(unit, int) and unit < len(job.sheet_ids)
                else None
            )

    # Thống kê theo từng mặt sổ — hiện huy hiệu ngay trên thumbnail bên trái. Tính bằng định nghĩa
    # chung review.py (không đọc `status` đóng băng) trên từng KHỐI = đoạn liền nhau của một mặt sổ
    # trong một sổ, đúng như kho kết quả cắt khối (results.save_job).
    per_sheet: dict[str, dict] = {
        sid: {"sheet_id": sid, "rows": 0, "need_check": 0, "fixed": 0, "confirmed": 0, "edited": 0}
        for sid in job.sheet_ids
    }
    for acc in data["accounts"]:
        for sid, run in groupby(acc["transactions"], key=lambda tx: tx.get("sheet_id")):
            if sid in per_sheet:
                st = review.sheet_stats([{"rows": list(run)}])
                per_sheet[sid]["rows"] += st["rows"]
                per_sheet[sid]["need_check"] += st["need"]
                for k in ("fixed", "confirmed", "edited"):
                    per_sheet[sid][k] += st[k]

    data["per_sheet"] = list(per_sheet.values())
    data["sheet_ids"] = job.sheet_ids
    return data


def stream(job: Job, replay: bool = True):
    """Generator sự kiện cho SSE. `replay` phát lại các bước đã qua trước.

    Mỗi lời gọi có CON TRỎ riêng `i` trên `job._log`, nên nhiều trình duyệt (hoặc
    F5 khi kết nối cũ chưa đóng) cùng nghe một job mà không giành nhau sự kiện,
    và không bị trùng: phát lại rồi nghe tiếp chỉ là đọc tiếp cùng một dãy.
    """
    i = 0 if replay else len(job._log)
    while True:
        with job._cond:
            job._cond.wait_for(
                lambda: len(job._log) > i or job._closed or job.status in ("done", "error"),
                timeout=PING_S,
            )
            batch = job._log[i:]
            over = job._closed or job.status in ("done", "error")
        if batch:
            i += len(batch)
            yield from batch          # nhả ngoài khoá: trình duyệt chậm không chặn luồng quét
            continue
        # Hết sự kiện mà job đã xong (kể cả khi luồng nền chết mà chưa kịp đóng, thường
        # là server vừa nạp lại code) → phải THOÁT, đừng ping tiếp: ping mãi thì uvicorn
        # không đóng được tiến trình cũ và treo cả server — đã dính đúng lỗi này 01/08/2026.
        if over:
            return
        yield {"stage": "ping", "message": ""}   # giữ kết nối sống


def to_json(job: Job) -> dict:
    return {
        "id": job.id,
        "status": job.status,
        "error": job.error,
        "error_code": job.error_code,
        "error_sheet": job.error_sheet,
        "error_info": job.error_info,
        "sheet_ids": job.sheet_ids,
        "names": job.names,
        "created_at": job.created_at,
        "result": job.result,
    }
