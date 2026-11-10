"""API web cho tsucho-scan.

Chạy:  python -m uvicorn api.main:app --reload --port 8000
Thử:   http://localhost:8000/docs

Toàn bộ xử lý đi qua `core.scan()` — không có logic đọc sổ nào ở đây.
"""

import asyncio
import json
import os
import re
from pathlib import Path
from typing import Annotated
from urllib.parse import quote

from fastapi import Body, Cookie, Depends, FastAPI, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, Response, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from export import export_accounts
from extract import is_sample_file

from . import (
    auth, autofix, corrections, demo, export_csv, imgjobs, jobs, prefs, results, rowmap, rowanchors, sample, workspace,
)

app = FastAPI(title="tsucho-scan API", version="0.3.0")

auth.init_db()
# Tài khoản dùng thử (nếu máy chủ có khai báo TSUCHO_DEMO_ACCOUNTS)
demo.tao_neu_thieu()

# Trang web nào được phép gọi API này. Mặc định là Next.js chạy máy mình lúc
# phát triển; khi triển khai thì đặt biến môi trường:
#     TSUCHO_ORIGINS=https://tsucho.vercel.app
# Nhiều tên miền thì ngăn bằng dấu phẩy.
#
# ⚠ TUYỆT ĐỐI không để "*": API này nhận cookie phiên, mở cho mọi trang web
# nghĩa là bất kỳ site nào cũng đọc được sổ ngân hàng của người đang đăng nhập.
_ORIGINS = [
    o.strip()
    for o in os.getenv(
        "TSUCHO_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000"
    ).split(",")
    if o.strip() and o.strip() != "*"
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    # Không expose thì JS không đọc được tên file đính kèm khi tải về
    expose_headers=["Content-Disposition"],
)


# Mọi route đụng tới dữ liệu sổ đều nhận `user: CurrentUser` — chưa đăng nhập
# thì FastAPI trả 401 trước khi vào thân hàm, không sót route nào.
CurrentUser = Annotated[auth.User, Depends(auth.require_user)]


def _ws(ws_id: str, user: auth.User) -> workspace.Workspace:
    """Nạp workspace VÀ kiểm tra quyền sở hữu.

    Trả 404 (không phải 403) khi workspace của người khác: nói "có tồn tại
    nhưng anh không được xem" là đã tiết lộ thông tin rồi.
    """
    ws = workspace.load(ws_id)
    if not ws or ws.owner != user.id:
        raise HTTPException(404, "Không tìm thấy không gian làm việc")
    return ws


def _sheet(ws: workspace.Workspace, sheet_id: str) -> workspace.Sheet:
    s = ws.find(sheet_id)
    if not s:
        raise HTTPException(404, "Không tìm thấy mặt sổ")
    return s


def _sheet_ready(ws: workspace.Workspace, sheet_id: str) -> workspace.Sheet:
    """Như `_sheet` nhưng chỉ nhận mặt sổ đã xử lý xong.

    Mặt sổ còn đang tách trang / kiểm hướng ở luồng nền (hoặc bị hỏng) chưa có ảnh ổn định:
    sửa hay quét lúc này sẽ đè lên việc nền hoặc mở file chưa tồn tại. Trả 409 kèm MÃ để
    giao diện tự dịch, cùng lối với các lỗi khác.
    """
    s = _sheet(ws, sheet_id)
    if s.status != "ready":
        raise HTTPException(409, {"kind": "not_ready", "status": s.status})
    return s


@app.get("/api/health")
def health() -> dict:
    return {"ok": True}


# ── Đăng nhập ────────────────────────────────────────────────────────

@app.post("/api/auth/register")
def register(response: Response, body: dict = Body(...)) -> dict:
    """Tự đăng ký. Người ĐẦU TIÊN thành admin và nhận các workspace cũ."""
    try:
        user = auth.create_user(str(body.get("email", "")), str(body.get("password", "")))
    except auth.AuthError as e:
        # Trả MÃ lỗi để giao diện dịch sang đúng thứ tiếng người dùng đang xem.
        raise HTTPException(400, {"kind": e.code, **e.info}) from e
    except ValueError as e:
        raise HTTPException(400, str(e)) from e

    claimed = workspace.claim_ownerless(user.id) if user.role == "admin" else 0
    auth.set_cookie(response, auth.start_session(user))
    return {**user.to_json(), "claimed_workspaces": claimed}


