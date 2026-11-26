"""Chống bot bằng Cloudflare Turnstile cho /api/auth/register, /forgot, /resend.

Biến môi trường: TURNSTILE_SITE_KEY (công khai, giao diện dùng) và TURNSTILE_SECRET_KEY (bí mật). Thiếu SECRET thì
bỏ qua kiểm (máy phát triển, test). Kiểm đồng bộ, không phụ thuộc email nên không tố cáo email nào đã đăng ký.
"""

from __future__ import annotations

import json
import logging
import os
import sys
import urllib.parse
import urllib.request
import uuid

from . import auth

log = logging.getLogger("tsucho.captcha")

VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify"
MAX_TOKEN = 2048


def secret() -> str:
    return os.getenv("TURNSTILE_SECRET_KEY", "").strip()


def enabled() -> bool:
    return bool(secret())


def site_key() -> str | None:
    """Khoá công khai cho giao diện — chỉ khi CẢ HAI khoá đều đặt."""
    key = os.getenv("TURNSTILE_SITE_KEY", "").strip()
    return key if key and secret() else None


def _post_form(url: str, data: dict) -> dict:
    req = urllib.request.Request(
        url, data=urllib.parse.urlencode(data).encode(), method="POST",
        headers={"Content-Type": "application/x-www-form-urlencoded", "Accept": "application/json",
                 "User-Agent": "tsucho-scan/1.0"},
    )
    with urllib.request.urlopen(req, timeout=10) as resp:
        out = json.loads(resp.read().decode("utf-8"))
    if not isinstance(out, dict):
        raise ValueError("phản hồi không phải JSON object")
    return out


def warn_if_unconfigured() -> None:
    """Máy chủ thật (TSUCHO_PUBLIC_URL không phải localhost) mà thiếu một trong hai khoá Turnstile → cổng đăng ký/quên
    mật khẩu không có chống bot. Cảnh báo to lúc khởi động."""
    if auth.public_is_local():
        return
    if not (os.getenv("TURNSTILE_SECRET_KEY", "").strip() and os.getenv("TURNSTILE_SITE_KEY", "").strip()):
        msg = ("!!! CẢNH BÁO: TSUCHO_PUBLIC_URL không phải localhost nhưng thiếu TURNSTILE_SITE_KEY hoặc "
               "TURNSTILE_SECRET_KEY — /register, /forgot, /resend KHÔNG có chống bot.")
        log.warning(msg)
        print(msg, file=sys.stderr, flush=True)


def _allowed_hostnames() -> set[str]:
    hosts = {"localhost"} if auth.public_is_local() else set()
    urls = [os.getenv("TSUCHO_PUBLIC_URL", "")] + os.getenv("TSUCHO_ORIGINS", "").split(",")
    for u in urls:
        h = urllib.parse.urlsplit(u.strip()).hostname
        if h:
            hosts.add(h.lower())
    return hosts


def verify(token: object, ip: str) -> bool:
    """True nếu không bật captcha hoặc token hợp lệ. Mọi lỗi (mạng, JSON, hostname lạ) → False và ghi log."""
    if not enabled():
        return True
    if not isinstance(token, str) or not token or len(token) > MAX_TOKEN:
        return False
    try:
        out = _post_form(VERIFY_URL, {
            "secret": secret(), "response": token, "remoteip": ip, "idempotency_key": str(uuid.uuid4()),
        })
    except Exception as e:                                   # không log token/secret
        log.warning("Turnstile siteverify lỗi: %s", type(e).__name__)
        return False
    if out.get("success") is not True:
        log.info("Turnstile từ chối: %s", out.get("error-codes"))
        return False
    host = out.get("hostname")
    if not host or str(host).lower() not in _allowed_hostnames():      # thiếu hostname cũng là thất bại
        log.warning("Turnstile hostname thiếu/lạ: %s", host)
        return False
    return True
