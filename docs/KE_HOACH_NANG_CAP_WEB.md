# Kế hoạch nâng cấp web-app tsucho-scan — đợt 10/2026

> Lập ngày 2026-09-30 (Opus 5.5), để các phiên sau (Sonnet 5.5) code · rà soát · test.
> Đọc cùng: `docs/WEB_PLAN.md` (đặc tả sản phẩm gốc), `docs/CHAY_WEB.md` (cách chạy),
> `web/AGENTS.md` (Next 16 khác kiến thức cũ — đọc docs trong `node_modules/next/dist/docs/`).

**Tóm tắt một đoạn.** Lõi của app (engine kiểm tra chuỗi số dư, xưởng chỉnh ảnh, bảng
soát sửa trực tiếp) đã mạnh hơn nhiều công cụ OCR thông thường. Nhưng **vòng khép kín
"máy đọc → người soát → file giao khách" đang hở**: soát xong trên web mà Excel vẫn ghi
要確認. Ngoài ra còn thiếu ba thứ mà mọi đối thủ đều có: **học từ chỉnh sửa**,
**sắp xếp theo hồ sơ khách**, và **nhập ảnh thông minh** (tự căn, tự xoay, chụp bằng
điện thoại). Kế hoạch này sửa vòng khép kín trước, rồi mới phát triển tính năng mới, theo
nguyên tắc anh đặt ra: **tính năng nào không phải ai cũng dùng thì để tuỳ chọn, không bật
mặc định**.

> **Bối cảnh đã chốt với anh (30/09/2026):**
> - Anh **không phải dân kỹ thuật**. Mọi thứ ở mức **thử nghiệm trên máy anh (localhost)**,
>   xong mới đưa khách Nhật dùng. **Chưa deploy, chưa push**; máy chủ tốt hơn tính sau.
> - **Gemini vẫn là bậc miễn phí** (20 lượt/ngày với `gemini-2.5-flash`), chưa bật trả phí.
> - Chưa biết khách dùng phần mềm kế toán nào ⇒ giai đoạn 6 **đóng** cho tới khi hỏi được.
> - `api/exporter.py`: anh không chắc ⇒ **giữ nguyên, không xoá**.
> - Anh **ưu tiên chỉnh ảnh thông minh** (trải nghiệm người dùng) ⇒ giai đoạn 5 được viết
>   lại chi tiết và **đưa lên làm ngay sau mốc demo A** (xem mục 4).

---

## 0. Cách dùng tài liệu này

Mỗi tin nhắn giao cho Sonnet một task (hoặc vài task nhỏ liền nhau). Có thể dán nguyên
câu sau:

```
Làm task 1.2 trong docs/KE_HOACH_NANG_CAP_WEB.md.
Đọc mục 3 "Luật chung" trước khi code. Xong thì chạy đủ kiểm tra của task,
báo cáo số liệu thật (kể cả phần hỏng), đánh dấu [x] ở mục 9, chưa push.
```

Mỗi task có sáu phần:
- **Loại**: `Mặc định` / `Nút` / `Tuỳ chọn` (định nghĩa ở mục 2).
- **Cỡ**: S = một tin nhắn · M = 1–2 tin · L = từ 3 tin trở lên, đã chia bước.
- **Làm gì**
- **Xong khi**: tiêu chí nghiệm thu đo được.
- **Kiểm tra**: lệnh chạy tự động, cộng với các bước **anh tự thử**.
- **Bẫy**: lỗi dễ mắc, nhiều cái lấy từ bài học cũ trong memory.

Khi code khác kế hoạch (vì phát hiện điều mới), ghi lý do vào cuối task, **đừng âm thầm
làm khác**.

---

## 1. Đánh giá hiện trạng — nhìn bằng mắt người dùng công cụ tốt nhất hiện nay

### 1.1 Chuẩn để so sánh

| Công cụ | Họ làm gì giỏi | Nguồn |
|---|---|---|
| **STREAMED** (記帳代行) | Số hoá 通帳 bằng AI + người vận hành, ~99.9%, **giao trong 1 ngày làm việc**. **Học theo 支払先**: sửa 勘定科目 một lần là lần sau tự áp; quy tắc có **thứ tự ưu tiên**, **áp hàng loạt**. Có kiểm tra trùng. Với 通帳 thì **không tự đoán 科目 theo nội dung** mà mặc định 仮払金/仮受金 rồi dựa vào quy tắc đã học. | streamedup.com/help/898, /8004, /7023 |
| **弥生 スマート取引取込** | Nhập ảnh/dữ liệu rồi tự tạo 仕訳, **học từ chỉnh sửa** (sửa 勘定科目/摘要 là lần sau tự theo). Các văn phòng thuế nói "**thiết lập quy tắc là quan trọng nhất**". | yayoi-kk.co.jp/smart/torihikitorikomi |
| **KEEPER Club** | 通帳 AI-OCR → 仕訳, **10円/trang**. | itreview / aspic |
| **Adobe Scan, trình quét tài liệu có sẵn của iOS/Android** | **Tự tìm mép giấy, tự nắn, tự xoay**; người dùng chỉ bấm xác nhận. Chụp ngay trên điện thoại. | (thực tế sử dụng) |
| Công cụ soát dữ liệu tài liệu có AI (loại Rossum) | **Hàng đợi soát**: một trường một lúc, **ảnh cắt đúng vùng đặt ngay cạnh ô**, một phím để xác nhận rồi sang ô kế. Máy **học từ chỉnh sửa**. | (thực tế sử dụng) |

### 1.2 Bảng đánh giá

| Khu vực | Đang làm tốt (có bằng chứng) | So với chuẩn | Quyết định |
|---|---|---|---|
| **Engine kiểm tra** | Chuỗi 残高 + 6 nhánh tự sửa + dò lệch hàng + dò nhảy số dòng. Đo được 残高 93–100%. Trong các dịch vụ đã tra, **không thấy dịch vụ nào công bố tự kiểm chứng bằng chuỗi số dư**; STREAMED đạt độ đúng bằng người vận hành, mất 1 ngày. | Mạnh nhất app, là điểm bán hàng | **Giữ.** Mở rộng sang kiểm tra **giữa các mặt sổ** và bắt **ảnh chụp trùng trang** (task 1.6, 1.7) |
| **Chi phí** | Chi phí gốc ~$0.004/trang (≈0.6円); cache theo trang nên quét lại $0. Để so: KEEPER Club **bán** 10円/trang ⇒ còn biên rộng nếu sau này tính giá theo trang | Tốt | Giữ. Thêm **báo trước chi phí/lượt**, biết trang nào đang miễn phí (4.3) |
| **Vòng soát → Excel** | Sửa ô trực tiếp, phím mũi tên, n/p, Ctrl+Z/Y, tự lưu, chép TSV sang Excel | **Hở ở lõi**: có 3 định nghĩa "cần soát" khác nhau (xem 1.3). Soát xong Excel vẫn vàng và vẫn ghi 要確認. Không có nút "đã soát". Gõ ngày kiểu khác làm xuất Excel lỗi 500. Gõ số toàn góc (IME) thì số bị xoá | **Sửa trước tiên** (0.3, 1.1–1.5) |
| **Tốc độ soát** | n/p đặt con trỏ đúng ô | Thua công cụ soát hiện đại: không có chế độ một-dòng-một-lúc, không có ảnh dòng phóng to cạnh ô, không có gợi ý sửa một chạm | Thêm **chế độ soát nhanh** (3.2) và **gợi ý sửa** (1.5) |
| **Học từ người dùng** | Không có | **Thiếu hoàn toàn**. Cả 弥生 lẫn STREAMED coi đây là cốt lõi. Khách kế toán quét sổ **của cùng một công ty hằng tháng**, tên đối tác lặp lại | **Từ điển sửa lỗi** (3.3). Chế độ kế toán thì có cổng quyết định (mục 6) |
| **Nhập ảnh** | Kéo thả, tự tách PDF, bắt trùng byte, bộ chỉnh ảnh thủ công rất đủ (nắn 4 góc + uốn mép cong) | Mọi thứ đều **tay**. Adobe Scan và trình quét của điện thoại tự làm, người chỉ xác nhận. Không báo trước ảnh mờ/loá (quét xong mới biết, đã mất lượt). Không có đường chụp bằng điện thoại. Trang lộn 180° (PDF khách A) vẫn phải tự nhận ra | **Giai đoạn 5**: kiểm tra chất lượng ảnh (5.1), tự tìm mép giấy (5.2), tự nhận hướng trang (5.3), **✨ Tự căn chỉnh một chạm có xem trước** (5.4), kính lúp (5.5), chụp bằng điện thoại (5.7). Máy đề xuất, người xem trước/sau rồi mới áp dụng |
| **Tốc độ quét** | SSE tiến độ từng trang, báo lỗi có mã | Quét **tuần tự**: 24 trang ≈ 4 phút | **Quét song song** (4.1): ước tính còn ~1.5 phút với 3 luồng khi đã bật trả phí (phải đo) |
| **Độ chính xác kana** | Engine ghép dấu đục, giữ kana chữ to; 摘要 60–95% | Là điểm yếu lớn nhất còn lại | **Đọc lại một dòng** bằng ảnh cắt sát (4.4): tốn ít, chỉ chạy khi bấm |
| **Tổ chức dữ liệu** | Kết quả sống qua F5, lưu theo mặt sổ | Chỉ có **một bàn làm việc ngầm** cho mỗi người: sổ của mọi khách dồn chung. Đối thủ chia theo khách/tài khoản | **Hồ sơ** (2.1–2.2), **sửa thông tin sổ** (2.3), **xuất theo tài khoản** (2.4) |
| **Người Nhật lớn tuổi** | 3 thứ tiếng; tên cột giữ tiếng Nhật; có sổ mẫu và hướng dẫn 7 bước | Mặc định **luôn tiếng Việt**. Chữ phần lớn 10.5–13.5px. Chú thích trong Excel viết tiếng Việt | Ngôn ngữ theo trình duyệt (0.3); cỡ chữ **tuỳ chọn** (3.4); Excel tiếng Nhật (1.4) |
| **Kiểm thử** | Hơn 160 test Python (pytest) | Frontend **không có test tự động nào**, mọi lỗi giao diện chỉ bắt được bằng mắt | Làm lưới an toàn **trước khi** thêm tính năng (0.2) |

### 1.3 Chi tiết lỗi lõi (đã soát trong code, không phải phỏng đoán)

1. **Ba định nghĩa "cần soát":**
   - `ReviewPane.tsx` → `Row()`: `flag = tx.status === "check" || chk === "NG"`. Nó dùng `status` chốt lúc quét.
   - `page.tsx` → `flatRows` / `perSheet` / `badCount`: tính lại theo chuỗi số dư, và **bỏ qua `status`** nếu dòng có số dư.
   - `export.py` → `_write_sheet` + `verification_summary`: chỉ dùng `status`.

   Hậu quả:
   - Sửa đúng số dư rồi mà **dòng vẫn vàng**, vì `editCell` không đổi `status`.
   - Có lúc hiện "Đã soát hết" trong khi bảng còn dòng vàng.
   - Phím `n` bỏ qua dòng bị cờ 日付不明 / 行抜けの疑い nếu dòng đó có số dư.
   - **File giao khách vẫn tô vàng và ghi 一部未検証.**
2. **Ngày gõ tay làm xuất Excel lỗi 500.** `editCell(date)` lưu nguyên chuỗi người gõ, còn `export.py` gọi `date.fromisoformat(tx["date"])`. Đã thử: `"2025/4/11"`, `"R7.4.11"`, `"07-04-11"` đều ném `ValueError`.
3. **Gõ số toàn góc bị xoá thành rỗng.** `parseYen` dùng `/[^\d-]/g`, mà `\d` không khớp `１２３４`. Người Nhật gõ bằng IME đang ở chế độ toàn góc sẽ mất số, không có báo lỗi gì.
4. **"Tự tính số dư" ghi số suy ra như thể số in trên sổ.** Không đánh dấu nguồn nên Excel không phân biệt được.
5. **"+ Thêm dòng" luôn thêm vào CUỐI khối.** Dòng bị sót thường nằm ở giữa, nên người dùng không đặt được dòng vào đúng chỗ, và chuỗi số dư sai thứ tự.
6. **Chưa bắt được ảnh chụp lại cùng một trang** (WEB_PLAN §5a coi là bắt buộc). Chỉ có `mark_duplicates` so trùng từng byte; hàm so trùng theo số dư không còn trong code.

### 1.4 Năm quyết định

1. **Khép vòng soát → Excel trước.** Mọi tính năng soát mới đều đứng trên một định nghĩa trạng thái duy nhất (giai đoạn 1).
2. **Tổ chức theo hồ sơ và tài khoản** để dùng được cho nhiều khách (giai đoạn 2).
3. **Soát nhanh + học từ chỉnh sửa**: tấn công đúng điểm yếu kana theo cách đối thủ làm, không tốn API (giai đoạn 3).
4. **Quét nhanh hơn, và đọc lại có chọn lọc** thay vì đổi prompt chung, để giữ nguyên toàn bộ cache (giai đoạn 4).
5. **Chỉnh ảnh thông minh dạng gợi ý có xem trước**, làm sớm vì anh ưu tiên (giai đoạn 5). Chế độ kế toán 仕訳 chỉ làm khi khách xác nhận cần (giai đoạn 6). Phần vận hành để sau, bản gọn (giai đoạn 7), đúng ưu tiên anh chọn.

---

## 2. Nguyên tắc chọn tính năng (theo yêu cầu của anh)

Mỗi tính năng mới phải trả lời được: **ai dùng? Có phải ai cũng cần không?**

| Loại | Nghĩa | Ví dụ |
|---|---|---|
| `Mặc định` | Ai cũng cần, hoặc là sửa lỗi hay độ đúng. Bật sẵn, không có công tắc | Định nghĩa "cần soát" thống nhất, 確認済 trong Excel, cảnh báo ảnh trùng, ngôn ngữ theo trình duyệt |
| `Nút` | Hiện ra một nút nhưng **không làm gì và không tốn gì cho tới khi bấm** | Chụp bằng điện thoại, Đọc lại dòng này, Tự tìm 4 góc |
| `Tuỳ chọn` | Làm **thay đổi giao diện hay hành vi** cho người bật nó. **Tắt sẵn**, bật trong ⚙ Cài đặt, lưu theo tài khoản | Chế độ kế toán 仕訳, tự áp từ điển, cỡ chữ lớn, hiện chi phí ước tính, tự xoay trang lộn ngược |

Những thứ chỉ **hiện khi có lý do** (gợi ý từ điển chỉ hiện khi đã học được, gợi ý sửa chỉ
hiện ở dòng lệch, cảnh báo lộn ngược chỉ hiện khi phát hiện) được coi là `Mặc định`,
vì chúng tự lọc: ai không gặp tình huống thì không bao giờ thấy.

**Không** được biến một hành vi tự động (sửa dữ liệu, gọi API tốn tiền) thành mặc định.
Máy chỉ **đề xuất**; người bấm mới áp dụng. Riêng `Tuỳ chọn` "tự áp" thì người dùng phải
tự bật.

---

## 3. Luật chung cho người code (Sonnet đọc trước mỗi task)

**Nguồn sự thật & môi trường**
- Đọc memory của dự án và file này. Với code Next.js, **đọc tài liệu trong `web/node_modules/next/dist/docs/`** trước khi viết (bản 16 khác kiến thức cũ). Hai file hay dùng:
  - `01-app/02-guides/static-exports.md`: app build tĩnh (`output: "export"`), **không có route động** nếu không dùng `generateStaticParams`.
  - `01-app/03-api-reference/04-functions/use-search-params.md`: phải bọc bằng `<Suspense>`.
- Chạy dev theo `.claude/launch.json`: `api` (cổng 8000), `web` (cổng 3000). Kiểm tra giao diện bằng công cụ preview của trình duyệt trong app.

**Tiền & dữ liệu thật**
- **Không gọi Gemini/Claude API khi chưa hỏi anh.** Test dùng sổ mẫu (`api/sample.py`, $0), kết quả có sẵn trong cache, hoặc giả lập (monkeypatch caller) như `tests/test_core.py`.
- Bậc miễn phí `gemini-2.5-flash` chỉ **20 request/ngày**. Mọi lần đo trên sổ thật phải báo trước số request và chi phí.
- **Không commit** `input/`, `output/`, `.data/`, `.cache/`, `.env`, số tài khoản hay tên khách thật. Fixture test dùng dữ liệu giả.
- Đổi prompt chính (`prompts/extract_prompt.txt`) = mất **toàn bộ** cache = mọi trang phải trả tiền quét lại. Kế hoạch này **cố ý không đổi prompt chính**; tính năng đọc lại dùng prompt riêng, cache riêng.

**Tương thích dữ liệu cũ**
- `.data/` có thể đang chứa dữ liệu thật (máy anh và Render). Mọi thay đổi định dạng JSON phải **đọc được file cũ**: trường mới đều tuỳ chọn; di trú kiểu "thiếu thì bổ sung", ghi lại nguyên tử.

**Code**
- Comment tiếng Việt, ngắn, giải thích **vì sao**, giống văn phong hiện có. Tên biến theo chuẩn của file đang sửa.
- Chữ giao diện mới phải có đủ **vi / en / ja**. Tên cột sổ **không dịch** (WEB_PLAN §8).
- Hạn chế thêm thư viện. Nếu phải thêm, ghi rõ trong báo cáo: tên, dung lượng, vì sao.
- **Bẫy React đã từng dính** (xem memory):
  - Không định nghĩa component bên trong component khác.
  - Không đặt tác dụng phụ trong hàm cập nhật state.
  - `dragId` phải để trong `useRef`.
  - `requestAnimationFrame` có thể chạy trước khi React commit, nên dùng `useEffect` theo state chờ.
  - Không lồng `<input>` trong `role=button` mà không chặn phím Space.
  - Không dùng checkbox native khi phải `preventDefault`.
- **Sau mỗi lần cắt/di chuyển khối code**: grep lại các thứ phải còn, gồm phím tắt (Ctrl+Z/Y, n/p, Ctrl+A, Escape), listener kéo-thả ở `window`, effect autosave, `beforeunload`. Bài học commit `025d8dc`: xoá nhầm `useEffect` phím tắt, chết âm thầm.

**Kiểm tra bắt buộc sau mỗi task** (sau khi có task 0.2)
1. `python -m pytest -q`: báo số test pass/fail, so với mốc ở mục 9.
2. `cd web && npm test`: test logic TS (script chạy `node --test src/lib/*.test.ts`).
3. `cd web && npm run build`: kiểm tra kiểu và sinh `web/out`.
4. `python tests/e2e/smoke.py`: kịch bản trình duyệt thật bằng sổ mẫu, $0.
5. Kiểm tra bằng mắt những gì task đổi, qua preview của trình duyệt. Chụp màn hình làm bằng chứng.
6. Báo cáo **trung thực**: con số đo được, cái gì chưa làm, cái gì hỏng. Không dùng "hoàn hảo". Thụt lùi thì nói thẳng và revert (feedback trong memory).