@app.post("/api/auth/login")
def login(request: Request, response: Response, body: dict = Body(...)) -> dict:
    email = str(body.get("email", ""))
    keys = auth.attempt_keys(email, auth.client_ip(request))

    # Đang bị khoá thì KHÔNG kiểm tra mật khẩu. Kiểm tra rồi mới từ chối là vô
    # nghĩa: kẻ dò cứ gọi tiếp và vẫn biết được lần đoán nào đúng.
    wait = auth.lock_remaining(keys)
    if wait:
        # detail là dict để giao diện tự dịch sang tiếng người dùng đang xem —
        # cùng lối với mã lỗi lúc quét (api/jobs.py).
        raise HTTPException(429, {"kind": "locked", "seconds": wait})

    found = auth.get_by_email(email)
    password = str(body.get("password", ""))
    if not found and auth.OPEN_LOGIN:
        # Đăng nhập mở (bản đang phát triển): tên chưa có ⇒ tạo luôn tài khoản rồi vào, khỏi bước đăng ký
        try:
            user = auth.create_open_user(email, password)
        except auth.AuthError as e:
            raise HTTPException(400, {"kind": e.code, **e.info}) from e
        auth.clear_failures(keys)
        auth.set_cookie(response, auth.start_session(user))
        return {**user.to_json(), "created": True}

    # Sai email và sai mật khẩu phải trả CÙNG một câu — nếu khác nhau thì người
    # ngoài dò được email nào đã có tài khoản.
    if not found:
        auth.burn_time()          # trả lời chậm y như khi email có thật
    if not found or not auth.verify_password(password, found[1]):
        auth.record_failure(keys)
        raise HTTPException(401, "Email hoặc mật khẩu không đúng")

    auth.clear_failures(keys)
    user = found[0]
    auth.set_cookie(response, auth.start_session(user))
    return user.to_json()


@app.get("/api/auth/demo")
def demo_accounts() -> dict:
    """Tài khoản dùng thử dùng chung, kèm mật khẩu — CỐ Ý công khai.

    Máy chủ không khai báo thì trả danh sách rỗng và giao diện không hiện gì.
    """
    return {
        "accounts": [
            {"email": t.email, "password": t.password, "label": t.label}
            for t in demo.danh_sach()
        ],
        "scan_limit": demo.han_muc(),
        # Trang đăng nhập dựa vào đây để hiện khung «bản đang phát triển — nhập tên/mật khẩu tuỳ ý»
        "open_login": auth.OPEN_LOGIN,
    }


@app.post("/api/auth/logout")
def logout(
    response: Response,
    session: str | None = Cookie(default=None, alias=auth.COOKIE),
) -> dict:
    if session:
        auth.end_session(session)
    auth.clear_cookie(response)
    return {"ok": True}


@app.get("/api/auth/me")
def me(user: CurrentUser) -> dict:
    return user.to_json()


# ── Cài đặt theo tài khoản (task 3.1) ─────────────────────────────────

# Tài khoản dùng thử là tài khoản CHUNG: nếu lưu ngôn ngữ/giao diện lên máy chủ thì người trước chọn
# tiếng Việt + nền tối là người sau (máy khác) cũng bị theo, mất mặc định tiếng Nhật + theo thiết bị.
# Nên với tài khoản này hai khoá đó chỉ nằm trên từng máy (localStorage), máy chủ không ghi, không trả.
_PER_DEVICE = ("lang", "theme")


def _shared_view(user: auth.User, p: dict) -> dict:
    return {**p, **{k: None for k in _PER_DEVICE}} if demo.la_demo(user.email) else p


@app.get("/api/me/prefs")
def get_prefs(user: CurrentUser) -> dict:
    """Cài đặt đầy đủ của CHÍNH người đang đăng nhập (khoá chưa đổi lấy mặc định)."""
    return _shared_view(user, prefs.get(user.id))


@app.put("/api/me/prefs")
def put_prefs(user: CurrentUser, body: dict = Body(...)) -> dict:
    """Đổi một vài khoá (các khoá không gửi giữ nguyên). Khoá lạ / sai kiểu → 400."""
    if demo.la_demo(user.email) and isinstance(body, dict):
        body = {k: v for k, v in body.items() if k not in _PER_DEVICE}
    try:
        return _shared_view(user, prefs.update(user.id, body))
    except ValueError as e:
        raise HTTPException(400, str(e)) from e


# ── Từ điển sửa lỗi theo người dùng (task 3.3) ─────────────────────────

@app.get("/api/dict")
def get_dict(user: CurrentUser) -> dict:
    """Từ điển của CHÍNH người đang đăng nhập (tên đối tác là dữ liệu tài chính: không bao giờ chung)."""
    return {"entries": corrections.list_entries(user.id)}


@app.post("/api/dict/learn")
def dict_learn(user: CurrentUser, body: dict = Body(...)) -> dict:
    """Học «sai → đúng» từ một lần người dùng sửa ô. Cùng khoá thì cập nhật và tăng `hits`."""
    try:
        return corrections.learn(user.id, body.get("field"), body.get("wrong"), body.get("right"))
    except corrections.DictError as e:
        raise HTTPException(400, str(e)) from e


@app.delete("/api/dict/{entry_id}")
def dict_delete(entry_id: int, user: CurrentUser) -> dict:
    if not corrections.delete(user.id, entry_id):
        raise HTTPException(404, "Không có mục này")
    return {"deleted": entry_id}


