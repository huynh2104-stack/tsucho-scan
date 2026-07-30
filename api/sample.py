"""Sổ mẫu giả lập — chạy hết luồng mà KHÔNG gọi model, nên $0.

Mục đích: giám đốc Nhật (hoặc bất kỳ ai) bấm thử được toàn bộ ứng dụng — xem
ảnh, chỉnh ảnh, soát kết quả, sửa ô, xuất Excel — mà không tốn một lượt gọi API
nào và không cần đưa sổ thật lên.

Dữ liệu là GIẢ LẬP, ảnh in rõ chữ「サンプル / DỮ LIỆU MẪU」để không ai nhầm với
sổ thật. Nhưng kết quả thì chạy qua ĐÚNG `validate_transactions` của engine —
nên chuỗi số dư, ô vàng, ô tự sửa đều là hành vi thật, không phải dựng cảnh.
"""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

from validate import validate_transactions

from . import results, workspace

# Font có glyph tiếng Nhật. Không có thì rơi về font mặc định (mất chữ Nhật
# nhưng vẫn chạy được — đây chỉ là dữ liệu demo).
_FONT_CANDIDATES = [
    r"C:\Windows\Fonts\YuGothM.ttc",
    r"C:\Windows\Fonts\meiryo.ttc",
    r"C:\Windows\Fonts\msgothic.ttc",
    "/System/Library/Fonts/ヒラギノ角ゴシック W3.ttc",
    "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
]

W, H = 1400, 1000
MARGIN = 48
ROW_H = 42
HEADER_Y = 150

# (年月日, 区分, 摘要, 出金, 入金, 残高)
_SHEET_A = [
    ("07-04-11", "R", "繰越",              None,    None,     22_061, True),
    ("07-04-11", "R", "SS手数料",          1_100,   None,     20_961, False),
    ("07-04-11", "R", "手数料",              2_750,   None,     18_211, False),
    ("07-04-15", "K", "ヨキンキ",            None,    2_090_000, 2_108_211, False),
    ("07-04-15", "R", "フリコミ8",           1_109_900, None,   998_311, False),
    ("07-04-15", "R", "フリコミテスクリヨウ",   550,     None,     997_761, False),
    ("07-04-15", "K", "ヨキンキ",            None,    4_000,    1_001_761, False),
    ("07-04-17", "L", "振込1",              None,    41_800,   1_043_561, False),
    ("07-04-21", "L", "振込1",              None,    21_620,   1_065_181, False),
    ("07-04-21", "Q", "振込1",              98_632,  None,     966_549, False),
    ("07-04-21", "R", "フリコミ8 カ）ナルトキコウ?", 119_195, None,  847_354, False),
    ("07-04-21", "R", "カード",              200_000, None,     647_354, False),
]

# Mặt thứ hai CỐ Ý in sai vài chỗ để người thử thấy engine kiểm tra kép làm việc.
# Đã thử nhiều cách để tạo ra một dòng VÀNG (cần soát) trong sổ mẫu nhưng engine
# tự sửa được hết — nên mẫu chỉ hiện ô XANH "đã tự sửa". Ô vàng xuất hiện khi quét
# sổ thật (đo được: bộ p5-6 có 1 dòng vàng).
_SHEET_B = [
    ("07-05-02", "R", "繰越",              None,   None,    647_354, True),
    ("07-05-02", "R", "デンキリヨウキン",      12_340, None,   635_014, False),
    ("07-05-07", "K", "ヨキンキ",            None,   58_300,  693_314, False),
    ("07-05-10", "R", "フリコミ8 カ）ヨシデンコウ", 26_500, None, 666_814, False),
    # Số dư in sai 4 đồng ⇒ engine TỰ SỬA được, hiện ô xanh "đã tự sửa".
    ("07-05-15", "L", "振込1",              None,   240_000, 906_810, False),
    ("07-05-20", "R", "証貸 5月",            155_000, None,   751_814, False),
    # Ngày mờ không đọc được ⇒ engine KHÔNG suy ra được, phải tô vàng nhờ người
    # soát. Đây là ca hay gặp thật (dòng phí thường không in ngày).
    ("",         "R", "手数料",              550,    None,    751_264, False),
    ("07-05-31", "K", "利息",               None,   211,     751_475, False),
]


