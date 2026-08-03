# Kế hoạch xây web app tsucho-scan

> Viết ngày 2026-07-30. Đọc cùng `README.md` và `MEMORY.md` (memory của Claude).
> Mục đích: chuyển từ CLI sang web có login/phân quyền, để giám đốc Nhật tự vào test.

---

## 1. Ý tưởng cốt lõi của sản phẩm

Tool **không hứa đọc đúng 100%** — không model nào làm được với sổ viết tay, mờ, xoay.
Giá trị thật nằm ở chỗ khác:

> **Máy đọc nhanh + chỉ đúng chỗ đáng ngờ + người sửa trong 30 giây.**

Đo được trên dữ liệu thật (xem bảng điểm trong memory): số tiền và số dư đạt 93–100%,
nhưng **tên đối tác (katakana) chỉ 60–95%** và thỉnh thoảng **sót/thừa dòng**.
Chuỗi số dư bắt được lỗi số, **không** bắt được sót dòng và đọc sai tên.

⇒ Giao diện web phải được thiết kế quanh **việc soát lỗi**, không phải quanh việc "tải lên rồi tải về".
Đây chính là điều khác biệt so với các tool OCR thông thường.

---

## 2. Màn hình quan trọng nhất: đối chiếu ảnh ↔ bảng

Đây là màn hình quyết định sản phẩm dùng được hay không.

```
┌─────────────────────────────────────────────────────────────────────┐
│  通帳スキャン    [ファイル名.pdf ▾]   検証レベル: ⚠ 一部未検証(3行)   │
├──────────────────────────┬──────────────────────────────────────────┤
│                          │  日付      摘要         出金    入金  残高 │
│   [ẢNH SỔ GỐC]           │  04-25  ウツカ ノボル          50,000 ... │
│                          │▶ 04-25  料金 ⚠           440         ... │ ← dòng đang chọn
│   • zoom / xoay          │  05-01  ｾﾝｺｰｼﾖｳｼﾞ(ｶ  177,369       ... │
│   • khung đỏ bám dòng    │  ...                                      │
│     đang chọn            │                                           │
│                          │  [◀ dòng lỗi trước]  [dòng lỗi sau ▶]     │
└──────────────────────────┴──────────────────────────────────────────┘
```

**Nguyên tắc bắt buộc:**

1. **Click dòng trong bảng → ảnh tự cuộn + zoom tới đúng dòng đó.** Không có cái này
   thì người dùng phải tự dò bằng mắt, tool mất hết giá trị.
2. **Nút "tới dòng lỗi tiếp theo"** — người dùng chỉ cần soát các dòng vàng, không
   phải đọc hết 200 dòng.
3. **Sửa tại chỗ**: ô nào cũng gõ đè được; sửa xong ô 残高 thì cột kiểm tra tính lại ngay.
4. **Không bao giờ tự ý giấu lỗi.** Dòng máy tự sửa phải hiện rõ "đã sửa từ X thành Y".

### Cần lưu toạ độ dòng
Để vẽ được khung đỏ trên ảnh, `extract.py` phải trả thêm **bounding box mỗi dòng**.
Gemini có thể trả toạ độ nếu yêu cầu trong schema. Đây là **thay đổi lớn nhất ở backend**,
nên làm sớm. Nếu chưa có, tạm thời chia đều theo số dòng (kém chính xác nhưng vẫn dùng được).

---

## 3. Các màn hình còn lại

| Màn hình | Nội dung chính |
|---|---|
| **Đăng nhập** | Email + mật khẩu. Có "đăng ký" để giám đốc Nhật tự tạo tài khoản. |
| **Dashboard** | Danh sách file đã quét: tên, ngày, số sổ, số dòng, **mức độ bảo đảm** (✅ đã kiểm chứng / ⚠ còn N dòng), nút tải Excel. |
| **Tải lên** | Kéo thả nhiều ảnh/PDF. Hiện tiến độ từng trang. **Cảnh báo ảnh trùng** (xem §5). |
| **Đối chiếu** | Màn hình §2 — nơi người dùng ở lâu nhất. |
| **Quản lý người dùng** | Chỉ admin: danh sách user, phân quyền, khoá tài khoản. |
| **Lịch sử / nhật ký** | Ai quét file nào, lúc nào. Dữ liệu tài chính nên có vết. |

