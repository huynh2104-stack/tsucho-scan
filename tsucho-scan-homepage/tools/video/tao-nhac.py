# -*- coding: utf-8 -*-
"""Tạo nhạc nền cho video giới thiệu bằng Lyria RealTime (Gemini API), phối theo cảnh.

Vì sao Lyria RealTime: khoá hiện ở gói miễn phí, các mô hình Lyria "thường"
(lyria-3.5, lyria-3-pro) có hạn mức 0; bản RealTime (thử nghiệm) thì dùng
được. Nó chơi nhạc LIÊN TỤC và nhận lệnh trong lúc chơi, nên script "phối"
theo đúng bảng CANH của video:
    mở đầu (câu hỏi + tên)   piano + dây, chưa có trống
    năm bước                 thêm trống nhẹ cho có nhịp
    「100%とは言いません」   bỏ trống, thưa lại — khoảnh khắc nghiêm túc
    lời mời cuối             trống nhẹ trở lại (quay-video.py làm nhỏ dần ở cuối)
Lệnh có độ trễ ~1–2 s (mô hình sinh trước một đoạn), nên script gửi lệnh
sớm hơn mốc một khoảng TRUOC.

Nhạc do AI tạo, không tải từ trang ngoài → không vướng bản quyền của ai.
Người viết (Claude) không nghe được: script tự đo độ to từng đoạn, kiểm có
hụt tiếng / vỡ tiếng không, và có trống ở đúng đoạn không. Tai người duyệt cuối.

Chạy (từ thư mục gốc repo, mất ~1,5 phút vì nhạc tạo theo thời gian thực):
    python tsucho-scan-homepage/tools/video/tao-nhac.py
    python tsucho-scan-homepage/tools/video/tao-nhac.py --seed 7   # thử bản khác
Kết quả: am-thanh/nhac.wav (48 kHz stereo)
"""
from __future__ import annotations

import argparse
import asyncio
import re
import sys
from pathlib import Path

import numpy as np

DAY = Path(__file__).resolve().parent
sys.path.insert(0, str(DAY))
from am_thanh_chung import SR, db, ghi_wav, lufs  # noqa: E402

AM = DAY / "am-thanh"
HTML = DAY / "video-gioi-thieu.html"
ENV = DAY.parents[2] / ".env"
TRUOC = 1.5  # đổi lệnh sớm hơn mốc chừng này giây, bù độ trễ của mô hình

LOI_NHAC = [
    ("Warm felt piano, gentle arpeggios", 1.0),
    ("Soft string pads, warm and airy", 0.7),
    ("Light acoustic guitar plucks", 0.4),
    ("Calm, hopeful, modern corporate background music", 0.9),
]


def khoa_api() -> str:
    for dong in ENV.read_text(encoding="utf-8").splitlines():
        if dong.startswith("GEMINI_API_KEY="):
            return dong.split("=", 1)[1].strip().strip('"').strip("'")
    sys.exit(f"Không thấy GEMINI_API_KEY trong {ENV}")


def doan_nhac() -> tuple[list[tuple[float, dict]], float]:
    """Đọc bảng CANH → các đoạn nhạc (giây bắt đầu, cấu hình) + tổng độ dài."""
    canh = {i: (float(a), float(b)) for i, a, b in
            re.findall(r"\{ id: '(s\d)', a: ([\d.]+),\s+b: ([\d.]+)", HTML.read_text(encoding="utf-8"))}
    tong = max(b for _, b in canh.values())
    return [
        (0.0,           dict(density=0.30, brightness=0.45, mute_drums=True)),   # mở đầu
        (canh["s2"][0], dict(density=0.45, brightness=0.55, mute_drums=False)),  # năm bước
        (canh["s8"][0], dict(density=0.25, brightness=0.45, mute_drums=True)),   # 100%とは…
        (canh["s9"][0], dict(density=0.35, brightness=0.50, mute_drums=False)),  # lời mời
    ], tong