**Git**
- Làm trên nhánh `nang-cap-10-2026` tạo từ `web-app-giai-doan-2` đã đồng bộ (task 0.1).
- **Một commit mỗi task.** Thông điệp tiếng Việt không dấu như các commit cũ. Dòng ghi công theo yêu cầu của phiên làm việc.
- **Không push, không deploy.** Giai đoạn này chỉ thử trên máy anh. Render có thể tự deploy khi có push.

**Làm việc với anh (anh không phải dân kỹ thuật)**
- **Cuối mỗi task, tự khởi động app** bằng công cụ preview: `preview_start` tên `api` rồi `web` (cấu hình ở `.claude/launch.json`). Kiểm tra trang mở được, rồi đưa anh:
  1. đường link **http://localhost:3000**. **Không** đưa link `:8000`: cổng đó phục vụ bản web build sẵn trong `web/out`, có thể cũ hơn code;
  2. **3–6 bước bấm thử**, viết bằng lời thường ("Bấm nút ✨ ở trên ảnh → kéo thanh giữa để so trước/sau…"). Không dùng thuật ngữ, không bắt anh gõ lệnh.
- Báo cáo có hai phần: **"Anh sẽ thấy gì khác"** (ngắn, dễ hiểu) và **"Chi tiết kỹ thuật"** (cho lần sau đọc lại).
- Việc gì **tốn lượt Gemini** (bậc miễn phí, 20 lượt/ngày), phải hỏi trước và nói rõ tốn mấy lượt.
- **Cài thư viện hay tải model mới**: hỏi trước, nói rõ tên, nguồn, dung lượng, giấy phép. Model tải về để trong `.models/` (thêm vào `.gitignore`), **không commit** file model.

---

## 4. Lộ trình tổng quan

| # | Task | Loại | Cỡ | Phụ thuộc |
|---|---|---|---|---|
| **0.1** | Đồng bộ nhánh, đo mốc, đo RAM OCR cục bộ | – | S | – |
| **0.2** | Lưới an toàn kiểm thử (thư mục dữ liệu riêng, E2E sổ mẫu, test TS, test đủ bản dịch) | – | M | 0.1 |
| **0.3** | 5 sửa lỗi nhỏ: ngày gõ tay, số toàn góc, ngôn ngữ theo trình duyệt, font sổ mẫu trong Docker, code chết | Mặc định | S | 0.2 |
| **1.1** | Danh tính dòng + giá trị máy đọc + cờ đã soát | Mặc định | M | 0.2 |
| **1.2** | Một định nghĩa "cần soát" dùng chung TS + Python | Mặc định | M | 1.1 |
| **1.3** | ✓ Đã soát (dòng / cả mặt), Ctrl+Enter, khôi phục giá trị máy, thêm dòng đúng chỗ | Mặc định | M | 1.2 |
| **1.4** | Excel/CSV: 確認済, chú thích tiếng Nhật, 検証レベル mới | Mặc định | M | 1.2 |
| **1.5** | Lý do dễ hiểu 3 thứ tiếng + gợi ý sửa một chạm | Mặc định | M | 1.2 |
| **1.6** | Kiểm tra nối số dư giữa các mặt sổ | Mặc định | M | 1.2 |
| **1.7** | Phát hiện 2 ảnh chụp cùng một trang | Mặc định | M | 1.2 |
| **2.1** | Backend hồ sơ: ghi nguyên tử + khoá, xoá, lưu trữ, thống kê | Mặc định | M | 1.2 |
| **2.2** | Trang danh sách hồ sơ + mở theo `?ws=` | Mặc định | M | 2.1 |
| **2.3** | Sửa thông tin sổ (銀行・店番・口座番号・名義) + áp cho các mặt sau | Mặc định | S–M | 1.1 |
| **2.4** | Xuất theo tài khoản + tóm tắt trước khi xuất | Mặc định | M | 1.6, 1.7, 2.3 |
| **3.1** | Cài đặt người dùng (lưu theo tài khoản) + hộp ⚙ | Mặc định (khung) | M | 0.2 |
| **3.2** | Chế độ soát nhanh: một dòng một lúc, ảnh dòng phóng to | Nút (chế độ) | L | 1.3, 1.5 |
| **3.3** | Từ điển sửa lỗi học từ chỉnh sửa | Mặc định (gợi ý) + Tuỳ chọn (tự áp) | M–L | 1.1, 3.1 |
| **3.4** | Cỡ chữ lớn | Tuỳ chọn | M | 3.1 |
| **3.5** | Bảng mượt khi có hàng trăm dòng | Mặc định | S–M | 1.2 |
| **4.1** | Quét song song + giới hạn toàn cục | Mặc định (số luồng qua env) | M | 0.2 |
| **4.2** | F5 vẫn theo dõi tiếp lần quét đang chạy | Mặc định | S | 4.1 |
| **4.3** | Báo trước lượt quét/chi phí, biết trang nào miễn phí | Mặc định (dùng thử) + Tuỳ chọn (chi phí) | S–M | 3.1 |
| **4.4** | Đọc lại một dòng bằng ảnh cắt sát | Nút | L | 1.3, 4.3 |
| **4.5** | Quét lại trang bằng model mạnh hơn | Nút (chỉ khi có `ESCALATE_MODEL`) | S | 4.3 |
| **5.0** | Nền chỉnh ảnh: OpenCV + hàng đợi phân tích ảnh chạy nền + tải model | – | S–M | 0.2 |
| **5.1** | Kiểm tra chất lượng ảnh (mờ, tối, loá, chữ nhỏ) **trước khi quét** | Mặc định (chỉ hiện khi có vấn đề) | M | 5.0 |
| **5.2** | Tự tìm mép giấy (4 góc) | Nút | M | 5.0 |
| **5.3** | Tự nhận hướng trang 0/90/180/270 | Mặc định (gợi ý) + Tuỳ chọn (tự xoay) | M | 5.0 |
| **5.4** | ✨ Tự căn chỉnh một chạm, xem trước/sau, áp cho nhiều mặt | Nút | L | 5.2, 5.3 |
| **5.5** | Kính lúp + giữ để xem ảnh gốc | Nút | S | – |
| **5.6** | Ảnh tải nhanh hơn (JPEG để xem + cache bất biến) | Mặc định | S | – |
| **5.7** | Chụp bằng điện thoại qua mã QR | Nút | L | 2.1 |
| **6.0** | **Cổng quyết định**: khách có cần 仕訳 không, dùng phần mềm nào | – | – | hỏi anh |
| **6.1** | Cột 勘定科目 + quy tắc học được | Tuỳ chọn | L | 6.0, 3.1 |
| **6.2** | Xuất 弥生 / freee / マネーフォワード | Tuỳ chọn | M–L | 6.1 |
| **7.x** | Vận hành bản gọn: đổi mật khẩu, mã đăng ký, admin, nhật ký, tự xoá | Mặc định/env | S–M mỗi task | để sau |

**Thứ tự khuyên làm** (đã chỉnh theo ưu tiên của anh 30/09: chỉnh ảnh thông minh lên sớm):

0.1 → 0.2 → 0.3 → 1.1 → 1.2 → 1.3 → 1.4 → **(mốc demo A)** →
**5.0 → 5.1 → 5.5 → 5.2 → 5.3 → 5.4 → (mốc demo C)** →
1.5 → 1.6 → 1.7 → 3.1 → 3.2 → **(mốc demo B)** →
2.1 → 2.2 → 2.3 → 2.4 → 3.3 → 4.2 → 4.3 → 5.6 → 4.4 → 3.5 → 3.4 → 4.1 → 5.7 → 4.5 → (6 nếu qua cổng) → 7.

- **Mốc demo A**: soát xong thì Excel sạch, đúng lời hứa「怪しい所だけ黄色、人が30秒で直す」.
- **Mốc demo C**: ảnh chụp điện thoại nghiêng, lộn ngược, chếch → **một nút ✨ là thẳng**, có so sánh trước/sau; ảnh mờ được báo **trước khi** tốn lượt quét.
- **Mốc demo B**: soát một dòng một lúc với ảnh phóng to. Đây là thứ đáng đưa khách Nhật xem nhất.
- 4.1 (quét song song) xếp cuối nhóm vì **bậc miễn phí không hưởng lợi**: quét song song chỉ nhanh hơn khi đã bật trả phí.

---

## 5. Chi tiết từng task

### GIAI ĐOẠN 0 — Chuẩn bị

#### Task 0.1 — Đồng bộ nhánh, đo mốc `S`
**Vì sao:** nhánh local `web-app-giai-doan-2` từng **chậm hơn origin 1 commit**: `66fa934` (26/09, "Cai thien toc do va do chinh xac khung do dong giao dich"). Commit này thêm `api/rowanchors.py` (khớp số tiền/số dư với toạ độ bằng OCR cục bộ RapidOCR + Tesseract), `POST /api/ws/:ws/sheets/:sheet/rowmap`, `requirements-rowmap.txt`, và Dockerfile cài `tesseract-ocr tesseract-ocr-jpn`.

**✅ Đã làm 30/09 (Opus):**
- `git pull --ff-only`: local đã chứa `66fa934`.
- `pytest`: **180 passed**.
- Máy anh có sẵn OpenCV 5.0, RapidOCR (onnxruntime 1.30) và Tesseract ở `C:\Program Files\Tesseract-OCR\`.
- App đã chạy thử ở http://localhost:3000.

**Còn lại**
1. `git status`: chỉ được có `docs/KE_HOACH_NANG_CAP_WEB.md`, `docs/WEB_PLAN.md` (đã sửa) và các thư mục untracked `.tools/`, `.deploy-homepage/`, `tsucho-scan-homepage/tools/video/` (**đừng** add các thư mục này).
2. `git switch -c nang-cap-10-2026`, rồi commit riêng hai file kế hoạch (`docs/KE_HOACH_NANG_CAP_WEB.md`, `docs/WEB_PLAN.md`).
3. `cd web && npm ci && npm run build`: ghi kết quả vào mục 9.
4. **Đo RAM** tiến trình uvicorn khi gọi `POST .../rowmap` lần đầu (RapidOCR nạp model), bằng `psutil.Process().memory_info().rss` trước/sau. **Không gấp**: chỉ cần khi chọn máy chủ để deploy. Lỗi 502 do hết RAM đã từng xảy ra trên máy 512MB (commit `aa71757`). Chuẩn bị sẵn biến `TSUCHO_LOCAL_OCR=0` để tắt OCR cục bộ trên máy nhỏ (task 5.3 cũng dùng).

**Xong khi:** đang ở nhánh `nang-cap-10-2026`; build xanh; mục 9 có đủ số đo.

**Bẫy:** `.tools/tessdata` là dữ liệu Tesseract cục bộ mà `rowanchors._read_words` dùng; không commit, không xoá.

#### Task 0.2 — Lưới an toàn kiểm thử `M`
**Vì sao:** frontend chưa có test tự động nào. Các lỗi kiểu "phím tắt chết âm thầm" chỉ bị phát hiện khi anh tự bấm. Mọi task sau cần một lưới bắt thụt lùi.

**Làm gì**
1. **Thư mục dữ liệu riêng cho test.** `api/workspace.py`: `DATA_DIR = Path(os.getenv("TSUCHO_DATA_DIR") or <mặc định hiện tại>)`. `auth.DB_PATH` đã suy ra từ `DATA_DIR` nên tự theo. Ghi vào `docs/CHAY_WEB.md`.
2. **Test logic TS không thêm thư viện.** Node 24 chạy thẳng `.ts` (tự bỏ kiểu).
   - Thêm `"allowImportingTsExtensions": true` vào `web/tsconfig.json` (hợp lệ vì đã có `noEmit`), để file test import được `./x.ts`.
   - Thêm script `"test": "node --test src/lib/*.test.ts"` vào `web/package.json`.
   - Logic đem test phải là **file .ts thuần**: không JSX, không import alias `@/`, chỉ `import type` khi cần kiểu.
3. **Tách từ điển**: chuyển `DICT` từ `web/src/lib/i18n.tsx` sang `web/src/lib/dict.ts` (dữ liệu thuần), `i18n.tsx` import lại. Viết `dict.test.ts` so **đệ quy** khoá và kiểu (hàm/chuỗi) của vi/en/ja. Hiện `t: DICT[lang] as Dict` là ép kiểu, nên thiếu khoá ở `ja` sẽ không báo lỗi lúc build mà hiện chữ `undefined` lúc chạy.
4. **E2E sổ mẫu**: `tests/e2e/smoke.py` (Playwright Python, máy đã cài; xem `tsucho-scan-homepage/tools/chup-anh-man-hinh.py` để lấy cách làm).
   - Chạy `uvicorn api.main:app --port 8765` với `TSUCHO_DATA_DIR=<thư mục tạm>`; FastAPI phục vụ luôn `web/out` nên phải `npm run build` trước.
   - Chờ `/api/health`.
   - Chromium với `locale="vi-VN"`, và đặt `localStorage["tsucho.lang"]="vi"` để chữ ổn định.
   - Kịch bản:
     1. Đăng ký `e2e@test.local`.
     2. Bấm「Bỏ qua」ở hướng dẫn.
     3. Bấm「Thử với sổ mẫu」→ chờ bảng có dòng.
     4. Sửa một ô 残高 thành số sai → bộ đếm "Còn N dòng" tăng → Ctrl+Z → về như cũ.
     5. Mở hộp Xuất file → tải `.xlsx` → mở bằng `openpyxl`, kiểm tra có sheet và có dòng dữ liệu.
     6. F5 → kết quả vẫn còn.
   - Kết thúc: dừng server, xoá thư mục tạm. In `PASS/FAIL` từng bước.
   - Không đặt tên `test_*.py` để pytest không tự chạy nó (cần build web trước).
5. Ghi cả 4 lệnh kiểm tra (mục 3) vào `docs/CHAY_WEB.md`.

**Xong khi:** 4 lệnh chạy xanh trên nhánh mới; cố ý làm hỏng phím Ctrl+Z (xoá tạm listener) thì E2E báo FAIL ở bước 4, sau đó trả lại.

#### Task 0.3 — Năm sửa lỗi nhỏ đã xác minh `Mặc định` `S`
1. **Ngày gõ tay làm Excel lỗi 500.**
   - Thêm `parseDateInput(s, neighbors)` vào `web/src/lib/review.ts` (file mới, thuần TS). Hàm nhận: `2025-04-11`, `2025/4/11`, `R7.4.11`, `令和7年4月11日`, `H31.4.30`, dạng in trên sổ `07-04-11` (năm theo niên hiệu, lấy niên hiệu từ dòng bên cạnh; mặc định 令和), và `4/11` (suy năm từ dòng trước/sau).
   - Chuẩn hoá NFKC trước khi đọc.
   - Đọc được → `date` = ISO. Không đọc được → `date: null`, `date_raw` = chuỗi gõ, dòng vàng.
   - Phía server, `export.py` và `export_csv.py` **không bao giờ đổ** vì ngày hỏng: `try date.fromisoformat` → nếu lỗi thì ghi chuỗi + tô vàng.
   - Test: pytest cho export với ngày hỏng; `review.test.ts` cho từng dạng ngày.
2. **Số toàn góc bị xoá.** `parseYen` (`ReviewPane.tsx`): `s.normalize("NFKC")` trước khi lọc số; nhận `－`, `，`, `￥`, `円`. Chuyển hàm sang `review.ts` và viết test (`"１，２３４"` → 1234; `"▲500"` → **không nhận**, vì sổ ngân hàng không có số âm: giữ giá trị cũ và báo ô không hợp lệ).
3. **Ngôn ngữ theo trình duyệt.** `LangProvider`: chưa có lựa chọn đã lưu thì lấy từ `navigator.languages` (`ja*`→ja, `vi*`→vi, còn lại→en). **Luôn** đặt `document.documentElement.lang` khi nạp, không chỉ khi bấm đổi, vì trình duyệt chọn phông chữ Hán theo `lang` (Android dễ hiện nét chữ Trung Quốc nếu `lang="vi"`).
4. **Font tiếng Nhật cho sổ mẫu trong Docker (xác minh trước).** `api/sample.py._font` tìm YuGothic/Meiryo (Windows) hoặc `/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc`, nhưng Dockerfile **không cài** gói font CJK. Khả năng cao là trên Render ảnh sổ mẫu **mất hết chữ Nhật**.
   - Xác minh: `docker build` nếu máy có Docker. Nếu không, nhờ anh mở sổ mẫu trên bản Render xem ảnh.
   - Nếu đúng như dự đoán: thêm `fonts-noto-cjk` (hoặc `fonts-ipafont-gothic`, nhẹ hơn) vào dòng `apt-get install` sẵn có.
5. **Code chết** `api/exporter.py` (không file nào import): anh không chắc ⇒ **giữ nguyên, không đụng tới**. Chỉ thêm một dòng comment đầu file ghi "chưa được dùng ở đâu (kiểm 30/09/2026)" để người sau khỏi mất công tìm.

**Kiểm tra — anh tự thử:**
- Sổ mẫu → gõ ngày `2025/4/11` vào một ô 年月日 → Xuất Excel: phải tải được, ô ngày đúng.
- Bật IME tiếng Nhật chế độ toàn góc, gõ `１２３４` vào ô 出金: phải thành 1,234.
- Mở app bằng trình duyệt tiếng Nhật (hoặc cửa sổ ẩn danh với ngôn ngữ ja) lần đầu: giao diện tiếng Nhật.

---

### GIAI ĐOẠN 1 — Soát → Excel đúng (lõi)

#### Task 1.1 — Danh tính dòng + giá trị máy đọc + cờ đã soát `Mặc định` `M`
**Vì sao:** muốn biết "người đã soát dòng này chưa", "máy đọc ra gì trước khi người sửa", và muốn học từ chỉnh sửa (3.3), thì mỗi dòng phải có **danh tính ổn định** và giữ **giá trị gốc của máy**. Hiện `TxRef` là chỉ số `(block,row)`: xoá một dòng là mọi chỉ số phía sau trượt.

**Mô hình (thêm vào Tx, mọi trường đều tuỳ chọn để đọc được file cũ):**
```ts
rid?: string;              // 12 ký tự hex, sinh một lần, không bao giờ đổi
orig?: Partial<Record<EditField, string | number | null>>;  // giá trị MÁY ĐỌC của các ô đã bị sửa
reviewed?: boolean;        // người đã xác nhận dòng này
reviewed_at?: number;      // epoch giây
added?: boolean;           // dòng do người thêm (không có giá trị máy)
inferred?: EditField[];    // ô do máy SUY RA (vd "Tự tính số dư"), không phải số in
// EditField = "date"|"kind"|"description"|"extra_text"|"store_code"|"amount_out"|"amount_in"|"balance"
```
`status` và `reason` **giữ nguyên là dữ kiện của máy**; giao diện không bao giờ sửa hai trường này. Trạng thái hiển thị được **suy ra** ở 1.2.

**Làm gì**
- `api/results.py`:
  - `save_job`: gán `rid` cho mọi dòng. Sổ mẫu cũng đi qua đây nên tự có.
  - `load_all`: dòng nào thiếu `rid` thì bổ sung rồi ghi lại bằng `_write_atomic` (một lần duy nhất).
  - `save_edits`: chỉ kiểm tra `rid` (nếu có) là chuỗi ≤ 32 ký tự; **giữ nguyên** mọi khoá khác của dòng để không mất dữ liệu.
- `web/src/lib/api.ts`: thêm kiểu.
- `web/src/app/page.tsx`:
  - `editCell`: lần đầu sửa ô F của dòng máy (không phải `added`) thì ghi `orig[F] = giá trị cũ`. Sửa về đúng bằng `orig[F]` thì xoá khoá F khỏi `orig`.
  - `addRow`: `rid` mới, `added: true`. Sinh `rid` bằng `crypto.getRandomValues(new Uint8Array(6))` → hex. **Không** dùng `crypto.randomUUID()`: hàm này chỉ có trong ngữ cảnh an toàn (HTTPS/localhost), mở app qua `http://<IP-LAN>` (thử trên điện thoại ở task 5.7) là lỗi ngay.
  - `autoBalance`: ghi `inferred: ["balance"]` cho ô vừa suy ra.
