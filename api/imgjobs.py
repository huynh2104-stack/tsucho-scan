"""Hàng đợi xử lý ảnh chạy NỀN — một luồng, làm lần lượt từng việc.

Vì sao có: tải một PDF 24 trang lên rồi tách trang, lưu ảnh, kiểm hướng, cắt gọn mất hàng
chục giây. Làm hết trong lúc trình duyệt chờ phản hồi thì người dùng nhìn một màn hình
đứng im. Nay yêu cầu tải lên trả lời NGAY (kèm các thẻ mặt sổ ở trạng thái "đang chờ") còn
việc nặng chạy ở đây; giao diện hỏi lại trạng thái để vẽ thanh tiến độ.

Một luồng duy nhất là cố ý: bộ đọc chữ cục bộ dùng chung một bản mô hình và mỗi ảnh lớn
tốn vài chục MB RAM khi xử lý — chạy song song chỉ làm máy chủ nhỏ hết bộ nhớ (lỗi 502
từng gặp). Muốn nhanh hơn thì nâng máy chứ đừng nâng số luồng.

Việc nào ném lỗi thì ghi log rồi làm tiếp việc sau; mỗi việc tự đánh dấu mặt sổ hỏng của nó.
"""

import logging
import queue
import threading

log = logging.getLogger("tsucho.imgjobs")

_q: "queue.Queue[tuple]" = queue.Queue()
_lock = threading.Lock()
_thread: threading.Thread | None = None


def submit(fn, *args) -> None:
    """Xếp một việc vào hàng; luồng nền được dựng lười ở lần đầu."""
    global _thread
    _q.put((fn, args))
    with _lock:
        if _thread is None or not _thread.is_alive():
            _thread = threading.Thread(target=_run, name="tsucho-imgjobs", daemon=True)
            _thread.start()


def _run() -> None:
    while True:
        fn, args = _q.get()
        try:
            fn(*args)
        except Exception:  # noqa: BLE001 — một việc hỏng không được làm chết cả hàng
            log.exception("việc xử lý ảnh bị lỗi: %s", getattr(fn, "__name__", fn))
        finally:
            _q.task_done()


def wait_idle() -> None:
    """Đợi hết việc trong hàng — chỉ dùng cho test."""
    _q.join()


def pending() -> int:
    return _q.unfinished_tasks
