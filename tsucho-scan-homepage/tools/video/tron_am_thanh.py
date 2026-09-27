# -*- coding: utf-8 -*-
"""Trộn tiếng cho video: giọng đọc + nhạc nền + hiệu ứng, rồi chuẩn hoá độ to.

Làm bằng numpy thay vì chuỗi bộ lọc ffmpeg để ĐO được từng lớp: người viết
(Claude) không nghe được, nên mọi quyết định về độ to phải dựa trên số đo —
giọng hơn nhạc bao nhiêu dB, nhạc lúc im giọng to cỡ nào, đỉnh có vỡ không.

Các lớp:
  giọng    am-thanh/<giọng>/s0…s9.wav, đặt ở đầu cảnh + "tre" (loi-doc.json)
  nhạc     am-thanh/nhac.wav — mờ vào/ra, tự hạ khi có người đọc (hạ TRƯỚC
           giọng 0,2 s để không hụt tiếng đầu câu), và lắng xuống + tối
           tiếng ở cảnh s8「100%とは言いません」rồi mở lại cho lời mời cuối
  hiệu ứng tự tổng hợp (không dùng file ngoài), đặt theo window.HIEU_UNG của
           trang video — nên luôn khớp hình
"""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
from scipy.ndimage import maximum_filter1d
from scipy.signal import butter, lfilter, sosfilt, sosfiltfilt

from am_thanh_chung import SR, db, doc_am_thanh, lufs

LUFS_CUOI = -16.0   # chuẩn cho video trên web / điện thoại
DINH_CUOI = -1.5    # dBFS, chừa chỗ cho bộ giải mã AAC
NHAC_DUOI_GIONG = 8.0  # nhạc lúc không ai đọc: nhỏ hơn giọng chừng này dB (người xem lớn tuổi → chừa rộng)
HA_NHAC = 8.0          # khi có người đọc: hạ nhạc thêm chừng này dB
LANG_S8 = 4.5          # cảnh「100%」: hạ thêm + lọc tối

_rng = np.random.default_rng(7)


# ── Hiệu ứng âm thanh tự tổng hợp ────────────────────────────────────
def _tat(n: int, tau: float) -> np.ndarray:
    return np.exp(-np.arange(n) / (tau * SR))


def _loc(x: np.ndarray, kieu: str, tan) -> np.ndarray:
    return sosfilt(butter(2, tan, kieu, fs=SR, output="sos"), x)


def _chuan(x: np.ndarray, dinh: float) -> np.ndarray:
    """Đưa về đỉnh cho trước + mờ 8 ms ở đuôi: cắt cụt đuôi là nghe thành tiếng 'tách'."""
    x = x / (np.abs(x).max() + 1e-12) * dinh
    m = min(len(x), int(0.008 * SR))
    x[-m:] *= np.linspace(1, 0, m)
    return x.astype(np.float32)


def phim(luc: float = 1.0) -> np.ndarray:
    """Gõ phím: tiếng tách ngắn của nắp phím + chút 'cộc' trầm."""
    n = int(0.03 * SR)
    tach = _loc(_rng.standard_normal(n) * _tat(n, 0.004), "bandpass", [1500, 6000])
    coc = np.sin(2 * np.pi * _rng.uniform(160, 210) * np.arange(n) / SR) * _tat(n, 0.008)
    return _chuan(tach / np.abs(tach).max() * 0.7 + 0.5 * coc, 0.06 * luc)


def dau() -> np.ndarray:
    """Con dấu 判子 đóng xuống: tiếng thụp trầm, tụt cao độ, thêm tiếng giấy."""
    n = int(0.35 * SR)
    t = np.arange(n) / SR
    tan_so = 110 * np.exp(-t / 0.08) + 55
    than = np.sin(2 * np.pi * np.cumsum(tan_so) / SR) * _tat(n, 0.07)
    giay = _loc(_rng.standard_normal(n), "lowpass", 1800) * _tat(n, 0.012)
    return _chuan(than + 0.35 * giay / np.abs(giay).max(), 0.30)


def bam() -> np.ndarray:
    """Click chuột: tiếng nhấn rồi tiếng nhả nhỏ hơn."""
    n = int(0.12 * SR)
    x = np.zeros(n)
    for lech, bien in [(0, 1.0), (int(0.075 * SR), 0.55)]:
        m = int(0.006 * SR)
        b = _loc(_rng.standard_normal(m) * _tat(m, 0.0012), "bandpass", [1200, 5000])  # dải thấp cho êm, đo lần đầu 58% năng lượng > 6 kHz
        x[lech:lech + m] += b / np.abs(b).max() * bien
    return _chuan(x, 0.05)


