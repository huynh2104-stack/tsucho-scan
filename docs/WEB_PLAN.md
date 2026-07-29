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

**Việc đầu tiên phải làm ở backend** (chưa cần web):
tách lõi thành hàm gọi được, hiện `main.py` đang trộn CLI với xử lý:

```python
# core.py  (đề xuất)
def scan(files: list[Path], rotate: int = 0) -> ScanResult:
    """Trả về accounts + thống kê + mức độ bảo đảm. Không in ra màn hình."""
```

`main.py` (CLI) và API cùng gọi `scan()`. Không viết lại logic lần hai.

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
1. Tách `core.scan()` khỏi CLI.
2. Thêm bounding box mỗi dòng vào schema trích xuất.
3. Chống trùng file.

**Giai đoạn 2 — web dùng được**
4. API: đăng nhập, tải lên, xem kết quả, tải Excel.
5. Màn hình đối chiếu ảnh ↔ bảng (§2) — **đầu tư nhiều nhất vào đây**.
6. Dashboard + hàng đợi xử lý.

**Giai đoạn 3 — cho người thật dùng**
7. Phân quyền, nhật ký.
8. Toàn bộ giao diện **tiếng Nhật** (giám đốc Nhật là người dùng, không phải người Việt).
9. Bật trả phí / Vertex AI.

---

## 7. Về giao diện

Tham khảo được: bố cục "ảnh trái – bảng phải" của các tool 仕訳変換 Nhật.
**Không sao chép** màu sắc, bố cục chi tiết, icon hay câu chữ của họ.

Định hướng riêng nên theo:
- **Sạch và ít màu.** Chỉ dùng màu để chỉ trạng thái: vàng = cần soát, xanh = đã sửa,
  xám = ghi chú. Màu dùng bừa sẽ làm mất ý nghĩa cảnh báo.
- **Chữ to, tương phản cao.** Người dùng cuối là người Nhật lớn tuổi.
- **Tiếng Nhật là ngôn ngữ chính.** Thuật ngữ dùng đúng chuẩn sổ: 摘要 / 差引残高 /
  お預り金額 / お支払金額 — đừng tự dịch sang từ khác.
- **Luôn hiện mức độ bảo đảm** ở đầu mỗi kết quả, kèm câu nhắc rằng máy không tự phát
  hiện được dòng bị sót.

---

## 8. Điều dễ bị quên

- File Excel dùng **công thức sống**; đọc bằng thư viện (`data_only=True`) sẽ ra rỗng.
  Backend muốn lấy số tổng thì phải **tự tính**, đừng đọc ô công thức.
- Kết quả **dao động giữa các lần chạy** dù cùng ảnh cùng model. Đừng kết luận một
  thay đổi là tốt/xấu chỉ từ một lần chạy.
- `eval.py` là thước đo bắt buộc. Bản thân nó **đã từng có 3 lỗi làm sai lệch mọi
  kết luận** — khi thêm định dạng sổ mới, phải kiểm tra chính eval trước.
- Mỗi dạng sổ có bố cục cột **khác nhau**, kể cả **thứ tự cột tiền ngược lại**
  (ゆうちょ). Không hard-code thứ tự cột ở bất kỳ đâu.
