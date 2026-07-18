"""Trích xuất giao dịch từ ảnh/PDF sổ ngân hàng Nhật bằng Claude API (vision)."""

import base64
import hashlib
import io
import json
import os
import re
import time
from pathlib import Path

import anthropic
from dotenv import load_dotenv
from PIL import Image

# Model mặc định. Đổi bằng EXTRACT_MODEL trong .env:
#   gemini-*  → gọi Google Gemini API (cần GEMINI_API_KEY, có bậc miễn phí)
#   claude-*  → gọi Anthropic API (cần ANTHROPIC_API_KEY)
DEFAULT_MODEL = "gemini-2.5-flash"
PROMPT_PATH = Path(__file__).parent / "prompts" / "extract_prompt.txt"
# Cache kết quả theo nội dung file: chạy lại cùng ảnh = không gọi API = $0
CACHE_DIR = Path(__file__).parent / ".cache"
# Tăng số này mỗi khi đổi tham số gọi API (schema, độ phân giải...) để cache cũ hết hạn
_CACHE_VERSION = "9"

# Giới hạn dung lượng (API: ảnh ~5MB, PDF ~32MB)
MAX_IMAGE_MB = 5
MAX_PDF_MB = 32


class ExtractError(Exception):
    """Lỗi trích xuất — message đã thân thiện, in thẳng cho người dùng."""


def _load_system_prompt() -> str:
    return PROMPT_PATH.read_text(encoding="utf-8")


def _detect_media_type(data: bytes) -> str | None:
    """Nhận diện định dạng thật từ nội dung file (không tin đuôi file)."""
    if data[:3] == b"\xff\xd8\xff":
        return "image/jpeg"
    if data[:8] == b"\x89PNG\r\n\x1a\n":
        return "image/png"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp"
    if data[:6] in (b"GIF87a", b"GIF89a"):
        return "image/gif"
    if data[:5] == b"%PDF-":
        return "application/pdf"
    return None


def _rotate_image(data: bytes, degrees_cw: int) -> bytes:
    """Xoay ảnh theo chiều kim đồng hồ, trả về bytes JPEG."""
    img = Image.open(io.BytesIO(data))
    rotated = img.rotate(-degrees_cw, expand=True).convert("RGB")
    buf = io.BytesIO()
    rotated.save(buf, format="JPEG", quality=90)
    return buf.getvalue()


def _prepare_file(path: Path, rotate: int = 0) -> tuple[str, bytes]:
    """Đọc file, nhận diện định dạng, xoay nếu cần → (media_type, bytes)."""
    data = path.read_bytes()
    media_type = _detect_media_type(data)
    if media_type is None:
        raise ExtractError(
            f"Không nhận diện được định dạng của '{path.name}'. "
            "Hãy dùng ảnh JPG/PNG/WebP hoặc file PDF."
        )

    if media_type == "application/pdf":
        if rotate:
            raise ExtractError(
                "Tùy chọn --rotate chỉ hỗ trợ ảnh. Với PDF hãy xuất từng trang "
                "thành ảnh rồi xoay, hoặc scan lại cho thẳng."
            )
    elif rotate:
        data = _rotate_image(data, rotate)
        media_type = "image/jpeg"

    size_mb = len(data) / (1024 * 1024)
    limit = MAX_PDF_MB if media_type == "application/pdf" else MAX_IMAGE_MB
    if size_mb > limit:
        raise ExtractError(
            f"File quá lớn ({size_mb:.1f}MB, giới hạn {limit}MB). "
            "Hãy giảm kích thước ảnh hoặc chia nhỏ PDF."
        )
    return media_type, data


def _parse_json(text: str) -> dict:
    """Lấy JSON từ câu trả lời của model (bỏ markdown fence nếu có)."""
    start = text.find("{")
    end = text.rfind("}")
    if start == -1 or end == -1:
        raise ExtractError(
            "Model không trả về JSON hợp lệ. Hãy thử lại hoặc dùng ảnh rõ nét hơn."
        )
    try:
        return json.loads(text[start : end + 1])
    except json.JSONDecodeError as e:
        raise ExtractError(f"JSON trả về bị lỗi ({e}). Hãy thử lại.") from e


