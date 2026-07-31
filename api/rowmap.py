"""Ước lượng dải ảnh của TỪNG DÒNG sổ — để click dòng là khoanh đúng chỗ trên ảnh.

⚠️ Đây là ƯỚC LƯỢNG từ ảnh, KHÔNG phải toạ độ do model trả về. Lý do: hỏi model
toạ độ thì phải đổi prompt, mà đổi prompt là **mất toàn bộ cache** — mọi trang
đã quét đều phải quét lại và mất tiền. Cách này chạy trên ảnh có sẵn nên $0.

Bản 2 (31/07/2026) — viết lại sau khi soi ảnh thật thấy bản 1 dò từng vệt mực
rời rạc nên dải trôi lung tung. Bản này dựa trên HAI đặc điểm mà mọi trang sổ
in đều có:

1. **Dòng in cách đều nhau** (máy in dòng, pitch cố định) → ước lượng pitch bằng
   tự tương quan của biểu đồ mực, rồi tìm ĐỈNH mực cách nhau ≥ ~0.6 pitch.
2. **Giữa trang có khoảng trắng lớn** (nếp gấp giữa hai nửa sổ) → nội dung được
   cắt thành KHỐI trước; kể cả khi phải bỏ cuộc, chia đều THEO TỪNG KHỐI vẫn
   đúng hơn nhiều so với chia đều cả trang (bản 1 chia đè lên cả nếp gấp).

Đo trên 9 mặt sổ thật (scratchpad eval): phủ mực 0.94→(xem eval sau khi đổi),
hết cảnh dải mỏng rải rác.
"""

import numpy as np
from PIL import Image

WORK_W = 700
INK_RATIO = 0.80


# ── Biểu đồ mực ──────────────────────────────────────────────────────

def _profile(img: Image.Image) -> tuple[np.ndarray, int]:
    g = img.convert("L")
    if g.width > WORK_W:
        g = g.resize((WORK_W, max(1, round(g.height * WORK_W / g.width))), Image.BILINEAR)
    a = np.asarray(g, dtype=np.float32)
    mask = a < np.median(a) * INK_RATIO
    return mask.sum(axis=1) / max(1, mask.shape[1]), mask.shape[0]


def _smooth(x: np.ndarray, win: int) -> np.ndarray:
    win = max(1, int(win))
    if win <= 1:
        return x
    k = np.ones(win, dtype=np.float32) / win
    return np.convolve(x, k, mode="same")


# ── Khối nội dung (tách bởi khoảng trắng lớn — nếp gấp giữa trang) ───

def _blocks(profile: np.ndarray, min_gap: float) -> list[tuple[int, int]]:
    """Các đoạn có chữ, tách nhau bởi khoảng trắng cao ≥ `min_gap` pixel."""
    on = profile > 0.008
    segs: list[tuple[int, int]] = []
    start = None
    for i, v in enumerate(on):
        if v and start is None:
            start = i
        elif not v and start is not None:
            segs.append((start, i))
            start = None
    if start is not None:
        segs.append((start, len(on)))

    if not segs:
        return []
    merged = [segs[0]]
    for a, b in segs[1:]:
        if a - merged[-1][1] < min_gap:
            merged[-1] = (merged[-1][0], b)
        else:
            merged.append((a, b))
    # Vụn quá nhỏ (vết bẩn) thì bỏ
    return [s for s in merged if s[1] - s[0] >= 3]


# ── Pitch: chu kỳ dòng in, ước lượng bằng tự tương quan ─────────────

