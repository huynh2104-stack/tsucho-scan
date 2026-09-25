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
from threading import Lock

from PIL import Image

_rapid_lock = Lock()
_rapid_engine = None


@lru_cache(maxsize=12)
def _read_rapid_words(path: str, revision: str):
    """Optional bundled ONNX models: CPU inference, no downloads or API calls."""
    from rapidocr_onnxruntime import RapidOCR
    global _rapid_engine
    with Image.open(path) as image:
        width, height = image.size
    # RapidOCR has mutable per-call state; serialize access to the shared engine.
    with _rapid_lock:
        if _rapid_engine is None:
            _rapid_engine = RapidOCR(intra_op_num_threads=2, inter_op_num_threads=1)
        detected, _ = _rapid_engine(path)
    words = []
    for quad, text, score in detected or []:
        number = _number(text)
        if not number or score < .85:
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


def _number(value):
    if isinstance(value, float) and value.is_integer():
        value = int(value)
    text = str(value or "").strip().replace(",", "").replace("，", "")
    # Decorations around printed balances are common. Do not turn letters into
    # digits: fuzzy OCR substitutions can create a plausible but false match.
    text = text.strip("*＊¥￥=。.")
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


def match_rows(rows, words, geometry, width, height):
    """Conservative one-to-one content matching, independent of row count/order.

    Coordinates refer to the centre of the paper, matching the existing skew
    contract. Two distinct values must occur on one line. Duplicate candidate
    lines and duplicate transaction signatures are rejected, not guessed.
    """
    import math
    slope = math.tan(math.radians(geometry["skew_deg"])) * width / height
    mid = (geometry["x0"] + geometry["x1"]) / 2
    tokens = [{**w, "center": w["y"] - (w["x"] - mid) * slope} for w in words]
    candidates = []
    for row in rows:
        balance = _number(row.get("balance"))
        amounts = {_number(row.get(key)) for key in ("amount_in", "amount_out")}
        amounts.discard(None)
        amounts.discard(balance)
        hits = []
        if balance and amounts and not row.get("is_note"):
            for b in tokens:
                if b["value"] != balance:
                    continue
                for a in tokens:
                    tolerance = min(0.012, max(a["height"], b["height"]) * .65)
                    if a["value"] in amounts and abs(a["center"] - b["center"]) <= tolerance and abs(a["x"] - b["x"]) > .025:
                        center = (a["center"] + b["center"]) / 2
                        half = max(a["height"], b["height"]) * .8
                        if not any(abs(center - old["center"]) < tolerance for old in hits):
                            hits.append({"center": center, "half": half})
        candidates.append(hits[0] if len(hits) == 1 else None)
    result = []
    for i, candidate in enumerate(candidates):
        if candidate and any(j != i and other and abs(other["center"] - candidate["center"]) < min(other["half"], candidate["half"]) for j, other in enumerate(candidates)):
            candidate = None
        fallback = dict(geometry["bands"][i])
        fallback["method"] = "estimated"
        if candidate:
            fallback.update(y0=max(0., candidate["center"] - candidate["half"]),
                            y1=min(1., candidate["center"] + candidate["half"]), method="content")
        result.append(fallback)
    return result


def locate(path: Path, revision: str, rows: list[dict], geometry: dict) -> dict:
    executable = _executable()
    geometry = {**geometry, "exact": False,
                "bands": [{**band, "method": "estimated"} for band in geometry["bands"]],
                "ocr_status": "unavailable"}
    if not rows:
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
        with Image.open(path) as image:
            geometry["bands"] = match_rows(rows, words, geometry, *image.size)
        geometry["ocr_status"] = "ready"
        geometry["exact"] = bool(rows) and all(b["method"] == "content" for b in geometry["bands"])
    return geometry