### Phân quyền tối thiểu
- `admin` — thấy mọi thứ, quản lý user.
- `user` — chỉ thấy file của chính mình.
- (sau) `viewer` — chỉ xem, không quét (cho kế toán của khách).

---

## 4. Kiến trúc đề xuất

```
Web (React/Next.js)  ──►  API (FastAPI)  ──►  core/ (code hiện có)
                                │                 extract → validate → export
                                ├──► DB (PostgreSQL): user, file, job, row
                                └──► Storage: ảnh gốc + file Excel
```

**Việc đầu tiên phải làm ở backend** (chưa cần web): ✅ **XONG 30/07/2026** — `core.py`

```python
from core import scan

result = scan(files, rotate=0, use_cache=True, banks=None, on_progress=None)
result.accounts        # list[dict] — như cũ, export.py/eval.py dùng được ngay
result.verification    # mức độ bảo đảm từng sổ (rows/verified/fixed/need_check/level)
result.totals          # cộng dồn cả lần quét
result.cost_usd        # 0.0 nếu lấy từ cache
result.to_excel(path)  # ghi file
result.to_dict()       # payload JSON cho API web
```

`main.py` (CLI) và API cùng gọi `scan()`. Không viết lại logic lần hai.
`extract.py` không còn `print()` — tiến độ đi qua `on_progress(event)` với
`event["stage"]` ∈ `page` / `skip` / `retry` / `validate` / `done`; web nối
thẳng cái này vào thanh tiến độ (WebSocket hoặc SSE).

### Xử lý bất đồng bộ
PDF 24 trang mất ~4 phút. **Không để người dùng ngồi chờ trang trắng.**
Dùng hàng đợi (Celery/RQ) + thanh tiến độ "đang xử lý trang 7/24".
Gemini Batch API rẻ hơn ~50% và hợp mô hình này.

---

## 5. Ba việc bắt buộc trước khi giám đốc Nhật vào test

### (a) Chống ảnh trùng — nguy hiểm nhất
Đo được: bộ ảnh mẫu có **3 cặp trùng byte** và ít nhất **1 cặp chụp lại cùng trang**.
Nếu người dùng kéo cả thư mục lên, giao dịch bị **cộng gấp đôi** mà file trông vẫn bình thường.

- Trùng byte → chặn ngay khi tải lên (so sánh SHA-256).
- Trùng nội dung → sau khi quét, nếu 2 sổ có ≥50% số dư giống nhau thì cảnh báo
  "2 file này có vẻ là cùng một trang, chọn giữ file nào?".

### (b) Bảo mật dữ liệu — vấn đề kinh doanh, không phải kỹ thuật
Đây là **số tài khoản ngân hàng thật của doanh nghiệp Nhật**.
- Bậc miễn phí AI Studio thường **dùng dữ liệu để cải thiện sản phẩm** → phải chuyển
  sang bậc trả phí hoặc Vertex AI (có hợp đồng, không dùng để huấn luyện, chọn vùng Tokyo).
- Ảnh gốc và Excel phải mã hoá khi lưu, có hạn xoá tự động.
- Cần chuẩn bị câu trả lời cho câu hỏi "dữ liệu của tôi đi đâu?" bằng **tiếng Nhật**.

### (c) Gỡ giới hạn quota
`gemini-2.5-flash` bậc miễn phí = **20 request/ngày**. Một người dùng quét 1 file PDF
là hết. Bắt buộc bật trả phí trước khi có người thật vào dùng.
Chi phí đo được: **~$0.003/trang** → 200 trang/tháng ≈ $0.60. Không đáng lo.

---

## 6. Thứ tự làm (đề xuất)

**Giai đoạn 1 — nền móng (chưa có giao diện)**
1. ✅ Tách `core.scan()` khỏi CLI. *(xong 30/07/2026, 10 test mới, eval p5-6 không đổi)*
2. Thêm bounding box mỗi dòng vào schema trích xuất.
3. Chống trùng file.

**Giai đoạn 2 — web dùng được**
4. API: đăng nhập, tải lên, xem kết quả, tải Excel.
5. Màn hình đối chiếu ảnh ↔ bảng (§2) — **đầu tư nhiều nhất vào đây**.
6. Dashboard + hàng đợi xử lý.

