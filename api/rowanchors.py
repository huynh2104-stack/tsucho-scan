"""Local numeric OCR anchors. Never send passbook images to another service.

Image geometry alone cannot distinguish a black column heading from a transaction.
Require two distinct matching numbers on the same physical line, including the
balance. Ambiguous or unmatched rows retain an explicitly estimated band.
"""
import csv
import io
import os
from pathlib import Path
import re
import shutil
import subprocess
import tempfile
from functools import lru_cache
from concurrent.futures import ThreadPoolExecutor

from PIL import Image

from . import ocrengine, rowmap


@lru_cache(maxsize=12)
def _read_rapid_words(path: str, revision: str):
    """Optional bundled ONNX models: CPU inference, no downloads or API calls."""
    # Bản RapidOCR dùng chung với `orient` (tự nhận hướng trang): nạp mô hình một lần thôi.
    engine = ocrengine.engine()
    if engine is None:
        raise ImportError("RapidOCR is not installed")      # `locate` coi như bộ đọc vắng mặt
    with Image.open(path) as image:
        width, height = image.size
    # RapidOCR has mutable per-call state; serialize access to the shared engine.
    with ocrengine.LOCK:
        detected, _ = engine(path)
    words = []
    for quad, text, score in detected or []:
        number = _number(text)
        # RapidOCR 1.2.3 (bản duy nhất cài được trên Python 3.14) trả điểm dạng CHỮ: so thẳng với số là TypeError, bị
        # nuốt ở `locate`, và bộ đọc chính lặng lẽ không chạy (đo: chỉ còn Tesseract thì 45% số dòng không định vị được).
        # Ngưỡng 0.6 (trước là 0.85): một con số đọc kém tự tin mà vẫn TRÙNG KHÍT số của một dòng và nằm đúng chỗ thì
        # vẫn là bằng chứng tốt; số đọc sai thì không trùng dòng nào nên tự rơi. Đo trên 76 mặt sổ thật: số cặp khớp
        # 806 → 826 (bản 1.4.4) và 231 → 713 (bản 1.2.3, điểm của nó thấp hơn hẳn), tỉ lệ đặt sai không đổi.
        if not number or float(score) < .6:
            continue
        words.append({"value": number,
                      "x": sum(p[0] for p in quad) / (4 * width),
                      "y": sum(p[1] for p in quad) / (4 * height),
                      "height": max(1, ((quad[3][1] - quad[0][1]) + (quad[2][1] - quad[1][1])) / 2) / height})
    return words


def _executable():
    configured = os.getenv("TSUCHO_TESSERACT")
    return configured or shutil.which("tesseract") or (
        str(Path("C:/Program Files/Tesseract-OCR/tesseract.exe"))
        if Path("C:/Program Files/Tesseract-OCR/tesseract.exe").is_file() else None
    )


# Số tiền in có dấu phân cách hàng nghìn; bộ đọc chữ hay đọc dấu phẩy thành dấu chấm («*73.513»). Sổ chỉ in số yên
# nguyên nên «1–3 chữ số rồi các nhóm ĐÚNG ba chữ số» chắc chắn là dấu phân cách, không phải số thập phân; ngày tháng
# («04.07.19») không có dạng đó. Đo trên 76 mặt sổ thật: nhận thêm dạng này thì số cặp khớp 692 → 806, không tăng sai.
_GROUPED = re.compile(r"[0-9]{1,3}(?:[.,，、][0-9]{3})+")


def _number(value):
    if isinstance(value, float) and value.is_integer():
        value = int(value)
    # Decorations around printed balances are common. Do not turn letters into
    # digits: fuzzy OCR substitutions can create a plausible but false match.
    text = str(value or "").strip().strip("*＊¥￥=。.")
    if _GROUPED.fullmatch(text):
        text = re.sub(r"[.,，、]", "", text)
    text = text.replace(",", "").replace("，", "").strip("*＊¥￥=。.")
    if not re.fullmatch(r"[0-9]{3,}", text):
        return None
    return text.lstrip("0") or "0"