- Không đổi hành vi hiển thị ở task này.

**Xong khi:** pytest mới:
- file kết quả cũ không có `rid` → `load_all` bổ sung và ghi lại; gọi lần hai không ghi nữa;
- `save_edits` giữ nguyên `orig/reviewed`.

Thêm vào E2E: sửa một ô → F5 → `orig` vẫn còn (đọc qua API).

**Bẫy:** `syncStore` so sánh tham chiếu; đừng tạo object mới cho mặt sổ không đổi, kẻo autosave gửi lại cả kho.

#### Task 1.2 — Một định nghĩa "cần soát" dùng chung `Mặc định` `M`
**Vì sao:** mục 1.3-1. Đây là gốc của chuỗi lỗi.

**Làm gì**
1. Lập bảng **mọi chuỗi lý do** mà `validate.py` sinh ra: grep `reasons.append`, `fixes.append`, `note =`, `"・".join`. Phân loại:
   | Loại | Nhận dạng | Coi là đã giải quyết khi |
   |---|---|---|
   | `balance` | bắt đầu bằng `残高不一致` | chuỗi số dư hiện tại của dòng = OK |
   | `date` | `日付不明` | `date` là ISO hợp lệ |
   | `nobal` | `残高が読取れず検証不可` | dòng đã có `balance` và chuỗi = OK |
   | `lowconf` | `低信頼度` | chỉ khi người bấm ✓ |
   | `rowgap` | chứa `行抜けの疑い` | chỉ khi người bấm ✓ |
   | `fix` | kết thúc bằng `補正` / `分離`, hoặc các ghi chú tự sửa khác | không phải việc cần soát (chỉ để biết) |
   | `other` | chuỗi lạ | chỉ khi người bấm ✓ |
2. `web/src/lib/review.ts` (thuần TS):
   ```ts
   chainChecks(rows): ("OK"|"NG"|"―")[]   // dòng ghi chú: "―" nhưng VẪN cập nhật số dư trước nếu có
   parseReasons(reason): {kind, text, params}[]
   needsReview(tx, chk): boolean
   rowState(tx, chk): "note"|"confirmed"|"review"|"fixed"|"edited"|"ok"
   focusField(tx, chk): "balance"|"date"|"description"   // ô mà phím n đặt con trỏ vào
   sheetStats(blocks): {rows, need, fixed, confirmed, edited}
   ```
   Quy tắc `needsReview`:
   - dòng ghi chú → false
   - `reviewed` → false
   - `chk==="NG"` → true
   - `status!=="check"` → false
   - còn lý do nào chưa được giải quyết theo bảng trên → true
   - `status==="check"` mà không có lý do nào → true

   Thứ tự ưu tiên của `rowState`: `note` > `confirmed` > `review` > `fixed` > `edited` (có `orig` hoặc `inferred`) > `ok`.
3. **Bản Python** `review.py` ở gốc repo (cạnh `export.py`), cùng hàm, cùng quy tắc.
4. **Một bộ test chung**: `tests/fixtures/review_cases.json`, ít nhất 14 ca. Phải có các ca:
   - chuỗi OK;
   - NG do người sửa sai;
   - `残高不一致` được người sửa đúng → hết vàng;
   - `日付不明` hết khi có ngày;
   - `行抜けの疑い` phải bấm ✓;
   - `reviewed` thắng NG;
   - ghi chú 繰越 có số dư;
   - dòng đầu khối có lý do `balance` (chk "―") vẫn vàng;
   - `fixed` giữ xanh;
   - `edited` không cờ;
   - `nobal`;
   - `check` rỗng lý do;
   - `inferred`;
   - dòng `added` chưa ✓.

   `tests/test_review.py` và `web/src/lib/review.test.ts` **đọc cùng file JSON đó**, nên hai bản không thể lệch nhau.
5. Thay **mọi** chỗ đang tự tính: `ReviewPane.tsx` (`checkColumn`, `Row.flag`, tô màu), `page.tsx` (`perSheet`, `flatRows`, `badCount`, `jumpBad` dùng `focusField`), `SheetRail` (huy hiệu). Grep `status === "check"` và `checkColumn` phải còn 0 kết quả ngoài `review.ts`.
6. **Cho sổ mẫu một dòng cần soát thật** (E2E của 1.3, 1.4, 3.2 cần nó).
   - Đã chạy engine trên sổ mẫu ngày 30/09: **không có dòng vàng nào**, chỉ 2 dòng xanh ở mặt ② (`残高を検算で補正`, `日付は前行と同じ`).
   - **Đừng thử tạo lệch số dư**: engine tự sửa hết (memory ghi rõ).
   - Cách tất định: `api/sample.py._to_tx` hiện đặt `"n"` nhưng **không đặt `row_no`**, nên `_flag_row_number_gaps` không chạy. Cho `_to_tx` đặt `row_no` (số nguyên) và bỏ một số ở `_SHEET_B` (ví dụ 04 → 06). Engine sẽ gắn `行抜けの疑い`, đúng loại cờ chỉ người mới gỡ được.
   - Nhân tiện sửa kiểu trong `api.ts`: `row_no?: number | null` (thực tế là số nguyên, không phải chuỗi).

**Xong khi:** hai bộ test cùng xanh trên một bộ JSON. Trên sổ mẫu: sửa sai một số dư → vàng; sửa lại đúng → **hết vàng**; bộ đếm, huy hiệu cột trái và phím n luôn khớp nhau (E2E kiểm cả ba).

**Anh tự thử:** trên sổ thật có dòng vàng (ví dụ bộ p5-6 có 1 dòng): sửa đúng số → dòng hết vàng ngay, "Còn N dòng" giảm, phím n không quay lại dòng đó.

#### Task 1.3 — Hành động ✓ Đã soát `Mặc định` `M`
**Làm gì**
- **Theo dòng** *(nút ✓ đã làm sẵn ở 1.2, xem ghi chú 1.2; ở đây còn chữ「✓ Đã soát」/「✎ đã sửa tay」ở cột 確認メモ và các bước dưới)*:
  - nút ✓ ở cột cuối, cạnh nút ×. Luôn hiện ở dòng cần soát; dòng khác chỉ hiện khi rê chuột;
  - bấm lại để bỏ xác nhận;
  - `reviewed=true, reviewed_at=now`, đi qua `patchRows`, nên Ctrl+Z hoàn tác được và autosave tự lưu.
- **Phím `Ctrl+Enter`** (kể cả khi con trỏ đang trong ô): xác nhận dòng chứa con trỏ (hoặc `selRow`), rồi nhảy tới dòng cần soát kế tiếp và đặt con trỏ vào `focusField`. Thêm vào bảng phím tắt và hướng dẫn.
- **Theo mặt sổ**: chân thẻ sổ có「✓ Xác nhận cả mặt sổ」.
  - Nếu còn dòng NG: `ConfirmDialog` ghi rõ "còn 2 dòng số dư lệch, vẫn xác nhận?".
  - Xác nhận cả mặt = đánh dấu mọi dòng không phải ghi chú. Đây là cách để Excel **hết tô vàng katakana** sau khi soát bằng mắt.
- **Khôi phục giá trị máy đọc**: ô có `orig[F]` hiện dấu ↺ nhỏ khi rê chuột; bấm để trả về giá trị máy và xoá `orig[F]`. Tooltip ghi "Máy đọc: …".
- **Thêm dòng đúng chỗ**: "+ Thêm dòng" chèn **ngay dưới dòng đang chọn**; chưa chọn dòng thì thêm vào cuối như cũ. Phím `Ctrl+Shift+Enter` = chèn dòng trống dưới dòng hiện tại. Dòng thêm có `added: true` nên cần ✓.
- Cột 確認メモ: dòng đã xác nhận hiện "✓ Đã soát" (dịch 3 thứ tiếng); dòng `edited` hiện "✎ đã sửa tay", tooltip liệt kê `orig → mới`.

**Xong khi:** E2E: ✓ một dòng → bộ đếm giảm → Ctrl+Z → tăng lại → F5 → trạng thái còn nguyên.

**Bẫy:** `Ctrl+Enter` trong `<input>`: bắt ở `keydown` của window **trước** nhánh `typing` trong `useEffect` phím tắt (giống Ctrl+Z). Nhớ `preventDefault`.

#### Task 1.4 — Excel/CSV: 確認済 + tiếng Nhật + 検証レベル mới `Mặc định` `M` *(anh đã duyệt đổi form)*
**Làm gì** (`export.py`, `api/export_csv.py`; dùng `review.py` để suy trạng thái)

| Trạng thái (`row_state`) | Tô màu | 確認メモ |
|---|---|---|
| `review` | vàng ở 出金/入金/残高 (và ô ngày nếu lý do là `date`) | `要確認: <lý do gốc>` |
| `confirmed` | **không tô** | `確認済` và, nếu có, `（元: <lý do gốc>）` / `（修正: 残高 1,234→1,284）` |
| `fixed` | xanh ở 出金/入金 (như cũ) | `自動修正: <lý do>` |
| `edited` | không tô | `手修正: 残高 1,234→1,284`. Ô có trong `inferred` (Tự tính số dư) ghi thêm `推定値（残高から計算）` |

- Tô vàng 摘要 katakana: **chỉ với dòng chưa xác nhận** (giữ quy tắc `_KANA_RUN` hiện có).
- Chú thích dòng 1–3, cột F, chuyển hẳn sang **tiếng Nhật**:
  - 「黄色＝要確認（読取り・検算で疑わしい箇所。カタカナ名は原本と照合してください）」
  - 「緑＝残高検算で自動修正」
  - 「確認メモ『確認済』＝利用者が原本と照合済み」
- `verification_summary` trả thêm `confirmed`, `edited`; **giữ nguyên các khoá cũ** vì `core.ScanResult.verification` và `tests/test_core.py` đang dùng. Mức 検証レベル:
  - không đọc được số dư → giữ câu cũ;
  - `need==0 && confirmed==0` → `残高チェーン検証済（全行一致）`;
  - `need==0 && confirmed>0` → `検証済（残高一致・人手確認 {confirmed}行）`;
  - `need>0` → `一部未検証（{need}行が要確認）`.

  Dòng 6 cột F: `取引 N行 / 残高検算OK X行 / 自動修正 Y行 / 人手確認 Z行 / 要確認 W行`.
- Giữ nguyên: công thức sống ở 残高チェック, màu header `#2F5B7C`, freeze `A9`, khối 集計/内訳.
- Câu cảnh báo giới hạn ở dòng 6 cột H **giữ nguyên**: không bao giờ giấu giới hạn.

**Xong khi:** `tests/test_export.py` có ca mới:
- dòng `confirmed` không có ô vàng;
- dòng `review` có ô vàng;
- 検証レベル đúng từng ca;
- chú thích không còn chữ Việt (kiểm bằng regex ký tự Việt có dấu).

E2E: sổ mẫu → xác nhận cả mặt → xuất → **0 ô vàng**, 検証レベル bắt đầu bằng `検証済` hoặc `残高チェーン検証済`.

**Anh tự thử:** soát xong một mặt sổ thật → xuất Excel → mở bằng Excel: không còn ô vàng, cột 確認メモ ghi 確認済, dòng 6 đếm đúng.

#### Task 1.5 — Lý do dễ hiểu + gợi ý sửa một chạm `Mặc định` `M`
**Vì sao:**
- Lý do hiện là chuỗi kỹ thuật tiếng Nhật (`残高不一致(差額 +440)`), người dùng VI/EN không hiểu.
- Engine đã tự sửa được những ca chắc chắn; phần còn lại là các ca **mơ hồ**, nơi người chỉ cần chọn một trong vài phương án. Gợi ý đúng phương án là cắt thời gian soát nhiều nhất, và $0.

**Làm gì**
- `review.ts`: `explainReason(r, lang)` → câu ngắn theo ngôn ngữ; tooltip giữ chuỗi gốc tiếng Nhật. Ví dụ VI:
  - `balance` → "Số dư lệch +440 so với phép tính từ dòng trên"
  - `rowgap` → "Số dòng nhảy 06→08: có thể sót 1 dòng"
  - `date` → "Không đọc được ngày"
  - `lowconf` → "Máy đọc không chắc (chữ mờ)"
- `review.ts`: `suggestFixes(rows, i)` **chỉ cho dòng NG**. Gọi P = số dư trước, O/I = rút/gửi, B = số dư in, E = P−O+I, diff = B−E. Trả tối đa 3 phương án, theo thứ tự:
  1. **Đổi cột 出金↔入金**: nếu P−I+O = B.
  2. **Sửa 残高 thành E**: chỉ khi dòng có số dư **kế tiếp** khớp với E (bằng chứng hai phía, giống `_lookahead_ok` trong `validate.py`).
  3. **Sửa 出金 (hoặc 入金) thành O′**: O′ = P+I−B > 0, và chuỗi số của O′ chỉ khác O tối đa 2 chữ số (gần như đọc nhầm một chữ).
  4. **Thêm dòng bị sót phía trên**: diff<0 → dòng 出金 |diff|; diff>0 → dòng 入金 diff; số dư dòng mới = P ± |diff|. Dòng mới `added: true`, 摘要 trống, nên vẫn cần ✓.
- Giao diện: chip nhỏ dưới ô 確認メモ của dòng NG, ví dụ「Đổi cột 出金↔入金」「残高 → 1,043,561」. Bấm = `patchRows` (hoàn tác được). Nếu áp xong dòng hết NG thì tự sang dòng cần soát kế.

**Xong khi:** `review.test.ts` có ít nhất 8 ca, mỗi phương án có ca đúng và ca không được phép gợi ý (ví dụ phương án 2 không được đề xuất khi dòng kế không khớp). Chip dịch đủ 3 thứ tiếng.

#### Task 1.6 — Kiểm tra nối số dư giữa các mặt sổ `Mặc định` `M`
**Vì sao:** engine chỉ nối chuỗi trong **một lần quét**. Anh quét trang 1–5 hôm nay, trang 6–10 hôm sau thì không ai kiểm chỗ nối, mà đó là chỗ hay **thiếu trang, sai thứ tự hoặc sót dòng**.

**Làm gì**
- `review.ts`: `sheetLinks(sheets, store)`. Với mỗi cặp mặt sổ **liền nhau trong danh sách** mà cả hai đã có kết quả:
  - Nếu cả hai có `account_no` và khác nhau → `different` (không kiểm).
  - Lấy số dư cuối của mặt A (kể cả dòng ghi chú 繰越).
  - Đi xuôi mặt B tới dòng đầu tiên có số dư, cộng trừ các giao dịch trên đường đi.
  - Kết quả: `ok` / `break (diff)` / `unknown` (không có số dư).
  - Nếu mặt B mở đầu bằng dòng 繰越 có số dư bằng đúng số dư cuối của A → `ok` chắc chắn.
- Giao diện:
  - Chế độ danh sách: dải mảnh giữa hai mặt, "⛓ nối liền với「A」" (nhạt) hoặc **"⚠ Đứt chuỗi với mặt trước: chênh ¥+12,340 — có thể thiếu dòng/thiếu trang hoặc sai thứ tự"** (vàng), kèm nút「Không phải lỗi」.
  - Chế độ trang: dòng tương tự ở đầu thẻ sổ.
  - Cột trái: biểu tượng ⛓✕ trên thẻ mặt B.
- Lưu「Không phải lỗi」: `PUT /api/ws/:ws/results/:sheet` nhận thêm `link_ok: bool` (lưu ở mức file kết quả của mặt B; `save_edits` gộp trường này).
- Bộ đếm cần soát có thêm mục "⚠ 1 chỗ đứt giữa các mặt" (tính riêng, không cộng vào số dòng).

**Xong khi:** test TS cho `sheetLinks`:
- 2 mặt nối đúng;
- đứt;
- khác tài khoản;
- mặt B mở bằng 繰越;
- mặt không có số dư.

E2E: sổ mẫu (2 mặt nối liền theo dữ liệu mẫu) → hiện "nối liền"; đổi thứ tự hai mặt → hiện "đứt".

#### Task 1.7 — Phát hiện 2 ảnh chụp cùng một trang `Mặc định` `M`
**Vì sao:** WEB_PLAN §5a, việc nguy hiểm nhất: bộ 通帳2 đã đo có ảnh chụp lại cùng trang (S__35774551 / S__35774555_0, 16/21 số dư trùng), dẫn tới **cộng gấp đôi giao dịch** mà file vẫn trông bình thường.

**Làm gì**
- `review.ts`: `duplicatePairs(store)`: tập số dư (≥ 1,000 để tránh trùng ngẫu nhiên số nhỏ) của từng mặt. Cặp nào có `|A∩B| ≥ 4` và `|A∩B| / min(|A|,|B|) ≥ 0.5` là nghi trùng.
- Backend: `ws.dup_ok: list[[idA,idB]]` trong `meta.json`, `POST /api/ws/:id/dup-ok {a,b}`.
- Giao diện:
  - huy hiệu "Có thể trùng với「X」" ở cột trái;
  - hộp **so sánh hai ảnh cạnh nhau** + "16/21 số dư trùng";
  - ba nút:「Không phải trùng」(lưu `dup_ok`),「Xoá mặt bên phải」(qua `ConfirmDialog`),「Để sau」.
