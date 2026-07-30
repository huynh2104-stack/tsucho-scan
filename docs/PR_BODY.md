# Giai đoạn 1+2: tách `core.scan()` và dựng web app ba khung

Chuyển tsucho-scan từ CLI sang web app dùng được, theo `docs/WEB_PLAN.md`.
11 commit, ~8.500 dòng.

## Có gì trong này

**Lõi dùng chung** — `core.py`
`scan(files, rotate, use_cache, banks, on_progress) -> ScanResult`. CLI và web
gọi cùng một hàm, không viết lại logic lần hai. `extract.py` bỏ hết `print()`,
tiến độ đi qua `on_progress(event)` để web nối vào thanh tiến độ.
`main.py` rút còn ~110 dòng chỉ lo argv.

**API** — `api/`
FastAPI. `workspace.py` quản lý *mặt sổ* (PDF nhiều trang tách ngay thành từng
mặt độc lập, xoay/cắt/chỉnh sáng thật trên ảnh, chống trùng SHA-256, hoàn tác
một bước). `jobs.py` chạy quét trong thread nền + SSE. `results.py` lưu kết quả
theo **từng mặt sổ** ra đĩa. `export_csv.py` xuất CSV có BOM UTF-8.

**Web** — `web/` (Next.js 16 + React 19 + Tailwind v4)
Bàn làm việc ba khung hiện cùng lúc: `[mặt sổ] [chỉnh ảnh] [kết quả]`.
Kết quả trình bày như mặt sổ thật, sửa trực tiếp từng ô, sửa 残高 thì cột 検算
tính lại ngay. Đa ngôn ngữ VI/EN/JA, sáng/tối/theo hệ thống.

## Hai quyết định đáng lưu ý

**Tên cột sổ KHÔNG dịch.** Người dùng đối chiếu với ảnh in chữ 摘要 — dịch thành
"Nội dung" là bắt họ tra ngược. Tên cột giữ tiếng Nhật, chỉ thêm chú thích
bên cạnh khi ở VI/EN.

**Ảnh chưa chỉnh gì thì gửi đúng bytes gốc cho model.** Cache của `extract.py`
băm theo nội dung; gửi bản PNG render lại là cache trượt và mỗi lần quét đều
mất tiền. Chỉ khi người dùng đã xoay/cắt mới buộc gửi bản đã sửa.

## Đo được

- **103 test pass** (93 cũ + 10 mới cho `core.scan`, dùng monkeypatch nên không
  gọi API), TypeScript sạch.
- `eval.py` trên bộ p5-6 giữ **đúng mốc trước khi refactor**: mất 0 dòng, ngày
  95, 出金 95, 入金 94, 残高 95, 摘要 91(+4) → tách lõi không làm thụt lùi.
- Toàn bộ quá trình phát triển tốn **~$0,01** tiền API nhờ cache và sổ mẫu.

## Người review nên biết

- **Chạy thử**: xem `docs/CHAY_WEB.md`. Cần 2 cửa sổ lệnh (uvicorn cổng 8000 +
  `npm run dev` cổng 3000). Mở trang khi danh sách trống rồi bấm
  **"Thử với sổ mẫu"** để chạy hết luồng mà không tốn lượt gọi API nào.
- **`web/AGENTS.md`** yêu cầu đọc tài liệu Next trong `node_modules` trước khi
  sửa code Next — bản này có breaking change so với kiến thức sẵn có.
- **Dữ liệu tài chính thật không nằm trong repo**: `.gitignore` chặn `input/`,
  `output/`, `.cache/`, `.data/`, `.env`.
  ⚠️ Nhưng **fixture test vẫn còn số tài khoản thật của khách** (`615001`,
  `0323401` trong `tests/test_core.py`, `tests/test_validate.py`) và vài comment
  nhắc tên công ty khách. Sổ mẫu đã được đổi sang số bịa ở commit cuối. Nếu repo
  có khả năng thành public thì nên thay nốt các fixture này trước.
- **Chưa làm**: đăng nhập/phân quyền, hàng đợi Celery, bounding box do model trả
  (đối chiếu ảnh↔dòng hiện dùng thuật toán ước lượng vì đổi prompt sẽ mất toàn
  bộ cache). Xem `docs/WEB_PLAN.md` §6.
- `api/autofix.py` + endpoint còn trong repo nhưng **đã gỡ khỏi giao diện** theo
  yêu cầu người dùng.
