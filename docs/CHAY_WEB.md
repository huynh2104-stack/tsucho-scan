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

## Biến môi trường (tuỳ chọn)

Không đặt gì cả vẫn chạy được. Đặt trước lệnh `uvicorn`.

| Biến | Tác dụng |
|---|---|
| `TSUCHO_DATA_DIR=<thư mục>` | Đổi nơi lưu ảnh, kết quả và CSDL tài khoản (mặc định `.data/` ở gốc repo). Dùng cho test tự động và khi thử máy chủ mới, để **không bao giờ ghi nhầm vào `.data` đang chứa sổ thật**. `pytest` và `tests/e2e/smoke.py` tự đặt biến này sang thư mục tạm. |
| `TSUCHO_LOCAL_OCR=0` | Tắt OCR cục bộ (RapidOCR + Tesseract) dùng để khoanh đúng dòng trên ảnh. Dành cho máy chủ ít RAM: bản giống Render tốn đỉnh ~460 MB khi OCR chạy, tắt thì ~140 MB. Khung đỏ vẫn hiện nhưng chỉ là vị trí ước lượng. Số đo và cách đo lại: `docs/KE_HOACH_NANG_CAP_WEB.md` mục 9. |

---

## Cách dùng

Giao diện là **bàn làm việc ba khung hiện cùng lúc**, không đi theo bước:

```
[ mặt sổ ]  │  [ xem & chỉnh ảnh ]  │  [ kết quả review ]
```

1. **Kéo thả ảnh hoặc PDF** vào bất kỳ đâu trên trang. PDF nhiều trang được
   **tách ngay thành từng mặt sổ riêng**, mỗi mặt sửa độc lập.
   Thẻ tải lên hiện ngay kèm thanh %, rồi máy xử lý nền (tách trang, **tự xoay cho chữ đứng và cắt gọn
   phần trắng thừa**, hoàn tác được một lần). Tắt ở ô ✨ dưới khu thả file; nút ✨ cạnh nút xoá áp cho các mặt đã tích.
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

## Kiểm tra tự động (chạy sau MỖI thay đổi, trước khi bàn giao)

Bốn lệnh, cả bốn phải xanh. Không lệnh nào gọi Gemini và không lệnh nào đụng `.data`.

```bash
python -m pytest -q          # 1. test Python (chạy ở thư mục gốc repo)
cd web && npm test           # 2. test logic TypeScript (Node chạy thẳng file .ts, không thêm thư viện)
cd web && npm run build      # 3. kiểm tra kiểu + sinh web/out
python tests/e2e/smoke.py    # 4. bấm thử app bằng trình duyệt thật, dùng sổ mẫu ($0)
```

- **Lệnh 4 cần lệnh 3 trước**: nó thử đúng bản `web/out`. Nếu `web/out` cũ hơn mã nguồn thì nó **từ chối chạy** (thử bản cũ sẽ báo xanh giả); thêm `--build` để nó tự build trước.
- Cài một lần cho lệnh 4 (không thuộc `requirements.txt`): `pip install playwright openpyxl httpx` rồi `python -m playwright install chromium`. Thêm `--headed` để xem trình duyệt bấm.
- Kịch bản lệnh 4 (in `PASS`/`FAIL` từng bước): đăng ký → bỏ qua hướng dẫn → thử với sổ mẫu → sửa một ô 残高 sai (bộ đếm "Còn N dòng", huy hiệu cột trái và số dòng vàng cùng tăng; phím `n` nhảy vào ô 残高) → gõ lại số đúng (hết vàng) → sai lần nữa → Ctrl+Z (về như cũ) → xuất Excel và mở bằng openpyxl → F5 vẫn còn kết quả → tải PDF 4 trang cố ý sai chiều và thấy máy tự xoay đúng (bước 7; báo SKIP nếu máy chủ thiếu RapidOCR) → gõ ngày `2025/4/12`, ngày vô nghĩa, số toàn góc `１２３４`, `▲500` rồi xuất Excel (bước 8) → trình duyệt tiếng Nhật/tiếng Pháp mở lần đầu ra đúng ngôn ngữ (bước 9) → mỗi dòng có `rid`, ô đã sửa nhớ giá trị máy đọc (`orig`) và F5 không làm mất chúng (bước 10) → mặt ② của sổ mẫu có đúng một dòng vàng thật (`行抜けの疑い`): bộ đếm, huy hiệu, phím `n` và nút ✓ khớp nhau; ✓ → Ctrl+Z → ✓ → F5 vẫn còn ✓ → bỏ ✓ (bước 11) → ↺ trả ô về giá trị máy đọc, `Ctrl+Enter` (✓ rồi nhảy, ghi cả chữ gõ dở), 「Xác nhận cả mặt sổ」có hỏi khi còn dòng NG, chèn dòng ngay dưới dòng đang chọn bằng nút và bằng `Ctrl+Shift+Enter`, F5 vẫn còn nguyên (bước 12) → ✓ cả hai mặt sổ rồi xuất Excel: mỗi tab không còn ô vàng, 検証レベル bắt đầu bằng `検証済`, 確認メモ ghi `確認済`, chú thích hoàn toàn tiếng Nhật (bước 14, đứng sau bước 13: lý do hiện tiếng Việt + gợi ý sửa một chạm 出金 → số đúng / 残高 → số đúng / đổi cột / thêm dòng sót) → chỗ nối số dư giữa hai mặt sổ liền nhau: nối liền, đổi thứ tự thì đứt, 「Không phải lỗi」sống qua F5 (bước 15) → thêm sổ mẫu lần nữa cho ra hai cặp mặt sổ trùng: huy hiệu «Có thể trùng», hộp so sánh hai ảnh, cảnh báo ở hộp Xuất file, 「Không phải trùng」sống qua F5, 「Xoá mặt bên phải」(bước 16) → danh sách hồ sơ: tên hồ sơ trên thanh trên, số «còn N dòng» khớp cột trái, tạo hồ sơ mới rồi mở lại hồ sơ cũ mà không lẫn mặt sổ, đổi tên, lưu trữ, xoá (Enter không xoá), hướng dẫn 8 bước (bước 17) → sửa thông tin sổ ở đầu thẻ (銀行名…) và áp cho mặt sau: một Ctrl+Z hoàn tác cả lượt, Excel ô B1/B3 đúng, bỏ tick thì mặt sau giữ nguyên (bước 18). Khi hỏng nó lưu ảnh chụp màn hình ở thư mục tạm của hệ điều hành và in đường dẫn.
- Đã thử cố ý làm hỏng: gỡ listener phím tắt trong `page.tsx` thì lệnh 4 báo FAIL ở bước 4.
- `tests/e2e/do_ram_rowmap.py`: không phải test, là script **đo RAM OCR cục bộ** khi chọn máy chủ (xem `docs/KE_HOACH_NANG_CAP_WEB.md` mục 9).

