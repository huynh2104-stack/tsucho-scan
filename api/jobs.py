"""Job quét chạy nền + hàng đợi sự kiện để đẩy tiến độ ra SSE.

`core.scan()` là hàm ĐỒNG BỘ và chạy lâu (24 mặt sổ ≈ 4 phút), nên phải chạy
trong thread riêng, không được chặn vòng lặp async của FastAPI. Mỗi job có một
`queue.Queue` chứa sự kiện; endpoint SSE lấy ra và đẩy về trình duyệt.

Lưu trong BỘ NHỚ — khởi động lại server là mất kết quả (ảnh thì vẫn còn trong
workspace). Đủ cho giai đoạn 2; giai đoạn 3 có CSDL thì chuyển vào đó.
"""

import queue
import threading
import time
import traceback
import uuid
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from core import ExtractError, scan

from . import results

_SENTINEL = object()


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
    events: queue.Queue = field(default_factory=queue.Queue)
    _log: list[dict] = field(default_factory=list)
    _result_obj: Any = None              # ScanResult, giữ để xuất file

    def emit(self, event: dict) -> None:
        """Ghi lại sự kiện rồi đẩy vào hàng đợi.

        `_log` để trình duyệt nối lại giữa chừng vẫn thấy các bước đã qua — F5
        lúc đang quét trang 12/24 mà mất sạch tiến độ thì rất khó chịu.
        """
        self._log.append(event)
        self.events.put(event)


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
        job.status = "done"
        job.emit({
            "stage": "finished",
            "message": "Hoàn tất",
            "totals": result.totals,
            "cost_usd": result.cost_usd,
            "cached": result.cached,
        })
    except ExtractError as e:
        job.status = "error"
        job.error_code, job.error_sheet, job.error = _friendly(job, e)
        job.error_info = getattr(e, "info", {})
        job.emit({
            "stage": "error",
            "message": job.error,        # dự phòng khi trình duyệt chưa dịch mã
            "code": job.error_code,
            "sheet": job.error_sheet,
            "info": getattr(e, "info", {}),   # con số ghép vào câu đã dịch
        })
    except Exception as e:                                   # lỗi ngoài dự tính
        job.status = "error"
        job.error = f"Lỗi không mong đợi: {e}"
        traceback.print_exc()
        job.emit({"stage": "error", "message": job.error})
    finally:
        job.events.put(_SENTINEL)


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

    # Thống kê theo từng mặt sổ — hiện huy hiệu ngay trên thumbnail bên trái
    per_sheet: dict[str, dict] = {
        sid: {"sheet_id": sid, "rows": 0, "need_check": 0, "fixed": 0}
        for sid in job.sheet_ids
    }
    for acc in data["accounts"]:
        for tx in acc["transactions"]:
            sid = tx.get("sheet_id")
            if sid in per_sheet and not tx.get("is_note"):
                per_sheet[sid]["rows"] += 1
                if tx.get("status") == "check":
                    per_sheet[sid]["need_check"] += 1
                elif tx.get("status") == "fixed":
                    per_sheet[sid]["fixed"] += 1

    data["per_sheet"] = list(per_sheet.values())
    data["sheet_ids"] = job.sheet_ids
    return data


def stream(job: Job, replay: bool = True):
    """Generator sự kiện cho SSE. `replay` phát lại các bước đã qua trước."""
    if replay:
        for event in list(job._log):
            yield event
        if job.status in ("done", "error"):
            return

    while True:
        try:
            event = job.events.get(timeout=25)
        except queue.Empty:
            # Job đã xong mà không thấy dấu kết thúc → luồng chạy nền đã chết
            # (thường là server vừa nạp lại code). Phải THOÁT, đừng ping tiếp:
            # ping mãi thì uvicorn không đóng được tiến trình cũ và treo cả
            # server — đã dính đúng lỗi này 01/08/2026.
            if job.status in ("done", "error"):
                return
            yield {"stage": "ping", "message": ""}   # giữ kết nối sống
            continue
        if event is _SENTINEL:
            return
        yield event


def to_json(job: Job) -> dict:
    return {
        "id": job.id,
        "status": job.status,
        "error": job.error,
        "error_code": job.error_code,
        "error_sheet": job.error_sheet,
        "error_info": job.error_info,
        "sheet_ids": job.sheet_ids,
        "result": job.result,
    }