**Giai đoạn 3 — cho người thật dùng**
7. Phân quyền, nhật ký.
   - ✅ **Đăng nhập + tách dữ liệu theo user** *(31/07/2026)* — SQLite `.data/app.db`,
     mật khẩu băm scrypt (stdlib, không thêm thư viện), phiên là token ngẫu nhiên
     trong cookie `HttpOnly` (thu hồi được, khác JWT). Mọi route đụng dữ liệu sổ
     đều đòi đăng nhập; workspace của người khác trả **404** chứ không phải 403.
     Người đăng ký đầu tiên thành `admin` và nhận các workspace tạo từ hồi chưa
     có đăng nhập. 11 test mới, trong đó có một test **tự quét mọi route** nên
     thêm route mà quên khoá là đỏ ngay.
   - ⬜ Còn thiếu trước khi mở cho người ngoài: **giới hạn số lần đăng nhập sai**,
     quên mật khẩu, trang quản lý user (khoá tài khoản), nhật ký ai quét file nào.
   - ⚠ Triển khai lên Vercel + Render (khác tên miền) phải đặt
     `TSUCHO_COOKIE_SAMESITE=none` và `TSUCHO_COOKIE_SECURE=1`, đồng thời sửa
     `allow_origins` trong `api/main.py`. Chạy localhost thì để mặc định.
8. Hoàn thiện bản dịch **tiếng Nhật** (xem §9 — khung i18n phải dựng từ ngày đầu).
9. Bật trả phí / Vertex AI.

---

## 7. Thiết kế giao diện

Tham khảo được: bố cục "ảnh trái – bảng phải" của các tool 仕訳変換 Nhật.
**Không sao chép** màu sắc, bố cục chi tiết, icon hay câu chữ của họ.

### 7.1 Nguyên tắc

- **Sạch và ít màu.** Chỉ dùng màu để chỉ trạng thái. Màu dùng bừa sẽ làm mất ý
  nghĩa cảnh báo — nếu mọi thứ đều nổi bật thì không gì nổi bật.
- **Chữ to, tương phản cao.** Người dùng cuối là người Nhật lớn tuổi. Nền chữ tối
  thiểu 16px, bảng 15px, không dùng chữ xám nhạt cho nội dung thật.
- **Bàn phím là công cụ chính.** Người soát dữ liệu dùng bàn phím nhanh hơn chuột
  nhiều lần. Chuột chỉ để zoom ảnh.
- **Luôn hiện mức độ bảo đảm** ở đầu mỗi kết quả, kèm câu nhắc rằng máy không tự
  phát hiện được dòng bị sót.

### 7.2 Bảng màu (kế thừa từ file Excel để cùng một bộ mặt sản phẩm)

| Vai trò | Mã | Dùng ở đâu |
|---|---|---|
| Nền trang | `#F7F8FA` | nền ngoài các thẻ |
| Thẻ / bảng | `#FFFFFF` | vùng nội dung |
| Chữ chính | `#1B2733` | |
| Chữ phụ | `#5B6B7C` | nhãn, đơn vị |
| Viền | `#DFE4EA` | |
| **Nhấn (thương hiệu)** | `#2F5B7C` | thanh tiêu đề, nút chính — **đúng màu header Excel** |
| ⚠ Cần soát | `#FFF2CC` nền / `#8A6100` chữ | **đúng màu ô vàng Excel** |
| ✅ Đã tự sửa | `#C6EFCE` nền / `#1E6B3A` chữ | **đúng màu ô xanh Excel** |
| Ghi chú (繰越…) | `#8A94A0` chữ nghiêng | |

Chỉ ba màu trạng thái đó. Không thêm màu nào khác cho tới khi có lý do đo được.
Người dùng thấy ô vàng trên web rồi mở Excel ra vẫn thấy đúng ô vàng đó — không
phải học lại lần hai.

### 7.3 Chữ

```css
font-family: "Inter", "Noto Sans JP", "Yu Gothic UI", system-ui, sans-serif;
font-variant-numeric: tabular-nums;  /* cột tiền phải thẳng hàng, bắt buộc */
```
Cột tiền căn phải, `tabular-nums`, cỡ 15–16px. Cột 摘要 (katakana) cỡ 15px,
`letter-spacing: .01em` — kana nửa chiều rộng dính nhau rất khó đọc.

### 7.4 Màn hình đối chiếu — chi tiết

