"""Tạo lại «kết quả đọc sẵn» cho các ảnh sổ mẫu trong thư mục này.

Mỗi ảnh mẫu `<tên>.jpg` đi kèm `<tên>.json` = đúng câu trả lời mô hình đã đọc từ ảnh đó
(cùng dạng với một mục `.cache/` của extract.py). Khi người dùng quét ảnh mẫu NGUYÊN VẸN,
`extract._sample_seed` lấy câu trả lời này thay vì gọi mô hình ⇒ $0, không tốn lượt miễn
phí, chạy được cả khi hết hạn mức. Engine kiểm tra kép vẫn chạy thật trên câu trả lời đó.

Chạy (TỐN 1 lượt gọi mô hình cho mỗi ảnh chưa có trong .cache/):

    python samples/make_seeds.py

Cần chạy lại khi đổi prompt/schema (bump `_CACHE_VERSION`) để kết quả mẫu theo đúng dạng mới.
"""

import hashlib
import json
import os
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

import extract  # noqa: E402


def main() -> None:
    from dotenv import load_dotenv

    load_dotenv(ROOT / ".env")
    model = os.environ.get("EXTRACT_MODEL") or extract.DEFAULT_MODEL
    prompt = extract._load_system_prompt()
    caller = extract._call_gemini if model.startswith("gemini") else extract._call_claude

    for img in sorted(Path(__file__).parent.glob("*.jpg")):
        (unit,) = extract._prepare_units(img)
        # Gọi thẳng đường đọc thật (bỏ qua chính bản đọc sẵn đang có): dùng cache nếu có, không thì gọi mô hình
        result = extract._extract_single(unit, 0, True, model, prompt, caller, sample=False)
        seed = {
            "sha256": hashlib.sha256(img.read_bytes()).hexdigest(),
            "model": model,
            "cache_version": extract._CACHE_VERSION,
            "made_at": time.strftime("%Y-%m-%d"),
            "result": {k: v for k, v in result.items() if k not in ("usage", "cached")},
        }
        out = img.with_suffix(".json")
        out.write_text(json.dumps(seed, ensure_ascii=False, indent=1), encoding="utf-8")
        rows = sum(len(a.get("transactions") or []) for a in result.get("accounts", []))
        print(f"{img.name}: {rows} dong, cached={result.get('cached')} -> {out.name}")


if __name__ == "__main__":
    main()
