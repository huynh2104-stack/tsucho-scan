"""API web cho tsucho-scan.

Chạy:  python -m uvicorn api.main:app --reload --port 8000
Thử:   http://localhost:8000/docs

Toàn bộ xử lý đi qua `core.scan()` — không có logic đọc sổ nào ở đây.
"""

import asyncio
import json
import re
from pathlib import Path
from urllib.parse import quote

from fastapi import Body, FastAPI, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, Response, StreamingResponse

from export import export_accounts

from . import export_csv, jobs, workspace

app = FastAPI(title="tsucho-scan API", version="0.2.0")

# Next.js chạy ở cổng 3000 lúc phát triển. Khi lên thật phải thay bằng tên miền
# thật — để "*" là cho phép mọi trang web gọi API kèm cookie của người dùng.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    # Không expose thì JS không đọc được tên file đính kèm khi tải về
    expose_headers=["Content-Disposition"],
)


def _ws(ws_id: str) -> workspace.Workspace:
    ws = workspace.load(ws_id)
    if not ws:
        raise HTTPException(404, "Không tìm thấy không gian làm việc")
    return ws


def _sheet(ws: workspace.Workspace, sheet_id: str) -> workspace.Sheet:
    s = ws.find(sheet_id)
    if not s:
        raise HTTPException(404, "Không tìm thấy mặt sổ")
    return s


@app.get("/api/health")
def health() -> dict:
    return {"ok": True}


# ── Không gian làm việc & mặt sổ ─────────────────────────────────────

@app.post("/api/ws")
def create_ws() -> dict:
    return workspace.to_json(workspace.create())


@app.get("/api/ws/{ws_id}")
def get_ws(ws_id: str) -> dict:
    return workspace.to_json(_ws(ws_id))


@app.patch("/api/ws/{ws_id}")
def rename_book(ws_id: str, body: dict = Body(...)) -> dict:
    ws = _ws(ws_id)
    ws.book_name = str(body.get("book_name", ""))[:80]
    ws.save()
    return workspace.to_json(ws)


@app.post("/api/ws/{ws_id}/sheets")
async def add_sheets(ws_id: str, files: list[UploadFile]) -> dict:
    """Tải file lên. PDF nhiều trang được TÁCH thành nhiều mặt sổ độc lập."""
    ws = _ws(ws_id)
    added = []
    for f in files:
        data = await f.read()
        try:
            added += workspace.add_upload(ws, f.filename or "file", data)
        except ValueError as e:
            raise HTTPException(400, str(e)) from e
    return {"added": [s.id for s in added], **workspace.to_json(ws)}


@app.delete("/api/ws/{ws_id}/sheets/{sheet_id}")
def delete_sheet(ws_id: str, sheet_id: str) -> dict:
    ws = _ws(ws_id)
    workspace.remove(ws, sheet_id)
    return workspace.to_json(ws)


@app.patch("/api/ws/{ws_id}/sheets/{sheet_id}")
def rename_sheet(ws_id: str, sheet_id: str, body: dict = Body(...)) -> dict:
    ws = _ws(ws_id)
    _sheet(ws, sheet_id).name = str(body.get("name", ""))[:80]
    ws.save()
    return workspace.to_json(ws)


@app.get("/api/ws/{ws_id}/sheets/{sheet_id}/image")
def sheet_image(ws_id: str, sheet_id: str, thumb: bool = False, v: str = ""):
    """Ảnh hiện tại của mặt sổ (đã áp dụng xoay/cắt). `v` để phá cache trình duyệt."""
    ws = _ws(ws_id)
    sheet = _sheet(ws, sheet_id)
    path = sheet.dir(ws.id) / ("thumb.png" if thumb else "current.png")
    if not path.is_file():
        raise HTTPException(404, "Chưa có ảnh")
    return FileResponse(path, media_type="image/png", headers={"Cache-Control": "no-cache"})


# ── Chỉnh ảnh: xoay (nhiều mặt) / cắt (một mặt) ──────────────────────

@app.post("/api/ws/{ws_id}/rotate")
def rotate_sheets(ws_id: str, body: dict = Body(...)) -> dict:
    """Xoay THẬT nhiều mặt sổ cùng lúc — dùng cho Ctrl/Shift chọn nhiều."""
    ws = _ws(ws_id)
    degrees = int(body.get("degrees", 90))
    if degrees % 90 != 0:
        raise HTTPException(400, "Chỉ xoay theo bội số 90°")
    ids = body.get("sheet_ids") or []
    if not ids:
        raise HTTPException(400, "Chưa chọn mặt sổ nào")
    for sid in ids:
        workspace.rotate(ws, _sheet(ws, sid), degrees % 360)
    ws.save()
    return workspace.to_json(ws)


