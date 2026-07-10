"""Trích xuất giao dịch từ ảnh/PDF sổ ngân hàng Nhật bằng Claude API (vision)."""

import base64
import json
import os
from pathlib import Path

import anthropic
from dotenv import load_dotenv

MODEL = "claude-sonnet-4-6"
PROMPT_PATH = Path(__file__).parent / "prompts" / "extract_prompt.txt"

# Định dạng file được hỗ trợ và media type tương ứng
MEDIA_TYPES = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".pdf": "application/pdf",
}

# Giới hạn dung lượng (API: ảnh ~5MB, PDF ~32MB)
MAX_IMAGE_MB = 5
MAX_PDF_MB = 32


class ExtractError(Exception):
    """Lỗi trích xuất — message đã thân thiện, in thẳng cho người dùng."""


def _load_system_prompt() -> str:
    return PROMPT_PATH.read_text(encoding="utf-8")


def _build_content_block(path: Path) -> dict:
    """Đọc file và tạo content block (image hoặc document) cho API."""
    ext = path.suffix.lower()
    if ext not in MEDIA_TYPES:
        raise ExtractError(
            f"Định dạng '{ext}' chưa được hỗ trợ. Hãy dùng ảnh JPG/PNG hoặc file PDF."
        )

    size_mb = path.stat().st_size / (1024 * 1024)
    limit = MAX_PDF_MB if ext == ".pdf" else MAX_IMAGE_MB
    if size_mb > limit:
        raise ExtractError(
            f"File quá lớn ({size_mb:.1f}MB, giới hạn {limit}MB). "
            "Hãy giảm kích thước ảnh hoặc chia nhỏ PDF."
        )

    data = base64.standard_b64encode(path.read_bytes()).decode("utf-8")
    source = {"type": "base64", "media_type": MEDIA_TYPES[ext], "data": data}

    if ext == ".pdf":
        return {"type": "document", "source": source}
    return {"type": "image", "source": source}


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


def extract_transactions(file_path: str) -> dict:
    """Gọi Claude API, trả về dict: {"bank_name": ..., "transactions": [...]}.

    Raise ExtractError với message thân thiện khi có vấn đề.
    """
    load_dotenv()
    if not os.environ.get("ANTHROPIC_API_KEY"):
        raise ExtractError(
            "Chưa có ANTHROPIC_API_KEY. Hãy sao chép .env.example thành .env và điền key."
        )

    path = Path(file_path)
    if not path.is_file():
        raise ExtractError(f"Không tìm thấy file: {file_path}")

    content_block = _build_content_block(path)
    client = anthropic.Anthropic()

    try:
        # Streaming để tránh timeout khi PDF nhiều trang / nhiều giao dịch
        with client.messages.stream(
            model=MODEL,
            max_tokens=32000,
            system=_load_system_prompt(),
            messages=[
                {
                    "role": "user",
                    "content": [
                        content_block,
                        {"type": "text", "text": "この通帳の取引明細を抽出してください。"},
                    ],
                }
            ],
        ) as stream:
            response = stream.get_final_message()
    except anthropic.AuthenticationError as e:
        raise ExtractError("API key không hợp lệ. Kiểm tra lại file .env.") from e
    except anthropic.RateLimitError as e:
        raise ExtractError("API đang bị giới hạn tốc độ. Chờ 1 phút rồi thử lại.") from e
    except anthropic.APIStatusError as e:
        raise ExtractError(f"Lỗi API ({e.status_code}). Thử lại sau ít phút.") from e
    except anthropic.APIConnectionError as e:
        raise ExtractError("Không kết nối được API. Kiểm tra mạng internet.") from e

    if response.stop_reason == "max_tokens":
        raise ExtractError(
            "Kết quả quá dài, bị cắt giữa chừng. Hãy chia PDF thành các phần nhỏ hơn."
        )

    text = "".join(b.text for b in response.content if b.type == "text")
    result = _parse_json(text)

    # Model tự báo lỗi: ảnh mờ hoặc không phải sổ ngân hàng
    if "error" in result:
        reason = result.get("message", "")
        if result["error"] == "not_bankbook":
            raise ExtractError(f"File này không phải sổ ngân hàng (通帳). {reason}")
        raise ExtractError(
            f"Ảnh quá mờ hoặc không đọc được. Hãy chụp lại rõ nét hơn. {reason}"
        )

    if not result.get("transactions"):
        raise ExtractError("Không tìm thấy giao dịch nào trong file. Kiểm tra lại ảnh.")

    return result
