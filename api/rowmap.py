"""Ước lượng dải ảnh của TỪNG DÒNG sổ — để click dòng là khoanh đúng chỗ trên ảnh.

⚠️ Đây là ƯỚC LƯỢNG từ ảnh, KHÔNG phải toạ độ do model trả về. Lý do: hỏi model
toạ độ thì phải đổi prompt, mà đổi prompt là **mất toàn bộ cache** — mọi trang
đã quét đều phải quét lại và mất tiền. Cách này chạy trên ảnh có sẵn nên $0.

Bản 3 (01/08/2026) — sau khi người dùng báo ảnh CHỤP BẰNG ĐIỆN THOẠI sai gần
100% (ゆうちょ, Fukuoka để bao quát không cắt). Soi ra ba thủ phạm, bản 2 dính
cả ba vì nó tính lượng mực trên TOÀN ảnh với một ngưỡng xám duy nhất:

1. **Nền lộn xộn quanh cuốn sổ** (mặt bàn tối, đồ vật). Ngưỡng "tối hơn trung
   vị" biến cả mảng nền thành "mực" → nhịp dòng tụt từ 23px xuống 6px, sinh 72
   đỉnh rác. → `_page_box`: cắt về đúng vùng GIẤY SÁNG trước khi đo.
2. **Ánh sáng không đều + mực in nhạt** (ゆうちょ in màu hồng/đỏ nhạt). Một
   ngưỡng cho cả ảnh thì chỗ tối mất chữ, chỗ sáng dính nền. → ngưỡng THÍCH
   NGHI: so từng điểm với nền mờ quanh nó (`BoxBlur`), giống adaptive threshold.
3. **Sổ đặt nghiêng / giấy vênh.** Nghiêng 2° trên bề ngang 700px là dòng trôi
   24px — bằng cả một nhịp dòng, nên biểu đồ mực nhoè hết đỉnh. → `_skew`: thử
   vài góc, chọn góc cho biểu đồ NÉT nhất, rồi mới đi tìm dòng.

Toạ độ trả về vẫn tính theo TOÀN ảnh gốc (không phải theo vùng đã cắt), kèm
`skew_deg` để giao diện nghiêng vệt đánh dấu đúng bằng độ nghiêng của trang.
"""

import numpy as np
from PIL import Image, ImageFilter

WORK_W = 700
# Trần chiều cao ảnh làm việc — chặn cho khỏi phình chi phí với ảnh rất cao
MAX_WORK_H = 1500

# Ngưỡng thích nghi: điểm tối hơn nền quanh nó ≥ INK_DELTA mức xám thì tính là
# mực. 8/255 bắt được cả chữ in hồng nhạt của ゆうちょ mà chưa ăn phải vân giấy.
BLUR_R = 14
INK_DELTA = 8.0

# Khử nghiêng: quét ±SKEW_MAX độ. Sổ chụp tay hiếm khi lệch quá 4°; quét rộng
# hơn thì dễ khớp nhầm vào nhịp của cột chữ dọc.
SKEW_MAX = 4.0
SKEW_STEPS = 33


# ── Vùng giấy & mặt nạ mực ───────────────────────────────────────────

def _work_image(img: Image.Image, n_rows: int) -> Image.Image:
    """Thu nhỏ để tính cho nhanh, nhưng KHÔNG được thu quá tay theo chiều dọc.

    Bản trước cứ ép bề ngang về 700px. Với mặt sổ nằm ngang (ảnh 2900×1200,
    hay gặp khi scan cả tờ đôi) thì ảnh làm việc chỉ còn cao 290px — 24 dòng
    nhồi trong 290px là hơn 12px/dòng, chữ dính vào nhau và không còn đỉnh mực
    nào để dò. Ở đây bảo đảm mỗi dòng có ~26px chiều cao rồi mới thu.
    """
    scale = min(1.0, WORK_W / img.width)
    need_h = min(MAX_WORK_H, max(600, 26 * max(1, n_rows)))
    if img.height * scale < need_h:
        scale = min(1.0, need_h / img.height)
    w = max(1, round(img.width * scale))
    h = max(1, round(img.height * scale))
    if (w, h) != img.size:
        img = img.resize((w, h), Image.BILINEAR)
    return img.convert("L")


