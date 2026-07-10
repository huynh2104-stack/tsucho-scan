"""Kiểm tra checksum số dư và chuyển ngày 和暦 → YYYY-MM-DD."""

import re
from datetime import date

# Năm gốc của các niên hiệu: năm thực = gốc + năm niên hiệu
ERA_BASE = {
    "R": 2018, "令和": 2018,  # Reiwa
    "H": 1988, "平成": 1988,  # Heisei
    "S": 1925, "昭和": 1925,  # Showa
}
DEFAULT_ERA = "R"  # thông thường sổ hiện nay in năm Reiwa


def convert_wareki(date_raw: str, default_era: str = DEFAULT_ERA) -> str | None:
    """Chuyển "6-01-15" / "R6.1.15" / "令和6年1月15日" → "2024-01-15".

    Nếu năm đã là 4 chữ số (Gregorian) thì giữ nguyên. Không parse được → None.
    """
    if not date_raw:
        return None
    s = str(date_raw).strip()

    # Tách niên hiệu đứng đầu nếu có (R/H/S hoặc kanji)
    era = default_era
    m = re.match(r"^(令和|平成|昭和|[RHS])\s*", s, re.IGNORECASE)
    if m:
        era = m.group(1).upper() if len(m.group(1)) == 1 else m.group(1)
        s = s[m.end():]

    # Lấy 3 nhóm số: năm, tháng, ngày (chấp nhận - . / 年 月 日 làm dấu tách)
    nums = re.findall(r"\d+", s)
    if len(nums) != 3:
        return None
    year, month, day = (int(n) for n in nums)

    # Năm 4 chữ số → đã là dương lịch
    if year < 100:
        year = ERA_BASE.get(era, ERA_BASE[DEFAULT_ERA]) + year

    try:
        return date(year, month, day).isoformat()
    except ValueError:
        return None


def validate_transactions(transactions: list[dict]) -> list[dict]:
    """Thêm các key: date (ISO), status ("ok"/"check"), reason (lý do cần kiểm tra).

    Checksum: với mỗi dòng có 残高 → prev_balance + 入金 - 出金 == 残高.
    Lệch, hoặc confidence "low", hoặc ngày không parse được → status "check".
    """
    result = []
    prev_balance = None  # số dư của dòng có 残高 gần nhất (đã cộng dồn kỳ vọng)

    for tx in transactions:
        row = dict(tx)
        reasons = []

        row["date"] = convert_wareki(row.get("date_raw", ""))
        if row["date"] is None:
            reasons.append("日付不明")

        if row.get("confidence") == "low":
            reasons.append("低信頼度")

        amount_in = row.get("amount_in") or 0
        amount_out = row.get("amount_out") or 0
        balance = row.get("balance")

        if balance is not None:
            if prev_balance is not None:
                expected = prev_balance + amount_in - amount_out
                if expected != balance:
                    reasons.append("残高不一致")
            # Tin số in trên sổ để lỗi 1 dòng không kéo dây chuyền các dòng sau
            prev_balance = balance
        elif prev_balance is not None:
            # Dòng không in 残高: cộng dồn để so ở dòng có 残高 tiếp theo
            prev_balance = prev_balance + amount_in - amount_out

        row["status"] = "check" if reasons else "ok"
        row["reason"] = "・".join(reasons)
        result.append(row)

    return result