def _pitch(profile: np.ndarray, blocks: list[tuple[int, int]], n_rows: int) -> float:
    content_h = sum(b - a for a, b in blocks)
    guess = content_h / max(1, n_rows)          # mồi: nội dung chia đều số dòng

    x = profile - profile.mean()
    n = len(x)
    lo = max(4, int(guess * 0.55))
    hi = min(n // 2, int(guess * 1.7) + 2)
    if hi <= lo:
        return max(4.0, guess)

    def corr(lag: int) -> float:
        return float((x[:-lag] * x[lag:]).sum())

    denom = float((x * x).sum()) or 1.0
    best_lag, best_val = None, -1.0
    for lag in range(lo, hi):
        v = corr(lag) / denom
        if v > best_val:
            best_lag, best_val = lag, v
    # Tương quan quá yếu nghĩa là không có chu kỳ rõ (ảnh mờ, chữ tay) → dùng mồi
    if best_lag is None or best_val < 0.05:
        return max(4.0, guess)

    # Bẫy bội số: nhịp thật p thì 2p, 3p cũng tương quan cao. Nếu ước số của
    # lag thắng cuộc vẫn giữ ≥70% tương quan thì nhịp thật là ước số đó.
    # (Đã dính thật: ảnh mẫu nhịp 21px bị bắt thành 42px → dò cách dòng.)
    for k in (3, 2):
        d = best_lag // k
        if d >= 4 and corr(d) / denom >= best_val * 0.7:
            return float(d)
    return float(best_lag)


# ── Đường kẻ ngang đậm (viền bảng) ──────────────────────────────────

def _rules(profile: np.ndarray) -> list[int]:
    """Các hàng gần như kẻ liền hết chiều ngang — viền bảng, gạch chân tiêu đề.

    Ngưỡng 0.38 đo từ ảnh thật: viền bảng mờ nhất là 0.41, dòng chữ dày nhất
    là 0.31 — 0.38 nằm giữa, tách được hai loại.
    """
    idx = [i for i in range(len(profile)) if profile[i] > 0.38]
    out: list[int] = []
    for i in idx:
        if out and i - out[-1] <= 2:
            out[-1] = i
        else:
            out.append(i)
    return out


def _drop_footnotes(
    peaks: list[int], rules: list[int], pitch: float, content_end: int
) -> list[int]:
    """Bỏ hẳn đỉnh chú thích: chữ in nhỏ NÉP NGAY DƯỚI viền đáy bảng.

    "Viền đáy" đo theo ĐÁY KHỐI NỘI DUNG (không phải chiều cao trang — trang
    có thể còn lề trắng dài bên dưới). Chỉ bỏ đỉnh cách viền ≤ 0.6 pitch —
    dòng thật (kể cả viết tay 繰越 dưới bảng) cách viền cỡ một nhịp nên thoát.
    """
    bottom_rules = [r for r in rules if r >= content_end - pitch * 2]
    return [
        p for p in peaks
        if not any(r < p <= r + pitch * 0.6 for r in bottom_rules)
    ]


# ── Đỉnh mực = tâm dòng chữ ─────────────────────────────────────────

def _peaks(profile: np.ndarray, blocks: list[tuple[int, int]], pitch: float) -> list[int]:
    sm = _smooth(profile, pitch / 3)
    floor = max(0.006, float(sm.max()) * 0.06)
    cand: list[tuple[float, int]] = []
    for a, b in blocks:
        for i in range(max(a, 1), min(b, len(sm) - 1)):
            if sm[i] >= sm[i - 1] and sm[i] > sm[i + 1] and sm[i] > floor:
                cand.append((float(sm[i]), i))

    # Giữ đỉnh mạnh trước, đỉnh sau phải cách đỉnh đã giữ ≥ 0.6 pitch —
    # khử "đỉnh kép" trong cùng một dòng (chữ kanji hai tầng, dấu gạch...)
    cand.sort(reverse=True)
    kept: list[int] = []
    min_d = pitch * 0.6
    for _, i in cand:
        if all(abs(i - j) >= min_d for j in kept):
            kept.append(i)
    return sorted(kept)


def _pick_window(peaks: list[int], n_rows: int) -> list[int]:
    """Thừa đỉnh thì bỏ từ ĐẦU: lấy đúng n_rows đỉnh CUỐI.

    Nghe thô nhưng là kết luận sau khi thử máy chấm điểm mực + nhịp trên ảnh
    thật: đỉnh thừa chỉ xuất hiện ở ĐẦU trang (tựa 普通預金, hàng tiêu đề cột)
    — còn đáy trang, sau khi đã lọc chú thích nép viền (_drop_footnotes), là
    dòng dữ liệu thật, kể cả dòng viết tay 新通帳に繰越 mà model có quét.
    Máy chấm điểm phức tạp hơn thì thua chính sự thô này: giấy cong ở mép làm
    dòng cuối giãn nhịp và bị phạt oan, tiêu đề đậm mực thì được thưởng oan.
    """
    return peaks[len(peaks) - n_rows :]


# ── Chia đều theo khối (đường lui khi không dò được) ────────────────

def _even_by_blocks(
    n_rows: int, blocks: list[tuple[int, int]], h: int
) -> list[dict]:
    """Chia đều nhưng THEO TỪNG KHỐI nội dung, không đè lên nếp gấp trắng."""
    if not blocks:
        blocks = [(0, h)]
    heights = [b - a for a, b in blocks]
    total = sum(heights)
    # Phân bổ số dòng cho từng khối theo tỉ lệ chiều cao, làm tròn dần
    counts = [max(0, round(n_rows * hh / total)) for hh in heights]
    while sum(counts) > n_rows:
        counts[counts.index(max(counts))] -= 1
    while sum(counts) < n_rows:
        counts[heights.index(max(heights))] += 1

    bands: list[dict] = []
    for (a, b), c in zip(blocks, counts):
        if c <= 0:
            continue
        step = (b - a) / c
        for i in range(c):
            bands.append({
                "y0": round((a + i * step) / h, 5),
                "y1": round((a + (i + 1) * step) / h, 5),
            })
    # Hụt do khối quá bé thì đắp thêm ở cuối cho đủ số dòng
    while len(bands) < n_rows:
        bands.append(bands[-1].copy() if bands else {"y0": 0.0, "y1": 1.0})
    return bands[:n_rows]


# ── API ─────────────────────────────────────────────────────────────

def bands_for(img: Image.Image, n_rows: int) -> dict:
    """`n_rows` dải, mỗi dải là {y0, y1} theo tỉ lệ 0..1 của chiều cao ảnh.

    `exact=True` nghĩa là chọn được đúng n_rows đỉnh mực hợp nhịp; False là đã
    phải chia đều theo khối.
    """
    if n_rows <= 0:
        return {"bands": [], "exact": False}

    profile, h = _profile(img)
    if h < 20:
        return {"bands": _even_by_blocks(n_rows, [], max(h, 1)), "exact": False}

    pitch0 = h / max(1, n_rows)
    blocks = _blocks(profile, min_gap=max(6.0, pitch0 * 0.9))
    if not blocks:
        return {"bands": _even_by_blocks(n_rows, [], h), "exact": False}

    pitch = _pitch(profile, blocks, n_rows)
    rules = _rules(profile)
    peaks = _drop_footnotes(
        _peaks(profile, blocks, pitch), rules, pitch, blocks[-1][1]
    )

    if len(peaks) < n_rows:
        return {"bands": _even_by_blocks(n_rows, blocks, h), "exact": False}

    chosen = _pick_window(peaks, n_rows)

    # Cổng chất lượng: dòng in thật thì hầu hết khoảng cách ≈ pitch (hoặc là
    # cú nhảy qua nếp gấp). Chữ viết tay / nhiễu cũng đẻ ra "đỉnh" nhưng khoảng
    # cách tán loạn — khi đó thà nhận là không dò được (chia đều theo khối,
    # UI hiện nhạt) còn hơn tự tin vẽ dải sai chỗ.
    if len(chosen) > 1:
        gaps = np.diff(chosen)
        ok = sum(1 for g in gaps if 0.7 * pitch <= g <= 1.35 * pitch or g > 1.6 * pitch)
        if ok / len(gaps) < 0.7:
            return {"bands": _even_by_blocks(n_rows, blocks, h), "exact": False}

    # Dải của mỗi đỉnh: nửa pitch quanh tâm, nhưng không lấn sang đỉnh kề —
    # qua nếp gấp thì khoảng cách lớn, min() giữ cho dải không phình ra.
    half = pitch / 2
    bands: list[dict] = []
    for k, c in enumerate(chosen):
        up = min(half, (c - chosen[k - 1]) / 2) if k > 0 else half
        dn = min(half, (chosen[k + 1] - c) / 2) if k < len(chosen) - 1 else half
        bands.append({
            "y0": round(max(0.0, (c - up) / h), 5),
            "y1": round(min(1.0, (c + dn) / h), 5),
        })
    return {"bands": bands, "exact": True}