def _chuong(f0: float, dinh: float) -> np.ndarray:
    """Tiếng chuông nhỏ: vài bồi âm tắt dần, mở 4 ms và đóng 0,3 s cho khỏi 'tách'.

    Dài 2 s: bản 1,2 s đầu tiên bị cắt khi nốt còn to -23 dB so với đỉnh.
    """
    n = int(2.0 * SR)
    t = np.arange(n) / SR
    x = sum(a * np.sin(2 * np.pi * f0 * k * t) * np.exp(-t / tau)
            for k, a, tau in [(1, 1.0, 0.45), (2, 0.35, 0.25), (3, 0.12, 0.15), (4.2, 0.06, 0.1)])
    x[: int(0.004 * SR)] *= np.linspace(0, 1, int(0.004 * SR))
    x[-int(0.3 * SR):] *= np.linspace(1, 0, int(0.3 * SR))
    # Lọc bớt trên 3 kHz: loa laptop/máy tính bảng làm tiếng chuông cao nghe chói
    return _chuan(_loc(x, "lowpass", 3000), dinh)


# Nhạc nền ở giọng Rê trưởng (tao-nhac.py) → chuông lấy ngũ cung Rê cho khỏi chỏi
NOT_TING = [587.33, 659.25, 739.99, 880.0]


def ting(bac: int) -> np.ndarray:
    """Chuông xác nhận: 4 dòng khớp lần lượt đi lên; bac 4 = 'xong' hai nốt."""
    if bac < 4:
        return _chuong(NOT_TING[bac], 0.07)
    a, b = _chuong(880.0, 0.06), _chuong(1174.66, 0.06)
    lech = int(0.09 * SR)
    x = np.zeros(len(b) + lech, np.float32)
    x[: len(a)] += a
    x[lech:] += b
    return x


def roi() -> np.ndarray:
    """Tài liệu rơi vào ô thả: tiếng 'bụp' mềm."""
    n = int(0.18 * SR)
    t = np.arange(n) / SR
    tan_so = 320 * np.exp(-t / 0.05) + 180
    return _chuan(np.sin(2 * np.pi * np.cumsum(tan_so) / SR) * _tat(n, 0.045), 0.08)


def lop_hieu_ung(ds: list[dict], tong: float) -> np.ndarray:
    y = np.zeros(int(tong * SR), np.float32)
    for h in ds:
        if h["loai"] == "phim":
            x, lech = phim(_rng.uniform(0.75, 1.0)), _rng.uniform(-0.006, 0.006)
        else:
            x, lech = {"dau": dau, "bam": bam, "roi": roi}.get(h["loai"], lambda: ting(h.get("bac", 0)))(), 0.0
        i = int((h["t"] + lech) * SR)
        j = min(len(y), i + len(x))
        if 0 <= i < len(y):
            y[i:j] += x[: j - i]
    return y


# ── Giọng đọc ────────────────────────────────────────────────────────
def lop_giong(canh: dict, dong: list[dict], thu_muc: Path, tong: float) -> tuple[np.ndarray, list]:
    y = np.zeros(int(tong * SR), np.float32)
    bang = []
    for d in dong:
        f = thu_muc / f"{d['id']}.wav"
        if not f.exists():
            bang.append((d["id"], None, None, None))
            continue
        x = doc_am_thanh(f)[:, 0]
        a, b = canh[d["id"]]
        dau_cau = a + d.get("tre", 0.4)
        i = int(dau_cau * SR)
        j = min(len(y), i + len(x))
        y[i:j] += x[: j - i]
        bang.append((d["id"], dau_cau, dau_cau + len(x) / SR, b))
    return y, bang


# ── Nhạc nền ─────────────────────────────────────────────────────────
def _duong(t: np.ndarray, moc: list[tuple[float, float]]) -> np.ndarray:
    """Đường cong theo thời gian từ các điểm (giây, giá trị), nội suy mượt."""
    xs, ys = zip(*moc)
    return np.interp(t, xs, ys)