async def thu_nhac(client, types, doan, can_giay: float, seed: int) -> bytes:
    buf = bytearray()
    goc = dict(bpm=90, scale=types.Scale.D_MAJOR_B_MINOR, temperature=1.0, guidance=4.0, seed=seed)
    async with client.aio.live.music.connect(model="models/lyria-realtime-exp") as s:
        await s.set_weighted_prompts(prompts=[types.WeightedPrompt(text=t, weight=w) for t, w in LOI_NHAC])
        await s.set_music_generation_config(config=types.LiveMusicGenerationConfig(**goc, **doan[0][1]))
        await s.play()
        ke = 1
        async for tin in s.receive():
            sc = tin.server_content
            if sc and sc.audio_chunks:
                for c in sc.audio_chunks:
                    buf.extend(c.data)
            da_co = len(buf) / (SR * 2 * 2)
            if ke < len(doan) and da_co >= doan[ke][0] - TRUOC:
                await s.set_music_generation_config(config=types.LiveMusicGenerationConfig(**goc, **doan[ke][1]))
                print(f"  giây {da_co:5.1f}: chuyển đoạn {ke} {doan[ke][1]}", flush=True)
                ke += 1
            if da_co >= can_giay:
                break
    return bytes(buf)


def bao_cao(x: np.ndarray, doan: list[tuple[float, dict]], tong: float) -> None:
    """Đo từng đoạn: độ to, năng lượng dải trống, và chỗ hụt tiếng nếu có."""
    mono = x.mean(axis=1)
    print(f"\nCả bài: {lufs(x):.1f} LUFS, đỉnh {db(float(np.abs(x).max())):.1f} dBFS, "
          f"mẫu chạm trần: {int((np.abs(x) >= 0.999).sum())}")
    # Hụt tiếng: khung 0,25 s nào dưới -50 dBFS
    k = SR // 4
    rms = np.array([np.sqrt(np.mean(mono[i:i + k] ** 2)) for i in range(0, len(mono) - k, k)])
    hut = [round(i * 0.25, 2) for i, v in enumerate(rms) if db(v) < -50 and i * 0.25 < tong]
    print(f"Chỗ gần như im (< -50 dBFS): {hut[:10] if hut else 'không có'}")
    # Trống: độ nhấp nhô của năng lượng dải trầm 40–150 Hz (kick) — có trống thì dao động mạnh theo phách
    spec_k = 2048
    moc = [d[0] for d in doan] + [tong]
    for i, (a, cfg) in enumerate(doan):
        b = moc[i + 1]
        seg = mono[int((a + 1.5) * SR):int((b - 0.5) * SR)]
        if len(seg) < SR:
            continue
        khung = [seg[j:j + spec_k] for j in range(0, len(seg) - spec_k, spec_k // 2)]
        f = np.fft.rfftfreq(spec_k, 1 / SR)
        tram = np.array([np.abs(np.fft.rfft(w * np.hanning(spec_k)))[(f > 40) & (f < 150)].sum() for w in khung])
        nhap_nho = float(np.std(np.diff(np.log(tram + 1e-9))))
        print(f"  đoạn {i} ({a:5.1f}–{b:5.1f}s, trống {'tắt' if cfg['mute_drums'] else 'bật'}): "
              f"{lufs(x[int(a * SR):int(b * SR)]):6.1f} LUFS, nhấp nhô dải trầm {nhap_nho:.2f}")


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    ap = argparse.ArgumentParser(description="Tạo nhạc nền theo cảnh bằng Lyria RealTime")
    ap.add_argument("--seed", type=int, default=42)
    ap.add_argument("--ra", type=Path, default=AM / "nhac.wav")
    a = ap.parse_args()

    from google import genai
    from google.genai import types

    client = genai.Client(api_key=khoa_api(), http_options={"api_version": "v1alpha"})
    doan, tong = doan_nhac()
    can = tong + 3.0  # thừa một chút cho đoạn nhỏ dần cuối
    print(f"Tạo {can:.0f}s nhạc (video dài {tong:.1f}s), seed {a.seed} — chờ khoảng {can:.0f}s…", flush=True)
    tho = asyncio.run(thu_nhac(client, types, doan, can, a.seed))
    x = np.frombuffer(tho, dtype="<i2").astype(np.float32).reshape(-1, 2) / 32768
    ghi_wav(a.ra, x)
    print(f"Đã lưu {a.ra} ({len(x) / SR:.1f}s)")
    bao_cao(x, doan, tong)


if __name__ == "__main__":
    main()
