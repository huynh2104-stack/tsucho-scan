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

Bản 4 (11/09/2026) — đo trên 32 mặt sổ THẬT đã quét, tìm ra hai lỗi mà ảnh giả
không lộ ra:

4. **Nhịp dòng bị bắt thành GẤP ĐÔI ở sổ ゆうちょ.** Dòng 料金 ngắn xen kẽ dòng
   giao dịch dài ⇒ lượng mực lặp theo chu kỳ hai dòng ⇒ tự tương quan ở 2p mạnh
   tới mức p không lọt nổi vào danh sách "đủ mạnh". Hậu quả: `_peaks` gạt mất
   một nửa số dòng, cả 4 mặt sổ dính lỗi phải rơi xuống chế độ chia đều.
   → `_pitch` gấp bội số về nhịp gốc khi lag lớn gần gấp đôi mồi.
5. **Đỉnh thừa không chỉ nằm ở đầu trang.** `_pick_window` cắt đỉnh thừa ở đầu,
   nhưng đỉnh rác thật sự nằm ở nếp gấp GIỮA trang và ở mép giấy ĐÁY trang, nên
   nó cắt nhầm dòng dữ liệu thật: `SCAN0000_page-0001` click dòng 1 khoanh vào
   dòng 4. → bỏ đỉnh rác trước rồi mới cắt phần dư (bản 7 đã thay hẳn bằng
   cách trừ điểm, xem mục 11).

Đo được sau bản 4 (32 mặt sổ thật): dò được chính xác **32/32** (trước 28/32),
số dải khoanh vào chỗ trắng **43 → 8**.

Bản 5 (11/09/2026) — vẫn còn ca lệch nguyên cụm, sửa nốt hai chỗ:

6. **Chọn đỉnh nào là dòng: đổi từ "cắt ở đầu" sang QUY HOẠCH ĐỘNG.** Sổ là
   biểu mẫu in sẵn nên dòng cách đều; chấm điểm cả một PHƯƠNG ÁN (vừa đều nhịp
   vừa gồm toàn đỉnh giống dòng) thay vì chấm từng đỉnh rồi cắt bừa. Nhịp cho
   CO GIÃN theo từng vùng vì ảnh chụp sổ cong có nhịp 16px ở đầu trang và 25px
   ở cuối — dùng một nhịp chung thì ở vùng bị nén, bỏ một dòng thật lại "rẻ"
   hơn giữ nó. Xem `_select_rows`.
7. **Dùng MÀU MỰC để nhận ra dòng của biểu mẫu.** Hàng tiêu đề cột có lượng
   mực, cột số dư và cột số thứ tự y hệt dòng dữ liệu — đã đo cả ba, không tách
   nổi. Nhưng biểu mẫu in mực màu còn máy in kim in dữ liệu bằng mực đen: tỉ lệ
   mực đen ở dòng rác là 0.00–0.19, ở dòng thật là 0.26–0.90. Xem `_black_ink`.
   `so-yucho-dep` từ lệch 5 dòng về khớp đúng 24/24.

Bản 6 (11/09/2026) — người dùng chỉ đích danh 11 mặt sổ còn lệch. Soi ra ba
chỗ nữa, tất cả đều là "một đỉnh rác chen vào rồi đẩy cả cụm đi một bậc":

8. **Vệt mảnh ở nếp gấp giữa trang.** Độ đậm (0.73/0.63) và cột số dư
   (1.02/0.65) của nó nằm gọn trong khoảng của dòng thật — không dấu hiệu nào
   cũ bắt được. Nhưng BỀ DÀY thì 0.20–0.47 so với dòng thật 0.87–1.13: dòng chữ
   dày bằng con chữ, vệt nếp gấp chỉ là một sợi. Xem `_peak_width`.
9. **Phạt khoảng cách phải BẤT ĐỐI XỨNG.** `_blocks` lẽ ra tách hai nửa trang
   thành hai khối để cú nhảy qua nếp gấp khỏi bị phạt, nhưng nếp gấp thường còn
   dính mực mờ nên không tách được; khi đó cú nhảy bị phạt tới 1.26, đắt tới mức
   máy thà nhét dòng ma vào giữa khoảng trắng. Nay khoảng XA có trần (`XA_TOI_DA`)
   vì bỏ sót dòng là chuyện thường, còn khoảng GẦN bị phạt nặng hơn
   (`GAN_NANG`) vì hai đỉnh sát nhau nghĩa là có một cái giả.
