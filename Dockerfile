# Render (tsucho-scan.onrender.com): chỉ còn là trang báo chuyển sang https://app.tsucho-scan.com.
# Ứng dụng thật chạy ở máy chủ laptop; nhánh này không chứa mã ứng dụng.
FROM python:3.12-alpine
WORKDIR /srv
COPY render/server.py ./
COPY render/site ./site
ENV PORT=10000 PYTHONUNBUFFERED=1
EXPOSE 10000
USER nobody
CMD ["python", "-I", "server.py"]