@lru_cache(maxsize=12)
def _read_words(path: str, revision: str, executable: str):
    del revision  # participates in cache key; edits invalidate the OCR result
    with Image.open(path) as source:
        image = source.convert("RGB")
        image.thumbnail((2600, 2600))
        width, height = image.size
        with tempfile.TemporaryDirectory(prefix="tsucho-row-") as temp:
            scan = Path(temp) / "scan.png"
            image.save(scan)
            local_data = Path(__file__).resolve().parents[1] / ".tools" / "tessdata"
            extra = (["--tessdata-dir", str(local_data)]
                     if (local_data / "jpn.traineddata").is_file() and (local_data / "eng.traineddata").is_file() else [])
            outputs = []
            # Independent readers give more candidates; conflicting positions
            # remain ambiguous and are rejected by match_rows.
            for language in ("eng", "jpn"):
                try:
                    process = subprocess.run(
                        [executable, str(scan), "stdout", *extra, "-l", language,
                         "--psm", "11", "-c", "tessedit_create_tsv=1"],
                        capture_output=True, timeout=20, check=True,
                        creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
                    )
                    outputs.append(process.stdout.decode("utf-8", errors="replace"))
                except (subprocess.CalledProcessError, subprocess.TimeoutExpired):
                    # English may exist without Japanese locally. Production
                    # installs both; keep any successful reader's candidates.
                    continue
    words = []
    for row in (r for output in outputs for r in csv.DictReader(io.StringIO(output), delimiter="\t")):
        number = _number(row.get("text"))
        if not number or float(row.get("conf", -1)) < 30:
            continue
        x, y, w, h = (int(row[key]) for key in ("left", "top", "width", "height"))
        token = {"value": number, "x": (x + w / 2) / width,
                 "y": (y + h / 2) / height, "height": h / height}
        if not any(old["value"] == number and abs(old["x"] - token["x"]) < .012
                   and abs(old["y"] - token["y"]) < token["height"] * .5 for old in words):
            words.append(token)
    return words


def _dedupe(words):
    """Hai bộ đọc chữ thường thấy cùng một con số ở cùng một chỗ: giữ một."""
    kept = []
    for w in words:
        if not any(o["value"] == w["value"] and abs(o["x"] - w["x"]) < .012
                   and abs(o["y"] - w["y"]) < max(o["height"], w["height"]) * .5 for o in kept):
            kept.append(w)
    return kept


def _pair_hits(row, tokens):
    """Mọi chỗ trên ảnh có SỐ DƯ và SỐ TIỀN của dòng này nằm trên cùng một dòng in."""
    balance = _number(row.get("balance"))
    amounts = {_number(row.get(key)) for key in ("amount_in", "amount_out")}
    amounts.discard(None)
    amounts.discard(balance)
    hits = []
    if not balance or not amounts or row.get("is_note"):
        return hits
    for b in tokens:
        if b["value"] != balance:
            continue
        for a in tokens:
            tolerance = min(0.012, max(a["height"], b["height"]) * .65)
            if a["value"] in amounts and abs(a["center"] - b["center"]) <= tolerance and abs(a["x"] - b["x"]) > .025:
                center = (a["center"] + b["center"]) / 2
                if not any(abs(center - old["center"]) < tolerance for old in hits):
                    hits.append({"center": center, "half": max(a["height"], b["height"]) * .8,
                                 "slope": (b["y"] - a["y"]) / (b["x"] - a["x"]), "dx": abs(b["x"] - a["x"]),
                                 "xs": (min(a["x"], b["x"]), max(a["x"], b["x"]))})
    return hits