10. **Nới hai đầu ngưỡng độ đậm.** Dòng dữ liệu thật đo được từ 0.47 (in nhạt)
   tới 1.74 (in đậm), trong khi ngưỡng cũ là 0.5–1.6 — cắt oan cả hai đầu, mỗi
   lần cắt oan là cả trang lệch một bậc. Nới thành 0.4–1.9; nới được là nhờ bề
   dày đỉnh đã gánh việc loại vệt mờ.

Bản 7 (11/09/2026) — bỏ bớt bộ lọc thay vì thêm:

11. **Thôi xoá thẳng, chuyển hết sang trừ điểm.** Dây chuyền cũ có bốn bộ lọc
   xoá VĨNH VIỄN đỉnh nào trông đáng ngờ, chạy TRƯỚC bước chọn. Nay bước chọn
   đã có mô hình chấm điểm đầy đủ, nên giữ thêm bản xoá thẳng vừa thừa vừa hại:
   chỉ cần một dòng thật bị xoá oan là cả trang lệch mà không gì cứu lại được.
   Nặng nhất là `_drop_junk` — nó cắt số đỉnh xuống VỪA KHÍT số dòng, nên
   `so-fukuoka(2)` còn đúng 25 đỉnh cho 25 dòng và bước chọn hết đường xoay xở,
   buộc phải nhận cả hàng tiêu đề. Bỏ `_drop_junk` và `_drop_no_balance` thì
   `so-fukuoka(1)` hết lệch, `11111111111111` vẫn giữ nguyên 24/24.

Còn một dấu hiệu nữa đã thêm nhưng CHƯA đủ mạnh: `_right_align` — số tiền căn
phải còn chữ tiêu đề「差引残高」căn giữa, nên trọng tâm mực ở cột số dư của hàng
tiêu đề là 0.40–0.47 so với 0.57–0.71 của dòng thật. Phạt nhẹ vì dòng GHI TAY
cũng cho 0.33. Nó chữa được `kotofuji-tr2` và `444444444444` nhưng chưa đủ cho
`kotofuji-tr3`, `so-fukuoka(1)/(2)`, `SCAN0000_page-0003` — ở đó hàng tiêu đề
vẫn chiếm mất dải đầu tiên. Xem ghi chú "Giới hạn còn lại" ở cuối.

Kèm theo: cổng "dò được chính xác" phải đổi cách đo. Cổng cũ đếm độ đều của các
đỉnh đã chọn, mà bước chọn mới lại lấy tiêu chí là đều — nó tự chấm bài của
chính mình và ảnh nhiễu vẫn được chấm là chính xác. Cổng mới hỏi ẢNH: mực ở tâm
dải phải đậm hơn mực ở ranh giới giữa hai dải (nhiễu 1.31, sổ thật ≥ 1.89).

Toạ độ trả về vẫn tính theo TOÀN ảnh gốc (không phải theo vùng đã cắt), kèm
`skew_deg` để giao diện nghiêng vệt đánh dấu đúng bằng độ nghiêng của trang, và
`x0`/`x1` là bề ngang tờ giấy để vệt không quét cả mặt bàn (xem `bands_for`).

GIỚI HẠN CÒN LẠI (đo 11/09/2026, đừng mất công dò lại những hướng đã thử):

Hàng TIÊU ĐỀ CỘT của cuốn sổ in biểu mẫu bằng MỰC ĐEN thì gần như không tách
được khỏi dòng dữ liệu. Đã đo và loại bốn hướng: lượng mực (tiêu đề 1.17 so với
dòng thật 0.66–1.18 — trùng nhau), bề dày (0.93 so với 0.93–1.07 — trùng), cột
số dư có mực hay không (cả hai đều có), cột số thứ tự ở mép (dòng thật có cái
0.35 mà tiêu đề lại 0.98). Chỉ `_right_align` còn tách được chút ít, nhưng phải
phạt nhẹ vì dòng ghi tay cũng giống hệt.

Hướng chắc ăn nếu sau này cần làm tới: hỏi model toạ độ dòng. Nhưng đổi prompt
là **mất toàn bộ cache**, mọi trang đã quét phải quét lại và mất tiền — nên chỉ
làm khi đã quyết định đổi prompt vì lý do khác.
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

# Mực TRUNG TÍNH (đen/xanh đen) so với mực có màu: điểm nào đỏ hơn mức này thì
# coi là mực của BIỂU MẪU in sẵn, không phải dữ liệu giao dịch. Xem `_black_ink`.
COLOR_DELTA = 12.0
# Đỉnh có tỉ lệ mực đen thấp hơn BLACK_RATIO lần trung vị thì gần như chắc chắn
# là dòng của biểu mẫu (tiêu đề cột, chú thích chân trang).
BLACK_RATIO = 0.40

