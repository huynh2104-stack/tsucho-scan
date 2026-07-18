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


def _balance_chains(first: list[dict], second: list[dict]) -> bool:
    """True nếu 残高 cuối của first nối tiếp khớp với chuỗi giao dịch đầu của second.

    Bao dung 2 chiều:
    - Mốc xuất phát: thử 3 số dư cuối của first (dòng 未記帳/繰越 cuối sổ có thể
      in số dư "sau cả giao dịch chưa ghi" — mốc nối đúng nằm trước đó).
    - Đích: kiểm tối đa 3 dòng có 残高 đầu của second (dòng đầu sổ mới hay bị
      đọc sai/dính mã 取扱店). Chỉ cần 1 cặp khớp số học là đủ bằng chứng.
    """
    anchors = []
    for tx in reversed(first):
        if tx.get("balance") is not None:
            anchors.append(tx["balance"])
            if len(anchors) >= 3:
                break
    if not anchors:
        return False

    for start in anchors:
        running = start
        checks = 0
        for tx in second:
            running += (tx.get("amount_in") or 0) - (tx.get("amount_out") or 0)
            bal = tx.get("balance")
            if bal is not None:
                if bal == running:
                    return True
                if bal >= 1000 and bal // 1000 == running:  # 残高 dính mã 取扱店
                    return True
                checks += 1
                if checks >= 3:
                    break
    return False


def merge_accounts(accounts: list[dict]) -> list[dict]:
    """Gộp các account liên tiếp thực chất là 1 sổ bị model tách nhầm.

    Chuỗi 残高 nối tiếp khớp là bằng chứng mạnh của cùng 1 sổ — mạnh hơn cả
    tên ngân hàng, vì khối đầu trang hay bị model gán nhầm tên từ bìa sổ
    bên cạnh. Khi tên 2 khối khác nhau, ưu tiên tên của khối SAU (tên ngân
    hàng thật thường in ở footer trang giao dịch, thuộc khối cuối).
    """
    merged: list[dict] = []
    for acc in accounts:
        # Tìm sổ đã có mà chuỗi 残高 nối tiếp khớp (không cần đứng kề nhau —
        # trang sau của sổ A có thể xuất hiện sau trang của sổ B)
        target = None
        for prev in merged:
            if _balance_chains(prev["transactions"], acc["transactions"]):
                target = prev
                break
        if target is not None:
            target["transactions"] = target["transactions"] + acc["transactions"]
            # Khối sau thường mang thông tin đúng hơn (footer trang giao dịch)
            for key in ("bank_name", "store_no", "account_no", "holder"):
                target[key] = acc.get(key) or target.get(key)
            continue
        merged.append({
            "bank_name": acc.get("bank_name"),
            "store_no": acc.get("store_no"),
            "account_no": acc.get("account_no"),
            "holder": acc.get("holder"),
            "transactions": list(acc.get("transactions", [])),
        })
    return merged


def _shift_balances(transactions: list[dict], offset: int) -> list[dict]:
    """Dịch cột 残高 đi offset hàng (model hay gán nhầm 残高 sang dòng kề)."""
    balances = [tx.get("balance") for tx in transactions]
    n = len(balances)
    shifted = []
    for i, tx in enumerate(transactions):
        row = dict(tx)
        j = i + offset
        row["balance"] = balances[j] if 0 <= j < n else None
        shifted.append(row)
    return shifted


def _count_mismatch(rows: list[dict]) -> int:
    return sum(1 for r in rows if "残高不一致" in r.get("reason", ""))