def _slope_model(hits):
    """Độ dốc của dòng chữ theo vị trí trên trang, đo từ chính các cặp số đã khớp: (k, c, lo, hi) hoặc None.

    Ảnh chụp bằng điện thoại có phối cảnh: dòng ở đầu trang và dòng ở cuối trang nghiêng khác nhau, nên một góc nghiêng
    chung cho cả trang làm khung lệch dần về hai mép. Hai con số trên cùng một dòng cho biết đúng độ dốc của dòng đó;
    khớp đường thẳng qua các điểm ấy là có độ dốc cho MỌI dòng: tại chiều cao y là clip(k·y + c, lo, hi).
    None = chưa đủ dữ kiện (dưới 4 cặp số cách nhau đủ xa theo chiều ngang).
    """
    import numpy as np
    pts = [(h["center"], h["slope"]) for h in hits if h["dx"] >= .15]
    if len(pts) < 4:
        return None
    ys, ss = np.array([p[0] for p in pts]), np.array([p[1] for p in pts])
    if float(ys.max() - ys.min()) < .2:
        level = float(np.median(ss))
        return 0., level, level, level
    k, c = np.polyfit(ys, ss, 1)
    rest = np.abs(ss - (k * ys + c))
    keep = rest <= max(1e-4, 2.5 * float(np.median(rest)))
    if 4 <= int(keep.sum()) < len(ys):
        k, c = np.polyfit(ys[keep], ss[keep], 1)
        ss = ss[keep]
    return float(k), float(c), float(ss.min()), float(ss.max())


# Sổ in 24 dòng mỗi mặt, nếp gấp nằm giữa dòng 12 và 13 (mọi cuốn đã gặp: 福岡, ゆうちょ, 西日本シティ, 百十四…)
FOLD_AFTER = 12


def _indices(block_rows):
    """(thứ tự DÒNG IN của từng dòng trong một khối, có dùng được số in ở lề không).

    Dùng số in ở lề (01..24) khi đọc được và không giảm; không thì dùng số thứ tự trong bảng. Dòng không có số: giao dịch
    thì nằm trên dòng in kế tiếp; ghi chú thì vào ô trống giữa hai số lân cận nếu có, không thì dùng chung dòng in với
    dòng liền trước. Giao dịch không số mà không còn ô trống cho nó nghĩa là số ở lề không khớp bảng → bỏ, dùng số thứ tự.
    """
    plain = list(range(len(block_rows)))
    raw = [r.get("row_no") if isinstance(r.get("row_no"), int) and not isinstance(r.get("row_no"), bool)
           and r.get("row_no") >= 1 else None for r in block_rows]
    nums = [n for n in raw if n is not None]
    if not nums or any(b < a for a, b in zip(nums, nums[1:])):
        return plain, False
    idx = []
    for i, n in enumerate(raw):
        if n is None:
            after = next((m for m in raw[i + 1:] if m is not None), None)
            note = bool(block_rows[i].get("is_note"))
            if not idx:
                n = after - 1 if after is not None else i
            elif after is None and not note:
                n = idx[-1] + 1
            elif after is not None and after - idx[-1] >= 2:
                n = idx[-1] + 1
            elif note:
                n = idx[-1]
            else:
                return plain, False
        idx.append(n)
    return idx, True


def _median_step(points, usual=None, sane=None):
    """Nhịp dòng (theo tỉ lệ chiều cao ảnh) từ các điểm (thứ tự dòng in, vị trí) liền kề nhau.

    Có từ ba khoảng đo được trở lên thì trung vị của chúng đủ tin. Mới có một hai khoảng thì chưa: khoảng duy nhất đó có
    thể vắt qua nếp gấp giữa trang và ra gấp ba nhịp thật — chỉ nhận khi nằm trong khoảng hợp lý `sane` (suy từ chiều
    cao con chữ), không thì dùng `usual` (nhịp phỏng chừng của cả trang).
    """
    import numpy as np
    steps = [(y2 - y1) / (i2 - i1) for (i1, y1), (i2, y2) in zip(points, points[1:]) if 1 <= i2 - i1 <= 3 and y2 > y1]
    if not steps:
        return usual
    found = float(np.median(steps))
    if len(steps) < 3 and sane and not sane[0] <= found <= sane[1]:
        return usual or found
    return found