def _clean_extra(value) -> tuple[str | None, str | None]:
    """Làm sạch trường x → (備考, mã 取扱店 nếu x thuần là mã).

    KHÔNG cắt số bên trong text (bài học: "ﾃ 055" từng bị cắt mất "055");
    chỉ khi x thuần là 2-3 chữ số (709/720) mới coi là mã 取扱店 đi lạc.
    """
    if not value:
        return None, None
    s = str(value).strip()
    if re.fullmatch(r"\d{2,3}", s):
        return None, s
    return (s or None), None


def _clean_str(value) -> str | None:
    """Chuỗi sạch hoặc None (model đôi khi trả chuỗi "null")."""
    if value is None:
        return None
    s = str(value).strip()
    return None if not s or s.lower() in ("null", "none") else s


def _to_int(value) -> int | None:
    """Chuyển giá trị model trả về thành int (chấp nhận "95,200", "*110"...)."""
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return int(value)
    s = str(value).strip().strip("※*¥, ").replace(",", "")
    if not s:
        return None
    try:
        return int(s)
    except ValueError:
        return None


def parse_model_output(text: str) -> dict:
    """Chuyển output dạng nén của model thành cấu trúc chuẩn.

    Trả về {"accounts": [{"bank_name": ..., "transactions": [...]}]}
    hoặc {"error": ..., "message": ...} nếu model tự báo lỗi.
    """
    data = _parse_json(text)
    if data.get("error"):  # schema có thể chèn "error": null → chỉ nhận khi có giá trị
        return data

    accounts = []
    for acc in data.get("accounts") or []:
        transactions = []
        for row in acc.get("rows", []):
            # 2 định dạng: mảng theo vị trí (Claude) hoặc object có tên trường (Gemini)
            extra = kind = store = note = None
            if isinstance(row, dict):
                date_raw = row.get("d") or row.get("date")
                desc = row.get("m") or row.get("desc")
                out = row.get("o", row.get("out"))
                amount_in = row.get("i", row.get("in"))
                bal = row.get("b", row.get("bal"))
                kind = _clean_str(row.get("k"))
                extra = row.get("x")
                store = _clean_str(row.get("t"))
                note = _clean_str(row.get("note"))
                flag = row.get("L")
            elif isinstance(row, list) and len(row) >= 5:
                date_raw, desc, out, amount_in, bal = row[:5]
                flag = row[5] if len(row) > 5 else None
            else:
                continue  # bỏ dòng sai định dạng thay vì crash
            is_note = bool(note)
            extra_clean, stray_store = _clean_extra(extra)
            transactions.append({
                "date_raw": str(date_raw or ""),
                "kind": kind,                      # 区分: 200/100/振込/CDカード...
                "description": note if is_note else str(desc or ""),
                "amount_out": _to_int(out),
                "amount_in": _to_int(amount_in),
                "balance": _to_int(bal),
                # 備考: text in ở cột tiền (テ055, (282)...) — không phải số tiền
                "extra_text": extra_clean,
                "store_code": store or stray_store,  # 取扱店: 709/720...
                "is_note": is_note,                # dòng ghi chú, không phải giao dịch
                "confidence": "low" if flag in ("L", True) else "high",
            })
        bank = _clean_str(acc.get("bank"))
        accounts.append({
            "bank_name": bank,
            "store_no": _clean_str(acc.get("store_no")),
            "account_no": _clean_str(acc.get("account_no")),
            "holder": _clean_str(acc.get("holder")),
            "transactions": transactions,
        })
    return {"accounts": accounts}


