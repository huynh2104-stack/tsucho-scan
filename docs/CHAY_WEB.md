# Chạy web app (giai đoạn 2)

Cần **2 cửa sổ lệnh chạy song song**: backend và frontend. Đóng cửa sổ nào là
phần đó tắt.

---

## Lần đầu — cài đặt

Cửa sổ 1 (Python, đứng ở `D:\Project\tsucho-scan`):

```bash
python -m pip install -r requirements.txt
```

Cửa sổ 2 (Node, đứng ở `D:\Project\tsucho-scan\web`):

```bash
npm install
```

---

## Mỗi lần chạy

**Cửa sổ 1 — backend** (thư mục `D:\Project\tsucho-scan`):

```bash
python -m uvicorn api.main:app --reload --port 8000
```

Mở http://localhost:8000/docs để thử từng API riêng lẻ (trang này FastAPI tự sinh).

**Cửa sổ 2 — frontend** (thư mục `D:\Project\tsucho-scan\web`):

```bash
npm run dev
```

Rồi mở **http://localhost:3000**.

Dừng: bấm `Ctrl + C` ở từng cửa sổ.

---

## Kiểm tra nhanh khi có trục trặc

| Hiện tượng | Nguyên nhân thường gặp |
|---|---|
| Trang trắng, console báo `Failed to fetch` | Backend chưa chạy. Kiểm tra http://localhost:8000/api/health phải trả `{"ok":true}` |
| `CORS policy` trong console | Frontend đang chạy ở cổng khác 3000 → sửa `allow_origins` trong `api/main.py` |
| `Chưa có GEMINI_API_KEY` | Thiếu `.env` ở thư mục gốc (không phải trong `web/`) |
| Quét mãi không xong | Bậc miễn phí Gemini = 20 request/ngày. Xem log ở cửa sổ 1 |
| Đăng nhập báo「sai quá nhiều lần」 | Gõ sai 5 lần trong 15 phút là bị khoá tạm. Đợi 15 phút, hoặc lúc đang phát triển thì xoá bảng: `DELETE FROM login_fails;` trong `.data/app.db` |
| Đổi cổng backend | Sửa `web/.env.local` → `NEXT_PUBLIC_API_URL`, rồi khởi động lại `npm run dev` |

---

## Nơi dữ liệu được lưu

```
.data/jobs/<mã job>/input/     ảnh gốc người dùng tải lên
.data/jobs/<mã job>/ket_qua.xlsx
```

`.data/` đã bị `.gitignore` chặn — **dữ liệu tài chính thật không bao giờ lên git**.
Xoá một job: `DELETE /api/jobs/<id>` (hoặc xoá thẳng thư mục).

---

## Cách dùng

Giao diện là **bàn làm việc ba khung hiện cùng lúc**, không đi theo bước:

```
[ mặt sổ ]  │  [ xem & chỉnh ảnh ]  │  [ kết quả review ]
```

1. **Kéo thả ảnh hoặc PDF** vào bất kỳ đâu trên trang. PDF nhiều trang được
   **tách ngay thành từng mặt sổ riêng**, mỗi mặt sửa độc lập.
2. **Chọn mặt sổ** ở cột trái — click = chọn một, `Ctrl`+click = thêm/bớt,
   `Shift`+click = chọn cả dải (giống Windows Explorer).
3. **Chỉnh ảnh** ở khung giữa: xoay trái/phải/lộn ngược **áp cho mọi mặt đang
   chọn**; cắt chỉ nhận đúng một mặt. Ảnh đổi ngay trước mắt, và chính ảnh đã
   chỉnh mới được gửi cho model.
4. **Quét** những mặt đã chọn. Kết quả hiện ở khung phải theo **từng mặt sổ**
   (có thể chuyển sang xem gộp danh sách).
5. **Click một mặt sổ** ở cột trái → khung phải cuộn tới đúng kết quả của mặt đó.
6. Đặt **tên sổ** ở thanh trên rồi tải **Excel** hoặc **CSV**.

Cột phụ (`区分`, `取扱店`, `備考`) bật/tắt được — mỗi dạng sổ một bố cục khác nhau.

### Mẹo tiết kiệm tiền

Ảnh **chưa chỉnh gì** được gửi đúng bytes gốc nên **dùng lại được cache** (quét
lại = $0). Xoay hoặc cắt là ảnh đổi thật → phải gọi API lại. Vì vậy chỉ chỉnh
khi thật sự cần.

---

## Cấu trúc mã nguồn

```
core.py            scan() — lõi dùng chung, CLI và web gọi cùng hàm này
api/
  main.py          các endpoint FastAPI
  workspace.py     mặt sổ: tách PDF, xoay/cắt thật, chống trùng SHA-256
  jobs.py          job chạy nền + hàng đợi sự kiện cho SSE
  export_csv.py    xuất CSV (BOM UTF-8 để Excel Nhật không lỗi font)
web/src/
  app/page.tsx           bàn làm việc 3 khung
  app/layout.tsx         khung trang, script chống nháy chủ đề
  lib/i18n.tsx           từ điển VI/EN/JA
  lib/theme.tsx          sáng/tối/theo hệ thống
  lib/api.ts             gọi API + SSE
  components/SheetRail   cột trái: mặt sổ, chọn nhiều
  components/SheetViewer khung giữa: xem + xoay/cắt
  components/ReviewPane  khung phải: bảng dạng sổ, bật tắt cột
  components/Tour        hướng dẫn 7 bước, tô sáng đúng nút trên giao diện thật
  lib/tour.tsx           nhớ "đã xem hướng dẫn chưa" theo từng người dùng
```

**Hướng dẫn sử dụng**: tự mở lần đầu mỗi người dùng đăng nhập; sau đó bấm nút
`?` ở thanh trên để xem lại từ đầu. Mốc tô sáng là thuộc tính `data-tour="..."`
đặt thẳng trên phần tử — thêm bước mới thì gắn thêm một mốc rồi khai báo trong
mảng `steps` của `Tour.tsx`. Sửa nội dung hướng dẫn thì **tăng `VERSION` trong
`lib/tour.tsx`** để người đã xem bản cũ được xem lại bản mới.

**Quy tắc:** không viết logic đọc sổ trong `api/` hay `web/`. Mọi thứ đi qua
`core.scan()`.
