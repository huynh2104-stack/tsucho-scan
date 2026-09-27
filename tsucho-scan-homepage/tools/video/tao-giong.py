# -*- coding: utf-8 -*-
"""Tạo giọng đọc tiếng Nhật cho video giới thiệu bằng Gemini TTS, rồi tự soát.

Người viết script (Claude) không nghe được âm thanh, nên script soát bằng
những thứ ĐO được — tai người vẫn là người duyệt cuối:
  1. Độ dài: mỗi câu phải vừa chỗ trống của cảnh (bảng CANH trong HTML).
  2. Cách đọc: gửi các file vừa tạo cho một mô hình khác NGHE LẠI, chép ra
     hiragana, so với cách đọc đúng (trường "am" trong loi-doc.json). Đọc
     sai chữ (全行 thành ぜんこう) hay đọc to cả lời dặn giọng là lộ ngay.
  3. Độ to: chuẩn hoá mọi câu về cùng một mức LUFS.

Bài học khi làm (27/09/2026):
  - Lời dặn giọng viết kiểu "Say calmly: …" bị ĐỌC TO thành tiếng (câu 3 giây
    thành 23 giây). Phải dùng khung "DIRECTOR'S NOTES … #### TRANSCRIPT".
  - gemini-3.8-flash-tts không nhận system_instruction (lỗi 400).
  - Khoá đang ở gói miễn phí: TTS và mô hình nghe lại có hạn mức theo ngày.

Chạy (từ thư mục gốc repo):
    python tsucho-scan-homepage/tools/video/tao-giong.py                  # 10 câu, giọng Sulafat
    python tsucho-scan-homepage/tools/video/tao-giong.py --giong Charon   # giọng nam
    python tsucho-scan-homepage/tools/video/tao-giong.py --chi s4 s5      # làm lại vài câu
    python tsucho-scan-homepage/tools/video/tao-giong.py --chi-soat       # chỉ soát lại
Kết quả: am-thanh/<giọng>/s0.wav … s9.wav + bao-cao.json
"""
from __future__ import annotations

import argparse
import difflib
import json
import re
import sys
import time
from pathlib import Path

import numpy as np

DAY = Path(__file__).resolve().parent
sys.path.insert(0, str(DAY))
from am_thanh_chung import (  # noqa: E402
    SR, cat_lang, dinh_db, doc_am_thanh, doc_wav_bytes, doi_sr, ghi_wav, lufs, mo_vao_ra,
)

AM = DAY / "am-thanh"
HTML = DAY / "video-gioi-thieu.html"
ENV = DAY.parents[2] / ".env"

MO_HINH_DOC = "gemini-3.8-flash-tts"
MO_HINH_NGHE = ["gemini-3.8-flash", "gemini-3.5-flash"]  # mô hình đầu bận (503) thì dùng mô hình sau
LUFS_CAU = -20.0  # mọi câu cùng một độ to; cả video chuẩn hoá lần cuối ở quay-video.py

NHAC_TRO = """# AUDIO PROFILE: Japanese product narrator
## THE SCENE: A quiet studio recording for a business software introduction video. The listeners are Japanese company owners and accountants, many of them older.
### DIRECTOR'S NOTES
Style: calm, warm and trustworthy, like a considerate guide. Clear articulation. Natural standard Japanese (Tokyo) pitch accent.
Pacing: {nhip}
#### TRANSCRIPT
{cau}"""
NHIP = "relaxed and unhurried, with natural short pauses at commas and a slightly longer pause at each full stop."


def khoa_api() -> str:
    for dong in ENV.read_text(encoding="utf-8").splitlines():
        if dong.startswith("GEMINI_API_KEY="):
            return dong.split("=", 1)[1].strip().strip('"').strip("'")
    sys.exit(f"Không thấy GEMINI_API_KEY trong {ENV}")


def cho_trong() -> dict[str, float]:
    """Chỗ trống của mỗi câu = độ dài cảnh − độ trễ bắt đầu − 0,2 s đệm cuối."""
    canh = re.findall(r"\{ id: '(s\d)', a: ([\d.]+),\s+b: ([\d.]+)", HTML.read_text(encoding="utf-8"))
    return {i: float(b) - float(a) for i, a, b in canh}