def _call_claude(model: str, prompt: str, files: list[tuple[str, bytes]]) -> tuple[str, dict]:
    """Gọi Anthropic API → (text trả lời, usage). files = [(media_type, bytes), ...]"""
    blocks = []
    for media_type, data in files:
        source = {
            "type": "base64",
            "media_type": media_type,
            "data": base64.standard_b64encode(data).decode("utf-8"),
        }
        block_type = "document" if media_type == "application/pdf" else "image"
        blocks.append({"type": block_type, "source": source})
    client = anthropic.Anthropic()

    kwargs = {}
    if model.startswith("claude-sonnet-5"):
        # sonnet-5 mặc định bật thinking → tắt để nhanh và không tốn token suy nghĩ
        kwargs["thinking"] = {"type": "disabled"}

    try:
        # Streaming để tránh timeout khi PDF nhiều trang / nhiều giao dịch
        with client.messages.stream(
            model=model,
            max_tokens=32000,
            system=prompt,
            messages=[
                {
                    "role": "user",
                    "content": blocks + [
                        {"type": "text", "text": "この通帳の取引明細を抽出してください。"},
                    ],
                }
            ],
            **kwargs,
        ) as stream:
            response = stream.get_final_message()
    except anthropic.AuthenticationError as e:
        raise ExtractError("API key không hợp lệ. Kiểm tra lại file .env.") from e
    except anthropic.RateLimitError as e:
        raise ExtractError("API đang bị giới hạn tốc độ. Chờ 1 phút rồi thử lại.") from e
    except anthropic.APIStatusError as e:
        raise ExtractError(f"Lỗi API ({e.status_code}): {e.message}") from e
    except anthropic.APIConnectionError as e:
        raise ExtractError("Không kết nối được API. Kiểm tra mạng internet.") from e

    if response.stop_reason == "max_tokens":
        raise ExtractError(
            "Kết quả quá dài, bị cắt giữa chừng. Hãy chia PDF thành các phần nhỏ hơn."
        )

    text = "".join(b.text for b in response.content if b.type == "text")
    usage = {
        "input_tokens": response.usage.input_tokens,
        "output_tokens": response.usage.output_tokens,
    }
    return text, usage


# Schema ép Gemini trả JSON đúng cấu trúc (constrained decoding):
# không thể hỏng JSON, không thể lẫn ô giữa các trường.
# Trường theo bố cục sổ (đã được user duyệt qua Claude Cowork):
# d=日付, k=区分 (200/100/振込/CDカード...), m=摘要 (tên đối tác, KHÔNG chứa số),
# x=備考 (テ055, (282)...), t=取扱店 (709/720...), o=出金, i=入金, b=残高,
# L=số mờ, note=dòng ghi chú không phải giao dịch (繰越, 未記帳...)
_GEMINI_SCHEMA = {
    "type": "object",
    "properties": {
        "error": {"type": "string", "nullable": True},
        "message": {"type": "string", "nullable": True},
        "accounts": {
            "type": "array",
            "nullable": True,
            "items": {
                "type": "object",
                "properties": {
                    "bank": {"type": "string", "nullable": True},
                    "store_no": {"type": "string", "nullable": True},
                    "account_no": {"type": "string", "nullable": True},
                    "holder": {"type": "string", "nullable": True},
                    "rows": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "d": {"type": "string", "nullable": True},
                                "k": {"type": "string", "nullable": True},
                                "m": {"type": "string", "nullable": True},
                                "x": {"type": "string", "nullable": True},
                                "t": {"type": "string", "nullable": True},
                                "o": {"type": "integer", "nullable": True},
                                "i": {"type": "integer", "nullable": True},
                                "b": {"type": "integer", "nullable": True},
                                "L": {"type": "boolean", "nullable": True},
                                "note": {"type": "string", "nullable": True},
                            },
                            "required": ["d", "m", "o", "i", "b"],
                        },
                    },
                },
                "required": ["rows"],
            },
        },
    },
}