- Hộp Xuất file: cảnh báo (không chặn) "2 mặt sổ có thể trùng — giao dịch có thể bị tính 2 lần".

**Xong khi:** test TS cho ngưỡng; pytest cho `dup-ok` (quyền sở hữu, id lạ → 400).

**Anh tự thử:** thả hai ảnh chụp lại cùng một trang (trong `input/通帳2/`, không phải bản trùng byte) → quét → phải hiện cảnh báo trùng. Việc này tốn 2 lượt API nếu hai ảnh chưa có trong cache: báo trước.

---

### GIAI ĐOẠN 2 — Hồ sơ & thông tin sổ

#### Task 2.1 — Backend hồ sơ `Mặc định` `M`
**Làm gì** (`api/workspace.py`, `api/main.py`)
- **Ghi nguyên tử**: `Workspace.save` ghi file tạm rồi `os.replace`, giống `results._write_atomic`. Hiện ghi thẳng `write_text`: server sập giữa chừng là mất danh sách mặt sổ.
- **Khoá theo hồ sơ**: một `threading.RLock` cho mỗi `ws_id` (từ điển có khoá bảo vệ). Mọi route **thay đổi** hồ sơ bọc trong `with workspace.locked(ws_id):`. Các route đồng bộ của FastAPI chạy song song trong threadpool: tải file lên lúc đang xoay ảnh, hay 2 tab cùng mở, đều có thể ghi đè lẫn nhau.
- Trường mới (tuỳ chọn, đọc được meta cũ):
  - `updated_at` (cập nhật mỗi lần `save`);
  - `archived: bool`.
  - `book_name` giữ nguyên, dùng luôn làm **tên hồ sơ**.
- Route:
  - `POST /api/ws` nhận `{book_name?}`.
  - `DELETE /api/ws/:id`: xoá thư mục, bỏ khỏi `_cache`. Chỉ chủ sở hữu; hồ sơ của người khác → 404.
  - `PATCH /api/ws/:id` nhận thêm `archived`.
  - `GET /api/ws` trả thêm: `rows`, `need`, `confirmed` (qua `review.py` trên kết quả đã lưu), `updated_at`, `archived`.
- Test `tests/test_api_workspaces.py`:
  - tạo / đổi tên / lưu trữ / xoá;
  - người khác → 404;
  - thống kê đúng trên kết quả giả;
  - **ghi nguyên tử**: giả lập lỗi khi đang ghi → `meta.json` cũ còn nguyên.

**Bẫy:**
- `list_for` nạp mọi `meta.json`. Quy mô hiện tại thì ổn, ghi chú lại để sau cần thì thêm chỉ mục.
- Test `tests/test_api_auth.py` có test **tự quét mọi route** phải đòi đăng nhập: route mới phải qua được test đó.

#### Task 2.2 — Trang danh sách hồ sơ `Mặc định` `M`
**Làm gì**
- Trang mới `web/src/app/cases/page.tsx` (`"use client"`):
  - thẻ hồ sơ: tên, ngày tạo, lần sửa cuối, số mặt sổ, số dòng, huy hiệu ✅ "đã soát hết" / ⚠ "còn N dòng";
  - ô tìm theo tên; lọc "đang làm / đã lưu trữ";
  - nút「+ Hồ sơ mới」(hỏi tên);
  - đổi tên (click đúp như cột trái), lưu trữ, xoá (`ConfirmDialog`, cảnh báo đậm vì mất cả ảnh lẫn kết quả).
- Bàn làm việc `/`:
  - đọc `?ws=<id>` bằng `useSearchParams` **bọc `<Suspense>`** (xem docs mục 3);
  - không có tham số thì mở hồ sơ mở gần nhất (localStorage `tsucho.ws.<user>`, như hiện nay), không có nữa thì hồ sơ mới nhất, không có nữa thì tạo mới. **Luồng hiện tại của anh không đổi.**
- `TopBar`: hiện tên hồ sơ đang mở + liên kết「← Hồ sơ」tới `/cases/`.
- Hướng dẫn (`Tour.tsx`): thêm một bước chỉ vào liên kết「Hồ sơ」, tăng `VERSION` trong `lib/tour.tsx`.

**Xong khi:** E2E: tạo hồ sơ B → thêm sổ mẫu → quay về danh sách → mở hồ sơ A → sổ của B không lẫn vào A. `npm run build` sinh `out/cases/index.html`.

#### Task 2.3 — Sửa thông tin sổ `Mặc định` `S–M`
**Vì sao:** sổ không có trang bìa thì khối đầu Excel ghi "―". Xuất theo tài khoản cũng không gộp được vì `account_no` rỗng (`results.to_accounts`, `buildAccounts` đòi `account_no != null`).

**Làm gì**
- Đầu `AccountCard` (`ReviewPane.tsx`): nút ✎ → form gọn: 銀行名, 店番号, 口座番号, 名義.
- Lưu vào `block.meta` qua `commitStore` (hoàn tác được, autosave lo phần lưu, `save_edits` đã lưu nguyên `blocks` gồm cả `meta`).
- Ô tick **"Áp dụng cho N mặt sổ phía sau chưa có thông tin"**, bật sẵn. Điền cho các khối liền sau có `bank_name` và `account_no` đều rỗng, **dừng** ở khối đầu tiên đã có thông tin. Đúng tinh thần `apply_cover_metadata`.
- Trường nào người sửa thì lưu thêm `meta.edited: true` (Excel không cần thể hiện).

**Xong khi:** E2E: sửa 銀行名 ở mặt 1 của sổ mẫu và áp cho mặt sau → xuất Excel → ô B1 của cả hai sheet đúng tên mới.

#### Task 2.4 — Xuất theo tài khoản + tóm tắt trước khi xuất `Mặc định` `M`
**Làm gì**
- `ExportDialog`: cấu trúc thứ ba **"Theo tài khoản"**. Gom mọi mặt cùng `(bank_name, account_no)` (khi `account_no` có giá trị) thành một sheet, theo thứ tự ở cột trái; mặt không có số tài khoản thì mỗi mặt một sheet. Làm ở `api/main.py.export` (thêm nhánh `structure == "per_account"`), đừng làm ở frontend.
- **Tóm tắt trước khi xuất** (đầu hộp thoại), **không chặn**:
  - "Còn 3 dòng cần soát · 1 chỗ đứt giữa các mặt · 1 cặp có thể trùng";
  - mỗi mục là liên kết nhảy tới chỗ đó;
  - nút「Vẫn xuất」.
- Excel: sheet "theo tài khoản" có chuỗi 残高チェック liên tục qua các mặt, vì công thức sống tự nối.

**Xong khi:** pytest cho `per_account` (2 mặt cùng tài khoản → 1 sheet; khác tài khoản → 2 sheet; không số tài khoản → mỗi mặt 1 sheet).

---

### GIAI ĐOẠN 3 — Soát nhanh & học từ người dùng

#### Task 3.1 — Cài đặt người dùng `Mặc định (khung)` `M`
**Vì sao:** nền cho mọi tính năng `Tuỳ chọn` (mục 2). Lưu **theo tài khoản** để đổi máy vẫn giữ (WEB_PLAN §7.5-5).

**Làm gì**
- `api/auth.py`: cột `prefs TEXT NOT NULL DEFAULT '{}'` trong `users`. Di trú trong `init_db`: kiểm `PRAGMA table_info(users)`, thiếu thì `ALTER TABLE`.
- `GET/PUT /api/me/prefs`: kiểm từng khoá theo **danh sách trắng** + kiểu, khoá lạ → 400.
  | Khoá | Kiểu | Mặc định | Dùng ở |
  |---|---|---|---|
  | `fontScale` | 1 / 1.15 / 1.3 | 1 | 3.4 |
  | `dictMode` | "suggest" / "auto" / "off" | "suggest" | 3.3 |
  | `showCost` | bool | false | 4.3 |
  | `autoRotate` | bool | false | 5.3 (tự xoay trang chưa quét khi máy chắc chắn về hướng) |
  | `autoFixOnUpload` | bool | false | 5.4 (tự căn chỉnh ảnh mới tải lên, chỉ các bước "chắc chắn") |
  | `accountingMode` | bool | false | 6.x |

  Ngôn ngữ và chủ đề **đồng bộ thêm** vào prefs, nhưng vẫn giữ localStorage để vẽ khung hình đầu không nháy.
- `web/src/lib/prefs.tsx` (provider sau `AuthProvider`) + `components/SettingsDialog.tsx`: nút ⚙ ở `TopBar`, cạnh nút ?. Mỗi tuỳ chọn có một dòng giải thích **ai nên bật**.

**Xong khi:** pytest: khoá lạ → 400; người A không đọc được prefs của B; cơ sở dữ liệu cũ (chưa có cột) tự di trú.

#### Task 3.2 — Chế độ soát nhanh `Nút (chế độ)` `L`
**Vì sao:** đây là lời hứa cốt lõi của sản phẩm:「機械が速く読み、怪しい行だけを黄色で指し示し、人が30秒で直す」. Công cụ soát hiện đại làm đúng như vậy: **một mục một lúc, ảnh vùng đó phóng to ngay trên ô, một phím để xác nhận**. Người Nhật lớn tuổi cũng hợp nhất với cách này: chữ to, không phải dò bảng.

**Làm gì** (chia 3 bước, mỗi bước một commit)
1. **Khung**:
   - nút「▶ Soát nhanh (N)」ở thanh trên cột kết quả, chỉ hiện khi N > 0;
   - vào chế độ thì cột phải thành **một thẻ lớn cho dòng cần soát hiện tại**, đi lần lượt qua mọi mặt sổ theo thứ tự cột trái; đổi mặt sổ thì đặt `active` (ảnh giữa đổi theo);
   - tiến độ "Dòng 3/12 · Mặt「…」";
   - `Esc` thoát, về đúng dòng đó trong bảng.
2. **Nội dung thẻ**:
   - **Dải ảnh phóng to của dòng**, lấy dải từ rowmap/rowanchors hiện có, nới ±1 dòng. Cắt bằng CSS: div `background-image` = ảnh mặt sổ, `background-size`/`background-position` tính từ `y0,y1,x0,x1`; dòng nghiêng thì `rotate` theo `skew_deg`. Viền **liền** = dải khớp theo nội dung (`method: "content"`), **nét đứt** = ước lượng. Ghi chữ "vị trí ước lượng" khi nét đứt.
   - **Các ô của dòng, chữ to 18px**: 年月日, 区分, 摘要, 出金, 入金, 残高. Sửa được, dùng chung `editCell`.
   - **Dòng phép tính**: "Số dư trước ¥P − rút ¥O + gửi ¥I = ¥E (sổ in ¥B, chênh ¥diff)". Với dòng NG, đây là thông tin quý nhất.
   - Lý do dễ hiểu và chip gợi ý sửa (1.5); gợi ý từ điển khi có (3.3); nút「Đọc lại dòng này」khi có (4.4).
3. **Điều khiển & kết thúc**:
   - 「✓ Đúng rồi — tiếp (Ctrl+Enter)」「Bỏ qua (n)」「Quay lại (p)」;
   - dòng hết cần soát thì tự sang dòng kế;
   - **khoảnh khắc hoàn thành** (WEB_PLAN §7.4-5): hiện「残高チェーン検証済 — ただし行の欠落や摘要の誤読は検出できません」(và bản dịch) + nút「Xuất file」. Không confetti.
   - Trên điện thoại: thẻ chiếm cả màn hình, ảnh ở trên, ô ở dưới.

**Xong khi:** E2E: sổ mẫu có ít nhất 1 dòng cần soát (xem **Bẫy** về dữ liệu mẫu) → vào soát nhanh → Ctrl+Enter → thẻ hoàn thành hiện ra.

**Bẫy:**
- Dòng cần soát trong sổ mẫu đã được tạo ở task 1.2 (bước 6: nhảy số thứ tự dòng). Nếu làm 3.2 mà sổ mẫu vẫn không có dòng vàng thì làm bước đó trước. **Đừng thử tạo lệch số dư**: engine tự sửa hết. Dòng không in ngày cũng bị engine tự gỡ (`日付は前行と同じ`).
- Toạ độ dải là 0..1 **của ảnh hiện tại**; ảnh đã chỉnh sau khi quét (`sheet.scanned === false`) thì dải sai, nên ẩn dải và hiện cảnh báo "kết quả cũ" như `SheetViewer`.

#### Task 3.3 — Từ điển sửa lỗi học từ chỉnh sửa `Mặc định (gợi ý)` + `Tuỳ chọn (tự áp)` `M–L`
**Vì sao:** tên katakana là điểm yếu lớn nhất (60–95%). Khách kế toán quét sổ **của cùng một công ty hằng tháng**, nên tên đối tác lặp lại. 弥生 và STREAMED đều coi học từ chỉnh sửa là cốt lõi. Làm bằng code nên **$0 và không đụng cache**.

**Làm gì**
- Bảng SQLite `dict_entries(user_id, field, wrong_key, wrong, right, hits, created_at, updated_at, PRIMARY KEY(user_id, field, wrong_key))`. `wrong_key` = NFKC + bỏ khoảng trắng, **chỉ dùng để so khớp**; giá trị thay vào là đúng chữ người gõ (memory: giữ kana chữ to như sổ in, đừng "chuẩn hoá" chữ hiển thị).
- **Học**: khi người sửa `description` (hoặc `kind`) của một dòng máy có `orig[field]` khác rỗng và giá trị mới khác rỗng → `POST /api/dict/learn {field, wrong: orig, right: mới}` (gửi kèm lúc commit ô, không gửi theo từng phím). Cùng `wrong_key` thì cập nhật `right` và `hits+1`.
- **Gợi ý** (`dictMode: "suggest"`, mặc định):
  - frontend tải `GET /api/dict` một lần rồi tự so khớp trên client, nên học một cái là các dòng giống hệt **trong cùng sổ sáng lên ngay**;
  - chip "💡 カ）リタリコ" cạnh ô 摘要, bấm hoặc `Tab` để nhận;
  - ngay sau khi học thì hiện toast: "Đã nhớ: ｶ)ﾘﾀﾘｺ → カ）リタリコ · Áp dụng cho 6 dòng giống vậy?" [Áp dụng] [Không]. Đây là "áp hàng loạt" như STREAMED.
- **Tự áp** (`dictMode: "auto"`, tuỳ chọn): áp ngay khi nạp kết quả, ghi `orig` như sửa tay, cột 確認メモ/Excel ghi `辞書で補正`. Không bao giờ âm thầm.
- **Quản lý**: trong ⚙ → "Từ điển sửa lỗi": bảng sai → đúng, số lần dùng, xoá từng dòng, xoá hết.
- Quyền riêng tư: từ điển chứa tên đối tác (dữ liệu tài chính) → theo từng người dùng, xoá tài khoản là xoá hết.

**Xong khi:**
- pytest API: học / cập nhật / xoá / người khác không thấy.
- test TS cho so khớp: NFKC, khoảng trắng, không gợi ý khi đã đúng.
- E2E: sửa 摘要 một dòng sổ mẫu → dòng khác có cùng chữ hiện chip → bấm nhận.

**Bẫy:** đừng học khi người **xoá trắng** ô, hoặc khi `orig` rỗng (máy không đọc ra gì thì không có cặp sai→đúng).

#### Task 3.4 — Cỡ chữ lớn `Tuỳ chọn` `M`
**Vì sao:** WEB_PLAN §7.1 yêu cầu chữ 15–16px cho người lớn tuổi, hiện phần lớn là 10.5–13.5px. Nhưng người dùng khác quen giao diện gọn, nên để **tuỳ chọn**.

**Làm gì**
- Biến CSS `--fs` trên `<html>` (1 / 1.15 / 1.3) từ prefs; đặt sớm trong `themeScript` (`layout.tsx`) từ localStorage để không nháy.
- Codemod có kiểm soát: `text-[Npx]` → `text-[calc(Npx*var(--fs))]` trong `web/src`. Tailwind v4 nhận `calc()` trong giá trị tuỳ ý, không có khoảng trắng.
- **Không** dùng CSS `zoom` cho cả trang: khung ảnh tính toạ độ chuột (cắt, nắn 4 góc, kéo ảnh) bằng `getBoundingClientRect`, rất dễ lệch.
- Kiểm bố cục ở 1.3 trên 1366×768 và 375×812: không tràn ngang, bảng cuộn ngang được.

**Xong khi:** ảnh chụp 3 mức trên 2 cỡ màn hình; E2E vẫn xanh ở mức 1.3.

#### Task 3.5 — Bảng mượt khi có hàng trăm dòng `Mặc định` `S–M`
**Vì sao:** PDF 24 trang ≈ 400 dòng (PDF khách A có 405) × ~9 ô. Mỗi lần chọn dòng (`setSelRow`) cả bảng vẽ lại; máy yếu sẽ khựng.

**Làm gì**
- `React.memo` cho `Row` và `AccountCard`; các callback ổn định bằng `useCallback`; `pick` dùng selector theo dòng.
- CSS `content-visibility: auto; contain-intrinsic-size: auto 900px;` cho mỗi `section[data-sheet]` ở chế độ danh sách: bỏ qua vẽ phần ngoài màn hình, **DOM vẫn còn** nên phím mũi tên và bôi đen vẫn chạy.
- Đo bằng React Profiler hoặc `performance.now()`: thời gian từ bấm dòng tới khung vẽ xong, trước và sau, trên kết quả 24 mặt. Có thể tạo kết quả giả bằng script, không cần quét thật.

**Xong khi:** con số trước/sau ghi vào báo cáo; E2E xanh; bôi đen chép TSV xuyên 2 mặt sổ vẫn đúng.

---

### GIAI ĐOẠN 4 — Quét nhanh hơn & đọc lại chính xác

#### Task 4.1 — Quét song song `Mặc định (số luồng qua env)` `M`
**Làm gì**
- `extract.py.extract_transactions(..., workers=None)`: xử lý các đơn vị bằng `ThreadPoolExecutor`.
  - Số luồng lấy từ env `TSUCHO_SCAN_WORKERS`, **mặc định 1** vì bậc miễn phí dễ bị 429; khuyên 3 khi đã bật trả phí.
  - **Giữ đúng thứ tự** khi ghép kết quả (`source_unit = i`).