```
┌──────────────────────────────────────────────────────────────────────────┐
│ 通帳スキャン   so-ngan-hang.pdf   ⚠ 一部未検証(3行)      [VI|EN|日] [Excel]│  ← thanh dính
├────────────────────────────────┬─────────────────────────────────────────┤
│  ┌──────────────────────────┐  │  #   日付      摘要        出金  入金 残高│
│  │                          │  │  1  04-25  ウツカ ノボル      – 50,000 …│
│  │      ẢNH SỔ GỐC          │  │▶ 2  04-25  料金 ⚠          440      – …│ ←chọn
│  │   ▭ khung đỏ bám dòng    │  │  3  05-01  ｾﾝｺｰ…      177,369      – …│
│  │      đang chọn           │  │                                         │
│  └──────────────────────────┘  │                                         │
│  [− ⌕ +]  [↺ 90°]  trang 2/24  │  ◀ dòng lỗi trước   dòng lỗi sau ▶  (n) │
└────────────────────────────────┴─────────────────────────────────────────┘
```

Chia đôi có **thanh kéo được**, nhớ tỉ lệ người dùng đặt (localStorage).

**Phím tắt** (hiện bằng dấu `?`):

| Phím | Việc |
|---|---|
| `↑` `↓` `←` `→` | ✅ *(31/07/2026)* đi giữa các Ô trong bảng, vệt đỏ trên ảnh bám theo. `←` `→` chỉ nhảy ô khi con trỏ đã ở kịch đầu/kịch cuối chữ, đứng giữa chữ thì vẫn sửa bình thường |
| `n` / `p` | **dòng cần soát tiếp theo / trước đó** — phím quan trọng nhất |
| `Enter` | sửa ô đang chọn · `Tab` sang ô kế · `Esc` huỷ |
| `+` `−` `0` | phóng to / thu nhỏ / vừa khung |
| `r` | xoay ảnh 90° |

**Chi tiết quyết định sản phẩm dùng được hay không:**

1. **Click dòng → ảnh cuộn + zoom tới đúng dòng.** Không có cái này thì tool mất
   hết giá trị (xem §2). Cần bounding box ở §2.
   - ✅ **Nắn phối cảnh** *(01/08/2026)* — `POST /api/ws/:ws/perspective`, kéo 4
     góc thành hình chữ nhật (PIL `Image.transform(PERSPECTIVE)`). Giao diện có
     4 tay nắm kéo được + hai thanh「Nắn dọc」「Nắn ngang」. Đo trên ảnh Fukuoka
     chụp chếch: nắn xong nền tối biến mất, trang đầy khung, **và khung đỏ cũng
     chuẩn hơn hẳn** (trước: dải bắt đầu từ dòng 6 rồi chạy xuống cả phần chú
     thích; sau: bám đúng 24 dòng). Đây là cách thực dụng để cứu những ảnh mà
     thuật toán tự động chịu thua.
   - *Bản 3 (01/08/2026)* — sau khi người dùng báo ẢNH CHỤP ĐIỆN THOẠI sai gần
     100% (ゆうちょ, Fukuoka để bao quát không cắt). Bốn lỗi thật đã sửa:
     **(a)** nền bàn tối quanh cuốn sổ bị tính là mực → cắt về vùng giấy trước
     (ngưỡng neo vào TRUNG VỊ, không phải mức giữa min–max — bản đầu cắt phăng
     cả nửa trang khi có bóng tay); **(b)** ánh sáng loang + mực in hồng nhạt →
     ngưỡng thích nghi theo nền mờ quanh từng điểm; **(c)** sổ đặt nghiêng →
     khử nghiêng bằng biểu đồ chiếu; **(d)** mặt sổ nằm ngang bị co mất độ phân
     giải dọc → bảo đảm ~26px mỗi dòng. Thêm bộ lọc **cột số dư**: dòng nào mép
     phải trống thì không phải dòng giao dịch (gạt được rác nằm giữa hai nửa
     trang, chỗ mà cắt đầu/đuôi không với tới).
     Đo lại: 20/23 mặt sổ scan dò được (bằng bản 2) nhưng dải ĐỀU hơn (0.24 so
     với 0.29) và bám mực sát hơn (0.99 so với 0.97); ảnh chụp ゆうちょ từ chỗ
     dồn cả 21 dải vào nửa dưới trang thành bám đúng dòng.
     ⚠ **Vẫn còn lệch ~1 dòng với ゆうちょ** và đây là giới hạn của phương pháp:
     ゆうちょ in nhãn 「料　金」 ở dòng DƯỚI phần tiền của nó, nên số dòng mực
     KHÁC số giao dịch. Không thuật toán đếm mực nào gỡ được — phải xin toạ độ
     từ model (đổi prompt = mất toàn bộ cache, cần hỏi người dùng trước).
   - *Hiện trạng 31/07/2026 (bản 2):* dùng **ước lượng từ ảnh** (`api/rowmap.py`)
     chứ không phải toạ độ do model trả (đổi prompt = mất toàn bộ cache).
     Bản 2 viết lại quanh hai đặc điểm của trang sổ in: **nhịp dòng cố định**
     (tự tương quan + né bẫy bội số) và **nếp gấp trắng giữa trang**. Lọc chú
     thích nép dưới viền đáy bảng; thừa đỉnh thì bỏ từ đầu trang (rác luôn là
     tựa/tiêu đề); nhịp tán loạn (viết tay) thì tự nhận không dò được.
     **Đo trên 9 mặt sổ thật: 9/9 khớp 1-1 từng dòng (soi mắt từng ảnh);**
     bản 1 chỉ 4/9, dải trôi và đè nếp gấp. 7 test đơn vị tái hiện từng ca
     hỏng trong `tests/test_rowmap.py`.
   - Cách vẽ: **chỉ tô nền, bỏ viền trên/dưới và bỏ nhãn nổi** vì chúng che
     chữ dòng bên cạnh; dò được thì nền đậm (13%), chia đều thì nhạt (7%).