def _chain(items, pitch):
    """Chuỗi ứng viên nặng nhất mà đi từ trên xuống dưới đúng theo thứ tự dòng (quy hoạch động).

    Mỗi ứng viên có vị trí trong khối (`pos`), thứ tự dòng in (`idx`), tâm và trọng số. Hai ứng viên liền nhau trong
    chuỗi phải cách nhau không dưới nửa nhịp cho mỗi dòng in, và không xa quá mức một nếp gấp giữa trang cho phép.
    """
    order = sorted(range(len(items)), key=lambda k: (items[k]["pos"], items[k]["center"]))
    best, back = {}, {}
    for n, k in enumerate(order):
        cur = items[k]
        best[k], back[k] = cur["weight"], None
        for j in order[:n]:
            old = items[j]
            if old["pos"] >= cur["pos"] or old["idx"] > cur["idx"]:
                continue
            steps = max(1, cur["idx"] - old["idx"])
            gap = cur["center"] - old["center"]
            if gap < .5 * pitch * steps or gap > 1.6 * pitch * steps + 4 * pitch:
                continue
            if best[j] + cur["weight"] > best[k]:
                best[k], back[k] = best[j] + cur["weight"], j
    if not best:
        return []
    k = max(best, key=lambda q: best[q])
    chain = []
    while k is not None:
        chain.append(k)
        k = back[k]
    return chain[::-1]


def _between(ya, yb, steps, peaks, pa, pb, first_idx, numbered):
    """Vị trí của `steps - 1` dòng in nằm giữa hai dòng đã biết (ya < yb), ưu tiên đặt lên vệt mực thật.

    `pa`/`pb` = nhịp dòng đo được ngay cạnh hai đầu. Khoảng giữa dài hơn hẳn `steps` nhịp nghĩa là có NẾP GẤP giữa trang
    nằm trong đó: các dòng phía trên bám vào đầu trên, các dòng phía dưới bám vào đầu dưới, không được chia đều (chia đều
    là rải dòng lên chính nếp gấp). Chỗ gấp chọn theo số in ở lề (sau dòng 12) khi có, không thì theo vệt mực.
    """
    need = steps - 1
    if need <= 0:
        return []
    pitch = (pa + pb) / 2
    inside = [q for q in peaks if ya + .45 * pitch < q < yb - .45 * pitch]

    def snap(spots, reach):
        out = []
        for y in spots:
            near = min((q for q in inside if q not in out), key=lambda q: abs(q - y), default=None)
            out.append(near if near is not None and abs(near - y) <= reach else y)
        return out

    if (yb - ya) - steps * pitch > .8 * pitch:
        best = None
        for k in range(need + 1):           # k dòng bám đầu trên, phần còn lại bám đầu dưới
            spots = [ya + pa * n for n in range(1, k + 1)] + [yb - pb * (need - n) for n in range(k, need)]
            if any(b - a < .5 * pitch for a, b in zip([ya] + spots, spots + [yb])):
                continue
            score = sum(1 for y in spots if any(abs(q - y) <= .3 * pitch for q in inside))
            score += 1.5 if numbered and first_idx + k == FOLD_AFTER else 0
            if best is None or score > best[0]:
                best = (score, spots)
        if best:
            return snap(best[1], .3 * pitch)
    if len(inside) == need:
        return inside                       # đúng số vệt chữ: nhận thẳng
    local = (yb - ya) / steps
    return snap([ya + local * n for n in range(1, steps)], .3 * local)