def validate_transactions(transactions: list[dict]) -> list[dict]:
    """Thêm các key: date (ISO), status ("ok"/"fixed"/"check"), reason.

    Checksum: với mỗi dòng có 残高 → prev_balance + 入金 - 出金 == 残高.
    Kiểm tra kép: nếu lệch nhưng chênh lệch 残高 khớp đúng số tiền đang nằm
    nhầm cột thì tự chuyển cột → status "fixed". Không tự sửa được → "check".
    Nếu nhiều dòng lệch liên tiếp theo mẫu "残高 lệch 1 hàng" (model gán số dư
    của dòng trên/dưới) → tự dịch lại cả cột và kiểm chứng bằng chính checksum.
    """
    result = _validate_pass(transactions)

    # Thử giả thuyết "cột 残高 bị lệch 1 hàng" khi có nhiều dòng lệch
    n_bad = _count_mismatch(result)
    if n_bad >= 3:
        best, best_bad = result, n_bad
        for offset in (1, -1):
            candidate = _validate_pass(_shift_balances(transactions, offset))
            cand_bad = _count_mismatch(candidate)
            if cand_bad < best_bad:
                best, best_bad = candidate, cand_bad
        # Chỉ nhận khi cải thiện rõ rệt (giảm hơn một nửa số dòng lệch)
        if best is not result and best_bad * 2 < n_bad:
            for orig, row in zip(transactions, best):
                if row.get("balance") != orig.get("balance"):
                    note = "残高の行ずれを自動補正"
                    row["reason"] = "・".join(filter(None, [row["reason"], note]))
                    if row["status"] == "ok":
                        row["status"] = "fixed"
            result = best

    return result


def _split_fused(balance: int | None) -> tuple[int | None, str | None]:
    """残高 dính liền mã 取扱店 3 chữ số (189 + 709 → 189709) → (189, "709")."""
    if balance is not None and balance >= 1000:
        return balance // 1000, f"{balance % 1000:03d}"
    return None, None


def _normalize_te_codes(transactions: list[dict]) -> None:
    """Sổ kiểu Fukuoka: mã 備考 dạng「ﾃ055」hay bị model nhét nhầm sang 取扱店
    (mất chữ ﾃ). Nếu tài khoản có dùng 備考 kiểu ﾃ thì trả mã lạc về đúng chỗ."""
    has_te = any(
        re.search(r"[ﾃテ]\s*\d{2,3}", str(tx.get("extra_text") or ""))
        for tx in transactions
    )
    if not has_te:
        return
    for tx in transactions:
        code = tx.get("store_code")
        if code and not tx.get("extra_text"):
            tx["extra_text"] = f"ﾃ{code}"
            tx["store_code"] = None