@app.delete("/api/dict")
def dict_clear(user: CurrentUser) -> dict:
    """Xoá HẾT từ điển của người này."""
    return {"deleted": corrections.clear(user.id)}


# ── Không gian làm việc & mặt sổ ─────────────────────────────────────

@app.post("/api/ws")
def create_ws(user: CurrentUser, body: dict | None = Body(None)) -> dict:
    """Tạo hồ sơ mới. Có thể đặt tên ngay (`book_name`); không có thì để trống, đặt sau cũng được."""
    name = (body or {}).get("book_name", "")
    return workspace.to_json(workspace.create(owner=user.id, book_name=name if isinstance(name, str) else ""))


@app.get("/api/ws")
def list_ws(user: CurrentUser) -> dict:
    """Workspace của CHÍNH người đang đăng nhập — mới nhất trước.

    Có cái này thì xoá bộ nhớ trình duyệt hay đổi máy vẫn tìm lại được việc
    đang làm dở, không bị mồ côi dữ liệu.
    """
    out = []
    for ws in workspace.list_for(user.id):
        stats = results.case_stats(ws, results.load_all(ws.id))
        out.append({
            "id": ws.id,
            "book_name": ws.book_name,
            "created_at": ws.created_at,
            # «Lần sửa cuối» tính cả việc sửa ô trong bảng (ghi vào file kết quả, không đụng meta.json)
            "updated_at": max(ws.updated_at, stats.pop("results_updated_at")),
            "archived": ws.archived,
            "sheets": len(ws.sheets),
            "scanned": sum(1 for s in ws.sheets if s.scanned),
            **stats,                          # rows, need, confirmed — theo review.py
        })
    return {"workspaces": out}


@app.get("/api/ws/{ws_id}")
def get_ws(ws_id: str, user: CurrentUser) -> dict:
    """Workspace + MỌI kết quả đã quét (khoá theo mặt sổ).

    Nhờ trả kèm kết quả mà F5 hay khởi động lại server vẫn thấy lại những gì đã
    quét — trước đây quét mặt mới là mất sạch kết quả các mặt cũ.
    """
    ws = _ws(ws_id, user)
    return {**workspace.to_json(ws), "results": results.load_all(ws_id)}


@app.patch("/api/ws/{ws_id}")
def rename_book(ws_id: str, user: CurrentUser, body: dict = Body(...)) -> dict:
    """Đổi tên hồ sơ (`book_name`) và/hoặc cất/mở lại (`archived`). Trường nào không gửi thì giữ nguyên."""
    ws = _ws(ws_id, user)
    with workspace.locked(ws_id):
        if "book_name" in body:
            ws.book_name = str(body["book_name"] or "")[: workspace.BOOK_NAME_MAX]
        if "archived" in body:
            if not isinstance(body["archived"], bool):
                raise HTTPException(400, "archived phải là true hoặc false")
            ws.archived = body["archived"]
        ws.save()
        return workspace.to_json(ws)


@app.delete("/api/ws/{ws_id}")
def delete_ws(ws_id: str, user: CurrentUser) -> dict:
    """Xoá HẲN hồ sơ (ảnh lẫn kết quả). Chỉ chủ sở hữu; hồ sơ của người khác → 404."""
    ws = _ws(ws_id, user)
    workspace.delete(ws)
    return {"deleted": ws_id}


@app.post("/api/ws/{ws_id}/sheets")
async def add_sheets(
    ws_id: str, files: list[UploadFile], user: CurrentUser, auto: bool = True
) -> dict:
    """Tải file lên. PDF nhiều trang được TÁCH thành nhiều mặt sổ độc lập.

    Trả lời NGAY với các thẻ mặt sổ ở trạng thái "queued"; việc nặng (tách trang, lưu ảnh,
    tự xoay/cắt) chạy ở luồng nền và giao diện hỏi lại `GET /api/ws/:id/sheets` để vẽ tiến độ.
    `auto=false` tắt bước tự xoay/cắt. File lỗi không làm hỏng cả lô: các file tốt vẫn được
    nhận, file xấu nằm trong `errors`; chỉ khi KHÔNG file nào nhận được mới trả 400.
    """
    ws = _ws(ws_id, user)
    # Đọc hết file trước: khoá của hồ sơ là RLock theo LUỒNG, không được giữ qua một `await`
    uploads = [(f.filename or "file", await f.read()) for f in files]
    added: list[workspace.Sheet] = []
    errors: list[dict] = []
    with workspace.locked(ws_id):
        for name, data in uploads:
            try:
                made, job = workspace.prepare_upload(ws, name, data, auto=auto)
            except ValueError as e:
                errors.append({"file": name, "message": str(e)})
                continue
            added += made
            imgjobs.submit(workspace.process_upload, job)
        if errors and not added:
            raise HTTPException(400, errors[0]["message"])
        return {"added": [s.id for s in added], "errors": errors, **workspace.to_json(ws)}