def _page_box(g: Image.Image) -> tuple[int, int, int, int]:
    """Khung của TỜ GIẤY trong ảnh, bỏ nền tối xung quanh.

    Giấy sáng, nền (mặt bàn, đồ vật) tối. Ngưỡng lấy theo TRUNG VỊ độ sáng của
    cả ảnh (giấy thường chiếm phần lớn khung hình): hàng nào tối hơn hẳn trung
    vị thì mới là nền.

    ⚠ Ngưỡng phải neo vào TRUNG VỊ, không được lấy mức giữa min–max. Bản đầu
    lấy (min+max)/2 và ăn ngay quả đắng: ảnh chụp cuốn sổ mở có bóng bàn tay
    đổ xuống làm nửa trang tối hơn nửa kia, thế là nó **cắt phăng cả nửa trang
    trên** và dồn 24 dòng vào nửa dưới.

    Cắt còn dưới 45% mỗi chiều thì coi như không nhận ra giấy và giữ nguyên cả
    ảnh: thà đo trên ảnh đầy đủ còn hơn đo trên một mẩu cắt bậy.
    """
    a = np.asarray(g, dtype=np.float32)
    h, w = a.shape
    med = float(np.median(a))
    if med <= 0:
        return 0, h, 0, w
    thr = med * 0.62

    def span(v: np.ndarray) -> tuple[int, int]:
        idx = np.where(v > thr)[0]
        return (int(idx[0]), int(idx[-1]) + 1) if len(idx) else (0, len(v))

    r0, r1 = span(a.mean(axis=1))
    c0, c1 = span(a.mean(axis=0))
    if (r1 - r0) < h * 0.45 or (c1 - c0) < w * 0.45:
        return 0, h, 0, w
    return r0, r1, c0, c1


def _ink_mask(g: Image.Image) -> np.ndarray:
    """True ở những điểm TỐI HƠN HẲN nền giấy ngay quanh nó.

    So với nền mờ (BoxBlur) chứ không so với một ngưỡng cố định: ảnh chụp tay
    luôn có chỗ sáng chỗ tối, dùng ngưỡng cố định là mất chữ nửa trang.
    """
    a = np.asarray(g, dtype=np.float32)
    bg = np.asarray(g.filter(ImageFilter.BoxBlur(BLUR_R)), dtype=np.float32)
    return (bg - a) > INK_DELTA


# ── Khử nghiêng ──────────────────────────────────────────────────────

def _profile_at(mask: np.ndarray, tan: float) -> np.ndarray:
    """Biểu đồ mực khi coi các dòng nghiêng đi một góc có tang = `tan`.

    Dồn từng điểm mực về hàng y − (x − w/2)·tan rồi đếm theo hàng.

    Hai chi tiết bắt buộc, thiếu là hỏng:
    - Lấy mốc ở GIỮA ảnh (x − w/2) nên xoay quanh tâm, không đẩy cả trang lệch
      đi khi góc lớn.
    - Điểm rơi ra ngoài khung thì **vứt đi**, tuyệt đối không `clip`. Clip dồn
      chúng vào hàng 0 thành một đỉnh giả khổng lồ, mà thước đo độ nét lại là
      tổng bình phương → góc càng lệch càng "nét", máy luôn chọn góc tối đa.
      Bug này làm bản đầu của khử nghiêng chọn đúng 4.0° cho mọi ảnh.
    """
    h, w = mask.shape
    ys, xs = np.nonzero(mask)
    if len(ys) == 0:
        return np.zeros(h, dtype=np.float32)
    shifted = ys - ((xs - w / 2) * tan).astype(np.int32)
    keep = (shifted >= 0) & (shifted < h)
    return np.bincount(shifted[keep], minlength=h).astype(np.float32) / w