def goi_lai(ham, lan: int = 6):
    """Gọi API, gặp 429 thì chờ đúng số giây máy chủ bảo rồi thử lại.

    Đừng đoán loại hạn mức từ chữ "PerDay" trong thông báo: lỗi theo PHÚT
    cũng liệt kê cả hạn mức ngày (lần đầu script dừng oan vì đoán như vậy).
    Chỉ bỏ cuộc khi "limit: 0" (mô hình không có ở gói miễn phí) hoặc thử
    đủ số lần mà vẫn bị chặn.
    """
    for k in range(lan):
        try:
            return ham()
        except Exception as e:  # noqa: BLE001 — SDK ném nhiều kiểu lỗi khác nhau
            thong_bao = str(e)
            if thong_bao.startswith(("503", "500")) and k < lan - 1:
                print(f"    {thong_bao[:3]} — máy chủ đang bận, chờ 20s rồi thử lại", flush=True)
                time.sleep(20)
                continue
            if "429" not in thong_bao:
                raise
            if "limit: 0" in thong_bao:
                sys.exit(f"Mô hình này không có trong gói miễn phí:\n{thong_bao[:300]}")
            if k == lan - 1:
                sys.exit(f"Vẫn bị chặn sau {lan} lần — có thể đã hết hạn mức ngày:\n{thong_bao[:600]}")
            m = re.search(r"retry in ([\d.]+)s", thong_bao)
            cho = float(m.group(1)) + 2 if m else 30
            loai = ", ".join(sorted(set(re.findall(r"'quotaId': '([^']+)'", thong_bao)))) or "?"
            print(f"    429 ({loai}) — chờ {cho:.0f}s rồi thử lại", flush=True)
            time.sleep(cho)


def doc_mot_cau(client, types, giong: str, cau: str, nhip: str) -> tuple[np.ndarray, int, int]:
    def goi():
        return client.models.generate_content(
            model=MO_HINH_DOC,
            contents=NHAC_TRO.format(nhip=nhip, cau=cau),
            config=types.GenerateContentConfig(
                response_modalities=["AUDIO"],
                speech_config=types.SpeechConfig(voice_config=types.VoiceConfig(
                    prebuilt_voice_config=types.PrebuiltVoiceConfig(voice_name=giong)))))
    r = goi_lai(goi)
    phan = r.candidates[0].content.parts[0].inline_data
    loai = phan.mime_type or ""
    if loai == "audio/wav":
        x, sr = doc_wav_bytes(phan.data)
    elif loai.startswith("audio/l16"):
        # PCM thô 16-bit little-endian (các mô hình 2.5/3.1): "audio/l16; rate=24000; channels=1"
        tham = dict(p.strip().split("=") for p in loai.split(";")[1:] if "=" in p)
        sr, kenh = int(tham.get("rate", 24000)), int(tham.get("channels", 1))
        x = np.frombuffer(phan.data, dtype="<i2").astype(np.float32).reshape(-1, kenh) / 32768
    else:
        sys.exit(f"Mô hình trả về {loai}, script chỉ xử lý audio/wav và audio/l16")
    return x, sr, r.usage_metadata.candidates_token_count or 0


def lam_sach(x: np.ndarray, sr: int) -> np.ndarray:
    """48 kHz, bỏ lặng hai đầu, mềm hai mép, đưa về LUFS_CAU."""
    x = mo_vao_ra(cat_lang(doi_sr(x, sr)))
    x = x * 10 ** ((LUFS_CAU - lufs(x)) / 20)
    if dinh_db(x) > -1.0:  # hiếm: câu có một tiếng bật quá to
        x = x * 10 ** ((-1.0 - dinh_db(x)) / 20)
    return x.astype(np.float32)


def hiragana(s: str) -> str:
    """Katakana → hiragana, bỏ mọi thứ không phải kana (dấu câu, khoảng trắng)."""
    s = "".join(chr(ord(c) - 0x60) if "ァ" <= c <= "ヶ" else c for c in s)
    return "".join(c for c in s if "ぁ" <= c <= "ゖ" or c == "ー")


