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

from . import autofix, export_csv, jobs, results, rowmap, sample, workspace

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
    """Workspace + MỌI kết quả đã quét (khoá theo mặt sổ).

    Nhờ trả kèm kết quả mà F5 hay khởi động lại server vẫn thấy lại những gì đã
    quét — trước đây quét mặt mới là mất sạch kết quả các mặt cũ.
    """
    ws = _ws(ws_id)
    return {**workspace.to_json(ws), "results": results.load_all(ws_id)}


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
    results.drop(ws_id, sheet_id)
    return {**workspace.to_json(ws), "results": results.load_all(ws_id)}


@app.patch("/api/ws/{ws_id}/sheets/{sheet_id}")
def rename_sheet(ws_id: str, sheet_id: str, body: dict = Body(...)) -> dict:
    ws = _ws(ws_id)
    _sheet(ws, sheet_id).name = str(body.get("name", ""))[:80]
    ws.save()
    return workspace.to_json(ws)


@app.post("/api/ws/{ws_id}/reorder")
def reorder_sheets(ws_id: str, body: dict = Body(...)) -> dict:
    """Sắp lại thứ tự mặt sổ (kéo thả ở cột trái).

    Cột kết quả tự đi theo vì nó luôn lặp theo `ws.sheets`.
    """
    ws = _ws(ws_id)
    order = body.get("sheet_ids") or []
    known = {s.id: s for s in ws.sheets}
    if sorted(order) != sorted(known):
        raise HTTPException(400, "Danh sách thứ tự không khớp với các mặt sổ hiện có")
    ws.sheets = [known[i] for i in order]
    ws.save()
    return {**workspace.to_json(ws), "results": results.load_all(ws_id)}


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



@app.get("/api/ws/{ws_id}/sheets/{sheet_id}/rowmap")
def sheet_rowmap(ws_id: str, sheet_id: str, rows: int = 0) -> dict:
    """Ước lượng dải ảnh của từng dòng — để click dòng là khoanh đúng chỗ.

    Chạy bằng thuật toán trên ảnh có sẵn nên $0 và dùng được cho cả những mặt sổ
    đã quét từ trước. Xem `api/rowmap.py` để biết giới hạn.
    """
    from PIL import Image

    ws = _ws(ws_id)
    sheet = _sheet(ws, sheet_id)
    if rows <= 0:
        return {"bands": [], "exact": False}
    img = Image.open(sheet.dir(ws.id) / "current.png")
    img.load()
    return rowmap.bands_for(img, rows)


@app.post("/api/ws/{ws_id}/sample")
def add_sample(ws_id: str) -> dict:
    """Thêm sổ MẪU (dữ liệu giả lập) + kết quả dựng sẵn. Không gọi model."""
    ws = _ws(ws_id)
    added = sample.add_to(ws)
    return {
        "added": added,
        **workspace.to_json(ws),
        "results": results.load_all(ws_id),
    }


# ── Cắt nhanh thông minh (thuật toán, KHÔNG gọi model nên $0) ────────

@app.get("/api/ws/{ws_id}/sheets/{sheet_id}/autofix")
def autofix_plan(ws_id: str, sheet_id: str) -> dict:
    """Đề xuất các bước chỉnh, chưa áp dụng gì."""
    from PIL import Image

    ws = _ws(ws_id)
    sheet = _sheet(ws, sheet_id)
    img = Image.open(sheet.dir(ws.id) / "current.png")
    img.load()
    return autofix.plan(img)


@app.post("/api/ws/{ws_id}/autofix")
def autofix_apply(ws_id: str, body: dict = Body(...)) -> dict:
    """Áp dụng kế hoạch cắt nhanh cho MẶT SỔ đang xem."""
    ws = _ws(ws_id)
    ids = body.get("sheet_ids") or []
    if len(ids) != 1:
        raise HTTPException(400, "Cắt nhanh áp dụng cho mặt sổ đang xem")
    sheet = _sheet(ws, ids[0])

    steps = body.get("steps") or []
    if not steps:
        raise HTTPException(400, "Không có bước nào để áp dụng")

    try:
        for i, st in enumerate(steps):
            kind = st.get("kind")
            # Chỉ bước ĐẦU chụp ảnh hoàn tác (snapshot=i==0) — để một lần bấm
            # "Hoàn tác" trả về đúng trạng thái TRƯỚC khi cắt nhanh, chứ không
            # phải về giữa chừng chuỗi bước.
            if kind == "rotate":
                workspace.rotate(ws, sheet, int(st["degrees"]) % 360, snapshot=i == 0)
            elif kind == "tilt":
                workspace.adjust(ws, sheet, fine_deg=float(st["degrees"]), snapshot=i == 0)
            elif kind == "crop":
                b = st["box"]
                workspace.crop(
                    ws, sheet,
                    (float(b["left"]), float(b["top"]), float(b["right"]), float(b["bottom"])),
                    snapshot=i == 0,
                )
            else:
                raise HTTPException(400, f"Bước không hiểu: {kind}")
    except ValueError as e:
        raise HTTPException(400, str(e)) from e

    ws.save()
    return workspace.to_json(ws)