- **Giới hạn toàn cục** số lời gọi model đồng thời: `threading.BoundedSemaphore(TSUCHO_MAX_MODEL_CALLS, mặc định 4)` bao quanh `caller(...)`, không bao quanh việc đọc cache. Nhiều người quét cùng lúc cũng không vượt.
- Sự kiện: giữ `page` (bắt đầu một trang), thêm `page_done {index, cached, skipped}`. `core.scan` truyền `workers` xuống.
- Frontend `runScan`: trạng thái theo **từng index** từ `page` và `page_done`. Bỏ giả định "trang trước xong khi trang sau bắt đầu" (sai khi chạy song song).

**Xong khi:**
- test giả lập caller ngủ ngẫu nhiên, `workers=3`: thứ tự `accounts` đúng; đủ `page_done`; `PageSkipped` ở giữa vẫn được bỏ qua đúng.
- Đo trên 24 mặt **có sẵn cache** (không tốn tiền): không chậm hơn.
- Đo khi quét mới: **cần anh duyệt chi phí** (~$0.08 cho PDF 24 trang, hoặc hết 20 lượt miễn phí).

#### Task 4.2 — F5 vẫn theo dõi tiếp lần quét `Mặc định` `S`
**Làm gì:**
- `jobs.active_for(ws_id)` + `GET /api/ws/:id/jobs/active`.
- Frontend: sau khi nạp hồ sơ, nếu có job đang chạy thì đặt `scanning`, dựng lại trạng thái từng mặt, nối `listenEvents`. `jobs.stream` đã phát lại `_log` nên tiến độ hiện lại đủ.

**Xong khi:** E2E với caller giả chậm (cờ env chỉ dùng cho test): bắt đầu quét → F5 → vẫn thấy "Đang quét" → xong thì kết quả hiện.

#### Task 4.3 — Báo trước lượt quét / chi phí `Mặc định (dùng thử)` + `Tuỳ chọn (chi phí)` `S–M`
**Làm gì**
- `extract.py`: tách `_cache_key(data, rotate, model, prompt)`, **dùng chung** cho `_extract_single` và hàm mới `cache_status(paths) -> list[bool]`. Chỉ tính khoá, không gọi API.
- `POST /api/ws/:id/scan/estimate {sheet_ids}` → `{pages, cached, new, est_usd, demo_left}`. `est_usd` = số trang mới × giá trung bình theo `core.PRICES`, ghi rõ là ước tính.
- Nút Quét:
  - "Quét (5) · 3 có sẵn";
  - khi có trang mới và (`showCost` bật **hoặc** là tài khoản dùng thử) thì hỏi lại: "2 mặt sẽ gọi AI (≈ $0.01) · còn 4 lượt hôm nay".
- **Sửa công bằng hạn mức dùng thử**: `start_scan` chỉ trừ lượt cho trang **chưa có cache** (hiện đang trừ cả trang miễn phí).

**Xong khi:** pytest: khoá cache của `cache_status` trùng khoá `_extract_single` thật (so trên file mẫu với caller giả); tài khoản dùng thử quét trang đã cache không bị trừ lượt.

#### Task 4.4 — Đọc lại một dòng bằng ảnh cắt sát `Nút` `L`
**Vì sao:** cách rẻ nhất để đánh vào điểm yếu kana **mà không đổi prompt chính** (đổi là mất toàn bộ cache). Ảnh cắt đúng 1–3 dòng, phóng to, nên model nhìn rõ hơn nhiều so với cả trang; memory đã ghi "cắt riêng từng sổ là đòn lớn cho kana". Ảnh nhỏ nên **rẻ**, có thể dùng model mạnh hơn cho riêng việc này.

**Làm gì** (4 bước)
1. `extract.py`: tách hàm công khai `call_model(model, prompt, files, on_progress=None) -> (text, usage)` từ `_call_gemini/_call_claude`, **không đổi hành vi** quét chính. Test cũ phải xanh nguyên.
2. `api/reread.py` + prompt riêng `prompts/reread_prompt.txt`:
   - cắt `current.png` theo dải (±1 dòng, theo bề ngang giấy `x0..x1`), phóng sao cho mỗi dòng cao ≥ 80px, lưu JPEG;
   - prompt: "Dải ảnh chứa 1–3 dòng sổ. Tìm dòng có 出金 {O} / 入金 {I} / 残高 {B}. Trả JSON `{found, date_raw, kind, description, extra_text, store_code, amount_out, amount_in, balance, confidence}`";
   - chép nguyên các luật kana/dấu đục/tên pháp nhân từ prompt chính, **không sửa prompt chính**;
   - cache riêng `.cache/reread/` theo `sha256(ảnh cắt + prompt + model + phiên bản)`;
   - model: env `REREAD_MODEL`, mặc định = `EXTRACT_MODEL`.
3. `POST /api/ws/:ws/sheets/:sheet/reread {rid, band, known}` → `{suggestion, cost_usd, cached, model}`. Tài khoản dùng thử: giới hạn `TSUCHO_DEMO_REREAD_LIMIT` (mặc định 20/ngày).
4. Giao diện: nút「⟳ Đọc lại dòng này」trong chế độ soát nhanh và ở dòng cần soát. Kết quả hiện dạng **so sánh từng ô**:「摘要: ｶ)ﾘﾀﾘｺ → カ）リタリコ [Áp dụng]」. **Không bao giờ tự áp.** Áp xong ghi `orig` như sửa tay.

**Đo trước khi coi là xong** (bắt buộc theo feedback trong memory; **hỏi anh trước vì tốn lượt**):
- lấy 20 dòng 摘要 đọc sai đã biết từ các bộ có file chuẩn (p5-6, PDF khách A);
- đếm số dòng được sửa đúng, số dòng bị làm sai thêm, và chi phí thật;
- so `REREAD_MODEL` = flash-lite với một model mạnh hơn.
- **Báo cả kết quả xấu.** Nếu không cải thiện rõ thì để tính năng ở dạng thử nghiệm, không quảng cáo.

**Xong khi:** pytest với caller giả: cắt đúng vùng, cache trúng lần 2, hạn mức dùng thử, `found:false`. Có bảng đo thật đã được anh duyệt chi phí.

#### Task 4.5 — Quét lại trang bằng model mạnh hơn `Nút` `S`
**Chỉ làm khi** anh đặt `ESCALATE_MODEL` trong `.env`.
- Nút trong menu ⋯ của khung ảnh:「Quét lại kỹ bằng {model}」, kèm chi phí ước tính (4.3).
- `startScan` nhận `model`, `core.scan`/`extract_transactions` nhận `model=` ghi đè env.
- `ConfirmDialog` báo rõ: kết quả mới **thay** kết quả cũ của mặt này, các ô đã sửa tay trên mặt này sẽ mất.

---

### GIAI ĐOẠN 5 — Chỉnh ảnh thông minh (anh ưu tiên: làm ngay sau mốc demo A)

**Vì sao cả giai đoạn:**
- Ảnh vào tốt thì mọi thứ phía sau đều tốt hơn: model đọc đúng hơn, khung đỏ bám dòng chuẩn hơn, ít phải quét lại.
- Công cụ quét tài liệu hiện nay (Adobe Scan, trình quét có sẵn của điện thoại) **tự** tìm mép giấy, tự xoay, tự nắn; người chỉ xác nhận.
- App mình có bộ chỉnh tay rất đủ, nhưng bắt người tự làm hết từng bước.

**Nguyên tắc riêng của giai đoạn này**
1. **Máy đề xuất; người xem trước/sau rồi mới áp dụng.** Không tự sửa ảnh, trừ khi người bật tuỳ chọn trong ⚙.
2. **Mọi thứ chạy trên máy anh, $0, ảnh không gửi đi đâu**: OpenCV + model ONNX nhỏ chạy bằng CPU.
3. **Ảnh đổi thì phải quét lại mặt đó**, vì cache gắn với nội dung ảnh.
   - Mặt chưa quét: không mất gì.
   - Mặt đã quét: báo rõ "tốn 1 lượt quét lại".
   - Vì vậy giao diện **khuyến khích căn chỉnh TRƯỚC khi quét**.
4. **Dùng lại đường chỉnh ảnh sẵn có**: `workspace.rotate` / `perspective` / `adjust` / `split_at` (đã có tham số `snapshot` để hoàn tác). Không viết đường thứ hai.
5. Các bước **thử nghiệm** (làm phẳng trang cong, làm sạch nền, tách 2 sổ) **tắt sẵn**. Chỉ bật sẵn khi đo thấy có ích.

#### Task 5.0 — Nền chỉnh ảnh `S–M`
- Thêm `opencv-python-headless` vào `requirements.txt`. Máy anh đã có OpenCV 5.0; kiểm `pip show` xem là gói nào, rồi ghim phiên bản chạy được cả Python 3.12 trong Dockerfile.
- `api/imgjobs.py`: **một luồng chạy nền duy nhất** (hàng đợi) để phân tích ảnh sau khi tải lên (5.1 chất lượng, 5.3 hướng trang). Không chặn request tải lên.
  - Kết quả ghi vào `Sheet` (trường mới, tuỳ chọn: `quality`, `orient`), **dưới khoá hồ sơ** của task 2.1.
  - Nếu 2.1 chưa làm: làm trước phần khoá + ghi nguyên tử `meta.json` ở đây.
- `GET /api/ws/:id` đã trả `sheets`, nên giao diện tự thấy kết quả phân tích. Chỉ hỏi lại mỗi 3 giây **khi** còn mặt đang chờ phân tích.
- Biến `TSUCHO_LOCAL_OCR=0` tắt mọi phân tích dùng model (dành cho máy chủ ít RAM).
- Model:
  - `tools/tai-model.py` tải model vào `.models/` và kiểm SHA256;
  - thêm `.models/` vào `.gitignore`;
  - **hỏi anh trước khi tải** (tên, nguồn, dung lượng, giấy phép).

#### Task 5.1 — Kiểm tra chất lượng ảnh trước khi quét `Mặc định (chỉ hiện khi có vấn đề)` `M`
**Vì sao:** bậc miễn phí chỉ có 20 lượt/ngày. Quét một ảnh mờ là mất lượt mà kết quả vẫn tệ. Báo **trước** thì người chụp lại ngay.

**Làm gì**
- `api/imgcheck.py`: `assess(img) -> {blur, exposure, glare, small_text, issues: [...]}` (công thức ở Phụ lục A.3):
  - mờ: phương sai Laplacian trên vùng giấy, sau khi thu về bề ngang cố định 1200px để so được giữa các ảnh;
  - quá tối / cháy sáng: tỉ lệ điểm ảnh quá đen / quá trắng;
  - loá (đèn phản chiếu trên giấy bóng): vùng rất sáng, ít màu, đủ lớn, nằm trong trang;
  - chữ quá nhỏ: chiều cao dòng (lấy nhịp dòng từ `rowmap`) dưới ngưỡng.
- Giao diện:
  - huy hiệu trên thẻ mặt sổ ("⚠ Ảnh mờ", "⚠ Loá sáng"…) kèm mẹo 3 thứ tiếng, ví dụ "Chụp lại gần hơn, tránh đèn chiếu thẳng";
  - trước khi quét, nếu có mặt ảnh kém, hỏi: "2 mặt có ảnh kém — quét vẫn tốn lượt nhưng dễ đọc sai. Vẫn quét?" [Vẫn quét] [Để tôi chụp lại].
- **Ngưỡng chốt bằng đo** trên ảnh thật trong `input/` ($0):
  - dùng cặp đã biết trong `input/通帳2/`: `S__35774551` (rõ) và `S__35774555_0` (mờ);
  - các bản scan PDF phải **không** bị báo;
  - ghi bảng kết quả vào báo cáo.

**Xong khi:** ảnh mờ đã biết bị báo, không bản scan nào bị báo nhầm. Có pytest cho từng chỉ số trên ảnh tổng hợp (làm mờ Gaussian, giảm sáng, chấm loá).

#### Task 5.2 — Tự tìm mép giấy (4 góc) `Nút` `M`
**Làm gì**
- `api/pagequad.py` (OpenCV, cách làm ở Phụ lục A.1):
  - hai cách sinh ứng viên: theo cạnh (Canny) và theo vùng giấy sáng;
  - chấm điểm theo diện tích, độ vuông góc, độ tương phản dọc mép;
  - trả `{quad (0..1, TL→TR→BR→BL), confidence, method}`, hoặc `null`.
- `GET /api/ws/:ws/sheets/:sheet/pagequad`.
- Giao diện: trong chế độ nắn (`SheetViewer`), nút「✨ Tự tìm 4 góc」đặt sẵn 4 tay nắm. Người vẫn kéo chỉnh được, rồi bấm Áp dụng như cũ. Không tìm được thì báo "Không tự tìm được mép giấy — hãy kéo tay".
- **Không dùng DocAligner**: nó tự tải model từ máy chủ của họ lúc chạy, và giấy phép chưa rõ. Chỉ xem lại nếu cách OpenCV thành công dưới 80% trên ảnh thật.

**Xong khi:**
- pytest trên ảnh tổng hợp (trang trắng méo phối cảnh trên nền gỗ/nhiễu, có bóng loang): góc lệch ≤ 2% cạnh ảnh;
- trên ảnh chụp thật trong `input/通帳2/`: báo tỉ lệ thành công, kèm **một tấm ảnh ghép** (contact sheet) vẽ tứ giác tìm được. Tấm ảnh lưu ở thư mục tạm để anh xem, **không commit**.

#### Task 5.3 — Tự nhận hướng trang 0°/90°/180°/270° `Mặc định (gợi ý)` + `Tuỳ chọn (tự xoay)` `M`
**Vì sao:**
- PDF khách A (24 trang) lộn ngược 180°, đọc rất tệ.
- Ảnh chụp điện thoại hay nằm ngang.
- Thuật toán ảnh thường không phân biệt được 0° với 180°, vì phải đọc chữ mới biết. Đây đúng là chỗ `autofix.py` đã thua.

**Làm gì**
- `api/orient.py`, hai tầng:
  1. **Chính**: model phân loại hướng tài liệu **PP-LCNet_x1_0_doc_ori**.
     - PaddlePaddle, giấy phép Apache-2.0, ~7MB, 4 lớp 0/90/180/270, độ đúng công bố 99.06%.
     - Bản ONNX `PaddlePaddle/PP-LCNet_x1_0_doc_ori_onnx` trên Hugging Face, chạy bằng `onnxruntime` (đã có sẵn nhờ RapidOCR).
     - Tiền xử lý **đọc đúng từ `inference.yml` đi kèm model**, không đoán (Phụ lục A.4).
  2. **Dự phòng** khi không có model: chạy RapidOCR (`use_cls=False`) ở 0° và 180°, so điểm nhận dạng trung bình. Cách này chỉ phát hiện được 180°.
- Chạy nền sau khi tải lên (hàng đợi của 5.0), lưu `Sheet.orient = {angle, score, method}`.
- Giao diện:
  - huy hiệu "↻ có vẻ nằm ngang" / "↕ có vẻ lộn ngược";
  - dải trong khung ảnh "Trang này có vẻ bị lộn ngược — [Xoay 180°]";
  - nhiều trang cùng lỗi: dải ở đầu cột trái "8 trang có vẻ lộn ngược — [Xoay tất cả]";
  - tuỳ chọn `autoRotate` (⚙, tắt sẵn): tự xoay ngay, **chỉ với mặt chưa quét** và khi `score` cao.
- **Kiểm chiều quay bằng ảnh tổng hợp trước khi tin nhãn**: lấy một trang thẳng, xoay 90° theo chiều kim đồng hồ, xem model trả nhãn nào và phải xoay ngược bao nhiêu thì về thẳng. Viết thành test.

**Đo ($0):** trang PDF khách A (180°), ảnh `通帳2` (nhiều ảnh 90°), bản scan (0°) → ma trận nhầm lẫn, thời gian mỗi trang, RSS đỉnh.

**Xong khi:** ≥ 98% đúng trên bộ đo và **không trang thẳng nào bị gợi ý xoay** (gợi ý sai phiền hơn bỏ sót). Không đạt thì nói thật và để ở dạng thử nghiệm.

#### Task 5.4 — ✨ Tự căn chỉnh một chạm, có xem trước `Nút` `L`
Đây là tính năng "wow" của giai đoạn: **một nút → máy đề xuất cả chuỗi chỉnh → người kéo thanh so trước/sau → Áp dụng.**

**Backend** (`api/smartfix.py`, chia 2 commit)
1. `POST /api/ws/:ws/sheets/:sheet/smartfix/preview` chạy lần lượt các bước trên ảnh thu nhỏ:

   | Bước | Nguồn | Bật sẵn? |
   |---|---|---|
   | `rotate` 90/180/270 | 5.3 | Có, nếu `score` cao |
   | `warp` (4 góc + điểm giữa cạnh) | 5.2 | Có, nếu `confidence` cao |
   | `deskew` (vài độ) | đo độ nghiêng còn lại sau khi nắn (dùng lại `rowmap`) | Có, nếu \|góc\| ≥ 0.3° |
   | `dewarp` làm phẳng trang cong | `uvdoc-onnx` (MIT, 214KB, CPU < 1s) — **thử nghiệm** | **Không** |
   | `clean` làm sạch nền/bóng | chia ảnh cho nền ước lượng (Phụ lục A.2) — **thử nghiệm** | **Không** |
   | `split` tách 2 sổ trong 1 ảnh | dò rãnh trắng dọc của `autofix.py` — **thử nghiệm** | **Không** (xem ghi chú) |

   Trả về `{steps: [{kind, params, default_on, confidence}], preview: <JPEG ≤1200px>, warnings}`.
2. `POST .../smartfix/apply {steps}`:
   - áp **đúng các bước và tham số đã xem trước**, không dò lại (thấy sao được vậy);
   - chạy ở độ phân giải đầy đủ, với **một lần chụp hoàn tác** cho cả chuỗi;
   - cập nhật `rotation/warped/adjusted`, `sha256`, `scanned=false`.

Lưu ý:
- `dewarp` chỉ chạy **sau** khi đã nắn phối cảnh (trang đầy khung), vì `uvdoc-onnx` ép ảnh về 488×712. Không dùng trên ảnh chưa cắt.
- Thiếu model hoặc `TSUCHO_LOCAL_OCR=0` thì bỏ bước đó, không báo lỗi.

**Giao diện**
- Nút「✨ Tự căn chỉnh」trên thanh công cụ khung ảnh.
- Bảng xem trước:
  - ảnh có **thanh kéo so sánh trước/sau** (kéo vạch giữa sang trái/phải);
  - danh sách các bước, mỗi bước có công tắc; bước thử nghiệm ghi "(thử nghiệm)";
  - nếu mặt đã quét: dòng cảnh báo "Áp dụng thì kết quả cũ không còn khớp — phải quét lại mặt này (tốn 1 lượt)";
  - [Áp dụng] [Huỷ].
