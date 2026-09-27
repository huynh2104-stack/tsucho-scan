# -*- coding: utf-8 -*-
"""Quay video giới thiệu từ video-gioi-thieu.html.

Vì sao làm kiểu này thay vì quay màn hình: trang HTML tự vẽ mỗi khung hình
theo thời gian t (hàm seek(t) trong trang), không dùng CSS animation. Script
chỉ việc tua tới từng khung, chụp, rồi đẩy thẳng vào ffmpeg. Máy chậm hay
nhanh thì video ra vẫn y hệt, không bao giờ bị giật hay rớt khung.

Xuất ra H.264 + yuv420p vì đó là thứ iPhone/Safari chắc chắn phát được —
ffmpeg đi kèm Playwright chỉ có VP8 (WebM) nên phải dùng imageio-ffmpeg.

Cần có:
    python -m pip install playwright imageio-ffmpeg
    python -m playwright install chromium

Chạy (từ thư mục gốc repo):
    python tsucho-scan-homepage/tools/video/quay-video.py              # quay cả video (~3 phút) + ghép tiếng
    python tsucho-scan-homepage/tools/video/quay-video.py --anh 9 33   # chỉ chụp vài khung để soát
    python tsucho-scan-homepage/tools/video/quay-video.py --chi-tron   # chỉ ghép lại tiếng (vài giây)

Tiếng (giọng đọc, nhạc nền, hiệu ứng): xem am-thanh/LOI-DOC.md.
"""
from __future__ import annotations

import argparse
import base64
import shutil
import subprocess
import sys
import time
from pathlib import Path

try:
    import imageio_ffmpeg
    from playwright.sync_api import sync_playwright
except ImportError:
    sys.exit("Thiếu thư viện. Chạy: python -m pip install playwright imageio-ffmpeg")

DAY = Path(__file__).resolve().parent
sys.path.insert(0, str(DAY))  # am_thanh_chung, tron_am_thanh
HTML = DAY / "video-gioi-thieu.html"
RA = DAY.parent.parent / "public" / "video"
TAM = DAY / ".tam"
AM = DAY / "am-thanh"

W, H = 1920, 1080
# Khung hình làm ảnh bìa (poster) trên trang: tên + khẩu hiệu đã hiện đủ
# nhưng ba thẻ tính năng CHƯA hiện — chừa chỗ cho nút phát của trang
# (components/intro-video.tsx đặt nút ở 78% chiều cao). Tính theo cảnh s1
# chứ không ghi cứng giây, vì độ dài các cảnh đổi theo giọng đọc. Thẻ
# tính năng hiện ở giây 4,2 của s1 (data-in trong HTML).
BIA = ("s1", 4.1)


def mo_trang(p):
    trinh_duyet = p.chromium.launch()
    trang = trinh_duyet.new_page(viewport={"width": W, "height": H}, device_scale_factor=1)
    trang.goto(HTML.as_uri())
    # Đợi phông chữ Google + ảnh nạp xong, nếu không vài khung đầu sẽ sai phông
    trang.evaluate("() => window.__ready")
    return trinh_duyet, trang


def chup(cdp) -> bytes:
    r = cdp.send("Page.captureScreenshot", {"format": "png", "optimizeForSpeed": True})
    return base64.b64decode(r["data"])


def chup_anh(giay: list[float], thu_muc: Path) -> None:
    thu_muc.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as p:
        trinh_duyet, trang = mo_trang(p)
        for t in giay:
            trang.evaluate("t => window.seek(t)", t)
            duong_dan = thu_muc / f"khung-{t:06.2f}.png"
            trang.screenshot(path=str(duong_dan))
            print(duong_dan)
        trinh_duyet.close()


def chup_bia(trang, ten: str) -> Path:
    """Ảnh bìa: JPEG nhẹ, hiện trước khi người xem bấm phát."""
    RA.mkdir(parents=True, exist_ok=True)
    bia = RA / f"{ten}-poster.jpg"
    canh, tre = BIA
    trang.evaluate("([id, tre]) => window.seek(window.CANH.find((c) => c.id === id).a + tre)", [canh, tre])
    trang.screenshot(path=str(bia), type="jpeg", quality=86)
    return bia