def he_so_ha(giong: np.ndarray, tong: float) -> np.ndarray:
    """Hệ số hạ nhạc (0..1 theo dB) khi có người đọc — mượt, có nhìn trước."""
    buoc = 0.01
    k = int(buoc * SR)
    n = len(giong) // k
    rms = np.sqrt(np.mean(giong[: n * k].reshape(n, k) ** 2, axis=1))
    co = (rms > 10 ** (-42 / 20)).astype(float)
    # Nhìn trước 0,2 s (hạ trước khi giọng vào) và giữ 0,35 s (không nhấp nhô giữa các dấu phẩy)
    truoc, sau = int(0.2 / buoc), int(0.35 / buoc)
    co = maximum_filter1d(co, size=truoc + sau + 1, origin=(sau - truoc) // 2)
    muc = np.empty(n)
    cur = 0.0
    xuong, len_ = np.exp(-buoc / 0.12), np.exp(-buoc / 0.6)
    for i, v in enumerate(co):
        he = xuong if v > cur else len_
        cur = v + (cur - v) * he
        muc[i] = cur
    return np.interp(np.arange(int(tong * SR)) / SR, (np.arange(n) + 0.5) * buoc, muc)


def lop_nhac(nhac: np.ndarray, giong: np.ndarray, canh: dict, tong: float, lufs_giong: float) -> np.ndarray:
    n = int(tong * SR)
    if len(nhac) < n:  # hiếm: nhạc ngắn hơn video → lặp lại
        nhac = np.concatenate([nhac] * (n // len(nhac) + 1))
    x = nhac[:n].astype(np.float32)
    x *= 10 ** ((lufs_giong - NHAC_DUOI_GIONG - lufs(x)) / 20)

    t = np.arange(n) / SR
    s8a, s8b = canh["s8"]
    # Cảnh「100%」: vừa hạ vừa làm tối tiếng (trộn dần sang bản lọc thấp 2,2 kHz)
    toi = sosfiltfilt(butter(2, 2200, "lowpass", fs=SR, output="sos"), x, axis=0).astype(np.float32)
    w = _duong(t, [(0, 0), (s8a - 0.3, 0), (s8a + 0.8, 1), (s8b - 0.2, 1), (s8b + 1.0, 0), (tong, 0)])
    x = x * (1 - w)[:, None] + toi * w[:, None]
    lang = _duong(t, [(0, 0), (s8a - 0.3, 0), (s8a + 0.8, -LANG_S8), (s8b - 0.2, -LANG_S8), (s8b + 1.0, 0), (tong, 0)])
    # Mờ vào 1,2 s đầu, mờ ra 3,5 s cuối (đường cong sin cho êm)
    vao = np.sin(np.clip(t / 1.2, 0, 1) * np.pi / 2)
    ra = np.cos(np.clip((t - (tong - 3.5)) / 3.5, 0, 1) * np.pi / 2)
    ha = -HA_NHAC * he_so_ha(giong, tong)
    return x * (10 ** ((lang + ha) / 20) * vao * ra)[:, None]


# ── Chặn đỉnh ────────────────────────────────────────────────────────
def chan_dinh(x: np.ndarray, tran_db: float = DINH_CUOI) -> np.ndarray:
    """Bộ chặn đỉnh nhìn trước 5 ms: chỉ hạ đúng chỗ vượt ngưỡng, nhả trong 80 ms."""
    tran = 10 ** (tran_db / 20)
    can = np.maximum(np.abs(x).max(axis=1) / tran, 1.0)
    can = maximum_filter1d(can, size=int(0.005 * SR) * 2 + 1)
    # Nhả mượt: bộ lọc một cực trên 1/can, rồi không bao giờ để lớn hơn 1/can
    g = 1 / can
    muot = lfilter([1 - np.exp(-1 / (0.08 * SR))], [1, -np.exp(-1 / (0.08 * SR))], g)
    return x * np.minimum(g, muot)[:, None]


# ── Ghép tất cả ──────────────────────────────────────────────────────
def tron(canh_ds: list[dict], hieu_ung: list[dict], tong: float, am: Path, giong: str,
         co_nhac: bool = True, co_hieu_ung: bool = True) -> tuple[np.ndarray, dict]:
    canh = {c["id"]: (c["a"], c["b"]) for c in canh_ds}
    dong = json.loads((am / "loi-doc.json").read_text(encoding="utf-8"))
    g, bang = lop_giong(canh, dong, am / giong, tong)
    lufs_giong = lufs(g[:, None]) if g.any() else -20.0

    nhac_f = am / "nhac.wav"
    m = lop_nhac(doc_am_thanh(nhac_f, kenh=2), g, canh, tong, lufs_giong) if co_nhac and nhac_f.exists() \
        else np.zeros((int(tong * SR), 2), np.float32)
    h = lop_hieu_ung(hieu_ung, tong) if co_hieu_ung else np.zeros(int(tong * SR), np.float32)

    tron_ = m + (g + h)[:, None]
    tang = LUFS_CUOI - lufs(tron_)
    ra = chan_dinh(tron_ * 10 ** (tang / 20))

    # Số đo để báo cáo: giọng hơn nhạc bao nhiêu dB trong lúc đọc, nhạc lúc im giọng
    k = 10 ** (tang / 20)
    so = {"lufs": lufs(ra), "dinh": db(float(np.abs(ra).max())), "giong": bang,
          "tang_db": tang, "cau": []}
    for id_, a, b, _ in bang:
        if a is None:
            continue
        i, j = int(a * SR), int(b * SR)
        so["cau"].append((id_, lufs(g[i:j, None] * k) - lufs(m[i:j] * k)))
    im = he_so_ha(g, tong) < 0.05
    so["nhac_luc_im"] = lufs(m[im] * k) if im.any() else float("nan")
    return ra.astype(np.float32), so
