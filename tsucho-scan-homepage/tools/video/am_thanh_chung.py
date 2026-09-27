# -*- coding: utf-8 -*-
"""Công cụ âm thanh dùng chung cho tao-giong.py, tao-nhac.py, quay-video.py.

Mọi tín hiệu là mảng float32 dạng (số mẫu, số kênh), giá trị trong [-1, 1].
Chỉ dùng numpy + scipy + ffmpeg của imageio-ffmpeg, không cần thư viện âm
thanh riêng.
"""
from __future__ import annotations

import io
import subprocess
import wave
from math import gcd
from pathlib import Path

import imageio_ffmpeg
import numpy as np
from scipy.signal import lfilter, resample_poly

SR = 48000  # mọi thứ trộn ở 48 kHz — chuẩn của video


def doc_wav_bytes(du_lieu: bytes) -> tuple[np.ndarray, int]:
    with wave.open(io.BytesIO(du_lieu)) as w:
        sr, ch, sw, n = w.getframerate(), w.getnchannels(), w.getsampwidth(), w.getnframes()
        tho = w.readframes(n)
    if sw != 2:
        raise ValueError(f"Chỉ đọc WAV 16-bit (file này {sw * 8}-bit)")
    x = np.frombuffer(tho, dtype=np.int16).astype(np.float32) / 32768
    return x.reshape(-1, ch), sr


def doc_am_thanh(duong_dan: Path, sr: int = SR, kenh: int = 1) -> np.ndarray:
    """Đọc mọi định dạng (wav/mp3/m4a…) qua ffmpeg, đổi sẵn về sr và số kênh."""
    lenh = [imageio_ffmpeg.get_ffmpeg_exe(), "-v", "error", "-i", str(duong_dan),
            "-f", "f32le", "-acodec", "pcm_f32le", "-ac", str(kenh), "-ar", str(sr), "-"]
    tho = subprocess.run(lenh, capture_output=True, check=True).stdout
    return np.frombuffer(tho, dtype=np.float32).reshape(-1, kenh).copy()


def ghi_wav(duong_dan: Path, x: np.ndarray, sr: int = SR) -> None:
    x = np.atleast_2d(x.T).T if x.ndim == 1 else x
    so = np.clip(np.round(x * 32767), -32768, 32767).astype("<i2")
    duong_dan.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(duong_dan), "wb") as w:
        w.setnchannels(x.shape[1])
        w.setsampwidth(2)
        w.setframerate(sr)
        w.writeframes(so.tobytes())


def doi_sr(x: np.ndarray, tu: int, den: int = SR) -> np.ndarray:
    if tu == den:
        return x
    g = gcd(tu, den)
    return resample_poly(x, den // g, tu // g, axis=0).astype(np.float32)


# ── Độ to theo ITU-R BS.1770-4 (LUFS) ────────────────────────────────
# Hệ số lọc K-weighting tính cho mọi tần số mẫu từ hai bộ lọc tương tự
# (cùng thông số với pyloudnorm, khớp bảng hệ số 48 kHz của ITU).
def _biquad_shelf(sr: int) -> tuple[np.ndarray, np.ndarray]:
    G, Q, fc = 3.99984385397, 0.7071752369554193, 1681.9744509555319
    A = 10 ** (G / 40)
    w0 = 2 * np.pi * fc / sr
    al = np.sin(w0) / (2 * Q)
    c, s = np.cos(w0), 2 * np.sqrt(A) * al
    b = [A * ((A + 1) + (A - 1) * c + s), -2 * A * ((A - 1) + (A + 1) * c), A * ((A + 1) + (A - 1) * c - s)]
    a = [(A + 1) - (A - 1) * c + s, 2 * ((A - 1) - (A + 1) * c), (A + 1) - (A - 1) * c - s]
    return np.array(b) / a[0], np.array(a) / a[0]


def _biquad_highpass(sr: int) -> tuple[np.ndarray, np.ndarray]:
    Q, fc = 0.5003270373253953, 38.13547087613982
    w0 = 2 * np.pi * fc / sr
    al, c = np.sin(w0) / (2 * Q), np.cos(w0)
    b = [(1 + c) / 2, -(1 + c), (1 + c) / 2]
    a = [1 + al, -2 * c, 1 - al]
    return np.array(b) / a[0], np.array(a) / a[0]


def _k_weight(x: np.ndarray, sr: int) -> np.ndarray:
    b1, a1 = _biquad_shelf(sr)
    b2, a2 = _biquad_highpass(sr)
    return lfilter(b2, a2, lfilter(b1, a1, x, axis=0), axis=0)


def lufs(x: np.ndarray, sr: int = SR) -> float:
    """Độ to tích hợp (integrated loudness), có cổng -70 LUFS và -10 LU."""
    x = x if x.ndim == 2 else x[:, None]
    y = _k_weight(x, sr)
    khoi, buoc = int(0.4 * sr), int(0.1 * sr)
    if len(y) < khoi:
        return float("-inf")
    z = np.array([np.mean(y[i:i + khoi] ** 2, axis=0) for i in range(0, len(y) - khoi + 1, buoc)])
    l = -0.691 + 10 * np.log10(np.maximum(z.sum(axis=1), 1e-12))
    qua = l > -70
    if not qua.any():
        return float("-inf")
    tuong_doi = -0.691 + 10 * np.log10(z[qua].sum(axis=1).mean()) - 10
    qua &= l > tuong_doi
    return float(-0.691 + 10 * np.log10(z[qua].sum(axis=1).mean()))


def db(x: float) -> float:
    return 20 * np.log10(max(x, 1e-12))


def dinh_db(x: np.ndarray) -> float:
    return db(float(np.abs(x).max()))


def cat_lang(x: np.ndarray, sr: int = SR, nguong_db: float = -45,
             truoc: float = 0.03, sau: float = 0.15) -> np.ndarray:
    """Bỏ khoảng lặng đầu/cuối, chừa một chút để không cụt hơi."""
    muc = np.abs(x).max(axis=1)
    co = np.nonzero(muc > 10 ** (nguong_db / 20))[0]
    if len(co) == 0:
        return x[:0]
    dau = max(0, co[0] - int(truoc * sr))
    cuoi = min(len(x), co[-1] + int(sau * sr))
    return x[dau:cuoi]


def mo_vao_ra(x: np.ndarray, sr: int = SR, vao: float = 0.01, ra: float = 0.08) -> np.ndarray:
    """Làm mềm hai đầu để không có tiếng 'tách' khi câu bắt đầu/kết thúc."""
    x = x.copy()
    nv, nr = min(len(x), int(vao * sr)), min(len(x), int(ra * sr))
    if nv:
        x[:nv] *= np.linspace(0, 1, nv)[:, None]
    if nr:
        x[-nr:] *= np.linspace(1, 0, nr)[:, None]
    return x