def quay(fps: int, crf: int, tu: float, den: float | None, ten: str) -> None:
    RA.mkdir(parents=True, exist_ok=True)
    TAM.mkdir(parents=True, exist_ok=True)
    # Bản CÂM giữ trong .tam: ghép lại giọng/nhạc bao nhiêu lần cũng đi từ
    # bản này, không phải quay lại hình (3 phút) mỗi lần đổi một câu đọc.
    mp4 = TAM / f"{ten}-cam.mp4"
    ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()

    with sync_playwright() as p:
        trinh_duyet, trang = mo_trang(p)
        tong = trang.evaluate("() => window.DURATION")
        den = tong if den is None else min(den, tong)
        so_khung = int(round((den - tu) * fps))
        bia = chup_bia(trang, ten)

        lenh = [
            ffmpeg, "-y", "-loglevel", "error",
            "-f", "image2pipe", "-framerate", str(fps), "-c:v", "png", "-i", "-",
            "-c:v", "libx264", "-preset", "slow", "-crf", str(crf), "-tune", "animation",
            "-profile:v", "high", "-level", "4.1",
            # Đổi RGB → YUV theo chuẩn BT.709 và ghi nhãn đúng, để màu xanh
            # mực không bị ngả khi phát trên Safari/Chrome. Phải gắn nhãn
            # bằng setparams: ảnh PNG vào không có nhãn, và ffmpeg 7 lấy
            # nhãn theo từng khung chứ không theo cờ -color_primaries.
            "-vf", "scale=out_color_matrix=bt709:out_range=tv,format=yuv420p,"
                   "setparams=colorspace=bt709:color_primaries=bt709:color_trc=bt709:range=tv",
            "-movflags", "+faststart",
            str(mp4),
        ]
        ff = subprocess.Popen(lenh, stdin=subprocess.PIPE)
        cdp = trang.context.new_cdp_session(trang)
        bat_dau = time.time()
        for i in range(so_khung):
            trang.evaluate("t => window.seek(t)", tu + i / fps)
            ff.stdin.write(chup(cdp))
            if i % (fps * 5) == 0 and i:
                da = time.time() - bat_dau
                con = da / i * (so_khung - i)
                print(f"  {i}/{so_khung} khung — còn khoảng {con:.0f}s", flush=True)
        ff.stdin.close()
        if ff.wait() != 0:
            sys.exit("ffmpeg báo lỗi — xem dòng lỗi phía trên.")
        trinh_duyet.close()

    print(f"Quay xong hình ({so_khung} khung, {time.time() - bat_dau:.0f}s). Ảnh bìa: {bia}")
    tron(ten)  # giọng/nhạc/hiệu ứng mặc định