def _walk(y, count, direction, peaks, pitch, start_idx, numbered):
    """Đi tiếp `count` dòng in từ một dòng đã biết, bám theo các vệt mực. Trả [(vị trí, còn chắc không)]."""
    out, sure, step = [], True, pitch
    for n in range(count):
        here = start_idx + direction * n
        expect = y + direction * step
        ahead = sorted((q for q in peaks if (q - y) * direction > .5 * step), key=lambda q: abs(q - y))
        near = min(ahead, key=lambda q: abs(q - expect), default=None)
        fold = numbered and here == (FOLD_AFTER if direction > 0 else FOLD_AFTER + 1)
        far = [q for q in ahead if 1.5 * step <= abs(q - y) <= 5 * step]
        if fold:
            y, sure = (far[0] if far else expect + direction * 1.5 * step), False
        elif near is not None and abs(near - expect) <= .45 * step:
            step = .7 * step + .3 * abs(near - y)
            y = near
        elif not numbered and ahead and 2.3 * step <= abs(ahead[0] - y) <= 4.5 * step:
            y, sure = ahead[0], False       # khoảng trắng lớn không có vệt nào: nếp gấp giữa trang
        else:
            y = expect
            sure = sure and n < 2           # không có vệt mực để bám: chỉ tin vài dòng đầu
        if n >= 8:
            sure = False
        out.append((min(1., max(0., y)), sure))
    return out