# Bề dày đỉnh so với trung vị. Mỏng hơn THIN_RATIO là một sợi vệt (nếp gấp,
# đường kẻ mờ, vết quét); dày hơn THICK_RATIO là HAI dòng dính vào nhau (hàng
# tiêu đề in hai tầng như「摘要 / (お客様メモ)」). Đo trên ảnh thật: dòng dữ liệu
# nằm gọn trong 0.87–1.13, rác thì 0.20/0.27/0.47 và 2.33. Xem `_peak_width`.
THIN_RATIO = 0.7
THICK_RATIO = 1.7

# Trần phạt khi hai dòng cách nhau XA hơn nhịp (nếp gấp, model bỏ sót dòng), và
# hệ số nhân khi cách GẦN hơn nhịp. Xem `phat_nhip` trong `_select_rows`.
XA_TOI_DA = 0.5
GAN_NANG = 1.5

# Số tiền CĂN PHẢI trong ô, còn chữ tiêu đề「差引残高」thì CĂN GIỮA — nên trọng
# tâm mực ở cột số dư của hàng tiêu đề lệch trái hơn hẳn. Dưới ALIGN_RATIO lần
# trung vị thì trừ điểm. Phạt NHẸ (sàn ALIGN_FLOOR) vì dòng ghi tay cũng lệch
# trái giống vậy — xem `_right_align`.
ALIGN_RATIO = 0.8
ALIGN_FLOOR = 0.55

# Đỉnh rác: mờ hơn WEAK_RATIO lần trung vị độ mạnh các đỉnh, hoặc nằm trong
# EDGE_FRAC nhịp tính từ mép khối nội dung (bóng mép giấy).
WEAK_RATIO = 0.45
EDGE_FRAC = 0.25

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


def _black_ink(rgb: Image.Image, ink: np.ndarray) -> np.ndarray:
    """Chỉ giữ điểm mực TRUNG TÍNH (đen), bỏ điểm mực có màu.

    Vì sao đáng làm: trên sổ Nhật, **biểu mẫu in sẵn dùng mực màu** (ゆうちょ in
    hồng/đỏ, nhiều sổ khác in xanh) — tựa trang, hàng tiêu đề cột, chú thích
    chân trang, viền bảng, số thứ tự dòng đều thuộc về biểu mẫu. Còn **dữ liệu
    giao dịch do máy in kim in bằng mực đen**.

    Đây là tín hiệu DUY NHẤT tách được hàng tiêu đề cột khỏi dòng dữ liệu. Đã
    thử và đo trên ảnh thật rồi loại ba tín hiệu khác:
    - lượng mực: hàng tiêu đề 0.92 so với dòng thật 0.99 — không phân biệt nổi;
    - cột số dư: tiêu đề 0.46–1.03, nằm lẫn trong khoảng của dòng thật;
    - cột số thứ tự ở mép: dòng thật có cái 0.35 mà tiêu đề lại 0.98.
    Tỉ lệ mực đen thì tách hẳn: rác 0.00–0.19, dòng thật 0.26–0.90.

    Ảnh xám (scan đen trắng) hay sổ in biểu mẫu bằng mực đen thì R≈G≈B nên mọi
    điểm đều "trung tính", tỉ lệ bằng 1 ở mọi đỉnh — chỉ số tự vô hiệu, không
    làm hỏng gì. Vì vậy chỗ dùng nó phải so theo TRUNG VỊ, đừng so với số tuyệt
    đối.
    """
    a = np.asarray(rgb, dtype=np.float32)
    if a.ndim != 3 or a.shape[2] < 3:
        return ink
    lech_do = a[:, :, 0] - (a[:, :, 1] + a[:, :, 2]) / 2.0
    return ink & (lech_do < COLOR_DELTA)


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
    lag = float(min(strong, key=lambda lag: abs(np.log(lag / guess))))

    # GẤP BỘI SỐ VỀ NHỊP GỐC.
    #
    # Lọc "lag đủ mạnh" ở trên vẫn lọt lưới ở sổ ゆうちょ: dòng 料金 chỉ in mỗi
    # chữ 料金 + số tiền, còn dòng giao dịch thì kín chữ. Hai kiểu dòng xen kẽ
    # nên lượng mực lặp lại đúng chu kỳ HAI DÒNG — tự tương quan ở 2p mạnh hơn
    # hẳn ở p, mạnh tới mức p không lọt nổi vào danh sách "đủ mạnh" để đem ra
    # so với mồi. Đo được: cả 4 mặt sổ phải chia đều đều dính đúng lỗi này
    # (pitch/mồi = 1.87–2.14), và hậu quả là `_peaks` gạt mất một nửa số dòng.
    #
    # Mồi tính từ chiều cao vùng có chữ chia số dòng nên sai số nhỏ; lag lớn hơn
    # mồi tới gần gấp đôi thì gần như chắc chắn là bội số. Đòi khoảng cách tới
    # mồi phải giảm RÕ RỆT mới chịu chia, để không đụng vào ca đang đúng.
    for div in (2.0, 3.0):
        nho = lag / div
        if nho >= 4 and abs(np.log(nho / guess)) < abs(np.log(lag / guess)) - 0.2:
            return nho
    return lag


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


