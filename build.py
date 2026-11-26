"""Dựng hai bản trang báo chuyển địa chỉ từ src/ (sửa src/ rồi chạy: python build.py, sau đó commit cả kết quả).

- render/site/   → tsucho-scan.onrender.com  ⇒ https://app.tsucho-scan.com  (ứng dụng)
- vercel/public/ → tsucho-scan.vercel.app    ⇒ https://tsucho-scan.com      (trang giới thiệu)
"""

import shutil
from pathlib import Path

HERE = Path(__file__).resolve().parent
SRC = HERE / "src"
ASSETS = ["redirect.css", "redirect.js", "icon.svg", "favicon.ico", "robots.txt"]

SITES = {
    HERE / "render" / "site": dict(
        SITE="app",
        TARGET="https://app.tsucho-scan.com",
        OLD_HOST="tsucho-scan.onrender.com",
        NEW_HOST="app.tsucho-scan.com",
        THEME="#1f3478",
        TITLE_JA="通帳スキャンは新しいアドレスに移りました",
        LEAD_JA="2026年11月25日より、通帳スキャンのアプリは下記の新しいアドレスでご提供しています。"
        "新しいアドレスでは、あらためてログインしてください。",
        DESC="通帳スキャンのアプリは 2026年11月25日より app.tsucho-scan.com に移転しました。",
    ),
    HERE / "vercel" / "public": dict(
        SITE="home",
        TARGET="https://tsucho-scan.com",
        OLD_HOST="tsucho-scan.vercel.app",
        NEW_HOST="tsucho-scan.com",
        THEME="#1b1d1a",
        TITLE_JA="紹介サイトは新しいアドレスに移りました",
        LEAD_JA="2026年11月25日より、通帳スキャンの紹介サイトは下記の新しいアドレスでご案内しています。"
        "内容はそのままご覧いただけます。",
        DESC="通帳スキャンの紹介サイトは 2026年11月25日より tsucho-scan.com に移転しました。",
    ),
}


def main() -> None:
    page = (SRC / "page.html").read_text(encoding="utf-8")
    for out, cfg in SITES.items():
        html = page
        for k, v in cfg.items():
            html = html.replace("{{" + k + "}}", v)
        assert "{{" not in html, f"còn chỗ trống chưa điền trong {out}"
        if out.exists():
            shutil.rmtree(out)
        out.mkdir(parents=True)
        (out / "index.html").write_text(html, encoding="utf-8", newline="\n")
        for a in ASSETS:
            shutil.copyfile(SRC / a, out / a)
        print("OK", out.relative_to(HERE).as_posix())


if __name__ == "__main__":
    main()
