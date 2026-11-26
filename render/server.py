"""Máy chủ nhỏ cho tsucho-scan.onrender.com: mọi đường dẫn trả trang báo chuyển sang https://app.tsucho-scan.com.

- GET/HEAD một trang bất kỳ → site/index.html (trang tự đếm 10 giây rồi sang đúng đường dẫn ở địa chỉ mới)
- /api/health → 200 (kiểm tra sức khoẻ của Render)
- /api/* khác hoặc POST/PUT/… → 410 JSON {"detail": {"kind": "moved", "url": ...}} cho tab app cũ còn mở
Không cần thư viện ngoài; chỉ thư viện chuẩn của Python.
"""

import json
import os
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

NEW = "https://app.tsucho-scan.com"
SITE = Path(__file__).resolve().parent / "site"
TYPES = {
    "/redirect.css": "text/css; charset=utf-8",
    "/redirect.js": "text/javascript; charset=utf-8",
    "/icon.svg": "image/svg+xml",
    "/favicon.ico": "image/x-icon",
    "/robots.txt": "text/plain; charset=utf-8",
}
FILES = {p: (SITE / p[1:]).read_bytes() for p in TYPES}
INDEX = (SITE / "index.html").read_bytes()
MOVED = json.dumps({"detail": {"kind": "moved", "url": NEW}}).encode()
HEALTH = json.dumps({"ok": True, "moved_to": NEW}).encode()
COMMON = [
    ("X-Content-Type-Options", "nosniff"),
    ("X-Frame-Options", "DENY"),
    ("Referrer-Policy", "strict-origin-when-cross-origin"),
    ("X-Robots-Tag", "noindex"),
    ("Link", f'<{NEW}/>; rel="canonical"'),
    (
        "Content-Security-Policy",
        "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; base-uri 'none'; "
        "form-action 'none'; frame-ancestors 'none'",
    ),
    ("Strict-Transport-Security", "max-age=31536000"),
]


class Handler(BaseHTTPRequestHandler):
    server_version = "tsucho-moved"
    sys_version = ""

    def _send(self, code: int, body: bytes, ctype: str, cache: str = "no-cache") -> None:
        self.send_response(code)
        for k, v in COMMON:
            self.send_header(k, v)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", cache)
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(body)

    def do_GET(self) -> None:
        path = self.path.split("?", 1)[0].split("#", 1)[0]
        if path == "/api/health":
            return self._send(200, HEALTH, "application/json", "no-store")
        if path.startswith("/api/"):
            return self._send(410, MOVED, "application/json", "no-store")
        if path in FILES:
            return self._send(200, FILES[path], TYPES[path], "public, max-age=3600")
        return self._send(200, INDEX, "text/html; charset=utf-8")

    do_HEAD = do_GET

    def _gone(self) -> None:
        self.close_connection = True
        self._send(410, MOVED, "application/json", "no-store")

    do_POST = do_PUT = do_PATCH = do_DELETE = _gone

    def log_message(self, fmt: str, *args) -> None:  # không ghi IP người xem vào log
        pass


def main() -> None:
    port = int(sys.argv[1]) if len(sys.argv) > 1 else int(os.environ.get("PORT", "10000"))  # Render đặt PORT
    print(f"tsucho-moved: port {port} -> {NEW}", flush=True)
    ThreadingHTTPServer(("0.0.0.0", port), Handler).serve_forever()


if __name__ == "__main__":
    main()