@app.get("/api/ws/{ws_id}/sheets")
def list_sheets(ws_id: str, user: CurrentUser) -> dict:
    """Danh sách mặt sổ (không kèm kết quả quét) — nhẹ, để giao diện hỏi lại mỗi giây
    trong lúc nền còn đang xử lý."""
    return workspace.to_json(_ws(ws_id, user))


@app.post("/api/ws/{ws_id}/autoprep")
def autoprep_sheets(ws_id: str, user: CurrentUser, body: dict = Body(...)) -> dict:
    """Cho máy tự xoay + cắt gọn những mặt sổ ĐÃ CÓ (nhập trước khi có tính năng này).

    Chạy nền như lúc nhập file. Mặt đã quét bị BỎ QUA trừ khi `force`: ảnh đổi thì kết quả
    cũ không còn khớp, phải quét lại.
    """
    ws = _ws(ws_id, user)
    with workspace.locked(ws_id):
        ids = body.get("sheet_ids") or []
        if not ids:
            raise HTTPException(400, "Chưa chọn mặt sổ nào")
        force = bool(body.get("force"))
        queued, skipped = [], []
        for sid in ids:
            s = _sheet_ready(ws, sid)
            if s.scanned and not force:
                skipped.append(sid)
                continue
            s.status = "analyzing"
            queued.append(sid)
        if queued:
            ws.save()
            imgjobs.submit(workspace.autoprep_sheets, ws.id, queued)
        return {"queued": queued, "skipped": skipped, **workspace.to_json(ws)}


@app.delete("/api/ws/{ws_id}/sheets/{sheet_id}")
def delete_sheet(ws_id: str, sheet_id: str, user: CurrentUser) -> dict:
    ws = _ws(ws_id, user)
    with workspace.locked(ws_id):
        workspace.remove(ws, sheet_id)
        results.drop(ws_id, sheet_id)
        return {**workspace.to_json(ws), "results": results.load_all(ws_id)}


@app.patch("/api/ws/{ws_id}/sheets/{sheet_id}")
def rename_sheet(
    ws_id: str,
    sheet_id: str,
    user: CurrentUser,
    body: dict = Body(...),
) -> dict:
    ws = _ws(ws_id, user)
    with workspace.locked(ws_id):
        _sheet(ws, sheet_id).name = str(body.get("name", ""))[:80]
        ws.save()
        return workspace.to_json(ws)


@app.post("/api/ws/{ws_id}/reorder")
def reorder_sheets(ws_id: str, user: CurrentUser, body: dict = Body(...)) -> dict:
    """Sắp lại thứ tự mặt sổ (kéo thả ở cột trái).

    Cột kết quả tự đi theo vì nó luôn lặp theo `ws.sheets`.
    """
    ws = _ws(ws_id, user)
    with workspace.locked(ws_id):
        order = body.get("sheet_ids") or []
        known = {s.id: s for s in ws.sheets}
        if sorted(order) != sorted(known):
            raise HTTPException(400, "Danh sách thứ tự không khớp với các mặt sổ hiện có")
        ws.sheets = [known[i] for i in order]
        ws.save()
        return {**workspace.to_json(ws), "results": results.load_all(ws_id)}


@app.post("/api/ws/{ws_id}/dup-ok")
def dup_ok(ws_id: str, user: CurrentUser, body: dict = Body(...)) -> dict:
    """「Không phải trùng」: người dùng đã so hai mặt sổ và xác nhận chúng là hai trang khác nhau
    (task 1.7). Id lạ hoặc hai id giống nhau → 400."""
    ws = _ws(ws_id, user)
    with workspace.locked(ws_id):
        a, b = body.get("a"), body.get("b")
        if not isinstance(a, str) or not isinstance(b, str):
            raise HTTPException(400, "Thiếu mã hai mặt sổ")
        try:
            workspace.mark_not_duplicate(ws, a, b)
        except ValueError as e:
            raise HTTPException(400, str(e)) from e
        return workspace.to_json(ws)


@app.get("/api/ws/{ws_id}/sheets/{sheet_id}/image")
def sheet_image(
    ws_id: str,
    sheet_id: str,
    user: CurrentUser,
    thumb: bool = False,
    v: str = "",
):
    """Ảnh hiện tại của mặt sổ (đã áp dụng xoay/cắt). `v` để phá cache trình duyệt."""
    ws = _ws(ws_id, user)
    sheet = _sheet(ws, sheet_id)
    path = sheet.dir(ws.id) / ("thumb.png" if thumb else "current.png")
    if not path.is_file():
        raise HTTPException(404, "Chưa có ảnh")
    return FileResponse(path, media_type="image/png", headers={"Cache-Control": "no-cache"})


# ── Chỉnh ảnh: xoay (nhiều mặt) / cắt (một mặt) ──────────────────────

