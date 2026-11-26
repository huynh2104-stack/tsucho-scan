"""Gửi thư (xác minh email, đặt lại mật khẩu) — docs/KE_HOACH_DANG_NHAP.md §4.

- Có `RESEND_API_KEY` → POST https://api.resend.com/emails trong luồng nền (không bắt người dùng chờ);
  lỗi chỉ ghi log. Người gửi: `TSUCHO_MAIL_FROM` (mặc định `通帳スキャン <no-reply@tsucho-scan.com>`).
- KHÔNG có khoá (máy phát triển, test) → ghi thư ra `DATA_DIR/outbox/<yyyymmdd-HHMMSS-ffffff>-<mục đích>.txt`
  ĐỒNG BỘ (để test và người phát triển đọc được ngay) và log một dòng.
- Link trong thư = `TSUCHO_PUBLIC_URL` (mặc định http://localhost:3000) + `/verify/#token=…` hoặc `/reset/#token=…`.
  Token nằm SAU dấu # nên không vào access log của máy chủ/proxy và không vào header Referer.
- Mẫu thư 3 thứ tiếng: ja (mặc định) / vi / en, theo `lang` giao diện gửi lên.
"""

from __future__ import annotations

import html as _html
import json
import logging
import os
import re
import sys
import threading
import urllib.error
import urllib.request
from datetime import datetime

from . import workspace

log = logging.getLogger("tsucho.mailer")

RESEND_URL = "https://api.resend.com/emails"
DEFAULT_FROM = "通帳スキャン <no-reply@tsucho-scan.com>"
LANGS = ("ja", "vi", "en")


def public_url() -> str:
    return os.getenv("TSUCHO_PUBLIC_URL", "http://localhost:3000").strip().rstrip("/") or "http://localhost:3000"


def _lang(lang: str | None) -> str:
    return lang if lang in LANGS else "ja"


# ── Chạy việc gửi thư ở luồng nền ─────────────────────────────────────
# /register, /resend, /forgot trả lời NGAY: tra tài khoản + tạo token + hạn mức + gửi thư chạy nền, nên thời gian trả
# lời không tố cáo email nào đã có tài khoản. Test đặt TSUCHO_MAIL_SYNC=1 để chạy đồng bộ (hoặc gọi `wait_idle()`).

_bg: list[threading.Thread] = []
_bg_lock = threading.Lock()


def background(fn, *args) -> None:
    def run():
        try:
            fn(*args)
        except Exception:
            log.exception("việc nền gửi thư hỏng")

    if os.getenv("TSUCHO_MAIL_SYNC") == "1":
        run()
        return
    t = threading.Thread(target=run, daemon=True, name="mail-bg")
    with _bg_lock:
        _bg[:] = [x for x in _bg if x.is_alive()]
        _bg.append(t)
    t.start()


def wait_idle(timeout: float = 10.0) -> None:
    with _bg_lock:
        pending = list(_bg)
    for t in pending:
        t.join(timeout)


def can_deliver() -> bool:
    """Thư có tới người nhận thật không: có RESEND_API_KEY, hoặc đang chạy trên máy phát triển (outbox là đủ)."""
    url = public_url().lower()
    local = re.match(r"https?://(localhost|127\.0\.0\.1|\[::1\])(:\d+)?(/|$)", url)
    return bool(local) or bool(os.getenv("RESEND_API_KEY", "").strip())


def warn_if_unconfigured() -> None:
    """Chạy ở máy chủ thật (TSUCHO_PUBLIC_URL không phải localhost) mà thiếu RESEND_API_KEY thì thư xác minh/đặt
    lại mật khẩu chỉ nằm trong thư mục outbox — người dùng không nhận được gì. Cảnh báo to ngay lúc khởi động."""
    url = public_url().lower()
    local = re.match(r"https?://(localhost|127\.0\.0\.1|\[::1\])(:\d+)?(/|$)", url)
    if not local and not os.getenv("RESEND_API_KEY", "").strip():
        msg = (f"!!! CẢNH BÁO: TSUCHO_PUBLIC_URL={url} nhưng KHÔNG có RESEND_API_KEY — thư xác minh email và đặt lại "
               "mật khẩu sẽ KHÔNG được gửi (chỉ ghi vào DATA_DIR/outbox). Hãy đặt RESEND_API_KEY.")
        log.warning(msg)
        print(msg, file=sys.stderr, flush=True)


# ── Mẫu thư ───────────────────────────────────────────────────────────
# {link} = đường dẫn; {hours}/{minutes} = hạn dùng của link.