- **Nhiều mặt**: đang tick N mặt thì nút thành「✨ Tự căn chỉnh N mặt」→ lưới ảnh nhỏ trước/sau, mỗi mặt có ô tick → [Áp dụng cho các mặt đã tick]. PDF 24 trang lộn ngược chỉ cần một lần bấm.
- Tuỳ chọn `autoFixOnUpload` (⚙, tắt sẵn; cần task 3.1): ảnh mới tải lên tự chạy các bước **bật sẵn** (không bao giờ chạy bước thử nghiệm); thẻ mặt sổ ghi "đã tự căn chỉnh — bấm để xem lại".

⚠ **Ghi chú về "tách 2 sổ"**: anh từng gỡ thanh「Cắt nhanh / Tách 2 sổ」vì thấy không cần. Ở đây nó chỉ là **một bước tắt sẵn** trong bảng xem trước, không có thanh nào tự hiện ra. Anh không muốn thì bỏ hẳn bước này.

**Đo hiệu quả với model** (hỏi anh trước, vì tốn lượt miễn phí):
- mẫu đo: 4 trang PDF khách A lộn ngược + 4 ảnh `通帳2` chụp chếch;
- "trước" lấy từ cache ($0); "sau" quét mới: 8 lượt, khoảng nửa hạn mức một ngày;
- so bằng `eval.py` với file chuẩn nếu có; báo cả trường hợp xấu đi;
- bước thử nghiệm chỉ được bật sẵn khi đo thấy có ích.

**Xong khi:**
- pytest cho preview/apply: tham số áp đúng như lúc xem trước; hoàn tác một lần là về đúng ảnh gốc; mặt đã quét bị đánh dấu `scanned=false`;
- E2E: xoay sổ mẫu 180° → bấm ✨ → máy gợi ý xoay 180° → Áp dụng → ảnh thẳng.

#### Task 5.5 — Kính lúp + giữ để xem ảnh gốc `Nút` `S`
- **Kính lúp** (nút 🔍 trên thanh phóng to, hoặc giữ phím `Alt`):
  - vòng tròn ~180px đi theo con trỏ, phóng 2.5×; cách làm ở Phụ lục A.6: một div tròn lấy chính ảnh làm nền;
  - ẩn khi đang cắt/nắn;
  - giúp người lớn tuổi đối chiếu chữ kana mà không phải phóng cả trang.
- **Giữ để xem ảnh gốc**: khi đang kéo thanh sáng/tương phản/nghiêng (xem trước bằng CSS), thêm nút「Giữ để xem ảnh gốc」. Giữ chuột thì bỏ hiệu ứng, thả ra thì hiện lại. Đơn giản hơn thanh kéo so sánh, dễ dùng cho người lớn tuổi.

#### Task 5.6 — Ảnh tải nhanh hơn `Mặc định` `S`
**Vì sao:**
- Khung xem đang tải `current.png` 2600px (vài MB) với `Cache-Control: no-cache`, nên lần nào cũng hỏi lại máy chủ.
- Sau này nếu đặt máy chủ xa Nhật, người dùng ở Nhật sẽ chờ lâu.

**Làm gì**
- Sinh thêm `view.jpg` (q=85) cạnh `current.png` trong `_write_sheet_images` / `_regen_current`; thiếu thì tạo khi được hỏi lần đầu. Thumbnail cũng chuyển sang JPEG.
- Route ảnh: nếu tham số `v` khớp sha hiện tại → `Cache-Control: private, max-age=31536000, immutable`; lệch → `no-cache`.
- **Giữ** `current.png` cho rowmap/rowanchors/cắt/nắn/phân tích ảnh, vì các thuật toán cần ảnh không nén.

**Xong khi:** đo dung lượng và thời gian tải một mặt sổ trước/sau (`read_network_requests`); E2E xanh.

#### Task 5.7 — Chụp bằng điện thoại qua mã QR `Nút` `L`
**Vì sao:** sổ là giấy, người dùng chụp bằng điện thoại. Hiện phải chuyển ảnh sang máy tính rồi mới kéo vào. Mẫu hiện đại (kiểu WhatsApp Web): **máy tính hiện mã QR → điện thoại quét → chụp → ảnh hiện ngay trên máy tính**. Cộng thêm 5.4 (tự căn chỉnh) là thành một "máy quét tài liệu" ngay trên web.

**Làm gì** (4 bước)
1. Backend:
   - bảng `phone_links(token_hash, user_id, ws_id, expires_at, uploads, max_uploads)`;
   - `POST /api/ws/:id/phone-link` → `{url, expires_at, qr_svg}`. Token 32 byte, lưu dạng **băm**, hạn 30 phút, tối đa 100 ảnh;
   - QR tạo bằng `segno` (thuần Python, nhỏ, xuất SVG). Báo khi thêm thư viện.
2. `POST /api/phone/upload`:
   - xác thực bằng header `X-Phone-Token`; **chỉ tải lên được**, không đọc được gì;
   - dùng lại `workspace.add_upload`, chạy dưới khoá hồ sơ.

   Thêm `GET /api/phone/info` (tên hồ sơ, hạn, số ảnh đã nhận) và `DELETE /api/ws/:id/phone-link` để thu hồi.
3. Trang điện thoại `web/src/app/m/page.tsx`:
   - token đặt ở **`#t=...` (fragment)** nên không lọt vào log máy chủ; JS đọc rồi gửi qua header;
   - nút lớn「📷 Chụp trang sổ」(`<input type=file accept="image/*" capture="environment" multiple>`);
   - thu ảnh ngay trên điện thoại về 2600px JPEG q=0.9 trước khi gửi;
   - danh sách ảnh đã gửi; ngôn ngữ theo trình duyệt.
4. Máy tính: nút「📱 Chụp bằng điện thoại」trong `DropZone` → hộp thoại QR + đếm ngược + số ảnh đã nhận (hỏi `GET /api/ws/:id` mỗi 3 giây khi hộp đang mở). Mặt sổ mới hiện ở cột trái.
- URL gốc: lấy `TSUCHO_PUBLIC_URL`; không có thì suy từ request. Chỉ tin `X-Forwarded-*` khi `TSUCHO_TRUST_PROXY=1`, giống `auth.client_ip`.

**Xong khi:** có pytest cho:
- token hết hạn → 401;
- sai hồ sơ;
- quá số ảnh;
- token **không** đọc được `GET /api/ws/...`;
- thu hồi.

Test **tự quét mọi route** trong `tests/test_api_auth.py` sẽ báo đỏ vì `/api/phone/*` không dùng cookie. Chỉ thêm **đúng** các route đó vào danh sách công khai của test, kèm một test chứng minh chúng đòi token.

**Thử trên máy anh (chưa deploy):**
- Điện thoại và máy tính phải cùng Wi-Fi.
- Chế độ dev **không dùng được từ điện thoại**: web cổng 3000 gọi API ở `localhost:8000`, mà "localhost" trên điện thoại là chính cái điện thoại.
- Phải chạy kiểu "một dịch vụ":
  1. `npm run build`;
  2. `uvicorn api.main:app --host 0.0.0.0 --port 8000` với `TSUCHO_PUBLIC_URL=http://<IP-LAN>:8000`. Log dev hiện IP LAN của máy anh là `192.168.11.2`; kiểm lại vì IP có thể đổi;
  3. cho phép cổng 8000 qua Windows Firewall khi được hỏi.
- Sonnet chuẩn bị sẵn cấu hình `phone` trong `.claude/launch.json` để anh không phải gõ lệnh, và ghi cách làm vào `CHAY_WEB.md`.

---

### GIAI ĐOẠN 6 — Chế độ kế toán 仕訳 `Tuỳ chọn` (có cổng quyết định)

**6.0 Cổng.** Hỏi anh, hoặc anh hỏi giám đốc Nhật: **khách dùng phần mềm kế toán nào** (弥生 / freee / マネーフォワード / 勘定奉行 / không dùng), và có muốn nhận **仕訳** thay vì bảng 通帳 không.
- **Không dùng** → **bỏ cả giai đoạn**: đó là tính năng nặng mà không ai cần.
- Có → làm phần mềm khách dùng trước.

Lý do có giai đoạn này: mọi đối thủ bán hàng bằng 仕訳 (STREAMED, KEEPER Club, 弥生). Nhưng mục tiêu gốc của dự án là "Excel cho người lớn tuổi", nên không mặc định.

#### Task 6.1 — Cột 勘定科目 + quy tắc học được `L`
- Chỉ hiện khi `accountingMode` bật.
- Mỗi dòng thêm `acct` (勘定科目), `sub_acct`, `tax` (税区分, **mặc định để trống** vì không suy được từ sổ).
- Phía tài khoản ngân hàng cố định: `普通預金` + 補助科目 = "{銀行} {口座番号}" (sửa được trong ⚙).
- Không có quy tắc thì đối ứng mặc định giống STREAMED: `仮払金` (tiền ra) / `仮受金` (tiền vào), sửa được.
- Quy tắc: bảng `acct_rules(user_id, keyword, match: contains|prefix|exact, direction: in|out|any, account, sub_account, tax, priority)`.
  - Người đặt 勘定科目 cho một dòng → hỏi "Nhớ cho các dòng「{摘要}」?" → tạo quy tắc + áp hàng loạt.
  - Quản lý trong ⚙: sắp thứ tự ưu tiên, sửa, xoá.
- **Bộ quy tắc mẫu** (利息→受取利息, 手数料→支払手数料, 給与→給料手当, 電気/ガス/水道→水道光熱費, 税→租税公課…): chỉ thêm khi người bấm「Thêm bộ quy tắc mẫu」, **không tự nạp**.

#### Task 6.2 — Xuất cho phần mềm kế toán `M–L`
| Phần mềm | Quy cách đã tra (phải kiểm lại với tài liệu chính thức lúc làm) |
|---|---|
| **弥生会計** | CSV **25 cột** (hoặc 27 với 取引先名), **Shift-JIS (CP932)**. Cột 1 識別フラグ = `2000` (một dòng một 仕訳). 取引日付 `YYYY/MM/DD` (nhận cả 和暦). 借方/貸方勘定科目 ≤10 ký tự. 補助科目 ≤15. 金額 số nguyên ≤9 chữ số, không âm. 摘要 ≤30 ký tự (thừa bị cắt). Nguồn: support.yayoi-kk.co.jp (インポートデータの記述形式). **Trang đã tra là bản やよいの青色申告 オンライン; bản 弥生会計 desktop có thể khác độ dài cột, phải đối chiếu đúng bản khách dùng.** |
| **マネーフォワード クラウド会計** | Nhập 仕訳帳: 取引No, 取引日 `yyyy/MM/dd`, 借方/貸方 勘定科目・補助科目・税区分・金額, 摘要 ≤200… **Tên 勘定科目 phải trùng với trong phần mềm.** Trang đã tra là bản "会計Plus", nên phải kiểm lại cột của bản thường. |
| **freee** | Dùng **file mẫu chính thức** tải từ trợ giúp freee (「取引・口座振替のインポート」hoặc「エクセルインポート」), rồi khớp đúng cột. Trang trợ giúp chặn máy đọc tự động, nên phải tải file mẫu bằng tay. |
| Chung | CSV 仕訳 UTF-8 BOM (ngày, 借方, 貸方, 金額, 摘要) cho phần mềm khác |

- Ký tự không có trong CP932 (①, ㈱, một số kanji hiếm): thay bằng ký tự tương đương hoặc `?`, và **báo danh sách dòng bị đổi**.
- **Sonnet không tự kiểm được việc nhập vào phần mềm thật.** Phải sinh file mẫu từ sổ mẫu và đưa anh (hoặc khách) nhập thử vào bản dùng thử của phần mềm, rồi sửa theo lỗi nhận được. Ghi rõ giới hạn này trong báo cáo.

---

### GIAI ĐOẠN 7 — Vận hành, bản gọn (làm sau theo ưu tiên của anh)

| Task | Nội dung | Cỡ |
|---|---|---|
| 7.1 | **Đổi mật khẩu** (trong ⚙). **Mã đăng ký** qua env `TSUCHO_SIGNUP_CODE`: có đặt thì đăng ký phải nhập mã; không đặt thì như cũ | S |
| 7.2 | **Admin gọn** (role `admin` đã có sẵn cột): danh sách người dùng, khoá/mở, đặt lại mật khẩu (sinh mật khẩu tạm), lượt quét và chi phí theo ngày (bảng `scan_log` ghi ở `jobs._run`) | M |
| 7.3 | **Nhật ký thao tác** (`events`: đăng nhập, tải lên, quét, xuất, xoá), ai / lúc nào / hồ sơ nào. Chỉ admin xem | S–M |
| 7.4 | **Tự xoá dữ liệu** sau N ngày không hoạt động (env `TSUCHO_RETENTION_DAYS`, mặc định tắt). Cảnh báo trên danh sách hồ sơ 7 ngày trước khi xoá | M |
| 7.5 | Trang **"データの取り扱い / Dữ liệu của bạn đi đâu"** 3 thứ tiếng (nội dung có sẵn ở `TRIEN_KHAI.md` bước 0b) | S |

---

## 6. Những thứ KHÔNG làm (và vì sao)

| Không làm | Vì sao |
|---|---|
| Xin toạ độ (bbox) từng dòng từ model | Đổi prompt chính = mất toàn bộ cache = tốn tiền quét lại tất cả. `rowanchors` (OCR cục bộ) đã cho vị trí khớp theo nội dung với $0 |
| Bôi đen chữ trên ảnh như PDF | Cần toạ độ từng ký tự (memory: "đừng hứa lại tính năng này") |
| Hỏi đáp AI trên số liệu ("tháng 3 trả tiền điện bao nhiêu?") | Tốn tiền mỗi câu hỏi, rủi ro riêng tư; lọc trong app + Excel đã đủ |
| Hai model đọc chéo **mọi trang** | Gấp đôi chi phí; đọc lại **có chọn lọc** (4.4) đạt phần lớn lợi ích |
| Đổ dòng chưa kiểm vào bảng trong lúc quét | Phức tạp (engine kiểm theo cả lô); quét song song (4.1) đã rút thời gian chờ. Xem lại nếu người dùng than chờ lâu |
| Cộng tác thời gian thực / app điện thoại riêng / offline | Chưa có ai cần; trang tải ảnh bằng QR (5.7) đã đủ cho điện thoại |
| Biểu đồ phân tích | Kế toán phân tích trong phần mềm kế toán, không phải việc của app này |
| Bật lại thanh「Cắt nhanh / Tách 2 sổ」tự hiện ra | Anh đã gỡ (memory). Tách 2 sổ chỉ còn là một bước **tắt sẵn** trong bảng ✨ Tự căn chỉnh (5.4) |
| DocAligner (model tìm 4 góc) | Tự tải model từ máy chủ của hãng lúc chạy, giấy phép chưa rõ. Dùng OpenCV trước (5.2); chỉ xem lại nếu thành công dưới 80% |
| Tự sửa ảnh ngay khi tải lên (mặc định) | Trái nguyên tắc "máy chỉ đề xuất". Chỉ có dạng tuỳ chọn `autoFixOnUpload`, tắt sẵn |

---

## 7. Câu hỏi còn mở, và câu trả lời của anh (30/09)

| Câu hỏi | Trả lời | Hệ quả cho kế hoạch |
|---|---|---|
| Đã bật trả phí Gemini chưa? | **Chưa**, vẫn bậc miễn phí | `TSUCHO_SCAN_WORKERS=1`; quét song song (4.1) để cuối. Mọi phép đo có gọi model phải gói trong ≤ 20 lượt/ngày và hỏi trước |
| Render gói nào, tự deploy từ nhánh nào? | Chưa quan tâm: **thử trên máy trước**, máy chủ tốt hơn tính sau | Không push, không deploy. Đo RAM ở 0.1 để dành cho lúc chọn máy chủ |
| Khách dùng phần mềm kế toán nào? | Chưa biết | Giai đoạn 6 **đóng**. Câu hỏi soạn sẵn để anh gửi khách Nhật (bên dưới) |
| Xoá `api/exporter.py`? | Không chắc | **Giữ nguyên** (0.3-5) |
| (4.4) Duyệt chi phí đo đọc lại dòng | Hỏi lại khi tới task | ~20–40 lời gọi nhỏ; ở bậc miễn phí thì chia 2–3 ngày |

**Câu hỏi gửi khách Nhật (khi tiện):**
> 普段お使いの会計ソフトはありますか？（弥生会計・freee・マネーフォワード・勘定奉行・その他・使っていない）
> 通帳の明細を、Excel ではなく会計ソフトに取り込める「仕訳データ」で受け取れると便利でしょうか？

### 7b. Trước khi đưa khách Nhật dùng thử (chưa làm bây giờ; ghi lại để khỏi quên)

1. **Dữ liệu thật + bậc miễn phí:** Google có thể dùng dữ liệu gửi qua API miễn phí để cải thiện sản phẩm (xem `TRIEN_KHAI.md` bước 0). Sổ **thật** của khách thì phải bật trả phí trước. Chưa bật thì chỉ dùng sổ mẫu hoặc ảnh anh được phép dùng.
2. **Cách khách Nhật vào được app:**
   - ngắn hạn: mở từ máy anh qua đường hầm miễn phí (Cloudflare Tunnel), máy anh phải bật;
   - lâu dài: máy chủ có ổ đĩa bền, RAM ≥ 1GB vì có OCR cục bộ.

   Quyết định sau.
3. Đã xong **0.3** (giao diện tự ra tiếng Nhật) và **1.4** (Excel chú thích tiếng Nhật, có 確認済).
4. Tạo sẵn tài khoản cho khách Nhật, và thử toàn bộ luồng trên máy khác.

---

## 8. Kiểm tra cuối mỗi giai đoạn (trước khi báo "xong giai đoạn")

- Đủ 4 lệnh kiểm tra (mục 3) xanh; số test tăng đúng như các task đã thêm.
- **Anh tự thử** theo các bước ghi trong từng task, trên dữ liệu thật trong `input/` (cache sẵn nên $0 nếu không chỉnh ảnh).
- Cập nhật `docs/WEB_PLAN.md` (đánh ✅ + ngày vào mục tương ứng) và `docs/CHAY_WEB.md` (cách chạy mới, biến env mới).
- Cập nhật memory dự án: điều gì đã làm, bài học mới, số đo.

---

## 9. Theo dõi tiến độ

**Mốc đo:** pytest **180 passed** (30/09, sau khi pull `66fa934`) · build **xanh** (`npm ci` 14 s, `npm run build` 11 s) · rowmap POST lần đầu **2.5 s**, lần sau **0.1 s** (cùng mặt sổ, đã cache; mặt sổ khác vẫn 2.5 s) · RSS đỉnh khi OCR **462 MB** (bản giống Render; lúc khởi động 117 MB). Bảng đầy đủ + các phát hiện: "Ghi chú khi làm" bên dưới.