def match_rows(rows, words, geometry, width, height, peaks_fn=None, gutter_fn=None):
    """Đặt khung cho TỪNG dòng kết quả: khớp theo nội dung trước, rồi suy các dòng còn lại từ những dòng đã khớp.

    Bốn bước:
      1. Dòng nào có SỐ DƯ và SỐ TIỀN cùng nằm trên một dòng in, duy nhất trên trang → khớp chắc chắn (như trước).
      2. Dòng chỉ tìm thấy MỘT con số (bộ đọc chữ sót số kia), hoặc có vài chỗ khớp: nhận khi chỗ đó nằm đúng thứ tự
         và đúng nhịp so với các dòng đã khớp. Con số phải là của riêng dòng ấy (không dòng nào khác có cùng số).
      3. Dòng không tìm thấy gì (ghi chú, số bị đọc sót): suy từ hai dòng đã khớp ở trên và dưới nó theo số dòng in ở
         lề, đặt lên vệt mực thật khi có. Trước đây các dòng này dùng ước lượng hình học của cả trang, mà ước lượng đó
         hay lệch nguyên cụm 1-7 dòng (đo trên các mặt sổ thật: một nửa số mặt bị lệch).
      4. Mỗi khung nghiêng theo đúng độ dốc của dòng tại chỗ đó (ảnh chụp có phối cảnh), và ảnh có hai cuốn sổ đặt cạnh
         nhau thì khung chỉ phủ cuốn chứa dòng.

    `method`: "content" = khớp theo nội dung; "inferred" = suy từ các dòng đã khớp; "estimated" = chỉ ước lượng hình học.
    Toạ độ theo tâm tờ giấy như cũ; khung có `x0`/`x1` riêng thì toạ độ theo tâm của chính khung đó.
    `peaks_fn(line, x0, x1)` (tuỳ chọn) trả các vệt chữ đo lại theo độ dốc từng vùng, xem `rowmap.peaks_at`;
    `gutter_fn(xa, xb)` (tuỳ chọn) trả rãnh trắng giữa hai cuốn sổ, xem `rowmap.gutter_between`.
    """
    import math
    import numpy as np

    base = math.tan(math.radians(geometry["skew_deg"])) * width / height
    mid = (geometry["x0"] + geometry["x1"]) / 2
    words = _dedupe(words)
    line = (0., base, base, base)

    def slope(y):
        return min(line[3], max(line[2], line[0] * y + line[1]))

    def read():
        tokens = [{**w, "center": w["y"] - (w["x"] - mid) * slope(w["y"])} for w in words]
        return tokens, [_pair_hits(row, tokens) for row in rows]

    tokens, hits = read()
    model = _slope_model([h[0] for h in hits if len(h) == 1])
    if model is not None:
        line = model
        tokens, hits = read()

    # Bước 1: cặp số duy nhất, không tranh chỗ với dòng khác
    trusted = [h[0] if len(h) == 1 else None for h in hits]
    # (hai cuốn sổ đặt cạnh nhau có dòng ngang hàng nhau là chuyện thường: chỉ tính là tranh chỗ khi còn chồng nhau theo
    # chiều ngang)
    clash = [i for i, cand in enumerate(trusted) if cand and any(
        j != i and other and abs(other["center"] - cand["center"]) < min(other["half"], cand["half"])
        and other["xs"][0] <= cand["xs"][1] and cand["xs"][0] <= other["xs"][1]
        for j, other in enumerate(trusted))]
    for i in clash:
        trusted[i], hits[i] = None, []

    result = []
    for band in geometry["bands"]:
        band = dict(band)
        band["method"] = "estimated"
        result.append(band)

    # Nhịp dòng phỏng chừng của cả trang. Chiều cao con số cho biết khoảng hợp lý (một dòng in cao gấp 1.2–3.2 lần chữ
    # số của nó, đo trên các sổ đã gặp); trong khoảng đó ưu tiên khoảng cách giữa các vệt mực, rồi tới các dải hình học.
    tall = float(np.median([w["height"] for w in words])) if words else None
    sane = (1.2 * tall, 3.2 * tall) if tall else None
    marks = sorted(geometry.get("peaks") or [])
    centers = [(b["y0"] + b["y1"]) / 2 for b in geometry["bands"]]
    guesses = []
    for series in (marks if len(marks) >= 6 else [], centers):
        gaps = [b - a for a, b in zip(series, series[1:]) if b > a]
        if gaps:
            guesses.append(float(np.median(gaps)))
    rough = next((g for g in guesses if not sane or sane[0] <= g <= sane[1]), None)
    if rough is None:
        rough = 1.9 * tall if tall else (guesses[-1] if guesses else None)

    owned = {}
    for row in rows:
        if not row.get("is_note"):
            for value in {_number(row.get(key)) for key in ("balance", "amount_in", "amount_out")} - {None}:
                owned[value] = owned.get(value, 0) + 1

    blocks = {}
    for i, row in enumerate(rows):
        key = row.get("block")
        blocks.setdefault(key if isinstance(key, int) and not isinstance(key, bool) else 0, []).append(i)

    # Bước 2: ứng viên một con số / nhiều chỗ khớp, chọn theo thứ tự và nhịp
    state = {}                              # khối → (thứ tự dòng in, có số ở lề, {vị trí trong khối: ứng viên}, nhịp)
    for key, members in blocks.items():
        idx, numbered = _indices([rows[i] for i in members])
        known = {pos: {**trusted[i], "sure": True} for pos, i in enumerate(members) if trusted[i]}
        pitch = _median_step([(idx[pos], known[pos]["center"]) for pos in sorted(known)], rough, sane)
        if pitch and pitch > 0:
            items = []
            for pos, i in enumerate(members):
                if pos in known:
                    items.append({**known[pos], "pos": pos, "idx": idx[pos], "weight": 10.})
                    continue
                if rows[i].get("is_note"):
                    continue
                found = [{"center": h["center"], "half": h["half"], "weight": 2., "xs": h["xs"]} for h in hits[i]]
                mine = {_number(rows[i].get(k)) for k in ("balance", "amount_in", "amount_out")} - {None}
                for t in tokens:
                    if t["value"] in mine and owned.get(t["value"]) == 1 and not any(
                            abs(t["center"] - f["center"]) < .3 * pitch for f in found):
                        found.append({"center": t["center"], "half": t["height"] * .8, "weight": 1.,
                                      "xs": (t["x"], t["x"])})
                items += [{**f, "pos": pos, "idx": idx[pos], "sure": False} for f in found]

            chain = [items[k] for k in _chain(items, pitch)]
            enough = len(chain) >= (2 if any(c["sure"] for c in chain) else 3)
            for n, cur in enumerate(chain):
                if cur["sure"] or not enough:
                    continue
                before = chain[n - 1] if n else None
                after = chain[n + 1] if n + 1 < len(chain) else None

                def fits(y, c=cur, a=before, b=after):
                    """Chỗ `y` có hợp với ít nhất một hàng xóm trong chuỗi không (và không trái thứ tự với cả hai)."""
                    ok = False
                    for other, sign in ((a, 1), (b, -1)):
                        if other is None:
                            continue
                        d = max(1, abs(c["idx"] - other["idx"]))
                        gap = (y - other["center"]) * sign
                        if gap < .5 * pitch * d:
                            return False
                        # Khoảng cách chỉ có thể DÀI hơn dự tính (vắt qua nếp gấp giữa trang), không thể ngắn hơn nhiều
                        lo, hi = sorted((c["idx"], other["idx"]))
                        crosses = lo <= FOLD_AFTER < hi if numbered else True
                        slack = pitch * min(1.2, .5 + .1 * d)
                        ok = ok or -slack <= gap - pitch * d <= slack + (3.5 * pitch if crosses else 0)
                    return ok

                rivals = [f for f in items if f["pos"] == cur["pos"] and not f["sure"] and fits(f["center"])]
                if fits(cur["center"]) and len(rivals) == 1:
                    known[cur["pos"]] = cur
        state[key] = (idx, numbered, known, pitch)

    # Bước 4a: hai cuốn sổ đặt cạnh nhau → mỗi khối chỉ phủ phần của mình
    spans = {key: (min(x for c in known.values() for x in c["xs"]), max(x for c in known.values() for x in c["xs"]))
             for key, (_, _, known, _) in state.items() if known}
    sides = sorted(spans.items(), key=lambda kv: kv[1][0])
    cuts = {}
    for (ka, (_, a1)), (kb, (b0, _)) in zip(sides, sides[1:]):
        if b0 - a1 > .08:
            cut = gutter_fn(a1 + .02, b0 - .02) if gutter_fn is not None else None
            if cut is None:
                cut = a1 + .3 * (b0 - a1)
            cuts.setdefault(ka, [geometry["x0"], geometry["x1"]])[1] = cut
            cuts.setdefault(kb, [geometry["x0"], geometry["x1"]])[0] = cut
    cuts = {key: (x0, x1) for key, (x0, x1) in cuts.items() if x1 - x0 >= .1}

    # Bước 3: ghi các dòng đã khớp, rồi suy các dòng còn lại từ chúng
    halves = [c["half"] for _, _, known, _ in state.values() for c in known.values()]
    for key, members in blocks.items():
        idx, numbered, known, pitch = state[key]
        x0, x1 = cuts.get(key, (geometry["x0"], geometry["x1"]))
        own = (x0 + x1) / 2

        def put(i, y, half, how):
            y += (own - mid) * slope(y)     # về tâm của chính khung (khác tâm tờ giấy khi khối có bề ngang riêng)
            result[i].update(y0=max(0., y - half), y1=min(1., y + half), method=how)

        if key in cuts:
            for i in members:
                result[i].update(x0=round(x0, 5), x1=round(x1, 5))
        for pos, cur in known.items():
            put(members[pos], cur["center"], cur["half"], "content")
        if not known or not pitch:
            continue
        if peaks_fn is not None and (model is not None or key in cuts):
            peaks = sorted(y - (own - mid) * slope(y) for y in peaks_fn(line, x0, x1))
        else:
            peaks = sorted(geometry.get("peaks") or [])
        order = sorted(known)
        pitch = _median_step([(idx[p], known[p]["center"]) for p in order], pitch, sane)
        half = min(float(np.median(halves)), .5 * pitch)

        def near(n):
            """Nhịp dòng đo ngay cạnh dòng đã biết thứ n (phối cảnh làm nhịp đầu trang khác cuối trang)."""
            local = [(known[b]["center"] - known[a]["center"]) / (idx[b] - idx[a])
                     for a, b in zip(order[max(0, n - 2):n + 3], order[max(0, n - 2) + 1:n + 3]) if idx[b] > idx[a]]
            local = [s for s in local if .7 * pitch <= s <= 1.3 * pitch]
            return float(np.median(local)) if local else pitch

        by_idx = {idx[p]: (known[p]["center"], "inferred") for p in order}
        for n, (a, b) in enumerate(zip(order, order[1:])):
            spots = _between(known[a]["center"], known[b]["center"], idx[b] - idx[a], peaks,
                             near(n), near(n + 1), idx[a], numbered)
            for m, y in enumerate(spots, start=1):
                by_idx.setdefault(idx[a] + m, (y, "inferred"))
        ends = ((-1, 0, idx[order[0]] - min(idx)), (1, len(order) - 1, max(idx) - idx[order[-1]]))
        for sign, n, count in ends:
            start = order[n]
            walked = _walk(known[start]["center"], count, sign, peaks, near(n), idx[start], numbered)
            for m, (y, sure) in enumerate(walked, start=1):
                by_idx.setdefault(idx[start] + sign * m, (y, "inferred" if sure else "estimated"))
        for pos, i in enumerate(members):
            if pos not in known and idx[pos] in by_idx:
                y, how = by_idx[idx[pos]]
                put(i, y, half, how)

    # Bước 4b: độ nghiêng riêng của từng dòng
    if model is not None:
        for band in result:
            if band["method"] != "estimated":
                centre = (band["y0"] + band["y1"]) / 2
                band["skew_deg"] = round(math.degrees(math.atan(slope(centre) * height / width)), 3)
    for band in result:
        band["y0"], band["y1"] = round(band["y0"], 5), round(band["y1"], 5)
    return result


