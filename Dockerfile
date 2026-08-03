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

ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY api/ ./api/
COPY prompts/ ./prompts/
COPY core.py export.py extract.py validate.py ./
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