def _lookahead_ok(start: int, following: list[dict], depth: int = 2) -> bool:
    """Chuỗi từ số dư `start` có khớp với 残高 in ở 1 trong `depth` dòng kế không."""
    running = start
    checks = 0
    for tx in following:
        if tx.get("is_note"):
            continue
        running += (tx.get("amount_in") or 0) - (tx.get("amount_out") or 0)
        bal = tx.get("balance")
        if bal is not None:
            if bal == running or (bal >= 1000 and bal // 1000 == running):
                return True
            checks += 1
            if checks >= depth:
                return False
    return False


def _clear_mismatch(row: dict, note: str) -> None:
    """Gỡ cờ 残高不一致 của 1 dòng sau khi đã chứng minh/sửa được nó."""
    parts = [p for p in row.get("reason", "").split("・")
             if p and not p.startswith("残高不一致")]
    parts.append(note)
    row["reason"] = "・".join(parts)
    others = [p for p in parts if p not in (note,) and not p.endswith("補正") and not p.endswith("分離")]
    row["status"] = "check" if others else "fixed"


def _validate_pass(transactions: list[dict]) -> list[dict]:
    _normalize_te_codes(transactions)
    result = []
    prev_balance = None   # số dư của dòng có 残高 gần nhất (đã cộng dồn kỳ vọng)
    prev_bal_row = None   # dòng in 残高 gần nhất (để sửa lùi khi phát hiện dính mã)
    prev_is_direct = False  # prev_balance đúng bằng 残高 in trên prev_bal_row?
    alt_prev = None       # số dư DẪN XUẤT của dòng vừa bị cờ lệch (giả thuyết thay thế)
    alt_prev_row = None

    for idx, tx in enumerate(transactions):
        row = dict(tx)
        reasons = []
        fixes = []

        row["date"] = convert_wareki(row.get("date_raw", ""))

        if row.get("is_note"):
            # Dòng ghi chú (繰越, 未記帳...): không phải giao dịch, chỉ dùng
            # 残高 (nếu có) làm mốc nối chuỗi; không bắt lỗi ngày/độ mờ
            balance = row.get("balance")
            if balance is not None:
                if prev_balance is not None and balance != prev_balance:
                    reasons.append(f"残高不一致(差額 {balance - prev_balance:+,})")
                prev_balance = balance
                prev_bal_row, prev_is_direct = row, True
            row["status"] = "check" if reasons else "note"
            row["reason"] = "・".join(reasons)
            result.append(row)
            continue

        if row["date"] is None:
            reasons.append("日付不明")

        amount_in = row.get("amount_in") or 0
        amount_out = row.get("amount_out") or 0
        balance = row.get("balance")

        chain_verified = False  # dòng này đã được chuỗi 残高 xác minh số học chưa
        if balance is not None and prev_balance is not None:
            move = amount_in - amount_out
            cur2, cur_code = _split_fused(balance)
            # Chỉ sửa lùi dòng trước khi nó chưa bị nghi vấn gì khác
            prev2, prev_code = (None, None)
            if (prev_is_direct and prev_bal_row is not None
                    and "残高不一致" not in prev_bal_row.get("reason", "")):
                prev2, prev_code = _split_fused(prev_balance)

            if move == balance - prev_balance:
                chain_verified = True
            # Kiểm tra kép 1: số tiền nằm nhầm cột 出金/入金
            elif (balance - prev_balance) > 0 and amount_out == balance - prev_balance and not amount_in:
                row["amount_in"], row["amount_out"] = amount_out, None
                fixes.append("金額を入金列へ移動")
                chain_verified = True
            elif (balance - prev_balance) < 0 and amount_in == prev_balance - balance and not amount_out:
                row["amount_out"], row["amount_in"] = amount_in, None
                fixes.append("金額を出金列へ移動")
                chain_verified = True
            # Kiểm tra kép 2: 残高 dòng này bị dính mã 取扱店 (189+709 → 189709)
            elif cur2 is not None and move == cur2 - prev_balance:
                row["balance"], balance = cur2, cur2
                row["store_code"] = row.get("store_code") or cur_code
                fixes.append("残高から取扱店を分離")
                chain_verified = True
            # Kiểm tra kép 3: 残高 dòng TRƯỚC bị dính mã → sửa lùi
            elif prev2 is not None and move == balance - prev2:
                prev_bal_row["balance"] = prev2
                prev_bal_row["store_code"] = prev_bal_row.get("store_code") or prev_code
                prev_bal_row["reason"] = "・".join(
                    filter(None, [prev_bal_row.get("reason"), "残高から取扱店を分離"]))
                if prev_bal_row.get("status") in ("ok", None):
                    prev_bal_row["status"] = "fixed"
                prev_balance = prev2
                chain_verified = True
            # Kiểm tra kép 4: cả dòng trước lẫn dòng này đều dính mã
            elif cur2 is not None and prev2 is not None and move == cur2 - prev2:
                prev_bal_row["balance"] = prev2
                prev_bal_row["store_code"] = prev_bal_row.get("store_code") or prev_code
                prev_bal_row["reason"] = "・".join(
                    filter(None, [prev_bal_row.get("reason"), "残高から取扱店を分離"]))
                if prev_bal_row.get("status") in ("ok", None):
                    prev_bal_row["status"] = "fixed"
                row["balance"], balance = cur2, cur2
                row["store_code"] = row.get("store_code") or cur_code
                fixes.append("残高から取扱店を分離")
                prev_balance = prev2
                chain_verified = True

            # Kiểm tra kép 5: 残高 và 取扱店 bị đổi chỗ cho nhau (717 ↔ 209)
            if not chain_verified:
                sc = str(row.get("store_code") or "")
                if re.fullmatch(r"\d{1,3}", sc) and move == int(sc) - prev_balance:
                    old_bal = balance
                    row["balance"] = balance = int(sc)
                    row["store_code"] = f"{old_bal:03d}" if old_bal < 1000 else str(old_bal)
                    fixes.append("残高と取扱店を入替補正")
                    chain_verified = True

            # Kiểm tra kép 6: 残高 in bị rác → SUY RA từ phép tính rồi kiểm chứng
            # bằng dòng kế tiếp (thử cả giả thuyết dòng trước và đổi cột tiền)
            if not chain_verified:
                following = transactions[idx + 1:]
                one_sided = (amount_in == 0) != (amount_out == 0)
                for pcand, pref in ((prev_balance, None), (alt_prev, alt_prev_row)):
                    if pcand is None or chain_verified:
                        continue
                    for swap in (False, True):
                        if swap and not one_sided:
                            continue
                        derived = pcand + (-move if swap else move)
                        if derived != balance and not _lookahead_ok(derived, following):
                            continue
                        # Bằng chứng đủ mạnh → áp dụng bộ giả thuyết này
                        if pref is not None:
                            pref["balance"] = pcand
                            _clear_mismatch(pref, "残高を検算で補正")
                        if swap:
                            row["amount_out"], row["amount_in"] = (
                                amount_in or None, amount_out or None)
                            amount_out, amount_in = amount_in, amount_out
                            move = -move
                            fixes.append("金額の列を入替")
                        if derived != balance:
                            fixes.append(f"残高を検算で補正(印字読取 {balance:,})")
                            row["balance"] = balance = derived
                        chain_verified = True
                        break

            if not chain_verified:
                # Không tự sửa được: báo kèm chênh lệch để người xem sửa nhanh
                reasons.append(f"残高不一致(差額 {balance - prev_balance:+,})")

        # Cờ "số mờ" của model chỉ giữ khi chuỗi 残高 KHÔNG xác minh được dòng này;
        # chuỗi đã khớp = con số được toán học bảo chứng (model hay gắn cờ tràn lan)
        if row.get("confidence") == "low" and not chain_verified:
            reasons.append("低信頼度")

        # Dòng bị cờ lệch → lưu số dư DẪN XUẤT làm giả thuyết cho dòng kế
        # (có thể chính 残高 in của dòng này là rác chứ không phải số tiền sai)
        new_alt = new_alt_row = None
        if balance is not None and prev_balance is not None and not chain_verified:
            new_alt = prev_balance + move
            new_alt_row = row

        if balance is not None:
            # Tin số in trên sổ để lỗi 1 dòng không kéo dây chuyền các dòng sau
            prev_balance = balance
            prev_bal_row, prev_is_direct = row, True
        elif prev_balance is not None:
            # Dòng không in 残高: cộng dồn để so ở dòng có 残高 tiếp theo
            prev_balance = prev_balance + (row.get("amount_in") or 0) - (row.get("amount_out") or 0)
            prev_is_direct = False
        alt_prev, alt_prev_row = new_alt, new_alt_row

        if reasons:
            row["status"] = "check"
        elif fixes:
            row["status"] = "fixed"
        else:
            row["status"] = "ok"
        row["reason"] = "・".join(reasons + fixes)
        result.append(row)

    # Cả sổ không đọc được 残高 nào → checksum không chạy được, "sạch" là ảo.
    # Đánh dấu toàn bộ để người dùng biết dữ liệu này chưa được kiểm chứng.
    if result and all(r.get("balance") is None for r in result):
        for row in result:
            row["status"] = "check"
            row["reason"] = "・".join(
                filter(None, [row["reason"], "残高が読取れず検証不可"])
            )

    return result