@app.post("/api/ws/{ws_id}/split")
def split_sheet(ws_id: str, body: dict = Body(...)) -> dict:
    """Tách 1 ảnh chứa 2 sổ thành 2 mặt sổ riêng (trái / phải)."""
    ws = _ws(ws_id)
    ids = body.get("sheet_ids") or []
    if len(ids) != 1:
        raise HTTPException(400, "Tách áp dụng cho mặt sổ đang xem")
    try:
        workspace.split_at(ws, _sheet(ws, ids[0]), float(body.get("x", 0.5)))
    except (ValueError, TypeError) as e:
        raise HTTPException(400, str(e)) from e
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


@app.post("/api/ws/{ws_id}/export")
def export(ws_id: str, body: dict = Body(...)):
    """Xuất theo tuỳ chọn người dùng.

    Ở mức WORKSPACE chứ không phải một lần quét: kết quả được tích luỹ theo từng
    mặt sổ, nên xuất phải lấy toàn bộ những gì đã quét, kể cả quét ở nhiều lượt.
    `accounts` do frontend gửi lên để xuất ĐÚNG cái người dùng đang thấy — kể cả
    các ô họ vừa sửa tay trong bảng review.
    """
    ws = _ws(ws_id)

    fmt = body.get("format", "xlsx")
    if fmt not in ("xlsx", "csv"):
        raise HTTPException(400, "format chỉ nhận xlsx hoặc csv")

    accounts = body.get("accounts")
    if not accounts:
        accounts = results.to_accounts(ws, results.load_all(ws_id))

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

    book = _safe_name(body.get("name") or ws.book_name or "tsucho")
    add_total = bool(body.get("add_total"))

    structure = body.get("structure")
    if structure == "per_sheet":
        names = {s.id: s.name for s in ws.sheets}
        accounts = _split_by_sheet(accounts, names)
    elif structure == "merged":
        # KHÔNG đặt điều kiện len(accounts) > 1: các khối cùng ngân hàng và cùng
        # số tài khoản đã được gộp từ trước, nên nhiều mặt sổ vẫn có thể ra đúng
        # một account — mà vẫn cần dòng phân cách để biết dòng nào của file nào.
        # "Gộp chung một bảng" phải ra ĐÚNG MỘT bảng. Trước đây chỉ dựa vào việc
        # các khối tự gộp theo bank+account_no — mà sổ không có trang bìa thì
        # account_no là null nên không khối nào gộp được, kết quả ra y hệt bản
        # tách. Ở đây ép thành một sổ duy nhất, đúng như tên tuỳ chọn.
        names = {sh.id: sh.name for sh in ws.sheets}
        merged_rows: list[dict] = []
        seen_sheet: str | None = None
        for acc in accounts:
            for tx in acc["transactions"]:
                sid = tx.get("sheet_id")
                # Đổi sang mặt sổ khác → chèn một dòng phân cách mảnh ghi tên
                # file. Gộp mà không có mốc nào thì không biết dòng nào của file
                # nào; một dòng ghi chú là đủ, không cần kẻ ô rườm rà.
                if sid != seen_sheet:
                    seen_sheet = sid
                    merged_rows.append({
                        "date": None, "date_raw": None, "kind": None,
                        "description": f"── {names.get(sid or '', sid or '?')}",
                        "extra_text": None, "store_code": None,
                        "amount_out": None, "amount_in": None, "balance": None,
                        "status": "note", "reason": "", "is_note": True,
                        "sheet_id": sid,
                    })
                merged_rows.append(tx)

        first = accounts[0]
        accounts = [{
            "bank_name": first.get("bank_name"),
            "store_no": first.get("store_no"),
            "account_no": first.get("account_no"),
            "holder": first.get("holder"),
            "sheet_title": book,
            "transactions": merged_rows,
        }]

    if fmt == "csv":
        data = export_csv.accounts_to_csv(accounts, book, add_total=add_total)
        return Response(
            content=data,
            media_type="text/csv; charset=utf-8",
            headers={"Content-Disposition": _disposition(f"{book}.csv")},
        )

    out = Path(workspace.WS_DIR) / ws_id / f"{book}.xlsx"
    export_accounts(accounts, str(out), source_name=book, add_total=add_total)
    return FileResponse(
        out,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": _disposition(f"{book}.xlsx")},
    )