def _call_gemini(model: str, prompt: str, files: list[tuple[str, bytes]]) -> tuple[str, dict]:
    """Gọi Google Gemini API → (text trả lời, usage). files = [(media_type, bytes), ...]"""
    try:
        from google import genai
        from google.genai import errors as genai_errors
        from google.genai import types as genai_types
    except ImportError as e:
        raise ExtractError(
            "Chưa cài SDK Gemini. Chạy: python -m pip install google-genai"
        ) from e

    client = genai.Client(api_key=os.environ["GEMINI_API_KEY"])

    config_kwargs = {}
    if model.startswith("gemini-2.5-flash"):
        # Họ 2.5-flash mặc định có thể bật thinking → tắt cho nhanh và rẻ
        config_kwargs["thinking_config"] = genai_types.ThinkingConfig(thinking_budget=0)
    try:
        # Mặc định Gemini nén ảnh rất nhỏ (~1 ô 768px) làm nát chữ kana nhỏ.
        # Tăng độ phân giải: tốn thêm ít token input nhưng đọc chữ chính xác hơn hẳn.
        config_kwargs["media_resolution"] = (
            genai_types.MediaResolution.MEDIA_RESOLUTION_HIGH
        )
    except AttributeError:
        pass  # SDK cũ không có tham số này → dùng mặc định

    response = None
    for attempt in range(3):
        try:
            response = client.models.generate_content(
                model=model,
                contents=[
                    genai_types.Part.from_bytes(data=data, mime_type=media_type)
                    for media_type, data in files
                ] + ["この通帳の取引明細を抽出してください。"],
                config=genai_types.GenerateContentConfig(
                    system_instruction=prompt,
                    temperature=0,
                    max_output_tokens=65535,  # nhiều trang/nhiều dòng cần chỗ trả lời
                    response_mime_type="application/json",
                    response_schema=_GEMINI_SCHEMA,  # ép cấu trúc, không thể hỏng JSON
                    **config_kwargs,
                ),
            )
            break
        except genai_errors.APIError as e:
            code = getattr(e, "code", None)
            if code in (401, 403):
                raise ExtractError(
                    "GEMINI_API_KEY không hợp lệ. Lấy key miễn phí tại "
                    "https://aistudio.google.com/apikey rồi điền vào .env."
                ) from e
            # Lỗi tạm thời (quá tải/giới hạn tốc độ) → chờ rồi tự thử lại
            if code in (429, 500, 503) and attempt < 2:
                print(f"  Gemini bận ({code}), chờ 20 giây thử lại...")
                time.sleep(20)
                continue
            if code == 429:
                raise ExtractError(
                    "Gemini đang giới hạn tốc độ (bậc miễn phí có hạn mức theo phút/ngày). "
                    "Chờ 1 phút rồi thử lại."
                ) from e
            raise ExtractError(f"Lỗi Gemini API ({code}): {getattr(e, 'message', e)}") from e

    finish = str(response.candidates[0].finish_reason) if response.candidates else ""
    if "MAX_TOKENS" in finish:
        raise ExtractError(
            "Kết quả quá dài, bị cắt giữa chừng. Hãy chia PDF thành các phần nhỏ hơn."
        )

    text = response.text or ""
    if not text:
        raise ExtractError("Gemini không trả về nội dung. Hãy thử lại hoặc đổi model.")

    um = response.usage_metadata
    usage = {
        "input_tokens": getattr(um, "prompt_token_count", 0) or 0,
        "output_tokens": getattr(um, "candidates_token_count", 0) or 0,
    }
    return text, usage