@app.post("/api/ws/{ws_id}/rotate")
def rotate_sheets(ws_id: str, user: CurrentUser, body: dict = Body(...)) -> dict:
    """Xoay THẬT nhiều mặt sổ cùng lúc — dùng cho Ctrl/Shift chọn nhiều."""
    ws = _ws(ws_id, user)
    with workspace.locked(ws_id):
        degrees = int(body.get("degrees", 90))
        if degrees % 90 != 0:
            raise HTTPException(400, "Chỉ xoay theo bội số 90°")
        ids = body.get("sheet_ids") or []
        if not ids:
            raise HTTPException(400, "Chưa chọn mặt sổ nào")
        for sid in ids:
            workspace.rotate(ws, _sheet_ready(ws, sid), degrees % 360)
        ws.save()
        return workspace.to_json(ws)


@app.post("/api/ws/{ws_id}/crop")
def crop_sheet(ws_id: str, user: CurrentUser, body: dict = Body(...)) -> dict:
    """Cắt — CHỈ nhận đúng một mặt sổ (vùng cắt của ảnh này không hợp ảnh khác)."""
    ws = _ws(ws_id, user)
    with workspace.locked(ws_id):
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
            workspace.crop(ws, _sheet_ready(ws, ids[0]), rect)
        except ValueError as e:
            raise HTTPException(400, str(e)) from e
        ws.save()
        return workspace.to_json(ws)


@app.post("/api/ws/{ws_id}/perspective")
def warp_sheet(ws_id: str, user: CurrentUser, body: dict = Body(...)) -> dict:
    """Nắn phối cảnh — CHỈ một mặt sổ (4 góc của ảnh này không hợp ảnh khác)."""
    ws = _ws(ws_id, user)
    with workspace.locked(ws_id):
        ids = body.get("sheet_ids") or []
        if len(ids) != 1:
            raise HTTPException(
                400, "Nắn phối cảnh áp dụng cho một mặt sổ — hãy chọn đúng một ảnh."
            )
        def diem(raw) -> list[tuple[float, float]]:
            return [(float(p[0]), float(p[1])) for p in raw or []]

        try:
            quad = diem(body.get("corners"))
            mids = diem(body.get("mids"))       # điểm giữa cạnh, có thể bỏ trống
        except (TypeError, ValueError, IndexError) as e:
            raise HTTPException(400, "Toạ độ các điểm không hợp lệ") from e

        try:
            workspace.perspective(ws, _sheet_ready(ws, ids[0]), quad, mids or None)
        except ValueError as e:
            raise HTTPException(400, str(e)) from e
        ws.save()
        return workspace.to_json(ws)


@app.post("/api/ws/{ws_id}/adjust")
def adjust_sheets(ws_id: str, user: CurrentUser, body: dict = Body(...)) -> dict:
    """Nghiêng tinh + độ sáng + độ tương phản. Áp cho mọi mặt đang chọn."""
    ws = _ws(ws_id, user)
    with workspace.locked(ws_id):
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
                ws, _sheet_ready(ws, sid),
                fine_deg=fine, brightness=bright, contrast=contrast,
            )
        ws.save()
        return workspace.to_json(ws)


@app.post("/api/ws/{ws_id}/undo")
def undo_sheet(ws_id: str, user: CurrentUser, body: dict = Body(...)) -> dict:
    """Hoàn tác MỘT bước chỉnh ảnh — cứu cú bấm nhầm「Về ảnh gốc」."""
    ws = _ws(ws_id, user)
    with workspace.locked(ws_id):
        ids = body.get("sheet_ids") or []
        if len(ids) != 1:
            raise HTTPException(400, "Hoàn tác áp dụng cho một mặt sổ đang xem")
        try:
            workspace.undo(ws, _sheet_ready(ws, ids[0]))
        except ValueError as e:
            raise HTTPException(400, str(e)) from e
        ws.save()
        return workspace.to_json(ws)


@app.post("/api/ws/{ws_id}/reset")
def reset_sheets(ws_id: str, user: CurrentUser, body: dict = Body(...)) -> dict:
    """Trả ảnh về bản gốc — hoàn tác mọi lần xoay/cắt."""
    ws = _ws(ws_id, user)
    with workspace.locked(ws_id):
        for sid in body.get("sheet_ids") or []:
            workspace.reset_sheet(ws, _sheet_ready(ws, sid))
        ws.save()
        return workspace.to_json(ws)