**Mốc hiện tại (cập nhật sau mỗi task; task sau so với dòng này):** sau 1.2 (03/10) — pytest **320 passed** · `npm test` **94 pass** · build xanh · E2E `smoke.py` **11/11 bước** (~15 s).

- [x] 0.1 Đồng bộ nhánh, đo mốc (xong 30/09/2026)
- [x] 0.2 Lưới an toàn kiểm thử (xong 30/09/2026)
- [x] 0.3 Năm sửa lỗi nhỏ (xong 03/10/2026)
- [x] 1.1 Danh tính dòng + giá trị máy đọc (xong 03/10/2026)
- [x] 1.2 Một định nghĩa "cần soát" (xong 03/10/2026)
- [ ] 1.3 ✓ Đã soát
- [ ] 1.4 Excel/CSV 確認済 + tiếng Nhật — **mốc demo A**
- [ ] 1.5 Lý do dễ hiểu + gợi ý sửa
- [ ] 1.6 Nối số dư giữa các mặt
- [ ] 1.7 Ảnh chụp trùng trang
- [ ] 2.1 Backend hồ sơ
- [ ] 2.2 Trang hồ sơ
- [ ] 2.3 Sửa thông tin sổ
- [ ] 2.4 Xuất theo tài khoản
- [ ] 3.1 Cài đặt người dùng
- [ ] 3.2 Chế độ soát nhanh — **mốc demo B**
- [ ] 3.3 Từ điển sửa lỗi
- [ ] 3.4 Cỡ chữ lớn
- [ ] 3.5 Bảng mượt
- [ ] 4.1 Quét song song
- [ ] 4.2 F5 theo dõi tiếp
- [ ] 4.3 Báo trước lượt/chi phí
- [ ] 4.4 Đọc lại một dòng
- [ ] 4.5 Quét lại bằng model mạnh
- [ ] 5.0 Nền chỉnh ảnh (OpenCV, hàng đợi nền, tải model)
- [ ] 5.1 Kiểm tra chất lượng ảnh trước khi quét
- [ ] 5.2 Tự tìm mép giấy
- [ ] 5.3 Tự nhận hướng trang
- [ ] 5.4 ✨ Tự căn chỉnh một chạm — **mốc demo C**
- [ ] 5.5 Kính lúp + giữ để xem ảnh gốc
- [ ] 5.6 Ảnh tải nhanh
- [ ] 5.7 Chụp bằng điện thoại
- [ ] 6.0 Cổng kế toán → 6.1 → 6.2
- [ ] 7.x Vận hành

### Ghi chú khi làm

**Task 0.1 — xong 30/09/2026 (Sonnet 5.5).** Nhánh `nang-cap-10-2026`. `npm ci` 14 s (47 gói), `npm run build` 11 s, xanh, sinh 3 trang (`/`, `/login`, `/_not-found`).

Đo RAM bằng `python tests/e2e/do_ram_rowmap.py --server-python .venv/Scripts/python.exe on tess off` (sổ mẫu, $0, thư mục dữ liệu tạm, Windows 11, RSS = working set do psutil đọc). **Khi chọn máy chủ, chạy lại đúng script này trên máy đó** rồi so với bảng.

| Cấu hình | Khởi động | POST lần 1 | Cùng mặt, lần 2 | Mặt khác | RSS đỉnh | Còn lại sau | Dòng khớp nội dung (mặt 1 · mặt 2) |
|---|---|---|---|---|---|---|---|
| **Giống Render** (Python 3.12, RapidOCR 1.4.4 + Tesseract) | 117 MB | 2.5–2.6 s | 0.06–0.12 s | 2.4–2.6 s | **462 MB** | 188–193 MB | 11/12 · 6/8 |
| Chỉ Tesseract (không cài RapidOCR) | 117 MB | 2.5 s | 0.1 s | 2.3 s | 145 MB | 125 MB | 11/12 · 6/8 |
| Tắt OCR (`TSUCHO_LOCAL_OCR=0`) | 117 MB | 0.1 s | 0.06 s | 0.06 s | 139 MB | 119 MB | 0/12 · 0/8 (chỉ ước lượng) |
| Máy anh đang chạy (Python 3.14, RapidOCR 1.2.3) | 124 MB | 2.7 s | 0.4 s | 2.6 s | 485 MB | 202–212 MB | 11/12 · 6/8 |