@app.post("/api/ws/{ws_id}/crop")
def crop_sheet(ws_id: str, body: dict = Body(...)) -> dict:
    """Cắt — CHỈ nhận đúng một mặt sổ (vùng cắt của ảnh này không hợp ảnh khác)."""
    ws = _ws(ws_id)
    ids = body.get("sheet_ids") or []
    if len(ids) != 1:
        raise HTTPException(
            400, "Cắt chỉ áp dụng cho một mặt sổ — hãy chọn đúng một ảnh."
        )
    box = body.get("box") or {}
    try:
        rect = (
            float(box["left"]), float(box["top"]),
            float(box["right"]), float(box["bottom"]),
        )
    except (KeyError, TypeError, ValueError) as e:
        raise HTTPException(400, "Vùng cắt không hợp lệ") from e
    try:
        workspace.crop(ws, _sheet(ws, ids[0]), rect)
    except ValueError as e:
        raise HTTPException(400, str(e)) from e
    ws.save()
    return workspace.to_json(ws)


@app.post("/api/ws/{ws_id}/adjust")
def adjust_sheets(ws_id: str, body: dict = Body(...)) -> dict:
    """Nghiêng tinh + độ sáng + độ tương phản. Áp cho mọi mặt đang chọn."""
    ws = _ws(ws_id)
    ids = body.get("sheet_ids") or []
    if not ids:
        raise HTTPException(400, "Chưa chọn mặt sổ nào")
    try:
        fine = float(body.get("fine_deg", 0) or 0)
        bright = float(body.get("brightness", 1) or 1)
        contrast = float(body.get("contrast", 1) or 1)
    except (TypeError, ValueError) as e:
        raise HTTPException(400, "Giá trị chỉnh ảnh không hợp lệ") from e

    if not (-20 <= fine <= 20):
        raise HTTPException(400, "Nghiêng tinh chỉ trong khoảng ±20°")
    if not (0.3 <= bright <= 2.5) or not (0.3 <= contrast <= 2.5):
        raise HTTPException(400, "Độ sáng/tương phản chỉ trong khoảng 0.3–2.5")

    for sid in ids:
        workspace.adjust(
            ws, _sheet(ws, sid),
            fine_deg=fine, brightness=bright, contrast=contrast,
        )
    ws.save()
    return workspace.to_json(ws)


@app.post("/api/ws/{ws_id}/undo")
def undo_sheet(ws_id: str, body: dict = Body(...)) -> dict:
    """Hoàn tác MỘT bước chỉnh ảnh — cứu cú bấm nhầm「Về ảnh gốc」."""
    ws = _ws(ws_id)
    ids = body.get("sheet_ids") or []
    if len(ids) != 1:
        raise HTTPException(400, "Hoàn tác áp dụng cho một mặt sổ đang xem")
    try:
        workspace.undo(ws, _sheet(ws, ids[0]))
    except ValueError as e:
        raise HTTPException(400, str(e)) from e
    ws.save()
    return workspace.to_json(ws)


@app.post("/api/ws/{ws_id}/reset")
def reset_sheets(ws_id: str, body: dict = Body(...)) -> dict:
    """Trả ảnh về bản gốc — hoàn tác mọi lần xoay/cắt."""
    ws = _ws(ws_id)
    for sid in body.get("sheet_ids") or []:
        workspace.reset_sheet(ws, _sheet(ws, sid))
    ws.save()
    return workspace.to_json(ws)


# ── Quét ─────────────────────────────────────────────────────────────

@app.post("/api/ws/{ws_id}/scan")
def start_scan(ws_id: str, body: dict = Body(...)) -> dict:
    """Quét đúng những mặt sổ người dùng chọn, theo thứ tự họ đang thấy."""
    ws = _ws(ws_id)
    ids = body.get("sheet_ids") or []
    if not ids:
        raise HTTPException(400, "Chưa chọn mặt sổ nào để quét")

    order = {s.id: i for i, s in enumerate(ws.sheets)}
    ids = sorted({s for s in ids if s in order}, key=lambda s: order[s])

    sheets = [_sheet(ws, sid) for sid in ids]
    paths = [str(s.scan_path(ws.id)) for s in sheets]

    job = jobs.create(ws.id, ids, paths)
    jobs.start(job, use_cache=not bool(body.get("no_cache")))
    for s in sheets:
        s.scanned = True
    ws.save()
    return jobs.to_json(job)


@app.get("/api/jobs/{job_id}")
def get_job(job_id: str) -> dict:
    job = jobs.get(job_id)
    if not job:
        raise HTTPException(404, "Không tìm thấy lần quét")
    return jobs.to_json(job)