@app.get("/api/ws/{ws_id}/sheets/{sheet_id}/rowmap")
def sheet_rowmap(ws_id: str, sheet_id: str, user: CurrentUser, rows: int = 0) -> dict:
    """Ước lượng dải ảnh của từng dòng — để click dòng là khoanh đúng chỗ.

    Chạy bằng thuật toán trên ảnh có sẵn nên $0 và dùng được cho cả những mặt sổ
    đã quét từ trước. Xem `api/rowmap.py` để biết giới hạn.
    """
    from PIL import Image

    ws = _ws(ws_id, user)
    sheet = _sheet(ws, sheet_id)
    if rows <= 0:
        # Trả ĐỦ khoá như đường thường: giao diện đọc `x0`/`x1` để vẽ vệt, thiếu
        # là vệt kéo hết bề ngang ảnh (kể cả mặt bàn) mà không báo lỗi gì.
        return {"bands": [], "exact": False, "skew_deg": 0.0, "x0": 0.0, "x1": 1.0}
    img = Image.open(sheet.dir(ws.id) / "current.png")
    img.load()
    found = rowmap.bands_for(img, rows)
    found.pop("peaks", None)        # chỉ dùng nội bộ cho bước ghép dòng (rowanchors)
    return found


class RowAnchorRequest(BaseModel):
    image_revision: str = Field(max_length=128)
    rows: list[dict] = Field(max_length=500)


@app.post("/api/ws/{ws_id}/sheets/{sheet_id}/rowmap")
def anchored_rowmap(ws_id: str, sheet_id: str, user: CurrentUser, body: RowAnchorRequest) -> dict:
    """Match current review rows to local OCR; no model call or scan-cache change."""
    from PIL import Image

    ws = _ws(ws_id, user)
    sheet = _sheet(ws, sheet_id)
    if body.image_revision != sheet.sha256:
        raise HTTPException(409, "Image changed; reload row positions")
    path = sheet.dir(ws.id) / "current.png"
    with Image.open(path) as image:
        geometry = rowmap.bands_for_rows(image, body.rows)
    located = rowanchors.locate(path, sheet.sha256, body.rows, geometry)
    if body.image_revision != sheet.sha256:
        raise HTTPException(409, "Image changed; reload row positions")
    return {**located, "image_revision": body.image_revision}


@app.put("/api/ws/{ws_id}/results/{sheet_id}")
def save_result(
    ws_id: str,
    sheet_id: str,
    user: CurrentUser,
    body: dict = Body(...),
) -> dict:
    """Lưu bản ĐÃ SỬA TAY của một mặt sổ (autosave từ trình duyệt).

    Trình duyệt gửi nguyên các khối đang hiện trên màn hình. Không cố gộp hay
    hoà giải với bản cũ: cái người dùng đang nhìn thấy mới là bản đúng.
    """
    ws = _ws(ws_id, user)
    _sheet(ws, sheet_id)                      # mặt sổ phải còn tồn tại

    blocks = body.get("blocks")
    if not isinstance(blocks, list):
        raise HTTPException(400, "Thiếu danh sách khối dòng")
    for b in blocks:
        if not isinstance(b, dict) or not isinstance(b.get("rows"), list):
            raise HTTPException(400, "Khối dòng không đúng định dạng")

    # Có khoá `link_ok` (kể cả null) thì ghi/xoá; không có thì giữ nguyên bản đã lưu
    extra = {"link_ok": body["link_ok"]} if "link_ok" in body else {}
    try:
        return results.save_edits(ws_id, sheet_id, blocks, **extra)
    except ValueError as e:
        raise HTTPException(400, str(e)) from e


@app.post("/api/ws/{ws_id}/sample")
def add_sample(ws_id: str, user: CurrentUser) -> dict:
    """Thêm sổ MẪU (dữ liệu giả lập) + kết quả dựng sẵn. Không gọi model."""
    ws = _ws(ws_id, user)
    with workspace.locked(ws_id):
        added = sample.add_to(ws)
        return {
            "added": added,
            **workspace.to_json(ws),
            "results": results.load_all(ws_id),
        }


@app.post("/api/ws/{ws_id}/sample-books")
def add_sample_books(ws_id: str, user: CurrentUser) -> dict:
    """Thêm ảnh chụp sổ THẬT làm mẫu (chưa quét). Quét chúng không gọi model — xem `sample.add_books`."""
    _ws(ws_id, user)
    with workspace.locked(ws_id):
        added = sample.add_books(ws_id)
        ws = _ws(ws_id, user)
        return {
            "added": added,
            **workspace.to_json(ws),
            "results": results.load_all(ws_id),
        }


# ── Cắt nhanh thông minh (thuật toán, KHÔNG gọi model nên $0) ────────

@app.get("/api/ws/{ws_id}/sheets/{sheet_id}/autofix")
def autofix_plan(ws_id: str, sheet_id: str, user: CurrentUser) -> dict:
    """Đề xuất các bước chỉnh, chưa áp dụng gì."""
    from PIL import Image

    ws = _ws(ws_id, user)
    sheet = _sheet_ready(ws, sheet_id)
    img = Image.open(sheet.dir(ws.id) / "current.png")
    img.load()
    return autofix.plan(img)