def _skew(mask: np.ndarray) -> tuple[float, np.ndarray]:
    """(tang góc nghiêng, biểu đồ mực đã nắn thẳng).

    Chọn góc làm biểu đồ NÉT nhất — đo bằng tổng bình phương CHIA cho tổng
    lượng mực: dòng chữ xếp thẳng hàng thì mực dồn thành đỉnh cao nên tỉ số
    này lớn, còn nghiêng thì mực trải đều nên nhỏ. Chia chuẩn hoá là bắt buộc,
    nếu không góc lớn (mất bớt mực ra ngoài khung) sẽ được so sánh không công
    bằng với góc 0. Đây là cách khử nghiêng kinh điển bằng biểu đồ chiếu.
    """
    best_tan, best_p, best_score = 0.0, None, -1.0
    for deg in np.linspace(-SKEW_MAX, SKEW_MAX, SKEW_STEPS):
        tan = float(np.tan(np.radians(deg)))
        p = _profile_at(mask, tan)
        total = float(p.sum())
        if total <= 0:
            continue
        score = float((p * p).sum()) / total
        if score > best_score:
            best_tan, best_p, best_score = tan, p, score
    return best_tan, best_p if best_p is not None else _profile_at(mask, 0.0)


def _smooth(x: np.ndarray, win: int) -> np.ndarray:
    win = max(1, int(win))
    if win <= 1:
        return x
    return np.convolve(x, np.ones(win, dtype=np.float32) / win, mode="same")


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
    return [s for s in merged if s[1] - s[0] >= 3]


# ── Pitch: chu kỳ dòng in, ước lượng bằng tự tương quan ─────────────