Phát hiện khi đo (không sửa trong task này, chờ anh quyết):
1. **Trên máy anh, RapidOCR hỏng âm thầm.** Python 3.14 chỉ cài được `rapidocr_onnxruntime` 1.2.3 (bản 1.4.4 đòi Python < 3.13). Bản 1.2.3 trả điểm tin cậy dạng *chữ*, nên `api/rowanchors.py:40` (`score < .85`) ném `TypeError` ở mỗi lần gọi; `locate()` nuốt lỗi. Tesseract vẫn đọc được nên kết quả vẫn "ready". Vậy trên localhost hiện chỉ Tesseract làm việc, RapidOCR chỉ tốn RAM và tốn 0.3 s mỗi lần (không cache được vì lần nào cũng lỗi). Bản Docker/Render (Python 3.12 + 1.4.4, trả số thực) và `.venv` của repo không dính.
2. **RapidOCR đắt mà chưa thấy lợi.** Đỉnh 462 MB so với 145 MB (+317 MB), giữ thêm ~65 MB sau khi xong, không khớp thêm dòng nào và không nhanh hơn (thời gian nằm ở Tesseract, ~2.4 s mỗi mặt sổ mới). Lưu ý: chỉ đo trên sổ mẫu vẽ sạch, **chưa đo ảnh chụp thật**; chưa đủ để nói RapidOCR vô ích với ảnh thật.
3. **Máy chủ 512 MB không đủ** với cấu hình giống Render (462 MB đỉnh của riêng tiến trình, chưa kể Tesseract chạy con): dễ lặp lại lỗi 502 của commit `aa71757`. Đường ra: máy ≥ 1 GB (đúng như mục 7b), hoặc `TSUCHO_LOCAL_OCR=0` (mất khung đỏ bám dòng chính xác), hoặc thêm công tắc tắt RIÊNG RapidOCR (giữ Tesseract, đỉnh ~145 MB) — **chưa làm**, cần anh duyệt.
4. `locate()` ghi đè `ocr_status="failed"` bằng `"ready"` khi một bộ đọc khác thành công ⇒ lỗi của một bộ đọc bị che (chính là lý do phát hiện 1 không ai thấy).
5. `npm audit` báo 4 lỗ hổng (1 nghiêm trọng, 3 cao), gốc ở `next` 16.2.12: bản vá là ≥ 16.3.3 ([GHSA-p293-qw3h-jr36](https://github.com/advisories/GHSA-p293-qw3h-jr36): lỗi đi ngược thư mục, cho chạy mã từ xa không cần đăng nhập trên máy chủ Windows). Bản deploy chỉ là file tĩnh do FastAPI phục vụ (không chạy máy chủ Next) nhưng `npm run dev` trên máy anh thì có; trang cảnh báo không nói rõ máy chủ dev có bị không. **Chưa nâng** vì đổi thư viện phải hỏi trước.

Thêm ngoài kế hoạch (nhỏ): script đo lưu trong repo (`tests/e2e/do_ram_rowmap.py`, cần `pip install psutil httpx`, không thuộc `requirements.txt`). Task 0.1 có **2 commit** thay vì 1 vì bước 2 yêu cầu commit riêng hai file kế hoạch trước khi đo.

**Task 0.2 — xong 30/09/2026.** Bốn lệnh kiểm tra (mục 3) đều xanh: pytest **191 passed** (180 + 11 mới), `npm test` **6 pass**, `npm run build` xanh, `tests/e2e/smoke.py` **6/6 bước** (~8 s). Không lệnh nào gọi Gemini; giờ sửa của `.data/app.db` không đổi sau khi chạy.
- `TSUCHO_DATA_DIR` (`api/workspace.py`) + `tests/test_data_dir.py` (3 test, chạy tiến trình con vì biến chỉ được đọc lúc import). Ghi vào `CHAY_WEB.md` cùng 4 lệnh kiểm tra và cách viết thêm test TS.
- Từ điển tách thành `web/src/lib/dict.ts` (DICT, LANGS, Lang, LANG_LABEL, Dict; dữ liệu thuần); `i18n.tsx` import lại và re-export nên mọi `import ... from "@/lib/i18n"` cũ chạy nguyên. Đã kiểm thân DICT giống hệt bản gốc (836 dòng) và grep lại `LangCtx`, `KEY`, `LangProvider`, `useT`, `localStorage`, `documentElement.lang` còn đủ (bài học `025d8dc`).
- `dict.test.ts` (6 test): đúng ba ngôn ngữ như `LANGS`; tiếng Việt ≥ 200 mục (chặn xanh giả khi import hỏng); en/ja cùng khoá và cùng kiểu với vi (hàm phải cùng số tham số); hàm dịch không trả `undefined`/`NaN`; không chuỗi rỗng, trừ `ja.colGloss` (cố ý để trống). Cố ý xoá `ja.trySample` thì test đỏ đúng chỗ (`thieu: ['trySample']`), đã trả lại.
- E2E `tests/e2e/smoke.py`: chạy uvicorn cổng 8765 với dữ liệu tạm, xong thì dừng server và xoá thư mục tạm. **Từ chối chạy khi `web/out` cũ hơn mã nguồn** (thêm `--build` để tự build): không thì sửa code xong E2E vẫn thử bản cũ và báo xanh giả (chính tôi đã suýt dính lúc viết). Cố ý gỡ listener phím tắt trong `page.tsx` thì bước 4 báo FAIL "bộ đếm về 0 sau Ctrl+Z" (bước 6 đỏ theo vì ô sửa sai còn nằm trên server); đã trả lại, build lại, 6/6 xanh; `git diff` của `page.tsx` rỗng.

Khác kế hoạch (nhỏ, có lý do):
- Script `test` thêm `--disable-warning=MODULE_TYPELESS_PACKAGE_JSON`: `web/package.json` chưa khai `"type"` nên Node in một cảnh báo dài ở mỗi lần chạy. Không đổi sang `"type": "module"` để khỏi động tới build Next.
- Thêm `tests/conftest.py` (kế hoạch không ghi): `api.main` chạy `auth.init_db()` ngay khi import, nên trước đây mỗi lần chạy pytest đều mở `.data/app.db` thật. Nay mọi phiên pytest dùng thư mục tạm (xoá khi xong).
- Bước 6 của E2E phải bấm vào một mặt sổ sau F5 (xem quan sát dưới).

Quan sát khi viết E2E (không sửa):
- Sau F5, kết quả còn nguyên nhưng **chưa mặt sổ nào được chọn**: khung phải chỉ hiện "Bấm một mặt sổ ở cột trái để xem kết quả của mặt đó", nên người dùng dễ tưởng mất kết quả. Gợi ý: sau khi nạp, tự chọn mặt sổ đầu tiên có kết quả. Chưa có trong kế hoạch, chờ anh duyệt.
- **Phím `n` (và nút「Dòng cần soát sau」) đặt con trỏ LỆCH MỘT Ô.** Đã đo trên sổ mẫu: sửa 残高 dòng 4 thành 999 rồi bấm `n`, con trỏ nhảy vào ô **入金** của dòng 5 chứ không phải 残高. Nguyên nhân: `pendingFocus` ở `page.tsx` chọn `inputs[idx]` với idx = `cols.kind ? 5 : 4` (残高) và `cols.kind ? 2 : 1` (摘要), viết từ trước khi có cột 行 (ô `readOnly` đầu dòng), nay mọi ô đã dịch một bậc. **Task 1.2** (`focusField`) nên chọn ô theo thuộc tính (vd. thêm `data-field="balance"` vào `Cell`) thay vì theo số thứ tự, và E2E của 1.2 nên kiểm ô nào đang được focus.

**Việc chen ngang theo yêu cầu của anh (30/09, sau 0.2): nhập file thông minh.** Anh nói "khoan làm 0.3" nên **0.3 hoãn**. Lý do: nhập PDF xong phải xoay/cắt tay từng trang thì khung đỏ mới chính xác, và kéo file vào thì không có phản hồi gì. Đây là phần lõi của giai đoạn 5 (5.0/5.2/5.3), làm sớm và ở dạng **tự áp dụng khi nhập** (mặt vừa nhập chưa quét nên chỉnh ảnh không mất gì; hoàn tác được một lần). Khác nguyên tắc "máy chỉ đề xuất" ở mục 2 — có lý do, và người dùng nói rõ muốn vậy; cần công tắc tắt (chưa làm).
- **Xong phía máy chủ** (pytest 249 pass; kiểm THẬT trên PDF 24 trang của anh: pha nền 12.5 s, 24/24 trang đúng chiều + cắt gọn, 92.8 → 34.3 MP; RapidOCR 1.2.3 và 1.4.4 đều đúng):
  - `ocrengine.py` (RapidOCR dùng chung, `rowanchors` cũng dùng), `orient.py` (nhận hướng 0/90/180/270 bằng bộ dò dòng + bộ phân loại dòng lộn ngược có sẵn trong RapidOCR: đúng 60/60 ảnh mẫu, ~0.2 s/trang, $0, không tải thêm gì; Tesseract OSD sai một nửa, chấm điểm OCR 4.4 s/trang), `pagecrop.py` (khung cắt ôm nội dung, bỏ vệt đen máy scan; chỉ ảnh scan phẳng), `autoprep.py` (kế hoạch + xoay theo đa số của cả file cho trang yếu), `imgjobs.py` (hàng đợi nền một luồng).
  - `workspace.py`: nhập hai pha (`prepare_upload` trả ngay thẻ "queued" + `process_upload` chạy nền), trạng thái `queued → rendering → analyzing → ready | failed`, `auto_apply` (xoay + cắt gộp một bước), áp EXIF cho ảnh rời, ghi `meta.json` nguyên tử. `main.py`: `POST /sheets?auto=`, `GET /sheets` (nhẹ), `POST /autoprep` (mặt sổ đã có), 409 `not_ready` khi sửa/quét mặt chưa xong.
  - Giao diện chỉ mới vá tối thiểu: hỏi lại `GET /sheets` mỗi giây khi còn mặt đang xử lý, không quét mặt chưa ready.
- **Giao diện (làm xong ngày 03/10)**: thẻ tải lên hiện NGAY lúc thả file kèm thanh % (XHR, `ImportProgress.tsx`); thanh「Đang xử lý k/n trang」+ trạng thái từng thẻ (đang chờ / tách trang / kiểm hướng / nhập không được, có chuỗi vi/en/ja); khung giữa cho mặt chưa xong (`SheetBusy.tsx`); nhãn「✨ Đã tự xoay -90° · đã cắt gọn」trên thẻ và biểu ngữ có nút Hoàn tác ở khung giữa; 「⚠ Chưa chắc hướng」; công tắc「Tự xoay & cắt gọn khi nhập file」(bật sẵn, nhớ trong `localStorage` `tsucho.autoprep`); nút ✨ cho các mặt đã tích (mặt đã quét bị bỏ qua); bước E2E số 7 (PDF 4 trang sai chiều → tự xoay đúng; SKIP nếu thiếu RapidOCR). Đo trên PDF khách A thật: khối tiến độ hiện sau 0.01 s, xong 24 trang sau ~12 s.
- **Còn lại**: (a) **ảnh chụp điện thoại chưa cắt được** (cần tìm 4 góc tờ giấy, task 5.2) và **chưa chỉnh nghiêng nhỏ** (bộ đo góc của `autofix.py` nhiễu ±5°; góc từ dòng chữ nhiễu ±0.5° — chưa đủ tin để tự áp); (b) sau khi tự xoay/cắt, quét lại tốn lượt Gemini vì ảnh đổi thì cache trượt — nên báo trước (task 4.3); (c) công tắc nên chuyển vào ⚙ Cài đặt khi có task 3.1 (hiện nằm dưới khu thả file); (d) khi RAM ít (`TSUCHO_LOCAL_OCR=0`) tính năng tự xoay bị tắt hẳn, chỉ còn nút xoay tay.

**Task 0.3 — xong 03/10/2026** (pytest 252, `npm test` 23, build xanh, E2E 9/9; thêm bước 8 và 9):
1. **Ngày gõ tay**: `web/src/lib/review.ts` (`parseDateInput`, `applyDateEdit`, `nearDates`; 16 test TS). Nhận `2025-04-11` · `2025/4/11` · `2025.4.11` · `2025年4月11日` · `20250411` · `R7.4.11` · `H31.4.30` · `令和7年4月11日` · `令和元年5月1日` · dạng in `07-04-11` (niên hiệu theo dòng bên cạnh, mặc định 令和) · `4/11` (năm suy từ dòng trước/sau; sang năm được). Không đọc được → `date: null`, `date_raw` = chuỗi gõ, dòng chuyển `status: check` với lý do `日付不明(手入力)`; gõ lại cho đúng thì gỡ lý do (kể cả `日付不明` của engine) và trả dòng về ok. Server: `export.py._iso_to_date` không ném lỗi nữa (ngày hỏng → ghi chuỗi + tô vàng); CSV vốn đã ghi chuỗi. Có test pytest cho 7 kiểu ngày hỏng.
2. **Ô tiền**: `parseYen` chuyển sang `review.ts`: chuẩn hoá NFKC (`１，２３４`, `￥`, `，`), nhận `円`, `、`, dấu cách; ô trống hoặc chỉ có gạch ngang = không có số. **Không nhận** số âm, `▲500`, số lẻ, chữ → ô quay về giá trị cũ và nháy đỏ 2.5 s (chuỗi vi/en/ja). *Đổi hành vi so với trước*: `-500` từng được nhận là số âm và `12.5` thành `125`; nay cả hai bị từ chối (theo kế hoạch: sổ ngân hàng không có số âm — nếu gặp sổ có 残高 âm như ゆうちょ 貸付 thì phải nới lại).
3. **Ngôn ngữ**: `detectLang` trong `dict.ts` (ja* → ja, vi* → vi, en* → en, ngôn ngữ lạ thì xét tiếp, không khớp → en); `LangProvider` dùng nó khi chưa có lựa chọn đã lưu (không ghi đè vào localStorage) và LUÔN đặt `<html lang>` lúc nạp.
4. **Font cho sổ mẫu trong Docker**: *chưa* build thử được (máy không có Docker). Bằng chứng gián tiếp: `python:3.12-slim` không có font CJK; font mặc định của Pillow vẽ mọi chữ Nhật thành cùng một ô vuông (đã thử: 'サ' và '日' ra ảnh y hệt); gói Debian `fonts-ipafont-gothic` đặt `/usr/share/fonts/opentype/ipafont-gothic/ipag.ttf` (đã tra packages.debian.org). Chọn gói IPA (nhẹ) thay vì Noto CJK; thêm vào `Dockerfile` và `api/sample.py._FONT_CANDIDATES`, có test giữ hai nơi khớp nhau. **Cần anh mở sổ mẫu trên Render sau lần deploy kế tiếp để xác nhận.**
5. `api/exporter.py`: giữ nguyên, chỉ thêm 2 dòng chú thích "chưa được dùng ở đâu (kiểm 30/09/2026)".
- Quan sát (không sửa): dòng có ngày không đọc được hiện vàng và vào file Excel với 要確認, nhưng bộ đếm「Còn N dòng cần soát」chưa tính nó (bộ đếm vẫn dùng định nghĩa riêng) — task 1.2 gom lại.

**Sửa lỗi anh báo 03/10 (sau 0.3): gõ LẠI đúng giá trị đã chuẩn hoá thì ô không đổi.** Ví dụ ô đang là `2025-04-12`, gõ lại `2025/4/12` rồi Enter vẫn thấy `2025/4/12`; cùng lỗi với `１２３４` khi ô đã là `1,234`. Nguyên nhân: `Cell` là input không kiểm soát với `key={value}`; giá trị sau chuẩn hoá trùng giá trị cũ ⇒ key không đổi ⇒ React không vẽ lại ô. Sửa: sau mỗi lần ghi nhận, tăng một bộ đếm trong key để ô luôn dựng lại với giá trị chuẩn hoá. Thêm: gõ lại giá trị đang có không còn tạo bước Ctrl+Z hay lượt autosave rỗng (`applyEdit` trả lại đúng mảng cũ, `commitStore` bỏ qua khi không đổi). E2E bước 8 có thêm 5 lần gõ lại; đã thử gỡ bản sửa thì bước 8 đỏ đúng chỗ.

**Task 1.1 — xong 03/10/2026** (pytest +9, `npm test` +11, E2E bước 10):
- Kiểu mới trong `api.ts` (mọi trường tuỳ chọn): `Tx.rid / orig / reviewed / reviewed_at / added / inferred`, `EditField`; `row_no` sửa thành số nguyên.
- `api/results.py`: `save_job` gán `rid` (12 hex) cho mọi dòng — sổ mẫu cũng đi qua đây; `load_all` bổ sung `rid` cho file cũ rồi ghi lại nguyên tử **đúng một lần** (lần đọc sau không ghi); `save_edits` kiểm `rid` (chuỗi ≤ 32 ký tự, sai thì HTTP 400), bù `rid` cho dòng thiếu/trùng, **giữ nguyên mọi khoá khác** kể cả khoá lạ của phiên bản sau. Thêm khoá `RLock` quanh đọc-sửa-ghi: nếu không thì lần bổ sung `rid` trong `load_all` có thể đè mất bản autosave vừa ghi giữa chừng.
- `web/src/lib/review.ts`: `applyEdit` (đường sửa ô DUY NHẤT: ngày → ISO, ghi `orig` lần đầu sửa ô, xoá khỏi `orig` khi sửa về đúng giá trị máy, bỏ nhãn `inferred` của ô người đã tự gõ, trả đúng mảng cũ nếu không đổi), `newRid` (dùng `getRandomValues`, không dùng `randomUUID`), `shown`. `page.tsx`: `editCell` gọi `applyEdit`; `addRow` đặt `rid` + `added: true`; `autoBalance` ghi `inferred: ["balance"]` và không tạo bước hoàn tác khi chẳng suy được ô nào.
- Với ô ngày, `orig.date` ghi **giá trị đang hiện** (ngày ISO của máy, hoặc chữ gốc nếu máy không đọc được ngày) để sau này khôi phục được cả hai trường `date`/`date_raw`.
- Chưa đổi hành vi hiển thị (đúng như kế hoạch). `applyDateEdit` của 0.3 vẫn đang gắn `status/reason` cho ngày hỏng — 1.2 chuyển sang suy ra để giao diện không bao giờ sửa hai trường này.

**Task 1.2 — xong 03/10/2026** (pytest **320 passed** = 262 + 58 · `npm test` **94 pass** · build xanh · E2E **11/11 bước**, bước 4 mở rộng và thêm bước 11):
- **Bảng lý do của engine** (lập bằng cách quét AST `validate.py`; `tests/test_review.py` báo đỏ nếu engine sinh thêm một chuỗi mà bảng chưa biết):
  - *cần soát*: `残高不一致(差額 ±N)` → `balance` · `日付不明` → `date` · `残高が読取れず検証不可` → `nobal` · `低信頼度` → `lowconf` · `行番号 a→b: n行抜けの疑い` → `rowgap`;
  - *tự sửa* (`fix`, chỉ để biết): `金額を入金列へ移動` · `金額を出金列へ移動` · `金額の列を入替` · `残高から取扱店を分離` · `残高と取扱店を入替補正` · `残高を検算で補正(印字読取 N)` và `残高を検算で補正` · `残高の行ずれを自動補正` · `日付は前行と同じ(印字なし)` · `年を前行から補完` / `年を後行から補完`.
  - **Quy tắc「kết thúc bằng 補正 / 分離」của kế hoạch chưa đủ**: `残高を検算で補正(印字読取 N)`, `日付は前行と同じ(…)`, `年を…補完`, `金額…移動`, `金額の列を入替` đều không kết thúc như vậy. Giữ quy tắc chung (để chuỗi tự sửa mới theo cùng kiểu vẫn được nhận) và thêm mẫu cho từng chuỗi còn lại.
- **Hai luật ngoài kế hoạch** (cần vì giao diện không còn sửa `status/reason`): (a) dòng `added` chưa ✓ → cần soát (1.3 đã viết "dòng thêm có `added: true` nên cần ✓" nhưng luật 1.2 chưa có); (b) `date` không phải ISO (người xoá trắng hoặc gõ chữ vô nghĩa vào dòng vốn ổn) → cần soát dù máy không ghi lý do nào — `openReasons` thêm một lý do `date` tổng hợp để cột 確認メモ giải thích được. Thứ tự luật đầy đủ nằm trong docstring `needsReview` (cả `review.ts` lẫn `review.py`).
- **Cột 検算 sửa hai chỗ so với bản cũ** (`checkColumn` đã bỏ): dòng không in 残高 nay vẫn cộng dồn vào chuỗi như engine (bản cũ bỏ qua nên dòng phí ゆうちょ kéo theo NG giả ở dòng sau), và dòng ghi chú hiện「―」chứ không OK/NG (nhưng 残高 của nó vẫn là mốc cho dòng sau).
- **`applyDateEdit` không còn sửa `status/reason`** (đúng nguyên tắc 1.1). Hệ quả tạm thời tới 1.4: gõ ngày đúng cho dòng `日付不明` thì màn hình hết vàng, nhưng **file Excel/CSV vẫn lấy `status` đóng băng của máy** nên dòng đó vẫn vàng + 要確認 trong file (ở 0.3 nó được gỡ). 1.4 sửa dứt điểm bằng `review.py`. Cũng vì vậy `api/jobs.py` (`per_sheet`, `totals` của một lần quét) chưa đổi; web không dùng chúng.
- **Sổ mẫu**: `_to_tx` đặt `row_no` số nguyên; mặt ② in số thứ tự 1,2,3,4,5,**7**,8,9 ⇒ engine gắn `行番号 5→7: 1行抜けの疑い` cho dòng 証貸 5月: **đúng MỘT dòng vàng thật**, chuỗi số dư vẫn khớp từng đồng (`tests/test_review.py` giữ điều này). Ảnh sổ mẫu nay in cột 行 ở lề trái để ảnh khớp dữ liệu. Tiện tay sửa dấu mờ trên ảnh: 「DỮ LIỆU MẪU」có Ữ/Ệ/Ẫ mà font Nhật không có ⇒ hiện ô vuông và tràn mép phải; đổi thành 「サンプル / SAMPLE」.
- **Giao diện**: bộ đếm「Còn N dòng」, huy hiệu cột trái (`data-need` trên thẻ), số dòng vàng trong bảng và phím n cùng đi qua `analyzeRows` nên không lệch được (E2E đối chiếu cả ba). `n` chọn ô bằng `data-field` ⇒ **hết lệch một ô** (E2E kiểm ô đang focus: 残高 khi chuỗi lệch, 摘要 với `行抜け`). Đầu thẻ sổ đếm「N dòng cần soát」thay cho「N NG」. Ô ngày tô vàng khi ngày là thủ phạm. Cột 確認メモ chỉ liệt kê lý do **chưa** giải quyết (+「Dòng thêm tay — chưa soát」); dòng đã ✓ ghi「✓ Đã soát」.
- **Làm sớm từ 1.3** (không có nó thì dòng vàng của sổ mẫu không gỡ được): nút ✓ theo dòng (luôn hiện ở dòng cần soát/đã soát, còn lại hiện khi rê chuột; bấm lại để bỏ; đi qua `patchRows` ⇒ Ctrl+Z và autosave chạy; `setReviewed` trong `review.ts`). Cột nút ✓/× **ghim sát mép phải** (`sticky`): bảng rộng hơn khung thì phải cuộn ngang mới tới được, mà ✓ là nút hay bấm nhất. Phần 1.3 còn lại: `Ctrl+Enter`, 「Xác nhận cả mặt sổ」, ↺ khôi phục giá trị máy, thêm dòng đúng chỗ, chữ「✎ đã sửa tay」ở cột 確認メモ.
- **Dockerfile**: thêm `review.py` vào dòng `COPY` + test `test_dockerfile_chep_du_moi_module_goc_ma_may_chu_import` (module ở gốc mà `api/` import nhưng Dockerfile không chép thì máy chủ Docker chết ngay lúc khởi động — chạy trên máy dev không bao giờ thấy). 1.4 sẽ import `review` từ `export.py`.
- **Kiểm test có răng**: cố ý đổi 5 luật trong `review.ts` (bỏ luật `reviewed`, bỏ `added`, ghi chú không làm mốc, không cộng dồn, ✓ không cần cho lowconf) và 4 luật trong `review.py` ⇒ cả hai bộ test đỏ đúng chỗ; đã trả lại.
- **Quyết định nhỏ, chờ anh gật/lắc**: dòng đã ✓ rồi sửa tiếp một ô vẫn giữ ✓ (người đã nhìn dòng này; và ✓ thắng cả NG theo kế hoạch). Nếu muốn「sửa là mất ✓」thì đổi một chỗ trong `applyEdit`.
- Chưa làm (đúng phạm vi): bộ đếm vẫn đếm mặt sổ **đang xem**, phím n không nhảy sang mặt khác; Excel/CSV chờ 1.4.

---

## 10. Nguồn tham khảo (tra ngày 2026-09-30)

- STREAMED — 通帳のデータ化: https://streamedup.com/help/898
- STREAMED — 通帳の科目は自動判定されないのですか？: https://streamedup.com/help/8004
- STREAMED — 学習の方法: https://streamedup.com/help/7023
- 弥生 スマート取引取込 活用ガイド: https://www.yayoi-kk.co.jp/smart/torihikitorikomi/
- 弥生 インポートデータの記述形式: https://support.yayoi-kk.co.jp/faq_Subcontents.html?page_id=27183
- マネーフォワード クラウド会計Plus「インポート」画面: https://biz.moneyforward.com/support/ac-plus/guide/journal2/import2.html
- freee 取引・口座振替のインポート: https://support.freee.co.jp/hc/ja/articles/202847320
- So sánh phần mềm kế toán có AI-OCR (KEEPER Club 通帳 10円/trang): https://www.aspicjapan.org/asu/article/252 · https://www.itreview.jp/categories/accounting
- PP-LCNet_x1_0_doc_ori (hướng tài liệu 0/90/180/270, Apache-2.0): https://huggingface.co/PaddlePaddle/PP-LCNet_x1_0_doc_ori · tài liệu PaddleX: https://paddlepaddle.github.io/PaddleX/3.1/en/module_usage/tutorials/ocr_modules/doc_img_orientation_classification.html · bản ONNX + cách dùng: https://github.com/phamnhuvu-dev/doc_ori_onnx
- uvdoc-onnx (làm phẳng trang cong, MIT): https://github.com/klopstack/uvdoc-onnx
- DocAligner (không dùng, lý do ở mục 6): https://docsaid.org/en/docs/docaligner/quickstart/

---

## Phụ lục A — Công thức kỹ thuật cho Sonnet (giai đoạn 5)

Các con số dưới đây là **điểm xuất phát**. Phải chỉnh bằng đo trên ảnh thật, rồi ghi giá trị cuối cùng vào comment trong code.

### A.1 Tìm mép giấy (OpenCV)
```python
def tim_4_goc(bgr):
    h, w = bgr.shape[:2]
    k = 1000 / max(h, w)
    nho = cv2.resize(bgr, None, fx=k, fy=k, interpolation=cv2.INTER_AREA)
    ung_vien = []
    # (a) theo CẠNH: Canny với ngưỡng tự động quanh trung vị độ sáng
    xam = cv2.GaussianBlur(cv2.cvtColor(nho, cv2.COLOR_BGR2GRAY), (5, 5), 0)
    v = float(np.median(xam))
    canh = cv2.Canny(xam, int(max(0, 0.66 * v)), int(min(255, 1.33 * v)))
    canh = cv2.dilate(canh, np.ones((3, 3), np.uint8), iterations=2)
    # (b) theo VÙNG: giấy sáng hơn mặt bàn → Otsu trên kênh V, rồi đóng lỗ
    hsv = cv2.cvtColor(nho, cv2.COLOR_BGR2HSV)
    _, giay = cv2.threshold(hsv[..., 2], 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    giay = cv2.morphologyEx(giay, cv2.MORPH_CLOSE, np.ones((15, 15), np.uint8))
    for mask in (canh, giay):
        cs, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        for c in sorted(cs, key=cv2.contourArea, reverse=True)[:5]:
            xx = cv2.approxPolyDP(c, 0.02 * cv2.arcLength(c, True), True)
            if len(xx) == 4 and cv2.isContourConvex(xx):
                ung_vien.append(xx.reshape(4, 2).astype(np.float32))
            else:
                ung_vien.append(cv2.boxPoints(cv2.minAreaRect(c)))
    # Chấm điểm mỗi ứng viên = diện tích hợp lý (0.2–0.98 ảnh)
    #   × độ vuông (4 góc gần 90°) × tương phản dọc 4 cạnh (gradient trung bình trên viền).
    # Lấy điểm cao nhất; dưới ngưỡng tin cậy → None.
    # Sắp thứ tự TL, TR, BR, BL bằng tổng/hiệu toạ độ; chia lại cho k và (w, h)
    # → toạ độ 0..1 đúng như workspace.perspective đang nhận.
```

### A.2 Làm sạch nền / bóng (thử nghiệm)
```python
nen = cv2.GaussianBlur(anh, (0, 0), sigmaX=max(h, w) / 30)  # hoặc MORPH_CLOSE, nhân ≈ 3× chiều cao dòng
sach = cv2.divide(anh, nen, scale=255)                       # từng kênh màu → giữ màu mực đỏ/xanh
# rồi kéo giãn tương phản nhẹ theo phân vị 1–99
```
Cẩn thận: dòng kẻ hồng nhạt của sổ có thể mờ đi, và số in nhạt có thể đậm lên. **Phải đo bằng `eval.py`** trước khi bật sẵn.

### A.3 Chỉ số chất lượng ảnh
| Chỉ số | Cách tính | Ngưỡng khởi điểm |
|---|---|---|
| Mờ | `cv2.Laplacian(xam, cv2.CV_64F).var()` trên vùng giấy, ảnh thu về rộng 1200px | < 60 → "mờ" (chỉnh bằng cặp `S__35774551` rõ / `S__35774555_0` mờ) |
| Tối / cháy | % điểm < 30 hoặc > 250 trong vùng giấy | > 25% |
| Loá | vùng liền nhau có V > 245 và S < 25, diện tích > 0.5% trang | có ⇒ "loá" |
| Chữ nhỏ | nhịp dòng (px) từ `rowmap`, tính trên ảnh gốc | < 18px/dòng |

### A.4 Model hướng trang PP-LCNet_x1_0_doc_ori
- Tải `inference.onnx` + `inference.yml` từ Hugging Face `PaddlePaddle/PP-LCNet_x1_0_doc_ori_onnx` vào `.models/doc_ori/`. Hỏi anh trước (~7MB, Apache-2.0).
- **Đọc `inference.yml` để lấy đúng tiền xử lý** (kích thước resize/crop, mean/std, thứ tự kênh) và danh sách nhãn. Không chép từ trí nhớ.
- `onnxruntime.InferenceSession(path, providers=["CPUExecutionProvider"])`: tạo **một lần**, dùng chung, có khoá (giống `rowanchors._rapid_lock`).
- Kiểm nghĩa của nhãn bằng test tổng hợp: xoay ảnh thẳng 90° theo chiều kim đồng hồ → xem nhãn nào → cần xoay ngược bao nhiêu thì về thẳng.

### A.5 Làm phẳng trang cong — UVDoc (thử nghiệm)
- `pip install uvdoc-onnx` (MIT; trọng số kèm theo 214KB; cần `opencv-python-headless`).
- `from uvdoc_onnx import dewarp` → `out, changed, err = dewarp(anh_pil)`. Lỗi thì trả nguyên ảnh cũ.
- Chỉ chạy **sau** bước nắn phối cảnh, vì đầu vào bị ép về 488×712.
- Đo trước/sau bằng độ "sắc" của biểu đồ chiếu dòng (hàm có sẵn trong `rowmap`) và bằng eval với model. Chỉ bật sẵn khi có ích.

### A.6 Kính lúp (frontend)
- Một div tròn `position:absolute; pointer-events:none`, `background-image` = URL ảnh đang xem, `background-size` = bề rộng ảnh trên màn hình × 2.5.
- `background-position` tính từ vị trí con trỏ **so với `imgBox.getBoundingClientRect()`** (đã gồm zoom/translate của khung).
- Không hoạt động khi đang cắt/nắn.

### A.7 Hợp đồng "xem trước = áp dụng"
- `preview` trả tham số tường minh: góc xoay, 4 góc + điểm giữa cạnh, góc nghiêng, cờ các bước thử nghiệm.
- `apply` chỉ nhận **đúng các tham số đó**, không dò lại.
- Test: `apply(preview().steps)` phải cho ảnh cùng kích thước và gần như trùng từng điểm với bản xem trước phóng to.

### A.8 RAM & tốc độ
- Model nạp lười (lần đầu dùng mới nạp); mỗi loại một phiên dùng chung.
- Ảnh đem phân tích thu về ≤ 1280px.
- Hàng đợi nền chỉ một luồng.
- Ghi thời gian từng bước vào log để biết chỗ nào chậm.