def local_ocr_enabled() -> bool:
    """TSUCHO_LOCAL_OCR=0 tắt OCR cục bộ (RapidOCR + Tesseract).

    Dành cho máy chủ ít RAM: model OCR nạp vào bộ nhớ ở lần gọi đầu, hết RAM là
    502 (đã dính ở commit aa71757). Tắt thì khung đỏ chỉ dùng vị trí ước lượng.
    """
    return os.getenv("TSUCHO_LOCAL_OCR", "1").strip().lower() not in ("0", "false", "no", "off")


def locate(path: Path, revision: str, rows: list[dict], geometry: dict) -> dict:
    executable = _executable()
    peaks = geometry.get("peaks")
    geometry = {key: value for key, value in geometry.items() if key != "peaks"}
    geometry = {**geometry, "exact": False,
                "bands": [{**band, "method": "estimated"} for band in geometry["bands"]],
                "ocr_status": "unavailable"}
    if not rows or not local_ocr_enabled():
        return geometry
    words = []
    available = False
    with ThreadPoolExecutor(max_workers=2) as pool:
        rapid = pool.submit(_read_rapid_words, str(path.resolve()), revision)
        classic = pool.submit(_read_words, str(path.resolve()), revision, executable) if executable else None
        for future in (rapid, classic):
            if future is None:
                continue
            try:
                words.extend(future.result())
                available = True
            except ImportError:
                pass
            except Exception:
                # Optional readers fail closed; keep the geometry result.
                geometry["ocr_status"] = "failed"
    if available:
        sizes: dict = {}
        for row in rows:
            sizes[row.get("block")] = sizes.get(row.get("block"), 0) + 1
        slots = max(rowmap.PAGE_SLOTS, *sizes.values())
        try:
            with Image.open(path) as image:
                image.load()
                geometry["bands"] = match_rows(
                    rows, words, {**geometry, "peaks": peaks}, *image.size,
                    peaks_fn=lambda line, x0, x1: rowmap.peaks_at(image, slots, line, x0, x1),
                    gutter_fn=lambda xa, xb: rowmap.gutter_between(image, xa, xb),
                )
        except Exception:
            # Ghép dòng hỏng thì vẫn còn dải ước lượng: thà khung nét đứt còn hơn không có khung nào.
            geometry["ocr_status"] = "failed"
            return geometry
        geometry["ocr_status"] = "ready"
        geometry["exact"] = bool(rows) and all(b["method"] != "estimated" for b in geometry["bands"])
    return geometry