def _font(size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    for path in _FONT_CANDIDATES:
        if Path(path).is_file():
            try:
                return ImageFont.truetype(path, size)
            except OSError:
                continue
    return ImageFont.load_default()


def _yen(v: int | None) -> str:
    return "" if v is None else f"{v:,}"


def _draw_sheet(title: str, rows: list[tuple]) -> Image.Image:
    img = Image.new("RGB", (W, H), (252, 250, 244))
    d = ImageDraw.Draw(img)
    f_title, f_head, f_body, f_stamp = _font(26), _font(19), _font(21), _font(34)

    d.text((MARGIN, 40), title, fill=(38, 62, 78), font=f_title)
    d.text((MARGIN, 78), "普通預金 / SAMPLE — 実在の口座ではありません",
           fill=(120, 130, 130), font=f_head)

    # Dấu ĐÂY LÀ MẪU — in mờ, chéo, để không ai nhầm là sổ thật
    d.text((W - 430, 46), "サンプル / DỮ LIỆU MẪU", fill=(206, 150, 150), font=f_stamp)

    cols = [
        ("年月日", MARGIN, "l"),
        ("区分", MARGIN + 170, "l"),
        ("摘要", MARGIN + 250, "l"),
        ("お支払金額", MARGIN + 760, "r"),
        ("お預り金額", MARGIN + 980, "r"),
        ("差引残高", MARGIN + 1220, "r"),
    ]
    for label, x, align in cols:
        w = d.textlength(label, font=f_head)
        d.text((x - w if align == "r" else x, HEADER_Y - 30), label,
               fill=(38, 62, 78), font=f_head)
    d.line((MARGIN, HEADER_Y - 4, W - MARGIN, HEADER_Y - 4), fill=(120, 140, 145), width=2)

    for i, (date, kind, desc, out_, in_, bal, _note) in enumerate(rows):
        y = HEADER_Y + 8 + i * ROW_H
        d.line((MARGIN, y + ROW_H - 6, W - MARGIN, y + ROW_H - 6),
               fill=(205, 212, 210), width=1)
        d.text((MARGIN, y), date, fill=(30, 52, 66), font=f_body)
        d.text((MARGIN + 170, y), kind, fill=(30, 52, 66), font=f_body)
        d.text((MARGIN + 250, y), desc.rstrip("?"), fill=(30, 52, 66), font=f_body)
        for val, x in ((out_, MARGIN + 760), (in_, MARGIN + 980), (bal, MARGIN + 1220)):
            s = _yen(val)
            if s:
                d.text((x - d.textlength(s, font=f_body), y), s,
                       fill=(30, 52, 66), font=f_body)
    return img


def _to_tx(rows: list[tuple]) -> list[dict]:
    """Đổi sang đúng dạng schema mà extract.py trả ra, rồi cho engine kiểm tra."""
    out = []
    for n, (date, kind, desc, out_, in_, bal, note) in enumerate(rows, 1):
        out.append({
            "n": f"{n:02d}",
            "date_raw": date,
            "kind": kind,
            "description": desc.rstrip("?"),
            "extra_text": None,
            "store_code": None,
            "amount_out": out_,
            "amount_in": in_,
            "balance": bal,
            # "low" = model tự nhận là đọc không rõ. Engine KHÔNG tự sửa được
            # cái này (nó không biết chữ đúng là gì) nên dòng bị tô vàng.
            "confidence": "low" if desc.endswith("?") else "high",
            "is_note": note,
        })
    return out


_SAMPLES = [
    ("見本銀行 サンプル通帳 ①", _SHEET_A, "西日本シティ銀行（見本）", "123456"),
    ("見本銀行 サンプル通帳 ②", _SHEET_B, "西日本シティ銀行（見本）", "123456"),
]


def add_to(ws: workspace.Workspace) -> list[str]:
    """Thêm các mặt sổ mẫu + kết quả dựng sẵn. Không gọi model, không tốn phí."""
    added: list[str] = []
    for i, (title, rows, bank, account) in enumerate(_SAMPLES, 1):
        img = _draw_sheet(title, rows)
        sheet = workspace.Sheet(
            id=workspace.uuid.uuid4().hex[:10],
            name=workspace._unique_name(ws, f"サンプル通帳 {i}", None),
            origin="sample.png",
            source_ext=".png",
        )
        workspace._write_sheet_images(ws, sheet, img)
        img.save(sheet.dir(ws.id) / "source.png")
        sheet.sha256 = workspace._hash_current(ws, sheet)
        sheet.scanned = True
        ws.sheets.append(sheet)
        added.append(sheet.id)

        # Chạy qua ĐÚNG engine kiểm tra kép — ô vàng / tự sửa là hành vi thật
        txs = validate_transactions(_to_tx(rows))
        for tx in txs:
            tx["sheet_id"] = sheet.id
        results.save_job(
            ws.id,
            [sheet.id],
            {
                "model": "sample (không gọi API)",
                "cached": True,
                "cost_usd": 0.0,
                "accounts": [{
                    "bank_name": bank,
                    "store_no": "000",
                    "account_no": account,
                    "holder": "サンプル 太郎",
                    "transactions": txs,
                }],
            },
            job_id="sample",
        )

    workspace.mark_duplicates(ws)
    ws.save()
    return added
