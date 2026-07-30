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
from typing import Any

from core import ExtractError, scan

_SENTINEL = object()


@dataclass
class Job:
    id: str
    ws_id: str
    sheet_ids: list[str]                 # theo ĐÚNG thứ tự đem quét
    paths: list[str]
    status: str = "pending"              # pending | running | done | error
    error: str | None = None
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


def create(ws_id: str, sheet_ids: list[str], paths: list[str]) -> Job:
    job = Job(id=uuid.uuid4().hex[:12], ws_id=ws_id, sheet_ids=sheet_ids, paths=paths)
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
        job.status = "done"
        job.emit({
            "stage": "finished",
            "message": "Hoàn tất",
            "totals": result.totals,
            "cost_usd": result.cost_usd,
            "cached": result.cached,
        })
    except ExtractError as e:
        job.status, job.error = "error", str(e)
        job.emit({"stage": "error", "message": str(e)})
    except Exception as e:                                   # lỗi ngoài dự tính
        job.status = "error"
        job.error = f"Lỗi không mong đợi: {e}"
        traceback.print_exc()
        job.emit({"stage": "error", "message": job.error})
    finally:
        job.events.put(_SENTINEL)


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
        "sheet_ids": job.sheet_ids,
        "result": job.result,
    }