@app.post("/api/ws/{ws_id}/autofix")
def autofix_apply(ws_id: str, user: CurrentUser, body: dict = Body(...)) -> dict:
    """Áp dụng kế hoạch cắt nhanh cho MẶT SỔ đang xem."""
    ws = _ws(ws_id, user)
    with workspace.locked(ws_id):
        ids = body.get("sheet_ids") or []
        if len(ids) != 1:
            raise HTTPException(400, "Cắt nhanh áp dụng cho mặt sổ đang xem")
        sheet = _sheet_ready(ws, ids[0])

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
def split_sheet(ws_id: str, user: CurrentUser, body: dict = Body(...)) -> dict:
    """Tách 1 ảnh chứa 2 sổ thành 2 mặt sổ riêng (trái / phải)."""
    ws = _ws(ws_id, user)
    with workspace.locked(ws_id):
        ids = body.get("sheet_ids") or []
        if len(ids) != 1:
            raise HTTPException(400, "Tách áp dụng cho mặt sổ đang xem")
        try:
            workspace.split_at(ws, _sheet_ready(ws, ids[0]), float(body.get("x", 0.5)))
        except (ValueError, TypeError) as e:
            raise HTTPException(400, str(e)) from e
        ws.save()
        return workspace.to_json(ws)


# ── Quét ─────────────────────────────────────────────────────────────

@app.post("/api/ws/{ws_id}/scan")
def start_scan(ws_id: str, user: CurrentUser, body: dict = Body(...)) -> dict:
    """Quét đúng những mặt sổ người dùng chọn, theo thứ tự họ đang thấy."""
    ws = _ws(ws_id, user)
    with workspace.locked(ws_id):
        ids = body.get("sheet_ids") or []
        if not ids:
            raise HTTPException(400, "Chưa chọn mặt sổ nào để quét")

        order = {s.id: i for i, s in enumerate(ws.sheets)}
        ids = sorted({s for s in ids if s in order}, key=lambda s: order[s])

        sheets = [_sheet(ws, sid) for sid in ids]
        paths = [str(s.scan_path(ws.id)) for s in sheets]

        # Tài khoản dùng thử là tài khoản CÔNG KHAI — chặn một người quét hết hạn
        # mức gọi mô hình của cả ngày. Ảnh sổ mẫu nguyên vẹn không gọi mô hình nên không bị tính.
        con = demo.con_lai(user)
        real = sum(1 for p in paths if not is_sample_file(p))
        if con is not None and real > con:
            raise HTTPException(
                429,
                {"kind": "demo_quota", "limit": demo.han_muc(), "left": con},
            )
        if any(s.status != "ready" for s in sheets):
            raise HTTPException(409, {"kind": "not_ready"})

        job = jobs.create(ws.id, ids, paths, names=[s.name for s in sheets])
        jobs.start(job, use_cache=not bool(body.get("no_cache")))
        if con is not None and real:
            demo.ghi_nhan(user.id, real)
        for s in sheets:
            s.scanned = True
        ws.save()
        return jobs.to_json(job)


def _job(job_id: str, user: auth.User):
    """Job của workspace thuộc người đang đăng nhập, ngược lại coi như không có.

    Tiến độ quét cũng là dữ liệu sổ (tên ngân hàng, số dòng) nên phải khoá y
    như workspace.
    """
    job = jobs.get(job_id)
    if not job or not (ws := workspace.load(job.ws_id)) or ws.owner != user.id:
        raise HTTPException(404, "Không tìm thấy lần quét")
    return job


@app.get("/api/jobs/{job_id}")
def get_job(job_id: str, user: CurrentUser) -> dict:
    return jobs.to_json(_job(job_id, user))


@app.get("/api/jobs/{job_id}/events")
async def events(job_id: str, user: CurrentUser):
    """SSE: đẩy tiến độ từng mặt sổ về trình duyệt theo thời gian thực."""
    job = _job(job_id, user)

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

    Header HTTP chỉ mã hoá được latin-1, nên `filename="Sổ 通帳.csv"` làm server
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


EXPORT_STRUCTURES = ("per_sheet", "per_account", "merged")


def _account_title(bank_name: str | None, account_no: str) -> str:
    """Tên tab cho một tài khoản: «ngân hàng 口座番号». Tab Excel dài tối đa 28 ký tự (xem `export._sheet_title`)
    nên nếu quá dài thì cắt TÊN NGÂN HÀNG chứ không cắt số tài khoản — số mới là thứ phân biệt các tab."""
    room = 28 - len(account_no) - 1
    if not bank_name:
        return account_no
    return f"{bank_name[:max(room, 0)]} {account_no}" if room > 0 else account_no


