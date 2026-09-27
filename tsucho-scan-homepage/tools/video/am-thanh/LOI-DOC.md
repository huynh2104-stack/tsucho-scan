# Âm thanh video giới thiệu

Ba lớp tiếng, mỗi lớp một công cụ; chạy từ thư mục gốc repo. Khoá Gemini lấy
từ `.env`. Gói miễn phí đủ dùng (27/09/2026 làm cả bộ không tốn đồng nào),
nhưng mô hình giọng chỉ ~10 lần/ngày, reset 16:00 giờ Nhật.

| lớp | công cụ | ra file |
|---|---|---|
| giọng đọc | `tools/video/tao-giong.py` (Gemini `gemini-3.8-flash-tts`) | `am-thanh/<giọng>/s0…s9.wav` |
| nhạc nền | `tools/video/tao-nhac.py` (Lyria RealTime, phối theo cảnh) | `am-thanh/nhac.wav` |
| hiệu ứng | tự tổng hợp trong `tron_am_thanh.py`, đặt theo `window.HIEU_UNG` của video | — |

Ghép vào video (vài giây, không quay lại hình):

    python tsucho-scan-homepage/tools/video/quay-video.py --chi-tron
    python tsucho-scan-homepage/tools/video/quay-video.py --chi-tron --giong grok      # nghe thử giọng Grok
    python tsucho-scan-homepage/tools/video/quay-video.py --chi-tron --khong-hieu-ung  # bỏ tiếng gõ/dấu/click

## Lời đọc

Câu đọc, cách đọc đúng (hiragana, để tự soát) và độ trễ trong cảnh nằm ở
`loi-doc.json`. Sửa câu ở đó rồi:

    python tsucho-scan-homepage/tools/video/tao-giong.py --chi s3      # làm lại một câu
    python tsucho-scan-homepage/tools/video/tao-giong.py --chi-soat    # chỉ soát lại

`tao-giong.py` tự soát sau khi tạo: câu có vừa cảnh không, và một mô hình
khác NGHE LẠI rồi chép ra hiragana để so với cách đọc đúng. Bảng soát lưu ở
`<giọng>/bao-cao.json`. Máy nghe lại cũng có lúc nghe nhầm (m/n, âm lặp
"とと") — chỗ nào nó báo, tai người nghe lại chỗ đó.

Muốn đổi giọng: `--giong Charon` (nam) v.v. Câu dài hơn cảnh thì nới cảnh
trong bảng `CANH` của `video-gioi-thieu.html` rồi quay lại hình (~3 phút).

## Chữ dễ đọc sai

通帳（つうちょう）・明細（めいさい）・検算（けんざん）・残高（ざんだか）・
全行（ぜんぎょう）・一行（いちぎょう）・行（ぎょう）・支払（しはらい）・
預り（あずかり）・四隅（よすみ）・箇所（かしょ）・見本（みほん）・
100%とは（ひゃくパーセント**と**とは）・PDF・CSV・Excel

Máy đọc sai chữ nào thì viết chữ đó bằng hiragana trong trường `doc`
(chỉ đổi cái gửi cho máy đọc, chữ trên màn hình giữ nguyên).