2. **Đếm ngược số dòng cần soát** ở thanh trên: `⚠ còn 3 dòng`. Soát xong một dòng
   thì số giảm ngay — người dùng thấy mình đang tiến tới đích.
3. **Ô 残高 sửa xong → cột kiểm tra tính lại tức thì**, dòng chuyển từ vàng sang
   trắng. Phản hồi phải trong cùng một khung hình, không chờ server.
4. **Máy tự sửa thì phải nói ra**: ô xanh, rê chuột hiện `đã sửa: 出金 ↔ 入金
   (440 → 0 / 0 → 440)` và có nút **hoàn tác**. Không bao giờ giấu.
5. Khi hết dòng vàng, **không** hiện "hoàn tất" trơn tru. Hiện:
   *「残高チェーン検証済（全行一致）— ただし行の欠落や摘要の誤読は検出できません」*
   Nói thật giới hạn của công cụ là điểm bán hàng, không phải điểm yếu.
6. Lúc đang quét: hiện **thumbnail từng trang**, tick dần theo `on_progress`, kèm
   trang đang chạy. PDF 24 trang mất ~4 phút — trang trắng im lặng là mất niềm tin.

---

### 7.5 Nâng cấp trải nghiệm (30/07/2026 — bản mẫu đầu bị chấm 1/10, chuẩn mới cho bản thật)

Bản mẫu `docs/mockup-doi-chieu.html` chỉ chứng minh HÀNH VI (click dòng → khung
bám, sửa ô → tính lại). Bản thật phải đạt các mục dưới đây.

#### Yêu cầu đã chốt

**(1) Hiệu ứng quét ảnh/PDF** — biến 4 phút chờ thành thứ đáng nhìn:
- Thả file vào → từng trang hiện thumbnail xám xếp hàng.
- Trang đang xử lý: **vạch sáng quét dọc qua thumbnail** (như máy scan thật),
  nhịp thở nhẹ quanh viền.
- Trang xong: thumbnail sáng lên, tick ✓, **các dòng đọc được "gõ" dần vào bảng
  bên phải** — người dùng thấy dữ liệu chảy về theo thời gian thực, không phải
  ngồi nhìn spinner.
- Nguồn dữ liệu: `on_progress` của `core.scan()` đẩy qua **SSE** — backend đã
  sẵn sự kiện `page/skip/retry/validate/done`, chỉ cần nối ống.