### Viết thêm test TypeScript

- Đặt cạnh mã: `web/src/lib/<tên>.test.ts` (script `npm test` tự nhặt mọi `src/lib/*.test.ts`).
- Logic đem test phải nằm trong file `.ts` **thuần**: không JSX, không import alias `@/`, chỉ `import type` khi cần kiểu.
- Import giữa các file `.ts` **ghi rõ đuôi `.ts`** (`from "./review.ts"`), vì Node không tự thêm đuôi. Bundler của Next vẫn build bình thường (đã thử).
- Từ điển VI/EN/JA nằm ở `web/src/lib/dict.ts`. `dict.test.ts` bắt việc thiếu khoá hay lệch kiểu giữa ba thứ tiếng — lỗi mà trình biên dịch không thấy vì `i18n.tsx` ép kiểu `DICT[lang] as Dict`, và chỉ lộ ra khi màn hình hiện chữ `undefined`.

---

## Cấu trúc mã nguồn

```
core.py            scan() — lõi dùng chung, CLI và web gọi cùng hàm này
review.py          định nghĩa「dòng này có cần soát không」— CÙNG luật với web/src/lib/review.ts; export.py (Excel),
                   api/export_csv.py và api/jobs.py đều đọc nó, KHÔNG đọc `status` đóng băng của máy;
                   hai bản cùng đọc tests/fixtures/review_cases.json, sửa luật thì sửa CẢ HAI + thêm ca vào file JSON
api/
  main.py          các endpoint FastAPI
  workspace.py     mặt sổ: tách PDF, xoay/cắt thật, chống trùng SHA-256
  jobs.py          job chạy nền + hàng đợi sự kiện cho SSE
  export_csv.py    xuất CSV (BOM UTF-8 để Excel Nhật không lỗi font)
web/src/
  app/page.tsx           bàn làm việc 3 khung
  app/layout.tsx         khung trang, script chống nháy chủ đề
  lib/i18n.tsx           bối cảnh ngôn ngữ (React)
  lib/dict.ts            từ điển VI/EN/JA — dữ liệu thuần, có test (dict.test.ts)
  lib/review.ts          luật thuần về dòng: ngày/số gõ tay, rid/orig, và ĐỊNH NGHĨA「cần soát」(bản Python: review.py)
  lib/theme.tsx          sáng/tối/theo hệ thống
  lib/api.ts             gọi API + SSE
  components/SheetRail   cột trái: mặt sổ, chọn nhiều
  components/SheetViewer khung giữa: xem + xoay/cắt
  components/ReviewPane  khung phải: bảng dạng sổ, bật tắt cột
  components/Tour        hướng dẫn 7 bước, tô sáng đúng nút trên giao diện thật
  lib/tour.tsx           nhớ "đã xem hướng dẫn chưa" theo từng người dùng
tests/
  conftest.py            ép mọi test pytest chạy trên thư mục dữ liệu tạm
  test_*.py              pytest (không gọi API thật)
  e2e/smoke.py           bấm thử bằng trình duyệt thật (lệnh 4 ở trên)
```

**Hướng dẫn sử dụng**: tự mở lần đầu mỗi người dùng đăng nhập; sau đó bấm nút
`?` ở thanh trên để xem lại từ đầu. Mốc tô sáng là thuộc tính `data-tour="..."`
đặt thẳng trên phần tử — thêm bước mới thì gắn thêm một mốc rồi khai báo trong
mảng `steps` của `Tour.tsx`. Sửa nội dung hướng dẫn thì **tăng `VERSION` trong
`lib/tour.tsx`** để người đã xem bản cũ được xem lại bản mới.

**Quy tắc:** không viết logic đọc sổ trong `api/` hay `web/`. Mọi thứ đi qua
`core.scan()`.