def _peak_width(profile: np.ndarray, p: int) -> int:
    """Bề DÀY của vệt mực tại đỉnh `p` — đo ở nửa chiều cao đỉnh.

    Một dòng chữ dày bằng chiều cao con chữ (cỡ nửa nhịp dòng). Còn nếp gấp
    giữa hai nửa trang, đường kẻ mờ hay vệt máy quét chỉ là một SỢI MẢNH — tuy
    cũng nhô lên thành đỉnh trong biểu đồ mực, nhưng mỏng hơn hẳn.

    Đây là thứ cứu được ca `5555555555`: hai vệt nằm đúng khoảng trắng giữa
    trang có lượng mực 0.73/0.63 và cột số dư 1.02/0.65 — nghĩa là cả độ đậm
    lẫn cột số dư đều nằm gọn trong khoảng của dòng thật, không cách nào loại.
    Nhưng bề dày thì 0.27/0.20 trong khi mọi dòng thật đều 0.87–1.13.

    Đo trên biểu đồ THÔ, không đo trên bản đã làm trơn: làm trơn với cửa sổ cỡ
    1/3 nhịp sẽ thổi phồng một sợi 3px thành ra dày bằng dòng chữ, đúng thứ
    đang cần phân biệt.
    """
    if not (0 <= p < len(profile)):
        return 0
    nua = float(profile[p]) / 2.0
    if nua <= 0:
        return 0
    a = p
    while a > 0 and profile[a] > nua:
        a -= 1
    b = p
    while b < len(profile) - 1 and profile[b] > nua:
        b += 1
    return b - a


def _right_align(mask: np.ndarray, peaks: list[int], pitch: float) -> dict[int, float]:
    """Trọng tâm mực theo chiều NGANG trong cột số dư, cho từng đỉnh (0..1).

    Máy in kim in số tiền CĂN PHẢI trong ô, nên trọng tâm nằm lệch phải. Hàng
    tiêu đề in chữ「差引残高」CĂN GIỮA ô, trọng tâm lệch trái hơn hẳn: đo được
    0.40–0.47 ở hàng tiêu đề so với 0.57–0.71 ở dòng dữ liệu.

    Đây là dấu hiệu cuối cùng còn lại cho những cuốn sổ in biểu mẫu bằng MỰC
    ĐEN — lúc đó `_black_ink` tự vô hiệu, mà độ đậm, bề dày, cột số dư có mực
    hay không đều giống dòng thật y hệt.

    ⚠ Dòng GHI TAY cũng cho trọng tâm thấp (đo được 0.33 ở dòng「新通帳に繰越」
    viết tay). Nó là dòng thật, nên chỗ dùng phải phạt nhẹ tay, đừng loại thẳng.
    """
    H, W = mask.shape
    nua = max(2, int(pitch / 3))
    ra: dict[int, float] = {}
    for p in peaks:
        a, b = max(0, p - nua), min(H, p + nua + 1)
        cot = mask[a:b, int(W * 0.76) : int(W * 0.99)].sum(axis=0).astype(np.float64)
        tong = float(cot.sum())
        if tong <= 0 or len(cot) < 2:
            ra[p] = -1.0
            continue
        xs = np.arange(len(cot), dtype=np.float64)
        ra[p] = float((xs * cot).sum() / tong) / (len(cot) - 1)
    return ra


