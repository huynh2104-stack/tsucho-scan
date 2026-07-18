# tsucho-scan

Chuyển ảnh/PDF sổ ngân hàng Nhật (通帳) thành file Excel, dùng Claude API (vision).

**Phase 1**: lõi trích xuất chạy bằng dòng lệnh (chưa có web).

## Cài đặt

```bash
# 1. Cài thư viện
python -m pip install -r requirements.txt

# 2. Tạo file .env và điền API key
copy .env.example .env
# Mở .env, điền ANTHROPIC_API_KEY=sk-ant-...
```

## Cách chạy

Đặt ảnh (jpg/png/webp) hoặc PDF sổ ngân hàng vào thư mục `input/`, rồi:

```bash
python main.py input/ten_anh.jpg -o output/ket_qua.xlsx

# Nếu trang giao dịch bị nằm ngang trong bản scan → xoay trước khi gửi
# (rất quan trọng với Claude: chữ xoay ngang làm model đọc sai nặng)
python main.py input/ten_anh.jpg --rotate 270

# Đặt tên cho sổ mà model không tự nhận ra tên ngân hàng (theo thứ tự sheet)
python main.py input/ten_anh.jpg --banks "福岡銀行,西日本シティ銀行"
```

Không truyền `-o` thì kết quả tự lưu vào `output/<tên đầu vào đầu tiên>.xlsx`.
**Nhiều trang của cùng sổ**: đưa hết vào một lệnh (`python main.py p3.jpg p4.jpg`) —
mỗi trang được trích riêng (cache theo trang) rồi tự nối sổ bằng chuỗi số dư.

Form Excel (học theo skill bank-passbook-to-excel người dùng đã duyệt):
- Đầu sheet: khối thông tin 銀行 / 店番号 / 口座番号 / 名義 / 出典 + chú giải màu.
- Cột theo bố cục sổ: 年月日(西暦) (ô ngày thật) | 区分 | 摘要 | (備考) |
  お支払金額 | お預り金額 | 差引残高 | (取扱店) | 残高チェック | 確認メモ.
  Cột 備考 (テ055, (282)...) và 取扱店 (709/720...) chỉ hiện khi sổ có dữ liệu đó.
- **残高チェック**: công thức Excel sống từng dòng (OK/NG) — sửa tay số liệu là
  Excel tự kiểm lại.
- Ô **vàng nhạt FFF2CC** = chưa chắc chắn (số mờ chưa kiểm chứng được, lệch checksum
  kèm 差額 ở 確認メモ); ô **xanh C6EFCE** = kiểm tra kép đã tự sửa cột. Cờ "số mờ"
  của model chỉ giữ khi chuỗi số dư KHÔNG xác minh được dòng đó.
- Dòng ghi chú của sổ (繰越, 未記帳...) in nghiêng xám, không có số tiền.
- Khối **■ 集計レポート**: 期首残高/期末残高/増減, số lần + tổng 預り/支払, dòng 検算 —
  toàn công thức sống. Kèm **入金・出金の内訳** theo đối tác bằng `COUNTIFS/SUMIFS`.

## Đo độ chính xác (trước khi tin kết quả)

Tự viết file chuẩn cho vài dòng đầu (nhìn sổ gõ tay), rồi:

```bash
python eval.py output/ket_qua.xlsx file_chuan.xlsx
```

In bảng điểm: đúng/sai từng cột (ngày・出金・入金・残高), 摘要 (đúng/gần/sai),
mất dòng, và text ở cột tiền có được giữ không. Mọi thay đổi prompt/model
nên chạy qua thước đo này trước khi kết luận tốt hơn hay tệ hơn.

## Chọn model / chi phí

Model đặt trong `.env` bằng `EXTRACT_MODEL` (xem `.env.example`).
Hỗ trợ 2 nhà cung cấp: tên bắt đầu `claude-*` → Anthropic, `gemini-*` → Google.

| Model | Chi phí/trang | Số tiền・残高 | Chữ (摘要) | Ghi chú |
|---|---|---|---|---|
| `claude-sonnet-5` (mặc định) | $0.014 (đo) | Đúng 100% | Đúng | Chuẩn nhất đã test, cần `--rotate` khi trang nằm ngang |
| `gemini-2.5-flash` | $0.006 (đo), **$0 với free tier** | Đúng 100% (checksum bảo chứng) | Còn sai kana, thiếu text phụ | Mặc định nên dùng hằng ngày; thường đọc được ảnh xoay ngang không cần `--rotate` (nhưng không tuyệt đối). Free tier ~1500 trang/ngày |
| `gemini-3.1-flash-lite` | ~$0.004 | chưa test | chưa test | Mới hơn, cũng có free tier |
| `claude-haiku-4-5` | $0.007 (đo) | Đúng 100%* | Sai nhiều | Có trang mất cả cột 残高 |
| `claude-sonnet-4-6` (cũ) | $0.08 (đo) | Nhầm cột nhiều | Sai nặng | Không dùng nữa |

Lưu ý: `gemini-2.5-flash-lite` đã đóng với người dùng mới (API trả 404).

\* nhầm cột 出金/入金 nhưng phần lớn được kiểm tra kép tự sửa; nếu cả sổ
mất 残高 thì toàn bộ dòng bị đánh dấu「残高が読取れず検証不可」thay vì báo "sạch" ảo.

Lấy `GEMINI_API_KEY` miễn phí (không cần thẻ): <https://aistudio.google.com/apikey>

**Cache:** kết quả được lưu trong `.cache/` theo nội dung file — chạy lại cùng
ảnh (cùng góc xoay, model) thì **miễn phí, không gọi API**. Bỏ qua bằng `--no-cache`.

Mỗi lần chạy CLI đều in số token + chi phí ước tính.

## Chạy test

```bash
python -m pytest
```

## Cấu trúc

| File | Vai trò |
|---|---|
| `extract.py` | Gọi Claude API (claude-sonnet-4-6, vision) → JSON giao dịch |
| `validate.py` | Checksum số dư, chuyển ngày 和暦 → YYYY-MM-DD, đánh dấu dòng cần kiểm tra |
| `export.py` | Xuất Excel bằng openpyxl |
| `main.py` | CLI |
| `prompts/extract_prompt.txt` | System prompt cho model |
