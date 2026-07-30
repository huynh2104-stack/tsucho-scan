"""Lõi dùng chung cho CLI và web.

`scan()` chạy trọn quy trình trích xuất → kiểm tra và trả về DỮ LIỆU, không in ra
màn hình, không đọc argv, không tự ghi file. `main.py` (CLI) và API web cùng gọi
hàm này để logic chỉ tồn tại một bản duy nhất.

    result = scan(["input/so.jpg"], rotate=180)
    result.to_excel("output/so.xlsx")

Muốn hiện tiến độ thì truyền `on_progress` — CLI in ra màn hình, web đẩy vào
thanh tiến độ. Xem `extract._emit` để biết các loại sự kiện.
"""

from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable, Sequence

from export import export_accounts, verification_summary
from extract import ExtractError, extract_transactions  # noqa: F401  (ExtractError dùng lại ở CLI/API)
from validate import (
    apply_cover_metadata,
    merge_accounts,
    split_mixed_accounts,
    validate_transactions,
)

# Giá USD / 1 triệu token (input, output) để ước tính chi phí mỗi lần chạy
# (sonnet-5: giá khuyến mãi đến 31/08/2026, sau đó 3/15)
PRICES = {
    "claude-sonnet-5": (2.0, 10.0),
    "claude-sonnet-4-6": (3.0, 15.0),
    "claude-haiku-4-5": (1.0, 5.0),
    "gemini-2.5-flash": (0.30, 2.50),
    "gemini-3.1-flash-lite": (0.25, 1.50),
}

ProgressFn = Callable[[dict], None]


def estimate_cost(model: str, usage: dict) -> float | None:
    """Chi phí ước tính (USD) của một lần chạy. None nếu chưa biết giá model."""
    price = PRICES.get(model)
    if not price:
        return None
    return (
        usage.get("input_tokens", 0) * price[0]
        + usage.get("output_tokens", 0) * price[1]
    ) / 1e6


@dataclass
class ScanResult:
    """Kết quả một lần quét: các sổ đã kiểm tra + thông tin lần chạy.

    `accounts` giữ nguyên kiểu dict như các module khác đang dùng (export/eval),
    để không phải sửa lan man. Chỗ nào cần JSON cho web thì gọi `to_dict()`.
    """

    accounts: list[dict]
    model: str
    usage: dict
    cached: bool
    source_name: str = ""
    skipped: list[str] = field(default_factory=list)
    pages: int = 0

    @property
    def cost_usd(self) -> float | None:
        """None nếu lấy từ cache (không gọi API) hoặc chưa biết giá model."""
        if self.cached:
            return 0.0
        return estimate_cost(self.model, self.usage)

    @property
    def verification(self) -> list[dict]:
        """Mức độ bảo đảm của từng sổ — thứ phải hiện ở đầu mỗi kết quả."""
        out = []
        for i, acc in enumerate(self.accounts):
            summary = verification_summary(acc["transactions"])
            summary["index"] = i
            summary["bank_name"] = acc.get("bank_name")
            summary["account_no"] = acc.get("account_no")
            out.append(summary)
        return out

    @property
    def totals(self) -> dict:
        """Cộng dồn cả lần quét. `chain_ok` False nghĩa là CÒN dòng phải soát.

        Lưu ý: `chain_ok` True vẫn KHÔNG bảo đảm đọc đúng — chuỗi số dư không
        phát hiện được dòng bị sót hay tên đối tác đọc sai.
        """
        rows = fixed = need = 0
        for v in self.verification:
            rows += v["rows"]
            fixed += v["fixed"]
            need += v["need_check"]
        return {
            "accounts": len(self.accounts),
            "rows": rows,
            "fixed": fixed,
            "need_check": need,
            "chain_ok": need == 0 and rows > 0,
        }

    def to_excel(self, output_path: str | Path) -> str:
        """Ghi file Excel. Raise PermissionError nếu file đang mở trong Excel."""
        return export_accounts(
            self.accounts, str(output_path), source_name=self.source_name
        )

    def to_dict(self) -> dict:
        """Payload JSON cho API web (không kèm ảnh gốc)."""
        return {
            "model": self.model,
            "cached": self.cached,
            "cost_usd": self.cost_usd,
            "usage": self.usage,
            "source_name": self.source_name,
            "pages": self.pages,
            "skipped": self.skipped,
            "totals": self.totals,
            "verification": self.verification,
            "accounts": self.accounts,
        }


def scan(
    files: str | Path | Sequence[str | Path],
    *,
    rotate: int = 0,
    use_cache: bool = True,
    banks: str | Sequence[str] | None = None,
    on_progress: ProgressFn | None = None,
) -> ScanResult:
    """Quét ảnh/PDF sổ ngân hàng → các sổ đã qua engine kiểm tra kép.

    files: nhiều trang của CÙNG (các) sổ thì đưa hết vào một lần gọi để chuỗi
        số dư nối liền giữa các trang.
    rotate: xoay 0/90/180/270 độ theo chiều kim đồng hồ trước khi gửi model.
    use_cache: True → cùng file + cùng thiết lập thì lấy kết quả cũ, $0.
    banks: ghi đè tên ngân hàng theo thứ tự sổ, cho trường hợp không có trang
        bìa nên model không tự đọc ra tên. Nhận list hoặc chuỗi "A,B".
    on_progress: hàm nhận dict tiến độ từng trang.

    Raise ExtractError khi không đọc được gì (message đã thân thiện).
    """
    if isinstance(files, (str, Path)):
        files = [files]
    paths = [Path(p) for p in files]

    raw = extract_transactions(
        paths, rotate=rotate, use_cache=use_cache, on_progress=on_progress
    )

    _emit(on_progress, "validate", "Đang kiểm tra chuỗi số dư...")

    # Gắn nguồn cho TỪNG DÒNG trước khi gộp: sau khi merge_accounts nối nhiều
    # trang thành một sổ thì không còn biết dòng nào từ ảnh nào nữa, mà web cần
    # biết để click ảnh là cuộn tới đúng phần kết quả của ảnh đó.
    for acc in raw["accounts"]:
        unit = acc.get("source_unit")
        for tx in acc["transactions"]:
            tx.setdefault("source_unit", unit)

    # Tách account mà model trộn nhầm 2 sổ → bìa sổ điền thông tin cho sổ sau nó
    # → gộp các khối thực chất là 1 sổ (chuỗi 残高 nối tiếp khớp).
    # THỨ TỰ NÀY QUAN TRỌNG, đừng đổi: xem docs/WEB_PLAN.md và MEMORY.
    accounts = merge_accounts(apply_cover_metadata(split_mixed_accounts(raw["accounts"])))

    if isinstance(banks, str):
        banks = banks.split(",")
    bank_names = [b.strip() for b in banks] if banks else []
    for i, acc in enumerate(accounts):
        if i < len(bank_names) and bank_names[i]:
            acc["bank_name"] = bank_names[i]
        acc["transactions"] = validate_transactions(acc["transactions"])

    result = ScanResult(
        accounts=accounts,
        model=raw["model"],
        usage=raw["usage"],
        cached=raw["cached"],
        source_name=", ".join(p.name for p in paths),
        skipped=raw.get("skipped", []),
        pages=raw.get("pages", len(paths)),
    )
    _emit(on_progress, "done", "Xong", totals=result.totals)
    return result


def _emit(on_progress: ProgressFn | None, stage: str, message: str, **extra) -> None:
    if on_progress is not None:
        on_progress({"stage": stage, "message": message, **extra})