def _row_quality(
    peaks: list[int],
    profile: np.ndarray,
    smooth: np.ndarray,
    right: np.ndarray,
    black: np.ndarray,
    align: dict[int, float],
    rules: list[int],
    blocks: list[tuple[int, int]],
    pitch: float,
) -> dict[int, float]:
    """Điểm 0..1: đỉnh này giống DÒNG DỮ LIỆU tới mức nào.

    Ba dấu hiệu, đều đo được trên ảnh thật (`so-yucho-dep`, xem số trong ngoặc):

    - **Lượng mực vừa phải.** Dòng dữ liệu quanh quẩn mức trung vị (0.56–1.25),
      còn tựa trang và hàng tiêu đề cột ĐẬM HƠN HẲN (2.33 / 3.10 / 3.36). Đây
      là chỗ trước kia bỏ sót: chỉ đi loại đỉnh MỜ mà quên rằng đỉnh quá ĐẬM
      cũng đáng ngờ y như vậy.
    - **Có số ở cột số dư.** Mọi dòng giao dịch đều in 差引残高/現在高 ở cột
      phải; hai dòng chú thích chân trang thì cột đó gần như trống (0.16 / 0.00)
      vì chữ chú thích chạy hết bên trái.
    - **Không nằm trên đường kẻ.** Viền bảng kẻ liền hết chiều ngang nên lượng
      mực vọt cao, nhưng nó là cái khung chứ không phải dòng.
    - **Mực ĐEN chứ không phải mực của biểu mẫu.** Xem `_black_ink` — đây mới là
      thứ tách được hàng tiêu đề cột (0.08–0.19) khỏi dòng dữ liệu (0.26–0.90),
      ba dấu hiệu kia đều bó tay với nó.
    - **Dày bằng dòng chữ, không phải một sợi mảnh.** Xem `_peak_width` — cái
      này loại được vệt nếp gấp nằm giữa trang, thứ mà cả bốn dấu hiệu trên đều
      không thấy có gì bất thường.
    - **Số căn phải trong cột số dư.** Xem `_right_align` — dấu hiệu cuối cùng
      còn lại khi cuốn sổ in biểu mẫu bằng mực đen.
    Mọi dấu hiệu đều TRỪ ĐIỂM chứ không loại thẳng, và đều so theo TRUNG VỊ của
    chính trang đó. Đó là điểm khác căn bản so với bản trước: trước kia có một
    dây chuyền bộ lọc xoá vĩnh viễn đỉnh nào trông đáng ngờ, nên chỉ cần một
    dòng dữ liệu thật bị xoá oan là cả trang lệch, mà không gì cứu lại được —
    đo trên `so-fukuoka(2)` thấy 3 đỉnh bị xoá trước khi bước chọn kịp nhìn tới.
    Nay bước chọn nhìn thấy MỌI ứng viên và tự cân nhắc.
    """
    if not peaks:
        return {}

    def lay(a: np.ndarray, p: int) -> float:
        return float(a[p]) if 0 <= p < len(a) else 0.0

    med = float(np.median([lay(smooth, p) for p in peaks])) or 1.0
    medr = float(np.median([lay(right, p) for p in peaks])) or 1.0
    # Tỉ lệ mực đen của từng đỉnh, rồi lấy trung vị làm mốc. So theo trung vị
    # nên ảnh xám (mọi đỉnh đều 1.0) hay sổ in mẫu bằng mực đen đều ra "bằng
    # nhau cả" — chỉ số tự vô hiệu thay vì phạt oan.
    ty_den = {p: lay(black, p) / (lay(smooth, p) or 1e-6) for p in peaks}
    med_den = float(np.median(list(ty_den.values()))) or 1.0
    day = {p: _peak_width(profile, p) for p in peaks}
    med_day = float(np.median(list(day.values()))) or 1.0
    co_canh = [align[p] for p in peaks if align.get(p, -1) >= 0]
    med_canh = float(np.median(co_canh)) if co_canh else 0.0

    q: dict[int, float] = {}
    for p in peaks:
        ty = lay(smooth, p) / med
        # Đậm vừa = 1.0; mờ quá hoặc đậm quá thì tụt dần, không cắt phăng —
        # cắt phăng thì một dòng đậm bất thường là mất luôn, còn cho điểm thấp
        # thì nhịp vẫn kéo nó lại được.
        # Trần 1.9 chứ không phải 1.6: đo trên ảnh thật, dòng dữ liệu in ĐẬM
        # hơn bình thường vẫn tới 1.74 (`11111111111111`, dòng cuối trang), mà
        # tựa/tiêu đề thì từ 2.33 trở lên — 1.9 nằm gọn giữa hai vùng.
        # Sàn 0.4 chứ không phải 0.5: dòng dữ liệu in NHẠT vẫn tới 0.47
        # (`444444444444`, dòng cuối trang) và sàn cũ loại oan nó, làm cả trang
        # lệch một bậc. Hạ sàn được là nhờ bề dày đỉnh đã gánh việc loại vệt mờ
        # — vệt nếp gấp tuy cũng nhạt nhưng mỏng hơn hẳn (0.20–0.47 bề dày).
        d = 1.0 if 0.4 <= ty <= 1.9 else max(0.05, 1.0 - abs(np.log(ty / 1.0)))
        r = lay(right, p) / medr
        d *= 1.0 if r >= 0.45 else max(0.05, r / 0.45)
        if any(abs(p - x) <= 2 for x in rules):
            d *= 0.25
        den = ty_den[p] / med_den
        if den < BLACK_RATIO:
            d *= max(0.03, den / BLACK_RATIO)
        # Bình phương cho dốc: 0.47 (vệt nếp gấp) phải tụt hẳn, còn 0.87
        # (dòng thật mỏng nhất đo được) thì không được đụng tới.
        canh = align.get(p, -1.0)
        if med_canh > 0 and canh >= 0:
            ty_canh = canh / med_canh
            if ty_canh < ALIGN_RATIO:
                d *= max(ALIGN_FLOOR, ty_canh / ALIGN_RATIO)
        mong = day[p] / med_day
        if mong < THIN_RATIO:
            d *= max(0.03, (mong / THIN_RATIO) ** 2)
        elif mong > THICK_RATIO:
            d *= max(0.03, (THICK_RATIO / mong) ** 2)
        q[p] = float(min(1.0, max(0.02, d)))
    return q


