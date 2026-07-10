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

Đặt ảnh (jpg/png) hoặc PDF sổ ngân hàng vào thư mục `input/`, rồi:

```bash
python main.py input/ten_anh.jpg -o output/ket_qua.xlsx
```

Không truyền `-o` thì kết quả tự lưu vào `output/<tên file>.xlsx`.

File Excel gồm các cột: 日付 / 摘要 / お支払金額 / お預り金額 / 残高 / 確認.
Dòng nghi sai (lệch checksum số dư, chữ mờ) được **tô vàng** kèm lý do ở cột 確認.
Cuối bảng có 出金合計・入金合計 bằng công thức `=SUM`.

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