def _pitch(profile: np.ndarray, blocks: list[tuple[int, int]], n_rows: int) -> float:
    """Nhịp dòng (pixel) — chu kỳ lặp của biểu đồ mực.

    Tự tương quan một mình KHÔNG đủ: nhịp thật p thì 2p, 3p cũng tương quan
    cao, và bội số thường thắng sát nút. Chọn nhầm 2p là dò cách dòng — nhìn
    thì "đều tăm tắp" nên rất khó phát hiện, mà mọi cú click đều lệch.

    Nên dùng thêm thông tin có sẵn: `n_rows` dòng nằm gọn trong vùng nội dung,
    vậy nhịp phải quanh quẩn `mồi = cao_vùng_nội_dung / n_rows`. Trong số các
    lag đủ mạnh (≥60% lag khoẻ nhất), lấy lag GẦN MỒI NHẤT theo tỉ lệ.
    """
    if not blocks:
        return 4.0
    # Mồi = chiều cao CÓ CHỮ chia số dòng, KHÔNG tính nếp gấp trắng ở giữa —
    # tính cả nếp gấp thì mồi phồng lên ~40% và bội số 2p lại gần mồi hơn nhịp
    # thật, đúng cái bẫy đang muốn tránh.
    # Nhân 0.85 vì trong vùng có chữ còn vài dòng KHÔNG phải giao dịch (tựa
    # trang, tiêu đề cột), nên chia cho n_rows luôn ra hơi lớn hơn nhịp thật.
    content_h = sum(b - a for a, b in blocks)
    guess = max(4.0, 0.85 * content_h / max(1, n_rows))

    x = profile - profile.mean()
    n = len(x)
    lo = max(4, int(guess * 0.45))
    hi = min(n // 2, int(guess * 2.4) + 2)
    if hi <= lo:
        return guess

    denom = float((x * x).sum()) or 1.0

    def corr(lag: int) -> float:
        return float((x[:-lag] * x[lag:]).sum()) / denom

    vals = {lag: corr(lag) for lag in range(lo, hi)}
    best_lag = max(vals, key=lambda k: vals[k])
    best_val = vals[best_lag]
    # Tương quan quá yếu nghĩa là không có chu kỳ rõ (ảnh mờ, chữ tay) → dùng mồi
    if best_val < 0.05:
        return guess

    strong = [lag for lag, v in vals.items() if v >= best_val * 0.6]
    return float(min(strong, key=lambda lag: abs(np.log(lag / guess))))


# ── Đường kẻ ngang đậm (viền bảng) ──────────────────────────────────

def _rules(profile: np.ndarray) -> list[int]:
    """Các hàng gần như kẻ liền hết chiều ngang — viền bảng, gạch chân tiêu đề.

    Ngưỡng theo ĐỈNH của chính ảnh này (0.75×max) chứ không phải một con số
    tuyệt đối: ảnh chụp tay có độ đậm rất khác ảnh scan.
    """
    if len(profile) == 0:
        return []
    thr = max(0.30, float(profile.max()) * 0.75)
    idx = [i for i in range(len(profile)) if profile[i] > thr]
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


def _drop_no_balance(
    peaks: list[int],
    mask: np.ndarray,
    tan: float,
    pitch: float,
    blocks: list[tuple[int, int]],
) -> list[int]:
    """Bỏ những dòng KHÔNG có gì ở cột số dư — chúng không phải dòng giao dịch.

    Mọi dòng giao dịch của sổ Nhật đều in 差引残高 / 現在高 ở sát mép phải. Còn
    tựa trang, dòng kẻ, nếp gấp, và cái dòng 「料　金」 trơ trọi ở đáy sổ ゆうちょ
    (tiền của nó in ở dòng trên) thì mép phải trống trơn.

    Đây là thứ cứu được ca ゆうちょ: rác nằm CHÊN GIỮA hai nửa trang nên không
    thể gạt bằng cách cắt bớt đầu/đuôi.

    Lấy dải 76–96% bề ngang: chừa ra mép ngoài cùng vì ゆうちょ in số thứ tự
    dòng (01▶ 02▶ …) ở đó cho CẢ những dòng trống.

    Ngưỡng tính RIÊNG cho từng khối. Ảnh chụp một cuốn sổ mở thường sáng ở nửa
    trên và tối ở nửa dưới; một ngưỡng chung sẽ xoá oan cả loạt dòng thật ở nửa
    tối — đã dính đúng lỗi đó.
    """
    h, w = mask.shape
    right = _profile_at(mask[:, int(w * 0.76) : int(w * 0.96)], tan)
    sm = _smooth(right, pitch / 3)

    def val(p: int) -> float:
        return float(sm[p]) if 0 <= p < len(sm) else 0.0

    keep: list[int] = []
    for a, b in blocks or [(0, h)]:
        here = [p for p in peaks if a <= p < b]
        if not here:
            continue
        med = float(np.median([val(p) for p in here]))
        keep += here if med <= 0 else [p for p in here if val(p) >= med * 0.12]

    # Đỉnh nằm ngoài mọi khối (nếp gấp) coi như rác — không nhận lại.
    return sorted(keep) if len(keep) >= 2 else peaks


def _drop_stray_runs(peaks: list[int], pitch: float, n_rows: int) -> list[int]:
    """Bỏ những cụm 1–2 dòng lẻ loi ở đầu/cuối, cách phần thân cả quãng xa.

    Đó là tựa trang ở trên và mấy dòng chú thích in nhỏ ở chân trang
    (「現在高（貸付高）の金額に…」). Chúng nằm ĐÚNG NHỊP không kém gì dòng thật
    nên nhịp không phân biệt được, mà mép phải cũng có mực nên cột số dư cũng
    chịu; chỉ có khoảng cách tới thân bảng là tố cáo được chúng.

    Chỉ gạt khi gạt xong vẫn còn đủ `n_rows` dòng.
    """
    if not peaks:
        return peaks
    runs: list[list[int]] = [[peaks[0]]]
    for p in peaks[1:]:
        (runs[-1].append(p) if p - runs[-1][-1] <= pitch * 2.2 else runs.append([p]))

    while len(runs) > 1 and len(runs[-1]) <= 2 and sum(map(len, runs[:-1])) >= n_rows:
        runs.pop()
    while len(runs) > 1 and len(runs[0]) <= 2 and sum(map(len, runs[1:])) >= n_rows:
        runs.pop(0)
    return [p for run in runs for p in run]


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

def _even_by_blocks(n_rows: int, blocks: list[tuple[int, int]], h: int) -> list[dict]:
    """Chia đều nhưng THEO TỪNG KHỐI nội dung, không đè lên nếp gấp trắng."""
    if not blocks:
        blocks = [(0, h)]
    heights = [b - a for a, b in blocks]
    total = sum(heights)
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
            bands.append({"y0": a + i * step, "y1": a + (i + 1) * step})
    while len(bands) < n_rows:
        bands.append(bands[-1].copy() if bands else {"y0": 0.0, "y1": float(h)})
    return bands[:n_rows]


# ── API ─────────────────────────────────────────────────────────────

def bands_for(img: Image.Image, n_rows: int) -> dict:
    """`n_rows` dải, mỗi dải là {y0, y1} theo tỉ lệ 0..1 của chiều cao ẢNH GỐC.

    `exact=True` nghĩa là dò được đỉnh mực đúng nhịp; False là đã phải chia đều
    theo khối (giao diện vẽ nhạt hơn để người dùng biết là chỗ đoán).
    `skew_deg` là độ nghiêng đo được — giao diện nghiêng vệt đánh dấu theo.
    """
    if n_rows <= 0:
        return {"bands": [], "exact": False, "skew_deg": 0.0}

    g = _work_image(img, n_rows)
    H, W = g.height, g.width
    if H < 20:
        return {
            "bands": [{"y0": i / n_rows, "y1": (i + 1) / n_rows} for i in range(n_rows)],
            "exact": False, "skew_deg": 0.0,
        }

    r0, r1, c0, c1 = _page_box(g)
    page = g.crop((c0, r0, c1, r1))
    mask = _ink_mask(page)
    tan, profile = _skew(mask)
    ph = len(profile)

    def out(bands: list[dict], exact: bool) -> dict:
        """Đổi toạ độ: trong-vùng-giấy → tỉ lệ của TOÀN ảnh gốc."""
        return {
            "bands": [
                {
                    "y0": round(max(0.0, (r0 + b["y0"]) / H), 5),
                    "y1": round(min(1.0, (r0 + b["y1"]) / H), 5),
                }
                for b in bands
            ],
            "exact": exact,
            "skew_deg": round(float(np.degrees(np.arctan(tan))), 3),
        }

    pitch0 = ph / max(1, n_rows)
    blocks = _blocks(profile, min_gap=max(6.0, pitch0 * 0.9))
    if not blocks:
        return out(_even_by_blocks(n_rows, [], ph), False)

    pitch = _pitch(profile, blocks, n_rows)
    rules = _rules(profile)
    peaks = _drop_footnotes(
        _peaks(profile, blocks, pitch), rules, pitch, blocks[-1][1]
    )
    trimmed = _drop_no_balance(peaks, mask, tan, pitch, blocks)
    if len(trimmed) >= n_rows:
        peaks = trimmed
    peaks = _drop_stray_runs(peaks, pitch, n_rows)
    if len(peaks) < n_rows:
        return out(_even_by_blocks(n_rows, blocks, ph), False)

    chosen = _pick_window(peaks, n_rows)

    # Cổng chất lượng: dòng in thật thì hầu hết khoảng cách ≈ pitch (hoặc là
    # cú nhảy qua nếp gấp). Chữ viết tay / nhiễu cũng đẻ ra "đỉnh" nhưng khoảng
    # cách tán loạn — khi đó thà nhận là không dò được (chia đều theo khối,
    # giao diện hiện nhạt) còn hơn tự tin vẽ dải sai chỗ.
    if len(chosen) > 1:
        gaps = np.diff(chosen)
        ok = sum(1 for gp in gaps if 0.7 * pitch <= gp <= 1.35 * pitch or gp > 1.6 * pitch)
        if ok / len(gaps) < 0.7:
            return out(_even_by_blocks(n_rows, blocks, ph), False)

    half = pitch / 2
    bands: list[dict] = []
    for k, c in enumerate(chosen):
        up = min(half, (c - chosen[k - 1]) / 2) if k > 0 else half
        dn = min(half, (chosen[k + 1] - c) / 2) if k < len(chosen) - 1 else half
        bands.append({"y0": c - up, "y1": c + dn})
    return out(bands, True)