@app.get("/api/jobs/{job_id}/events")
async def events(job_id: str):
    """SSE: đẩy tiến độ từng mặt sổ về trình duyệt theo thời gian thực."""
    job = jobs.get(job_id)
    if not job:
        raise HTTPException(404, "Không tìm thấy lần quét")

    async def gen():
        # jobs.stream là generator ĐỒNG BỘ (có timeout chặn) → chạy ở threadpool
        # để không khoá vòng lặp async của server.
        it = jobs.stream(job)
        while True:
            event = await asyncio.to_thread(lambda: next(it, None))
            if event is None:
                break
            yield f"data: {json.dumps(event, ensure_ascii=False)}\n\n"

    return StreamingResponse(
        gen(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


# ── Xuất file ────────────────────────────────────────────────────────

def _safe_name(name: str) -> str:
    cleaned = re.sub(r'[\\/:*?"<>|]', "", name).strip()
    return cleaned[:60] or "tsucho"


def _disposition(filename: str) -> str:
    """Header tải file chịu được tên tiếng Việt/Nhật.

    Header HTTP chỉ mã hoá được latin-1, nên `filename="Sổ 見本.csv"` làm server
    đổ 500. Chuẩn RFC 5987 giải quyết: gửi kèm `filename*=UTF-8''<percent-encode>`
    và để `filename=` là bản ASCII cho trình duyệt cũ.
    """
    ascii_name = filename.encode("ascii", "ignore").decode().strip() or "tsucho"
    quoted = quote(filename, safe="")
    return f"attachment; filename=\"{ascii_name}\"; filename*=UTF-8''{quoted}"


def _split_by_sheet(accounts: list[dict], names: dict[str, str]) -> list[dict]:
    """Cắt lại thành từng MẶT SỔ để mỗi mặt ra một tab Excel riêng.

    Giữ nguyên thứ tự dòng. Một mặt sổ chứa 2 sổ khác nhau thì thành 2 khối,
    nhưng vẫn nằm cùng một tab (đúng như người dùng nhìn thấy mặt sổ đó).
    """
    order: list[str] = []
    groups: dict[str, dict] = {}
    for acc in accounts:
        for tx in acc["transactions"]:
            sid = tx.get("sheet_id") or "?"
            if sid not in groups:
                order.append(sid)
                groups[sid] = {
                    "bank_name": acc.get("bank_name"),
                    "store_no": acc.get("store_no"),
                    "account_no": acc.get("account_no"),
                    "holder": acc.get("holder"),
                    "sheet_title": names.get(sid) or sid,
                    "transactions": [],
                }
            groups[sid]["transactions"].append(tx)
    return [groups[s] for s in order]


@app.post("/api/jobs/{job_id}/export")
def export(job_id: str, body: dict = Body(...)):
    """Xuất theo tuỳ chọn người dùng.

    Nhận `accounts` do frontend gửi lên để xuất ĐÚNG cái người dùng đang thấy —
    kể cả các ô họ vừa sửa tay trong bảng review.
    """
    job = jobs.get(job_id)
    if not job or not job._result_obj:
        raise HTTPException(404, "Chưa có kết quả để tải")

    fmt = body.get("format", "xlsx")
    if fmt not in ("xlsx", "csv"):
        raise HTTPException(400, "format chỉ nhận xlsx hoặc csv")

    accounts = body.get("accounts") or job._result_obj.accounts
    keep = body.get("sheet_ids")          # None = lấy hết
    if keep:
        keep_set = set(keep)
        accounts = [
            {**a, "transactions": rows}
            for a in accounts
            if (rows := [t for t in a["transactions"] if t.get("sheet_id") in keep_set])
        ]
    if not accounts:
        raise HTTPException(400, "Phạm vi đã chọn không có dòng nào để xuất")

    book = _safe_name(body.get("name") or job._result_obj.source_name or "tsucho")
    add_total = bool(body.get("add_total"))

    if body.get("structure") == "per_sheet":
        ws = workspace.load(job.ws_id)
        names = {s.id: s.name for s in (ws.sheets if ws else [])}
        accounts = _split_by_sheet(accounts, names)

    if fmt == "csv":
        data = export_csv.accounts_to_csv(accounts, book, add_total=add_total)
        return Response(
            content=data,
            media_type="text/csv; charset=utf-8",
            headers={"Content-Disposition": _disposition(f"{book}.csv")},
        )

    out = Path(workspace.WS_DIR) / job.ws_id / f"{book}.xlsx"
    export_accounts(accounts, str(out), source_name=book, add_total=add_total)
    return FileResponse(
        out,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": _disposition(f"{book}.xlsx")},
    )