def _group_by_account(accounts: list[dict], names: dict[str, str]) -> list[dict]:
    """Gom các mặt sổ cùng MỘT TÀI KHOẢN thành một sheet (task 2.4), theo thứ tự xuất hiện đầu tiên ở cột trái.

    - Có số tài khoản: cùng `(bank_name, account_no)` thì chung một sheet, kể cả khi các mặt không đứng liền nhau
      (mặt ①, ③ của sổ A xen mặt ② của sổ B ⇒ A một sheet gồm ①③, B một sheet).
    - Không có số tài khoản (ảnh lẻ không bìa): không biết mặt nào cùng sổ nên MỖI MẶT một sheet, giống `per_sheet`.
    - Chỗ nối giữa hai mặt trong cùng sheet luôn được đánh `block_start` (kể cả khi client không gửi dấu này) — chuỗi
      số dư tính theo từng khối, không được nối ngầm xuyên mặt rồi báo lỗi giả ở dòng đầu mặt sau.
    """
    order: list[tuple] = []
    groups: dict[tuple, dict] = {}
    last_sheet: dict[tuple, str] = {}
    for ai, acc in enumerate(accounts):
        bank = (acc.get("bank_name") or "").strip() or None
        number = (acc.get("account_no") or "").strip() or None
        for tx in acc["transactions"]:
            sid = tx.get("sheet_id") or "?"
            key = ("account", bank, number) if number else ("sheet", sid, None)
            if key not in groups:
                order.append(key)
                groups[key] = {
                    "bank_name": acc.get("bank_name"),
                    "store_no": acc.get("store_no"),
                    "account_no": acc.get("account_no"),
                    "holder": acc.get("holder"),
                    "sheet_title": _account_title(bank, number) if number else (names.get(sid) or sid),
                    "transactions": [],
                }
            g = groups[key]
            for field in ("store_no", "holder"):          # mặt đầu thiếu tên chủ mà mặt sau có thì lấy của mặt sau
                if not g.get(field) and acc.get(field):
                    g[field] = acc[field]
            if key in last_sheet and last_sheet[key] != (ai, sid):
                tx = {**tx, "block_start": True}
            last_sheet[key] = (ai, sid)
            g["transactions"].append(tx)
    return [groups[k] for k in order]


@app.post("/api/ws/{ws_id}/export")
def export(ws_id: str, user: CurrentUser, body: dict = Body(...)):
    """Xuất theo tuỳ chọn người dùng.

    Ở mức WORKSPACE chứ không phải một lần quét: kết quả được tích luỹ theo từng
    mặt sổ, nên xuất phải lấy toàn bộ những gì đã quét, kể cả quét ở nhiều lượt.
    `accounts` do frontend gửi lên để xuất ĐÚNG cái người dùng đang thấy — kể cả
    các ô họ vừa sửa tay trong bảng review.
    """
    ws = _ws(ws_id, user)

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
    if structure is not None and structure not in EXPORT_STRUCTURES:
        raise HTTPException(400, "structure chỉ nhận per_sheet, per_account hoặc merged")
    if structure == "per_sheet":
        names = {s.id: s.name for s in ws.sheets}
        accounts = _split_by_sheet(accounts, names)
    elif structure == "per_account":
        accounts = _group_by_account(accounts, {s.id: s.name for s in ws.sheets})
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


# ── Phục vụ luôn trang web (khi đã build sẵn) ────────────────────────
#
# Đăng ký CUỐI CÙNG để mọi route /api/... ở trên được ưu tiên khớp trước.
#
# Có thư mục `web/out` (do `npm run build` sinh ra) thì chính FastAPI phục vụ
# trang web. Nhờ vậy khi triển khai chỉ có MỘT dịch vụ và MỘT tên miền:
#   • không cần cấu hình CORS (web và API cùng gốc),
#   • cookie phiên là first-party nên SameSite=Lax chạy được, khỏi cần
#     SameSite=None + HTTPS chéo tên miền,
#   • người dùng chỉ nhận đúng một đường link.
# Lúc phát triển thì thư mục này không có, Next chạy riêng ở cổng 3000.

WEB_DIR = Path(__file__).resolve().parents[1] / "web" / "out"

if WEB_DIR.is_dir():
    app.mount(
        "/_next",
        StaticFiles(directory=WEB_DIR / "_next"),
        name="next-assets",
    )

    @app.get("/{path:path}", include_in_schema=False)
    def web_page(path: str):
        """Trả file tĩnh, không có thì trả trang chủ (kiểu ứng dụng một trang).

        KHÔNG cần đăng nhập — phải với tới được trang /login thì mới đăng nhập
        được. Dữ liệu sổ vẫn nằm sau /api/... và vẫn đòi đăng nhập như cũ.
        """
        # /api/... gõ sai thì trả 404 cho ra 404, đừng trả trang web làm lập
        # trình viên tưởng đường dẫn đúng.
        if path.startswith("api/"):
            raise HTTPException(404, "Không có API này")

        # Chặn đi ngược thư mục: '../../etc/passwd' phải không ra khỏi web/out
        target = (WEB_DIR / path).resolve()
        if WEB_DIR in target.parents or target == WEB_DIR:
            if target.is_file():
                return FileResponse(target)
            if (target / "index.html").is_file():
                return FileResponse(target / "index.html")
        return FileResponse(WEB_DIR / "index.html")
