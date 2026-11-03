# Đóng gói CẢ web lẫn API vào MỘT dịch vụ.
#
# Vì sao gộp: web là trang tĩnh (Next.js `output: "export"`), FastAPI phục vụ
# luôn được. Một dịch vụ = một tên miền = không cấu hình CORS, cookie phiên là
# first-party, và người dùng chỉ nhận đúng một đường link.

# ── Bước 1: dựng trang web tĩnh ──────────────────────────────────────
FROM node:22-slim AS web
WORKDIR /web
# Chép package trước để Docker giữ lại lớp cài thư viện khi chỉ sửa code
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web/ ./
# KHÔNG truyền NEXT_PUBLIC_API_URL: để trống thì web gọi API bằng đường dẫn
# tương đối (/api/...), tức là cùng gốc với chính nó.
RUN npm run build

# ── Bước 2: máy chủ Python ───────────────────────────────────────────
FROM python:3.12-slim
WORKDIR /app

# Numeric OCR is local to the service; Japanese tessdata helps with passbook
# print. The small ONNX models are bundled in the RapidOCR wheel below.
# fonts-ipafont-gothic: ảnh sổ MẪU (api/sample.py) in chữ Nhật; python:slim không có font CJK nào
# nên thiếu gói này thì sổ mẫu trên máy chủ mất hết chữ Nhật (chỉ còn ô trống/ô vuông).
RUN apt-get update && apt-get install -y --no-install-recommends \
    tesseract-ocr tesseract-ocr-jpn fonts-ipafont-gothic && rm -rf /var/lib/apt/lists/*

ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

# TẮT OCR cục bộ mặc định: đo luồng demo (tải ảnh chụp → quét → khung đỏ → xuất) thì bật OCR RAM đỉnh 795MB, tắt
# 220MB. Gói 512MB của Render mà bật là tiến trình bị giết giữa chừng → 502 liên tục. Tắt thì mất tự xoay ảnh lúc tải
# lên (mô hình vẫn đọc được ảnh nằm ngang) và khung đỏ chỉ ước lượng. Máy chủ ≥2GB: đặt TSUCHO_LOCAL_OCR=1 trên Render.
ENV TSUCHO_LOCAL_OCR=0

COPY requirements.txt requirements-rowmap.txt ./
RUN pip install --no-cache-dir -r requirements.txt -r requirements-rowmap.txt

COPY api/ ./api/
COPY prompts/ ./prompts/
COPY core.py export.py extract.py review.py validate.py ./
# Ảnh sổ mẫu + kết quả đọc sẵn: nút「サンプル通帳で試す」quét chúng mà không gọi mô hình
COPY samples/ ./samples/
COPY --from=web /web/out ./web/out

# Ảnh sổ, file Excel và CSDL tài khoản nằm hết trong đây. Khi triển khai PHẢI
# gắn ổ đĩa lưu trữ bền vào đúng chỗ này, nếu không deploy lại là mất sạch.
RUN mkdir -p /app/.data
VOLUME ["/app/.data"]

EXPOSE 8000

# CHỈ MỘT tiến trình (không dùng --workers): danh sách lần quét đang chạy nằm
# trong bộ nhớ, nhiều tiến trình thì trình duyệt hỏi tiến trình A về job do
# tiến trình B tạo và không thấy đâu cả.
CMD ["sh", "-c", "uvicorn api.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
