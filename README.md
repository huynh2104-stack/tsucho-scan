# Nhánh `chuyen-huong` — trang báo chuyển địa chỉ

Từ **25/11/2026** tsucho-scan chuyển sang tên miền riêng. Hai địa chỉ cũ chỉ còn hiện trang «移転のお知らせ»
(tiếng Nhật / English / Tiếng Việt, theo ngôn ngữ trình duyệt). Trang đếm ngược 10 giây rồi tự sang **đúng trang
tương ứng** ở địa chỉ mới, giữ nguyên đường dẫn, `?…` và `#…`. Người xem bấm được «Dừng tự chuyển».

| Địa chỉ cũ | Chuyển tới | Nơi chạy | Thư mục |
|---|---|---|---|
| https://tsucho-scan.onrender.com | https://app.tsucho-scan.com (ứng dụng) | Render, Docker (`Dockerfile` ở gốc) | `render/` |
| https://tsucho-scan.vercel.app | https://tsucho-scan.com (trang giới thiệu) | Vercel, trang tĩnh (Root Directory = `vercel`) | `vercel/` |

Nhánh này **không chứa mã ứng dụng**: mã thật nằm ở `web-app-giai-doan-2` (máy chủ laptop) và `trang-gioi-thieu`
(Cloudflare Pages).

## Sửa nội dung

1. Sửa trong `src/`: `page.html` (khung trang), `redirect.js` (chữ 3 thứ tiếng + đếm ngược), `redirect.css` (giao diện).
2. Chạy `python build.py` để dựng lại `render/site/` và `vercel/public/`.
3. Commit cả `src/` lẫn kết quả, rồi đẩy nhánh `chuyen-huong`. Render và Vercel tự đưa bản mới lên.

## Máy chủ trên Render (`render/server.py`)

Chỉ dùng thư viện chuẩn Python, không ghi IP người xem vào log.

- Mọi trang → trang báo chuyển.
- `/api/health` → 200 (kiểm tra sức khoẻ của Render).
- `/api/*` khác và mọi POST/PUT/… → `410 {"detail":{"kind":"moved","url":"https://app.tsucho-scan.com"}}`: tab app cũ
  còn mở sẽ báo lỗi thay vì treo; tải lại trang là thấy thông báo chuyển.

Thử trên máy: `python render/server.py 3110` rồi mở http://localhost:3110/cases/?ws=abc.