**(2) Bên trái: chỉnh ảnh trước khi quét** — cắt, xoay, kéo sáng:
- Xoay tự do 90°/180°/270° + kéo thanh xoay tinh chỉnh vài độ (ảnh chụp nghiêng).
- **Cắt (crop)** bằng kéo góc — dùng `react-easy-crop` hoặc canvas.
- Kéo sáng / tương phản (canvas filter, chạy trong trình duyệt, miễn phí).
- Làm xong mới bấm「スキャン」→ gửi bản ĐÃ chỉnh cho model.
- 💰 Cắt không chỉ đẹp: **cắt riêng từng sổ trong ảnh 2 sổ là "đòn lớn cho kana"**
  (TODO #4 trong memory) — người dùng tự cắt = đỡ hẳn lỗi trộn sổ.
- ⚠ Ảnh đã chỉnh = bytes mới = **cache key mới = tốn lượt gọi mới**. Hiện rõ
  điều này trên nút: 「スキャン（1ページ ≈ $0.003）」.

**(3) Tô màu tiền vào / tiền ra** — thấy hướng dòng tiền không cần đọc số:
- 入金 (tiền vào): số kèm dấu **▲ xanh lam**; 出金 (tiền ra): **▼ đỏ gạch**.
  Tô ở CHỮ/dấu hiệu, không tô nền.
- Nền vẫn chỉ dành cho trạng thái (vàng = chưa chắc, xanh lá = máy tự sửa) —
  nếu tô nền cả 2 cột tiền thì màu cảnh báo chìm nghỉm. **Kiểm tra bằng cách
  nheo mắt: thứ duy nhất nổi lên phải là ô vàng.**
- Ô máy KHÔNG chắc chắn ở cột tiền (model đọc mờ, engine đổi cột) vẫn nền vàng
  + tooltip lý do — đúng yêu cầu "dễ dàng biết chỗ nào không chắc chắn".

**(4) Undo / Redo** — `Ctrl+Z` / `Ctrl+Shift+Z` + hai nút ↶ ↷ trên thanh công cụ:
- Mọi thao tác vào một stack: sửa ô, hoàn tác auto-fix, xoá dòng, cắt ảnh.
- Kèm **bảng lịch sử chỉnh sửa** (ô nào, từ gì → thành gì, lúc nào) — vừa là
  undo, vừa là vết kiểm toán cho dữ liệu tài chính (nối thẳng vào nhật ký §3).

**(5) Sáng / tối tuỳ chỉnh** — nút 3 trạng thái: Sáng ☀ / Tối ☾ / Theo hệ thống.
- Toàn bộ màu đã là CSS token (§7.2 có sẵn bảng dark) → chỉ là gắn nút.
- Lưu vào tài khoản, thiết bị nào đăng nhập cũng giữ nguyên.

#### Bổ sung để "xịn" thật sự

- **Tải lên kéo-thả** có xem trước, và **bắt ảnh trùng ngay lúc thả** (tính
  SHA-256 ngay trong trình duyệt, chưa cần upload) — chặn lỗi cộng gấp đôi (§5a)
  từ cửa, kèm hộp so sánh 2 ảnh cạnh nhau "giữ cái nào?".
- **Mini-map dòng vàng** cạnh thanh cuộn bảng (như VS Code): liếc một cái biết
  còn bao nhiêu chỗ phải soát và ở đâu.
- **Cuộn đồng bộ 2 bên**: cuộn bảng thì ảnh trôi theo và ngược lại (tắt được).
- ✅ **Autosave bản soát** *(31/07/2026)*: sửa tới đâu lưu tới đó; F5 hay đăng
  xuất không mất công. `PUT /api/ws/:ws/results/:sheet`, chờ 800ms sau nhịp gõ
  cuối mới ghi, ghi nguyên tử (file tạm + `os.replace`). Trạng thái「Đã lưu」hiện
  ở thanh trên cột kết quả. *Trước đó các ô sửa CHỈ nằm trong bộ nhớ trình
  duyệt — người dùng soát xong cả file rồi mất trắng.*
- **Trang trống lần đầu** có nút「サンプルで試す / Thử với sổ mẫu」— chạy toàn bộ
  luồng bằng dữ liệu giả, không tốn API, để giám đốc bấm chơi mà không sợ hỏng gì.
- **Khoảnh khắc hoàn thành**: dòng vàng cuối được sửa xong → huy hiệu chuyển
  xanh với hiệu ứng ✓ ngắn gọn, thanh tiến độ chạm 100%. Không confetti loè
  loẹt — người dùng là kế toán lớn tuổi, "đầm" hơn "nhí nhố".
- **Skeleton + toast** chuẩn: mọi vùng đang tải có khung xám nhấp nháy; mọi hành
  động có phản hồi (「保存しました」) — không bao giờ màn hình trắng câm lặng.
- Phím tắt đầy đủ (đã có ở §7.4) + nút `?` hiện bảng phím tắt.

---

## 8. Đa ngôn ngữ (tiếng Việt trước, Nhật/Anh sau)

Khung i18n **dựng từ ngày đầu** (nhét chữ vào file dịch ngay từ dòng code đầu
tiên), nhưng **chỉ dịch đủ tiếng Việt trước** — bản Nhật hoàn thiện ở giai đoạn 3.
Thêm ngôn ngữ vào một app đã viết cứng chữ tốn gấp nhiều lần làm đúng từ đầu.

```
web/src/locales/vi.json   ← làm trước, đầy đủ
web/src/locales/ja.json   ← giai đoạn 3, người dùng thật
web/src/locales/en.json   ← dự phòng / demo cho khách nước ngoài
```

Thư viện: `react-i18next`. Chọn ngôn ngữ lưu vào `localStorage` + cột `lang`
trong bảng user. Nút chuyển ở góc phải thanh trên, dạng `VI | EN | 日本語`.

### ⚠ Luật quan trọng: **tên cột KHÔNG dịch**

Người dùng đang đối chiếu với ảnh sổ — trên ảnh in chữ 摘要 thì trên bảng phải
là 摘要. Dịch thành "Nội dung" là bắt họ tự tra nghĩa ngược lại.

⇒ **Tên cột luôn giữ tiếng Nhật**, khi ngôn ngữ là VI/EN thì thêm chú thích nhỏ
bên dưới:

```
  摘要            差引残高          お預り金額
  Nội dung        Số dư            Tiền vào
```

Chỉ **chữ của giao diện** mới dịch: nút, thông báo, menu, lỗi.
Cùng luật đó cho 検証レベル: giữ nguyên câu tiếng Nhật (nó cũng nằm trong file
Excel), thêm dịch nghĩa bên dưới.

Ba thứ hay quên khi làm i18n:
- **Ngày tháng**: VI `25/04/2025`, JA `2025年4月25日`, EN `Apr 25, 2025`.
- **Số tiền**: luôn `¥` và dấu phẩy nghìn ở mọi ngôn ngữ (đây là tiền Nhật).
- **Chiều dài chữ**: nút tiếng Việt dài hơn tiếng Nhật ~1.7 lần. Đừng đặt chiều
  rộng cứng cho nút.

---

## 9. Chọn công nghệ & lộ trình cho người chưa làm web bao giờ

### 9.1 Chốt stack

| Phần | Chọn | Vì sao |
|---|---|---|
| Backend | **FastAPI** | Python — đã biết sẵn. Tự sinh trang thử API tại `/docs`, không cần công cụ ngoài. |
| CSDL | **SQLite** trước, PostgreSQL khi có người thật | SQLite là 1 file, không phải cài server. Dùng SQLModel/SQLAlchemy thì đổi sang Postgres chỉ là đổi chuỗi kết nối. |
| Hàng đợi | **`BackgroundTasks` của FastAPI** trước, Celery sau | Celery kéo theo Redis + tiến trình worker — hai hệ thống nữa phải học. Một người dùng thì chưa cần. |
| Frontend | **Next.js (App Router) + TypeScript** | Quyết định 30/07/2026. Deploy Vercel 1 nút, hệ sinh thái lớn nhất React, tài liệu nhiều. |
| CSS | **Tailwind CSS** | Người mới ra giao diện đẹp và đều nhanh hơn CSS thuần rất nhiều. |
| Thành phần UI | **shadcn/ui** | Copy code vào dự án chứ không phải thư viện — sửa được, không bị khoá. Sinh ra cho Next + Tailwind. |
| Animation | **Framer Motion** | Hiệu ứng quét, chuyển trang, khung đỏ trượt — mượt mà không tự viết keyframe. |

**Cách dùng Next.js không bị ngợp** (nó nhiều khái niệm — SSR, server component,
routing kiểu file — nhưng mình không cần học hết mới bắt đầu):

- **Màn hình đối chiếu = 1 file có `"use client"` ở dòng đầu** → bên trong viết
  React bình thường (useState, sự kiện, canvas). 90% thời gian anh sống ở đây.
- Routing kiểu file chỉ cần nhớ: `app/login/page.tsx` = trang `/login`. Hết.
- Server component / SSR: kệ nó, mặc định của Next đủ tốt. Học sau khi app chạy.
- **Auth và API vẫn ở FastAPI** (JWT) — Next chỉ là giao diện gọi API. KHÔNG dùng
  NextAuth song song kẻo hai hệ thống đăng nhập đá nhau; một nguồn sự thật thôi.
- KHÔNG viết logic trong API routes của Next — mọi xử lý đi qua FastAPI → `core.scan()`.

### 9.2 Thứ tự học — mỗi bước phải chạy được mới sang bước sau

Nguyên tắc: **luôn có một thứ chạy được**. Không viết 2 tuần rồi mới mở trình duyệt.

1. **FastAPI trần**: một route `GET /health` trả `{"ok": true}`. Mở `/docs` bấm thử.
2. **Nối `core.scan()`**: `POST /scan` nhận file → chạy → trả `result.to_dict()`.
   Chưa cần đăng nhập, chưa cần CSDL. Đây là lúc thấy backend đã xong 90%.
3. **Next trần**: `npx create-next-app@latest web` (chọn TypeScript + Tailwind +
   App Router) → sửa `app/page.tsx` in "Xin chào".
4. **Nối hai bên**: form chọn file → gọi `POST /scan` của FastAPI → in JSON ra
   màn hình. Bước này hay vướng **CORS** — thêm `CORSMiddleware` ở FastAPI là xong.
5. **Bảng thật**: đổ JSON vào bảng, tô vàng dòng `status === "check"`.
6. **Ảnh bên trái** + đồng bộ với dòng đang chọn (§7.4). Phần đáng đầu tư nhất.
7. **CSDL + đăng nhập** (`fastapi-users` hoặc tự làm JWT). Làm *sau cùng* trong
   giai đoạn 2 — không có nó vẫn demo được, có nó mà không có màn đối chiếu thì vô nghĩa.

### 9.3 Tên miền & hosting — CHƯA mua gì cả

| Giai đoạn | Chạy ở đâu | Tốn |
|---|---|---|
| Đang code (bây giờ) | `localhost` | $0 |
| Demo cho giám đốc | **Vercel free** (Next.js) + **Render/Railway free** (FastAPI); hoặc Cloudflare Tunnel chiếu từ máy mình | $0 |
| Người thật dùng (giai đoạn 3) | Vercel + backend trả phí (~$5–7/tháng) hoặc 1 VPS; + tên miền | ~$70–100/năm |

- **Tên miền (~$10–12/năm) chỉ mua khi có người thật dùng.** Demo dùng
  `ten-app.vercel.app` miễn phí, giám đốc Nhật không quan tâm URL demo.
- Thứ đáng trả tiền TRƯỚC tên miền: **billing Gemini** (gỡ quota 20 req/ngày — §5c).
- ⚠ Bậc free của Render "ngủ" sau 15 phút không ai gọi — request đầu chờ ~1 phút.
  Demo hẹn giờ thì tự vào đánh thức trước 5 phút.
- ⚠ **Không đưa sổ thật lên demo public.** Demo bằng dữ liệu mẫu; môi trường
  thật mới cần vùng Tokyo + mã hoá + hạn xoá (§5b).

### 9.4 Nhớ ngay từ đầu

- Chạy đồng thời **2 cửa sổ lệnh**: `uvicorn` (cổng 8000) và `npm run dev` (cổng 3000).
- **Không đưa `GEMINI_API_KEY` vào frontend.** Key chỉ nằm ở backend. Frontend
  gọi API của mình, API mới gọi Gemini.
- Ảnh sổ là **dữ liệu tài chính thật** — thư mục lưu ảnh phải nằm ngoài git
  (`.gitignore` đã chặn `input/`, `output/`; thêm thư mục mới của web vào đó).

---

## 10. Điều dễ bị quên

- File Excel dùng **công thức sống**; đọc bằng thư viện (`data_only=True`) sẽ ra rỗng.
  Backend muốn lấy số tổng thì phải **tự tính**, đừng đọc ô công thức.
- Kết quả **dao động giữa các lần chạy** dù cùng ảnh cùng model. Đừng kết luận một
  thay đổi là tốt/xấu chỉ từ một lần chạy.
- `eval.py` là thước đo bắt buộc. Bản thân nó **đã từng có 3 lỗi làm sai lệch mọi
  kết luận** — khi thêm định dạng sổ mới, phải kiểm tra chính eval trước.
- Mỗi dạng sổ có bố cục cột **khác nhau**, kể cả **thứ tự cột tiền ngược lại**
  (ゆうちょ). Không hard-code thứ tự cột ở bất kỳ đâu.
