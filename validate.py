"""Kiểm tra checksum số dư và chuyển ngày 和暦 → YYYY-MM-DD."""

import re
import unicodedata
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
        bal = tx.get("balance")
        if bal is not None:
            anchors.append(bal)
            # Mốc neo cũng có thể bị dính mã 取扱店/店番 (110552003 = 110552 + 003).
            # Nhánh gỡ dính bên dưới chỉ áp cho dòng ĐÍCH, nên phải thử cả ở đây —
            # thiếu chỗ này thì sổ 徳島大正 bị cắt thành 4 sheet rời.
            if bal >= 1000:
                anchors.append(bal // 1000)
            if len(anchors) >= 6:
                break
    if not anchors:
        return False

    for start in anchors:
        # Bao dung lỗi "số tiền nằm nhầm cột 出金/入金" — chính engine kiểm tra kép
        # vẫn sửa được lỗi này, nên nó không được phép làm hỏng việc nối sổ.
        # Giữ song song các số dư có thể có (tập rất nhỏ vì chỉ đi vài dòng).
        running = {start}
        hits = 0          # số mốc 残高 đã xác nhận khớp
        for tx in second[:6]:
            move = (tx.get("amount_in") or 0) - (tx.get("amount_out") or 0)
            one_sided = bool(tx.get("amount_in")) != bool(tx.get("amount_out"))
            nxt = {r + move for r in running}
            if one_sided:
                nxt |= {r - move for r in running}
            running = nxt

            bal = tx.get("balance")
            if bal is None:
                continue
            # Khớp trực tiếp, hoặc 残高 còn dính mã 取扱店 (189709 = 189 + 709)
            ok = {r for r in running if r == bal or (bal >= 1000 and bal // 1000 == r)}
            if not ok:
                break     # mâu thuẫn → giả thuyết mốc này sai, thử mốc khác
            running = ok  # chốt lại theo số in trên sổ
            hits += 1
            # Đòi 2 mốc liên tiếp: 1 mốc dễ trùng ngẫu nhiên khi đã bao dung cả
            # đổi cột lẫn dính mã — từng gộp nhầm 23 dòng 西日本 vào sổ 福岡.
            if hits >= 2:
                return True
        if hits >= 1 and sum(1 for t in second if t.get("balance") is not None) == 1:
            return True   # khối chỉ có đúng 1 mốc để kiểm thì 1 lần là hết mức
    return False


_META_KEYS = ("bank_name", "store_no", "account_no", "holder")


def _row_signature(tx: dict) -> tuple[int, int]:
    """Dấu vân tay định dạng của 1 dòng: (区分 là mã số?, có 取扱店?).

    Skill Cowork: nhận dạng sổ bằng ĐỊNH DẠNG DÒNG, không bằng chữ viết tay.
    西日本 dùng mã số 200/100/510 + cột 取扱店; 福岡 dùng chữ CDカード/CDフリコミ.
    """
    kind = str(tx.get("kind") or "")
    return (1 if re.fullmatch(r"\d{3}", kind) else 0,
            1 if tx.get("store_code") else 0)


def _sig_profile(rows: list[dict]) -> tuple[float, float]:
    real = [t for t in rows if not t.get("is_note")]
    if not real:
        return (0.0, 0.0)
    sigs = [_row_signature(t) for t in real]
    return (sum(s[0] for s in sigs) / len(sigs), sum(s[1] for s in sigs) / len(sigs))


def split_mixed_accounts(accounts: list[dict], min_side: int = 5) -> list[dict]:
    """Tách 1 account mà model đã trộn nhầm 2 sổ khác nhau vào chung.

    Một ảnh scan thường chụp 2 sổ cùng lúc; model (nhất là flash-lite) đôi khi
    trả về cả 2 trong một account. Dấu hiệu để cắt phải có ĐỦ hai điều kiện:
    chuỗi 残高 đứt tại đó, VÀ dấu vân tay định dạng dòng đổi hẳn (đo được ở
    trang 4: 24 dòng 福岡 dính 24 dòng 西日本).
    """
    result = []
    for acc in accounts:
        txs = acc.get("transactions") or []
        cut, best_diff = None, 0.5   # 0.5 là ngưỡng tối thiểu để dám cắt
        if len(txs) >= 2 * min_side:
            for i in range(min_side, len(txs) - min_side + 1):
                prev, cur = txs[i - 1], txs[i]
                pb, cb = prev.get("balance"), cur.get("balance")
                if pb is None or cb is None:
                    continue
                move = (cur.get("amount_in") or 0) - (cur.get("amount_out") or 0)
                if cb - pb == move:
                    continue  # chuỗi vẫn liền → không phải chỗ giáp ranh
                before, after = _sig_profile(txs[:i]), _sig_profile(txs[i:])
                diff = max(abs(a - b) for a, b in zip(before, after))
                # Lấy chỗ tín hiệu MẠNH NHẤT, không phải chỗ đứt đầu tiên: chuỗi
                # còn đứt vì lỗi đọc số, cắt vội sẽ lệch vài dòng (đo được: cắt
                # ở 19 thay vì 24 làm 5 dòng 福岡 lạc sang sổ 西日本).
                if diff > best_diff:
                    cut, best_diff = i, diff
        if cut is None:
            result.append(acc)
            continue
        head, tail = dict(acc), dict(acc)
        head["transactions"] = txs[:cut]
        tail["transactions"] = txs[cut:]
        # Tên/số tài khoản đã đọc được thuộc về sổ nào thì chưa biết → để trống
        # phần sau, các bước sau (bìa sổ, --banks) sẽ điền.
        for key in _META_KEYS:
            tail[key] = None
        result.extend([head, tail])
    return result


def apply_cover_metadata(accounts: list[dict]) -> list[dict]:
    """Chuyển thông tin trên trang BÌA sang sổ đứng ngay sau nó.

    Nhiều sổ (vd 百十四銀行) chỉ in 銀行名/店番号/口座番号/名義 ở bìa, còn trang
    giao dịch thì không có gì. Trang bìa được model trả về dưới dạng account
    không có dòng nào — dùng nó điền vào các ô trống của sổ kế tiếp rồi bỏ đi.
    """
    result = []
    pending: dict = {}
    pending_unit = None
    for acc in accounts:
        # Trang nào có thông tin sổ (bìa, hoặc trang giao dịch in tên ở footer)
        # đều cập nhật "sổ hiện hành". Bìa sổ mới = sang sổ khác.
        # Không dùng "0 giao dịch" làm điều kiện: bìa hay bị model đọc ra 1 dòng rác.
        if any(acc.get(k) for k in _META_KEYS):
            for key in _META_KEYS:
                if acc.get(key):
                    pending[key] = acc[key]
            pending_unit = acc.get("source_unit")

        if not acc.get("transactions"):
            continue  # bìa thuần: không tạo sheet riêng

        # Chỉ lan sang TRANG KHÁC. Một ảnh có thể chứa 2 sổ khác nhau (trang 5-6:
        # 西日本 + 福岡) — lan trong cùng ảnh sẽ gán nhầm tên sổ này cho sổ kia.
        # KHÔNG xóa pending: các trang sau vẫn thuộc sổ này cho tới bìa kế tiếp,
        # vì trang giao dịch hiếm khi in tên ngân hàng.
        same_page = (pending_unit is not None
                     and acc.get("source_unit") == pending_unit)
        if pending and not same_page:
            acc = dict(acc)
            for key in _META_KEYS:
                acc[key] = acc.get(key) or pending.get(key)
        result.append(acc)
    return result


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
    return _merge_same_account(merged)


def _merge_same_account(groups: list[dict]) -> list[dict]:
    """Nối các nhóm kề nhau CÙNG một tài khoản dù chuỗi 残高 đứt.

    Sau bước nối bằng chuỗi vẫn còn nhóm rời khi model đọc sai vài con số ở chỗ
    sang trang. Nhưng nếu trang bìa cho biết cùng 銀行名 + 口座番号 thì đó chắc
    chắn là một sổ (bìa mới = sổ mới), nên gộp lại thành 1 sheet như người làm tay.
    Không giấu lỗi: chỗ nối không chứng minh được sẽ bị chính checksum bắt và tô
    vàng 残高不一致 ở bước validate_transactions.
    """
    out: list[dict] = []
    for grp in groups:
        prev = out[-1] if out else None
        # Đòi BẰNG CHỨNG DƯƠNG: phải biết rõ số tài khoản và trùng nhau.
        # Nếu chấp nhận "cả hai đều None" thì 2 sổ khác nhau trong cùng 1 ảnh
        # (trang 5-6: 西日本 + 福岡) sẽ bị gộp thành một sheet — đã đo được.
        same = (
            prev is not None
            and grp.get("bank_name")
            and prev.get("bank_name") == grp.get("bank_name")
            and grp.get("account_no")
            and prev.get("account_no") == grp.get("account_no")
        )
        if same:
            prev["transactions"] = prev["transactions"] + grp["transactions"]
            continue
        out.append(grp)
    return out


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


def _move_of(tx: dict) -> int:
    return (tx.get("amount_in") or 0) - (tx.get("amount_out") or 0)


def _shift_segments(transactions: list[dict]) -> list[dict] | None:
    """Dịch cột 残高 lùi 1 hàng cho TỪNG ĐOẠN lệch, thay vì cả cột.

    Khi model bỏ sót 1 dòng (hay gặp nhất: dòng 繰越 đầu trang), 残高 của các
    dòng sau đó lùi 1 hàng — mỗi dòng mang số dư của dòng trên nó. Nếu model
    bỏ sót thêm dòng nữa ở giữa thì từ đó trở đi lại tự khớp lại, nên _shift_balances
    (dịch cả cột) không cứu được: nó sửa được đoạn đầu thì phá đoạn sau.

    Ở đây tìm các đoạn liên tiếp mà giả thuyết "lệch 1 hàng" khớp số học còn
    giả thuyết "thẳng hàng" thì không, rồi chỉ dịch trong đoạn đó.
    Trả về None nếu không có đoạn nào đủ dài (>= 3 dòng).
    """
    idxs = [i for i, tx in enumerate(transactions) if tx.get("balance") is not None]
    if len(idxs) < 4:
        return None

    bal = [transactions[i]["balance"] for i in idxs]
    # Tổng biến động giữa 2 dòng có 残高 liên tiếp (gồm cả dòng giữa không in 残高)
    moves = [
        sum(_move_of(transactions[k]) for k in range(idxs[p - 1] + 1, idxs[p] + 1))
        for p in range(1, len(idxs))
    ]

    last = len(idxs) - 1
    # suspect[p] (p = 1..last): giả thuyết "lệch 1 hàng" khớp còn "thẳng hàng" sai
    suspect = {}
    for p in range(1, len(idxs)):
        aligned = bal[p] - bal[p - 1] == moves[p - 1]
        shifted = p < last and bal[p + 1] - bal[p] == moves[p - 1]
        suspect[p] = shifted and not aligned

    # Gom thành các đoạn liên tiếp p = a..b, chỉ nhận đoạn >= 3 dòng.
    # Đoạn đó nghĩa là: số dư thật của dòng idxs[q] chính là bal[q+1] (q = a-1..b).
    result = [dict(tx) for tx in transactions]
    found = False
    a = None
    for p in range(1, len(idxs) + 1):
        if suspect.get(p):
            a = p if a is None else a
            continue
        if a is not None:
            b = p - 1
            if b - a + 1 >= 3:
                for q in range(a - 1, min(b, last - 1) + 1):
                    result[idxs[q]]["balance"] = bal[q + 1]
                found = True
            a = None
    return result if found else None


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
        candidates = [_shift_balances(transactions, off) for off in (1, -1)]
        segmented = _shift_segments(transactions)
        if segmented is not None:
            candidates.append(segmented)  # lệch theo từng đoạn (bỏ sót dòng giữa chừng)

        best, best_bad = result, n_bad
        for shifted in candidates:
            candidate = _validate_pass(shifted)
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

    _fill_partial_dates(result)
    _flag_row_number_gaps(result)
    return result


def _fill_partial_dates(rows: list[dict]) -> None:
    """Điền năm cho những ngày chỉ in tháng.ngày (vd "11.14" → 2025-11-14).

    Nhiều sổ chỉ in năm ở dòng đầu hoặc khi sang năm mới. Giao dịch trong sổ luôn
    theo thứ tự thời gian nên năm suy được từ dòng có ngày đầy đủ gần nhất; nếu
    tháng/ngày lùi lại so với dòng trước thì đã sang năm sau.
    """
    def _month_day(row) -> tuple[int, int] | None:
        nums = re.findall(r"\d+", str(row.get("date_raw") or ""))
        return (int(nums[0]), int(nums[1])) if len(nums) == 2 else None

    def _apply(row, guess: date, note: str) -> None:
        row["date"] = guess.isoformat()
        # Đã đọc được ngày → gỡ cờ 日付不明 mà pass trước đã gắn
        parts = [p for p in row.get("reason", "").split("・") if p and p != "日付不明"]
        still_bad = [p for p in parts
                     if "不一致" in p or "疑い" in p or p == "低信頼度"]
        row["reason"] = "・".join(parts + [note])
        row["status"] = "check" if still_bad else "fixed"

    # Xuôi: lấy năm của dòng đầy đủ gần nhất phía TRƯỚC
    last = None
    for row in rows:
        if row.get("date"):
            last = date.fromisoformat(row["date"])
            continue
        md = _month_day(row)
        if md is None and last is not None and not row.get("is_note"):
            # Dòng KHÔNG in ngày (sổ ゆうちょ: dòng 料金 đi kèm giao dịch ngay trên
            # thì bỏ trống cả 年月日 lẫn 取扱店). Không phải lỗi đọc — thừa kế
            # ngày của dòng trên, nếu không sẽ báo động giả 日付不明 hàng loạt.
            if not str(row.get("date_raw") or "").strip():
                _apply(row, last, "日付は前行と同じ(印字なし)")
            continue
        if last is None or md is None:
            continue
        for year in (last.year, last.year + 1):   # tháng lùi lại = đã sang năm mới
            try:
                guess = date(year, *md)
            except ValueError:
                break
            if guess >= last:
                _apply(row, guess, "年を前行から補完")
                last = guess
                break

    # Ngược: các dòng ĐẦU sổ chưa có mốc phía trước thì suy từ dòng đầy đủ phía SAU
    nxt = None
    for row in reversed(rows):
        if row.get("date"):
            nxt = date.fromisoformat(row["date"])
            continue
        md = _month_day(row)
        if nxt is None or md is None:
            continue
        for year in (nxt.year, nxt.year - 1):
            try:
                guess = date(year, *md)
            except ValueError:
                break
            if guess <= nxt:
                _apply(row, guess, "年を後行から補完")
                nxt = guess
                break


def _flag_row_number_gaps(rows: list[dict]) -> None:
    """Cảnh báo khi số thứ tự dòng in trên sổ bị nhảy cóc (model bỏ sót dòng).

    Sổ in sẵn số 01..24 ở lề trái. Số nhảy = chắc chắn thiếu dòng, và thiếu dòng
    là nguyên nhân gốc làm cả cột 残高 lệch — phải báo cho người dùng biết chứ
    không được lặng lẽ "tự sửa" bằng số suy ra.
    """
    prev = None
    for row in rows:
        cur = row.get("row_no")
        if cur is None:
            continue
        # Số thứ tự nhỏ đi = sang trang mới (01 lại từ đầu), không phải nhảy cóc
        if prev is not None and 1 < cur - prev:
            missing = cur - prev - 1
            note = f"行番号 {prev}→{cur}: {missing}行抜けの疑い"
            row["reason"] = "・".join(filter(None, [row.get("reason"), note]))
            row["status"] = "check"
        prev = cur


def _split_fused(balance: int | None) -> tuple[int | None, str | None]:
    """残高 dính liền mã 取扱店 3 chữ số (189 + 709 → 189709) → (189, "709")."""
    if balance is not None and balance >= 1000:
        return balance // 1000, f"{balance % 1000:03d}"
    return None, None


# Dấu đục đứng rời sau kana đầy đủ → ký tự tổ hợp, để NFC ghép vào chữ trước
_SPACING_DAKUTEN = str.maketrans({"゛": "゙", "゜": "゚"})
# Kana nửa chiều rộng: không có dạng ghép nửa rộng nên phải đổi cả cụm sang đầy đủ
_HALFWIDTH_KANA = re.compile(r"[｡-ﾟ]+")


def compose_dakuten(text: str | None) -> str | None:
    """Ghép dấu đục rời vào chữ trước: "ニシタ゛" → "ニシダ", "ﾆｼﾀﾞ" → "ニシダ".

    Sổ in katakana nửa chiều rộng, dấu đục là glyph riêng nên model hay chép
    thành 2 ký tự. Chỉ ghép dấu và mở rộng kana nửa rộng — GIỮ NGUYÊN cách viết
    CHỮ TO của sổ (フイ/シヤ không đổi thành ファ/シャ) và các ký hiệu khác
    (「（」 không đổi thành「(」).
    """
    if not text:
        return text
    text = _HALFWIDTH_KANA.sub(
        lambda m: unicodedata.normalize("NFKC", m.group()), text)
    return unicodedata.normalize("NFC", text.translate(_SPACING_DAKUTEN))


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
    for tx in transactions:
        for key in ("description", "kind", "extra_text"):
            tx[key] = compose_dakuten(tx.get(key))
    _normalize_te_codes(transactions)
    # Sổ không in cột 取扱店 thì 残高 không thể dính mã → tắt các nhánh tách,
    # nếu không 387,089 bị xé thành 387 + "089" (đã đo được ở sổ 福岡 trang 5-6)
    allow_fused = any(tx.get("store_code") for tx in transactions)
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
            cur2, cur_code = _split_fused(balance) if allow_fused else (None, None)
            # Chỉ sửa lùi dòng trước khi nó chưa bị nghi vấn gì khác
            prev2, prev_code = (None, None)
            if (allow_fused and prev_is_direct and prev_bal_row is not None
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

                # Ứng viên số dư dòng trước: (giá trị, dòng cần sửa, mã tách ra).
                # Mốc neo có thể CÒN dính mã 店番 mà chưa nhánh nào gỡ (sổ 徳島大正:
                # 4006003 = 4,006 + 003) — không thử ở đây thì cả trang lệch theo.
                prev_cands = []
                for pv, pref in ((prev_balance, None), (alt_prev, alt_prev_row)):
                    if pv is None:
                        continue
                    prev_cands.append((pv, pref, None))
                    fix_row = pref if pref is not None else (
                        prev_bal_row if prev_is_direct else None)
                    if allow_fused and pv >= 1000 and fix_row is not None:
                        prev_cands.append((pv // 1000, fix_row, f"{pv % 1000:03d}"))

                for pcand, pref, pcode in prev_cands:
                    if chain_verified:
                        break
                    for swap in (False, True):
                        if swap and not one_sided:
                            continue
                        derived = pcand + (-move if swap else move)
                        # 残高 dòng này cũng có thể đang dính mã
                        cur_fused = (allow_fused and balance >= 1000
                                     and derived == balance // 1000)
                        if (derived != balance and not cur_fused
                                and not _lookahead_ok(derived, following)):
                            continue
                        # Bằng chứng đủ mạnh → áp dụng bộ giả thuyết này
                        if pref is not None:
                            pref["balance"] = pcand
                            if pcode:
                                pref["store_code"] = pref.get("store_code") or pcode
                                _clear_mismatch(pref, "残高から取扱店を分離")
                            else:
                                _clear_mismatch(pref, "残高を検算で補正")
                        if swap:
                            row["amount_out"], row["amount_in"] = (
                                amount_in or None, amount_out or None)
                            amount_out, amount_in = amount_in, amount_out
                            move = -move
                            fixes.append("金額の列を入替")
                        if cur_fused:
                            row["store_code"] = (row.get("store_code")
                                                 or f"{balance % 1000:03d}")
                            fixes.append("残高から取扱店を分離")
                            row["balance"] = balance = derived
                        elif derived != balance:
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