def extract_transactions(file_paths, rotate: int = 0, use_cache: bool = True) -> dict:
    """Trích xuất giao dịch bằng model cấu hình trong .env, trả về:

    {"accounts": [...], "usage": {...}, "model": ..., "cached": bool}

    file_paths: 1 đường dẫn hoặc danh sách nhiều trang của CÙNG các sổ —
    gửi chung 1 lần gọi để chuỗi 繰越 nối liền giữa các trang.
    rotate: xoay ảnh N độ theo chiều kim đồng hồ trước khi gửi (90/180/270).
    use_cache: True → cùng file + cùng thiết lập thì lấy kết quả cũ, không tốn phí.
    Raise ExtractError với message thân thiện khi có vấn đề.
    """
    if isinstance(file_paths, (str, Path)):
        file_paths = [file_paths]
    load_dotenv()
    model = (
        os.environ.get("EXTRACT_MODEL")
        or os.environ.get("CLAUDE_MODEL")  # tên cũ, giữ để tương thích
        or DEFAULT_MODEL
    )

    is_gemini = model.startswith("gemini")
    if is_gemini and not os.environ.get("GEMINI_API_KEY"):
        raise ExtractError(
            "Chưa có GEMINI_API_KEY. Lấy key miễn phí tại "
            "https://aistudio.google.com/apikey rồi điền vào .env."
        )
    if not is_gemini and not os.environ.get("ANTHROPIC_API_KEY"):
        raise ExtractError(
            "Chưa có ANTHROPIC_API_KEY. Hãy sao chép .env.example thành .env và điền key."
        )

    paths = [Path(p) for p in file_paths]
    for path in paths:
        if not path.is_file():
            raise ExtractError(f"Không tìm thấy file: {path}")

    # Mỗi trang gọi riêng (cache theo trang) rồi nối sổ bằng chuỗi 残高 ở bước sau
    prompt = _load_system_prompt()
    caller = _call_gemini if is_gemini else _call_claude
    accounts: list = []
    usage_total = {"input_tokens": 0, "output_tokens": 0}
    all_cached = True
    for path in paths:
        single = _extract_single(path, rotate, use_cache, model, prompt, caller)
        accounts.extend(single["accounts"])
        usage_total["input_tokens"] += single["usage"]["input_tokens"]
        usage_total["output_tokens"] += single["usage"]["output_tokens"]
        all_cached = all_cached and single["cached"]

    return {
        "accounts": accounts,
        "model": model,
        "usage": usage_total,
        "cached": all_cached,
    }


def _extract_single(path: Path, rotate: int, use_cache: bool, model: str, prompt: str, caller) -> dict:
    """Trích xuất 1 file (có cache riêng theo file)."""
    key = hashlib.sha256(
        path.read_bytes()
        + f"|v{_CACHE_VERSION}|{rotate}|{model}|".encode()
        + prompt.encode()
    ).hexdigest()
    cache_file = CACHE_DIR / f"{key}.json"
    if use_cache and cache_file.is_file():
        result = json.loads(cache_file.read_text(encoding="utf-8"))
        result["cached"] = True
        return result

    files = [_prepare_file(path, rotate)]

    # Model thỉnh thoảng trả JSON hỏng giữa chừng → tự thử lại 1 lần
    last_error = None
    for _ in range(2):
        text, usage = caller(model, prompt, files)
        try:
            result = parse_model_output(text)
            break
        except ExtractError as e:
            last_error = e
    else:
        raise last_error

    # Model tự báo lỗi: ảnh mờ hoặc không phải sổ ngân hàng
    if "error" in result:
        reason = result.get("message", "")
        if result["error"] == "not_bankbook":
            raise ExtractError(f"'{path.name}' không phải sổ ngân hàng (通帳). {reason}")
        raise ExtractError(
            f"'{path.name}' quá mờ hoặc không đọc được. Hãy chụp lại rõ nét hơn. {reason}"
        )

    if not any(acc["transactions"] for acc in result.get("accounts", [])):
        raise ExtractError(f"Không tìm thấy giao dịch nào trong '{path.name}'.")

    result["usage"] = usage
    result["cached"] = False

    # Lưu cache để lần chạy sau với cùng file không tốn phí
    CACHE_DIR.mkdir(exist_ok=True)
    cache_file.write_text(json.dumps(result, ensure_ascii=False), encoding="utf-8")
    return result