_TEMPLATES = {
    "verify": {
        "ja": ("【通帳スキャン】メールアドレスの確認",
               "通帳スキャンにご登録いただきありがとうございます。\n"
               "下のリンクを開いて、メールアドレスの確認を完了してください。\n\n{link}\n\n"
               "このリンクの有効期限は{hours}時間です。\n"
               "心当たりがない場合はこのメールを破棄してください。"),
        "vi": ("[通帳スキャン] Xác minh địa chỉ email",
               "Cảm ơn bạn đã đăng ký 通帳スキャン.\n"
               "Hãy mở liên kết dưới đây để hoàn tất xác minh email.\n\n{link}\n\n"
               "Liên kết có hiệu lực trong {hours} giờ.\n"
               "Nếu bạn không đăng ký, hãy bỏ qua thư này."),
        "en": ("[Tsucho Scan] Confirm your email address",
               "Thank you for signing up for Tsucho Scan.\n"
               "Open the link below to confirm your email address.\n\n{link}\n\n"
               "This link is valid for {hours} hours.\n"
               "If you did not sign up, please ignore this email."),
    },
    "exists": {
        "ja": ("【通帳スキャン】すでにアカウントがあります",
               "このメールアドレスはすでに登録されています。\n"
               "ログインしてください。パスワードをお忘れの場合は、下のリンクから再設定できます。\n\n{link}\n\n"
               "心当たりがない場合はこのメールを破棄してください。"),
        "vi": ("[通帳スキャン] Bạn đã có tài khoản",
               "Địa chỉ email này đã được đăng ký.\n"
               "Hãy đăng nhập. Nếu quên mật khẩu, bạn có thể đặt lại qua liên kết dưới đây.\n\n{link}\n\n"
               "Nếu bạn không thực hiện yêu cầu này, hãy bỏ qua thư này."),
        "en": ("[Tsucho Scan] You already have an account",
               "This email address is already registered.\n"
               "Please sign in. If you forgot your password, you can reset it using the link below.\n\n{link}\n\n"
               "If you did not make this request, please ignore this email."),
    },
    "reset": {
        "ja": ("【通帳スキャン】パスワードの再設定",
               "パスワードの再設定が依頼されました。\n"
               "下のリンクから新しいパスワードを設定してください。\n\n{link}\n\n"
               "このリンクの有効期限は{minutes}分です。\n"
               "心当たりがない場合はこのメールを破棄してください。"),
        "vi": ("[通帳スキャン] Đặt lại mật khẩu",
               "Có yêu cầu đặt lại mật khẩu cho tài khoản của bạn.\n"
               "Hãy mở liên kết dưới đây để đặt mật khẩu mới.\n\n{link}\n\n"
               "Liên kết có hiệu lực trong {minutes} phút.\n"
               "Nếu bạn không yêu cầu, hãy bỏ qua thư này."),
        "en": ("[Tsucho Scan] Reset your password",
               "A password reset was requested for your account.\n"
               "Open the link below to set a new password.\n\n{link}\n\n"
               "This link is valid for {minutes} minutes.\n"
               "If you did not request this, please ignore this email."),
    },
}


def render(purpose: str, lang: str | None, link: str) -> tuple[str, str, str]:
    """(tiêu đề, chữ thuần, HTML) của thư `purpose` ('verify' | 'exists' | 'reset') bằng thứ tiếng `lang`."""
    from . import auth   # nạp muộn: auth không phụ thuộc mailer, tránh vòng khi sau này auth cần gửi thư

    subject, body = _TEMPLATES[purpose][_lang(lang)]
    text = body.format(link=link, hours=auth.VERIFY_HOURS, minutes=auth.RESET_MINUTES)
    safe = _html.escape(link, quote=True)
    paras = "".join(f"<p>{_html.escape(p).replace(chr(10), '<br>')}</p>" for p in body.split("\n\n"))
    paras = paras.replace("{link}", f'<a href="{safe}">{safe}</a>')
    paras = paras.replace("{hours}", str(auth.VERIFY_HOURS)).replace("{minutes}", str(auth.RESET_MINUTES))
    return subject, text, f"<div>{paras}</div>"


def send_verify(to: str, token: str, lang: str | None) -> None:
    subject, text, html = render("verify", lang, f"{public_url()}/verify/#token={token}")
    send(to, subject, text, html, purpose="verify")


def send_exists(to: str, lang: str | None) -> None:
    subject, text, html = render("exists", lang, f"{public_url()}/forgot/")
    send(to, subject, text, html, purpose="exists")


def send_reset(to: str, token: str, lang: str | None) -> None:
    subject, text, html = render("reset", lang, f"{public_url()}/reset/#token={token}")
    send(to, subject, text, html, purpose="reset")


# ── Gửi ───────────────────────────────────────────────────────────────

def send(to: str, subject: str, text: str, html: str = "", purpose: str = "mail") -> None:
    """Gửi một thư. Không bao giờ ném lỗi ra ngoài (gửi hỏng không được làm hỏng yêu cầu đăng nhập)."""
    key = os.getenv("RESEND_API_KEY", "").strip()
    try:
        if key:
            threading.Thread(
                target=_send_resend, args=(key, to, subject, text, html), daemon=True, name="mailer"
            ).start()
        else:
            _write_outbox(to, subject, text, html, purpose)
    except Exception:
        log.exception("không gửi được thư (%s)", purpose)


def _send_resend(key: str, to: str, subject: str, text: str, html: str) -> None:
    payload = {
        "from": os.getenv("TSUCHO_MAIL_FROM", DEFAULT_FROM),
        "to": [to],
        "subject": subject,
        "text": text,
    }
    if html:
        payload["html"] = html
    req = urllib.request.Request(
        RESEND_URL,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
            "User-Agent": "tsucho-scan/1.0",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            resp.read()
            status = getattr(resp, "status", 200)
            if not 200 <= status < 300:
                log.error("Resend trả HTTP %s — thư không được gửi", status)
    except urllib.error.HTTPError as e:           # chỉ ghi mã trạng thái — không lộ khoá hay nội dung thư
        log.error("Resend trả HTTP %s — thư không được gửi", e.code)
    except Exception as e:                        # mạng đứt, timeout...: chỉ ghi log, không ném
        log.error("Resend gửi thư thất bại: %s", type(e).__name__)


def _write_outbox(to: str, subject: str, text: str, html: str, purpose: str) -> None:
    out = workspace.DATA_DIR / "outbox"
    out.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S-%f")
    name = f"{stamp}-{purpose}"
    path = out / f"{name}.txt"
    n = 1
    while path.exists():                          # cùng micro giây (hiếm): không ghi đè
        n += 1
        path = out / f"{name}-{n}.txt"
    path.write_text(f"To: {to}\nSubject: {subject}\n\n{text}\n", encoding="utf-8")
    log.info("thư ghi ra %s (chưa đặt RESEND_API_KEY)", path)