def soat(client, types, thu_muc: Path, dong: list[dict]) -> list[dict]:
    """Một lần gọi cho cả loạt: mô hình nghe từng file, chép ra hiragana."""
    phan = []
    for d in dong:
        phan += [f"音声 {d['id']}:", types.Part.from_bytes(
            data=(thu_muc / f"{d['id']}.wav").read_bytes(), mime_type="audio/wav")]
    phan.append(
        "各音声を、聞こえたとおりに書き起こしてください。日本語はすべてひらがなで"
        "（漢字・カタカナ・数字・英字は使わない）。日本語以外の言葉が聞こえたらその言語のまま書く。"
        "推測で補わず、聞こえた音だけを書くこと。"
        "あわせて、日本語ネイティブとして不自然なアクセント・イントネーション・間があれば"
        "「chu_y」に短く書く（なければ空文字）。"
        'JSON: [{"id": "s0", "text": "...", "chu_y": "..."}]')
    for mo_hinh in MO_HINH_NGHE:
        try:
            r = goi_lai(lambda: client.models.generate_content(
                model=mo_hinh, contents=phan,
                config=types.GenerateContentConfig(response_mime_type="application/json")), lan=3)
            print(f"(nghe lại bằng {mo_hinh})")
            return json.loads(r.text)
        except Exception as e:  # noqa: BLE001
            print(f"    {mo_hinh} không dùng được: {str(e)[:120]}", flush=True)
    sys.exit("Không mô hình nào nghe lại được — thử lại sau.")


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    ap = argparse.ArgumentParser(description="Tạo và soát giọng đọc tiếng Nhật")
    ap.add_argument("--giong", default="Sulafat", help="tên giọng dựng sẵn của Gemini TTS")
    ap.add_argument("--chi", nargs="+", help="chỉ làm các câu này (vd s4 s5)")
    ap.add_argument("--chi-soat", action="store_true", help="không tạo mới, chỉ soát file đã có")
    a = ap.parse_args()

    from google import genai
    from google.genai import types

    client = genai.Client(api_key=khoa_api())
    dong = json.loads((AM / "loi-doc.json").read_text(encoding="utf-8"))
    chon = [d for d in dong if not a.chi or d["id"] in a.chi]
    thu_muc = AM / a.giong.lower()
    cho = cho_trong()

    if not a.chi_soat:
        tong_token = 0
        for d in chon:
            x, sr, token = doc_mot_cau(client, types, a.giong, d["doc"], d.get("nhip", NHIP))
            tong_token += token
            x = lam_sach(x, sr)
            ghi_wav(thu_muc / f"{d['id']}.wav", x)
            print(f"  {d['id']}: {len(x) / SR:5.2f}s  ({token} token)", flush=True)
        print(f"Đã tạo {len(chon)} câu — {tong_token} token âm thanh")

    ket_qua = soat(client, types, thu_muc, chon)
    nghe = {k["id"]: k for k in ket_qua}
    bao_cao, ok_het = [], True
    print(f"\n{'câu':4} {'dài':>6} {'chỗ':>6}  khớp  ghi chú")
    for d in chon:
        x = doc_am_thanh(thu_muc / f"{d['id']}.wav")
        dai = len(x) / SR
        con = cho[d["id"]] - d.get("tre", 0.4) - 0.2
        mong, duoc = hiragana(d["am"]), hiragana(nghe.get(d["id"], {}).get("text", ""))
        ty_le = difflib.SequenceMatcher(None, mong, duoc).ratio()
        lech = [f"{mong[i1:i2] or '∅'}→{duoc[j1:j2] or '∅'}"
                for op, i1, i2, j1, j2 in difflib.SequenceMatcher(None, mong, duoc).get_opcodes() if op != "equal"]
        vua = dai <= con
        ok_het &= vua and ty_le >= 0.97
        chu_y = nghe.get(d["id"], {}).get("chu_y", "")
        print(f"{d['id']:4} {dai:5.2f}s {con:5.2f}s  {ty_le:4.0%}  "
              f"{'' if vua else 'DÀI QUÁ  '}{' '.join(lech)}{'  | ' + chu_y if chu_y else ''}")
        bao_cao.append({"id": d["id"], "dai": round(dai, 2), "cho": round(con, 2), "khop": round(ty_le, 3),
                        "lech": lech, "nghe_duoc": duoc, "chu_y": chu_y, "lufs": round(lufs(x), 1)})
    (thu_muc / "bao-cao.json").write_text(json.dumps(bao_cao, ensure_ascii=False, indent=2), encoding="utf-8")
    print("\nTất cả đạt." if ok_het else "\nCó câu cần xem lại (dài quá hoặc nghe lại không khớp).")


if __name__ == "__main__":
    main()