def tron(ten: str, giong: str = "sulafat", co_nhac: bool = True, co_hieu_ung: bool = True) -> None:
    """Ghép giọng đọc + nhạc nền + hiệu ứng (tron_am_thanh.py) vào bản câm.

    Không có giọng lẫn nhạc thì xuất video câm như cũ.
    """
    cam = TAM / f"{ten}-cam.mp4"
    ra = RA / f"{ten}.mp4"
    if not cam.exists():
        sys.exit(f"Chưa có bản câm {cam} — chạy quay-video.py (không cờ) một lần trước.")
    if not (AM / giong).exists() and not (AM / "nhac.wav").exists():
        shutil.copyfile(cam, ra)
        print(f"Không có giọng/nhạc trong {AM} — xuất video câm: {ra}")
        return

    from am_thanh_chung import ghi_wav
    from tron_am_thanh import tron as tron_tieng

    with sync_playwright() as p:
        trinh_duyet, trang = mo_trang(p)
        canh = trang.evaluate("() => window.CANH")
        hieu_ung = trang.evaluate("() => window.HIEU_UNG")
        tong = trang.evaluate("() => window.DURATION")
        trinh_duyet.close()

    am, so = tron_tieng(canh, hieu_ung, tong, AM, giong, co_nhac, co_hieu_ung)
    ok = True
    for id_, a, b, het_canh in so["giong"]:
        if a is None:
            print(f"  {id_}: THIẾU file giọng")
            ok = False
            continue
        vua = b <= het_canh - 0.2
        ok &= vua
        print(f"  {id_}: đọc {a:5.1f}–{b:5.1f}s, cảnh hết {het_canh:5.1f}s  {'OK' if vua else 'ĐÈ SANG CẢNH SAU'}")
    for id_, hon in so["cau"]:
        print(f"  {id_}: giọng to hơn nhạc {hon:4.1f} dB")
    print(f"Nhạc lúc không ai đọc: {so['nhac_luc_im']:.1f} LUFS | cả video: {so['lufs']:.1f} LUFS, "
          f"đỉnh {so['dinh']:.1f} dBFS")
    if not ok:
        print("⚠ Có câu thiếu hoặc dài hơn cảnh — vẫn xuất để nghe thử.")

    wav = TAM / f"{ten}-am.wav"
    ghi_wav(wav, am)
    lenh = [
        imageio_ffmpeg.get_ffmpeg_exe(), "-y", "-loglevel", "error", "-i", str(cam), "-i", str(wav),
        "-map", "0:v", "-map", "1:a", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k",
        "-shortest", "-movflags", "+faststart", str(ra),
    ]
    if subprocess.run(lenh).returncode != 0:
        sys.exit("ffmpeg báo lỗi khi ghép âm thanh — xem dòng lỗi phía trên.")
    print(f"Xong: {ra} ({ra.stat().st_size / 1e6:.1f} MB)")


def main() -> None:
    # Cửa sổ lệnh Windows mặc định không in được chữ Việt có dấu
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    ap = argparse.ArgumentParser(description="Quay video giới thiệu 通帳スキャン")
    ap.add_argument("--anh", type=float, nargs="+", help="chỉ chụp ảnh tĩnh ở các giây này để soát")
    ap.add_argument("--ra", type=Path, default=TAM, help="thư mục lưu ảnh tĩnh (mặc định tools/video/.tam)")
    ap.add_argument("--fps", type=int, default=30)
    ap.add_argument("--crf", type=int, default=20, help="chất lượng H.264: nhỏ hơn = nét hơn, file nặng hơn")
    ap.add_argument("--tu", type=float, default=0.0, help="quay từ giây")
    ap.add_argument("--den", type=float, default=None, help="quay tới giây")
    ap.add_argument("--ten", default="gioi-thieu", help="tên file ra trong public/video")
    ap.add_argument("--chi-bia", action="store_true", help="chỉ tạo lại ảnh bìa, không quay video")
    ap.add_argument("--chi-tron", action="store_true", help="chỉ ghép lại giọng đọc + nhạc nền (vài giây), không quay lại hình")
    ap.add_argument("--giong", default="sulafat", help="thư mục giọng trong am-thanh/ (sulafat, grok, …)")
    ap.add_argument("--khong-nhac", action="store_true", help="bỏ nhạc nền")
    ap.add_argument("--khong-hieu-ung", action="store_true", help="bỏ tiếng gõ phím, con dấu, click…")
    a = ap.parse_args()

    if a.chi_tron:
        tron(a.ten, a.giong, not a.khong_nhac, not a.khong_hieu_ung)
    elif a.anh:
        chup_anh(a.anh, a.ra)
    elif a.chi_bia:
        with sync_playwright() as p:
            trinh_duyet, trang = mo_trang(p)
            print(f"Ảnh bìa: {chup_bia(trang, a.ten)}")
            trinh_duyet.close()
    else:
        quay(a.fps, a.crf, a.tu, a.den, a.ten)


if __name__ == "__main__":
    main()