def _select_rows(
    peaks: list[int],
    n_rows: int,
    quality: dict[int, float],
    blocks: list[tuple[int, int]],
    pitch: float,
) -> list[int]:
    """Chọn đúng `n_rows` đỉnh là dòng dữ liệu — quy hoạch động theo NHỊP.

    Vì sao phải thay cách cũ: cách cũ (`_pick_window`) thừa bao nhiêu thì cắt
    bấy nhiêu đỉnh ở ĐẦU. Trên `so-yucho-dep` có 36 đỉnh cho 24 dòng, và 12 đỉnh
    thừa nằm rải ba nơi — tựa + 3 hàng tiêu đề ở đầu, 2 dòng chú thích ở chân
    trang, còn lại là đỉnh đôi trong cùng một dòng. Cắt ở đầu là **xoá mất dòng
    01–05** rồi đẩy mọi dải xuống 5 bậc.

    Cách mới chấm cả một PHƯƠNG ÁN thay vì chấm từng đỉnh: sổ là biểu mẫu in
    sẵn nên các dòng dữ liệu cách nhau đều; phương án đúng là phương án vừa đều
    nhịp vừa gồm toàn đỉnh giống dòng. Chi phí = (lệch nhịp) + (điểm giống dòng
    thấp), tìm phương án rẻ nhất bằng quy hoạch động.

    Khoảng cách vắt qua NẾP GẤP giữa hai nửa trang không bị phạt — chỗ đó vốn
    phải nhảy xa, phạt thì máy lại đi nhét dòng ma vào giữa nếp gấp.
    """
    P = len(peaks)
    if P <= n_rows or n_rows <= 0:
        return peaks

    def khoi_cua(p: int) -> int:
        for i, (a, b) in enumerate(blocks):
            if a <= p < b:
                return i
        return -1

    kh = [khoi_cua(p) for p in peaks]
    W_Q = 1.2          # nặng ngang một lần lệch nhịp e-lần; chỉnh bằng đo đạc

    # NHỊP CO GIÃN THEO VÙNG, không dùng một con số cho cả trang.
    #
    # Ảnh chụp cuốn sổ đang mở thì mặt giấy cong, nên dòng ở xa ống kính bị nén
    # lại: đo trên `so-yucho-dep` là 16–20px ở đầu trang và 22–25px ở cuối, tức
    # chênh nhau tới 50%. Lấy một nhịp chung (25) thì ở vùng bị nén, **bỏ một
    # dòng thật còn rẻ hơn giữ nó** — gộp hai khoảng 17px thành 34px chỉ bị phạt
    # 0.31 trong khi giữ cả hai bị phạt 0.38+0.38. Đó chính là lý do 5 dòng đầu
    # trang bị xoá và cả trang trôi xuống.
    #
    # Nhịp tại chỗ = trung vị khoảng cách của các đỉnh lân cận. Trung vị nên vài
    # đỉnh rác xen vào cũng không kéo lệch được.
    gaps = [peaks[i + 1] - peaks[i] for i in range(P - 1)]

    def nhip_tai(i: int) -> float:
        if not gaps:
            return pitch
        lan_can = gaps[max(0, i - 4) : min(len(gaps), i + 5)]
        return float(np.median(lan_can)) if lan_can else pitch

    nhip = [max(3.0, nhip_tai(i)) for i in range(P)]

    def phat_nhip(i: int, j: int) -> float:
        """Phạt cho khoảng cách giữa hai dòng liền nhau — CỐ Ý KHÔNG ĐỐI XỨNG.

        Xa hơn nhịp thì có TRẦN, gần hơn nhịp thì phạt nặng. Lý do:

        - Khoảng XA là chuyện bình thường và vô tội: nếp gấp giữa hai nửa trang,
          hoặc model bỏ sót một dòng. `_blocks` lẽ ra tách hai nửa trang thành
          hai khối (và khi đó cú nhảy không bị phạt), nhưng nếp gấp thường vẫn
          dính chút mực mờ nên không tách được — lúc ấy cú nhảy qua nếp gấp bị
          phạt tới 1.26, đắt tới mức máy thà **nhét một dòng ma vào giữa khoảng
          trắng** cho "đều nhịp". Đúng lỗi của `11111111111111` và `33333333333`.
        - Khoảng GẦN thì ngược lại, là bằng chứng mạnh: dòng in sẵn cách đều
          nhau, hai đỉnh sát nhau hơn hẳn một nhịp nghĩa là có một cái giả.
        """
        if kh[i] != kh[j]:
            return 0.0
        gap = peaks[j] - peaks[i]
        if gap <= 0:
            return 9.9
        lech = float(abs(np.log(gap / nhip[i])))
        return min(lech, XA_TOI_DA) if gap >= nhip[i] else lech * GAN_NANG

    INF = float("inf")
    # chi_phi[k][j] = rẻ nhất khi đã chọn k+1 đỉnh và đỉnh cuối là j
    chi_phi = [[INF] * P for _ in range(n_rows)]
    tu_dau = [[-1] * P for _ in range(n_rows)]
    for j in range(P):
        chi_phi[0][j] = W_Q * (1.0 - quality.get(peaks[j], 0.5))
    for k in range(1, n_rows):
        for j in range(k, P):
            rieng = W_Q * (1.0 - quality.get(peaks[j], 0.5))
            tot, tu = INF, -1
            for i in range(k - 1, j):
                c = chi_phi[k - 1][i]
                if c == INF:
                    continue
                c += phat_nhip(i, j)
                if c < tot:
                    tot, tu = c, i
            if tu >= 0:
                chi_phi[k][j] = tot + rieng
                tu_dau[k][j] = tu

    cuoi = min(range(P), key=lambda j: chi_phi[n_rows - 1][j])
    if chi_phi[n_rows - 1][cuoi] == INF:
        return _pick_window(peaks, n_rows)
    ra: list[int] = []
    k, j = n_rows - 1, cuoi
    while k >= 0 and j >= 0:
        ra.append(peaks[j])
        j = tu_dau[k][j]
        k -= 1
    return sorted(ra)


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
    `x0`/`x1` là bề ngang TỜ GIẤY (tỉ lệ 0..1 của bề ngang ảnh gốc).

    Vì sao phải trả `x0`/`x1`: độ nghiêng được đo QUANH TÂM TỜ GIẤY (`_profile_at`
    lấy mốc x − w/2 trên ảnh ĐÃ CẮT về vùng giấy). Giao diện vẽ vệt kéo hết bề
    ngang ảnh rồi `skewY` — mà CSS xoay quanh tâm của chính vệt đó, tức tâm ẢNH.
    Ảnh chụp mà tờ giấy lệch sang một bên thì hai tâm khác nhau, và cả vệt bị
    đẩy lên (hoặc xuống) một đoạn = khoảng lệch tâm × tang góc nghiêng. Vẽ vệt
    đúng bằng bề ngang tờ giấy thì tâm vệt TRÙNG tâm giấy, hết lệch — mà nhìn
    cũng gọn hơn vì không quét cả mặt bàn.
    """
    if n_rows <= 0:
        return {"bands": [], "exact": False, "skew_deg": 0.0, "x0": 0.0, "x1": 1.0}

    g = _work_image(img, n_rows)
    H, W = g.height, g.width
    if H < 20:
        return {
            "bands": [{"y0": i / n_rows, "y1": (i + 1) / n_rows} for i in range(n_rows)],
            "exact": False, "skew_deg": 0.0, "x0": 0.0, "x1": 1.0,
        }

    r0, r1, c0, c1 = _page_box(g)
    page = g.crop((c0, r0, c1, r1))
    mask = _ink_mask(page)
    # Cùng vùng cắt nhưng giữ MÀU, để tách mực đen của dữ liệu khỏi mực màu của
    # biểu mẫu in sẵn (xem `_black_ink`).
    rgb = img.convert("RGB").resize(g.size, Image.BILINEAR).crop((c0, r0, c1, r1))
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
            "x0": round(c0 / W, 5),
            "x1": round(c1 / W, 5),
        }

    pitch0 = ph / max(1, n_rows)
    blocks = _blocks(profile, min_gap=max(6.0, pitch0 * 0.9))
    if not blocks:
        return out(_even_by_blocks(n_rows, [], ph), False)

    pitch = _pitch(profile, blocks, n_rows)
    rules = _rules(profile)

    # CHỈ còn hai bước xoá thẳng, và cả hai đều gạt thứ nằm NGOÀI bảng: chú
    # thích nép dưới viền đáy, và cụm 1-2 dòng lạc lõng ở hai đầu trang.
    #
    # Hai bộ lọc cũ (`_drop_no_balance`, `_drop_junk`) đã bỏ hẳn. Tín hiệu của
    # chúng nay nằm trong `_row_quality` dưới dạng TRỪ ĐIỂM, nên giữ thêm bản
    # xoá thẳng là xử hai lần — mà lần xoá thẳng thì không cứu lại được. Tệ hơn:
    # `_drop_junk` cắt số đỉnh xuống VỪA KHÍT số dòng, nên `so-fukuoka(2)` còn
    # đúng 25 đỉnh cho 25 dòng và bước chọn hết đường xoay xở, buộc phải lấy cả
    # hàng tiêu đề. Bỏ chúng đi thì `so-fukuoka(1)` hết lệch.
    peaks = _drop_footnotes(
        _peaks(profile, blocks, pitch), rules, pitch, blocks[-1][1]
    )
    peaks = _drop_stray_runs(peaks, pitch, n_rows)
    if len(peaks) < n_rows:
        return out(_even_by_blocks(n_rows, blocks, ph), False)

    sm = _smooth(profile, pitch / 3)

    # Cột số dư: dòng giao dịch nào cũng có số ở đây, chú thích chân trang thì
    # không. Chừa mép ngoài cùng vì ゆうちょ in số thứ tự dòng ở đó.
    mw = mask.shape[1]
    right = _smooth(
        _profile_at(mask[:, int(mw * 0.76) : int(mw * 0.96)], tan), pitch / 3
    )
    black = _smooth(_profile_at(_black_ink(rgb, mask), tan), pitch / 3)
    chosen = _select_rows(
        peaks,
        n_rows,
        _row_quality(
            peaks, profile, sm, right, black,
            _right_align(mask, peaks, pitch), rules, blocks, pitch,
        ),
        blocks,
        pitch,
    )

    # CỔNG CHẤT LƯỢNG — đo trên ẢNH, không đo trên cách chọn.
    #
    # Cổng cũ đếm xem khoảng cách giữa các đỉnh có đều không. Nay `_select_rows`
    # chọn theo tiêu chí đều nhịp, nên nó LUÔN trả về một tập đều — kể cả khi
    # nguyên liệu là nhiễu. Cổng cũ thành ra tự kiểm tra chính đầu ra của mình
    # và bao giờ cũng gật (đo được: ảnh nhiễu vẫn được chấm là "dò chính xác").
    #
    # Chỉ số mới hỏi ẢNH chứ không hỏi thuật toán: trang in thật có dòng ĐEN và
    # khe TRẮNG, nên mực ở tâm dải phải đậm hơn hẳn mực ở ranh giới giữa hai
    # dải. Đo được: ảnh nhiễu 1.31, còn 32 mặt sổ thật thấp nhất 1.89 và trung
    # vị 11.85 — lấy mốc 1.6 nằm gọn giữa hai vùng.
    half = pitch / 2
    if chosen:
        tam = [float(profile[c]) for c in chosen if 0 <= c < ph]
        bien = [
            float(profile[int(round(y))])
            for c in chosen
            for y in (c - half, c + half)
            if 0 <= int(round(y)) < ph
        ]
        if tam and bien:
            muc_bien = float(np.mean(bien)) or 1e-6
            if float(np.mean(tam)) / muc_bien < 1.6:
                return out(_even_by_blocks(n_rows, blocks, ph), False)

    bands: list[dict] = []
    for k, c in enumerate(chosen):
        up = min(half, (c - chosen[k - 1]) / 2) if k > 0 else half
        dn = min(half, (chosen[k + 1] - c) / 2) if k < len(chosen) - 1 else half
        bands.append({"y0": c - up, "y1": c + dn})
    return out(bands, True)
