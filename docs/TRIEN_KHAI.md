# Đưa app lên mạng để giám đốc Nhật tự dùng

> Viết cho người **chưa từng deploy bao giờ**. Làm theo đúng thứ tự.
> Thời gian: khoảng 40 phút. Chi phí: **$7/tháng**.

---

## Trước khi bắt đầu: hiểu app gồm những gì

App có **hai nửa**, nhưng đã được gộp thành **một dịch vụ duy nhất**:

- **Trang web** (thứ giám đốc nhìn thấy) — được "nướng" thành file tĩnh khi build.
- **Máy chủ** (Python) — vừa chạy logic đọc sổ, vừa phục vụ luôn trang web ở trên.

⇒ Chỉ deploy **một** chỗ, giám đốc nhận **một** đường link. Không phải cấu hình
CORS hay cookie chéo tên miền gì cả.

App lưu dữ liệu bằng **file trên đĩa** (ảnh sổ, kết quả, tài khoản) trong thư
mục `.data`. Nên chỗ nào chạy app cũng **phải có ổ đĩa lưu trữ bền** — nếu không,
mỗi lần cập nhật app là mất sạch.

---

## Bước 0 — Hai việc bắt buộc (làm trước, đừng bỏ qua)

### (a) Bật trả phí cho Gemini

Bậc miễn phí chỉ **20 lượt/ngày**. Giám đốc quét một file PDF 24 trang là hết
sạch, rồi app báo lỗi và ông ấy tưởng sản phẩm hỏng.

1. Vào https://aistudio.google.com/apikey
2. Chọn dự án → **Set up Billing** → gắn thẻ.

Chi phí thật đã đo: **~$0.004/trang**. 200 trang/tháng ≈ **$0.80**.

### (b) Chuẩn bị câu trả lời về dữ liệu

Đây là **số tài khoản ngân hàng thật của doanh nghiệp Nhật**. Bậc miễn phí AI
Studio thường **dùng dữ liệu để cải thiện sản phẩm** — bật trả phí ở bước (a)
là để tránh điều đó.

Giám đốc gần như chắc chắn sẽ hỏi「私のデータはどこへ行きますか？」. Câu trả lời
trung thực:

> 通帳の画像は当社のサーバー（〇〇）に保存され、読み取りのために Google Gemini API
> （有料プラン・学習に使用されない）へ送信されます。アカウントごとにデータは分離
> されており、他の利用者からは見えません。

---

## Bước 1 — Đưa code lên GitHub (10 phút)

Nơi chạy app sẽ lấy code từ GitHub. Nếu code đã ở GitHub rồi thì bỏ qua bước này.

```bash
gh repo create tsucho-scan --private --source . --push
```

Chưa có công cụ `gh` thì tạo repo **Private** thủ công trên github.com rồi:

```bash
git remote add origin https://github.com/<tên-của-anh>/tsucho-scan.git
git push -u origin master
```

> ⚠ Phải là **Private**. Repo có `prompts/` và cấu hình; và tuyệt đối đừng bao
> giờ commit file `.env` (đã được `.gitignore` chặn sẵn).

---

## Bước 2 — Tạo dịch vụ trên Render (15 phút)

Render là nơi chạy app. Em chọn Render vì nó có **ổ đĩa lưu trữ bền** với giá rẻ
và giao diện dễ hiểu nhất cho người mới.

1. Vào https://render.com → **Get Started** → đăng nhập bằng GitHub.
2. Bấm **New +** → **Web Service**.
3. Chọn repo `tsucho-scan` vừa đẩy lên.
4. Điền:

   | Ô | Điền gì |
   |---|---|
   | Name | `tsucho-scan` (tên này thành địa chỉ web) |
   | Language | **Docker** |
   | Instance Type | **Starter — $7/month** |

   > Đừng chọn Free: bản Free **không có ổ đĩa lưu trữ**, và tự ngủ sau 15 phút
   > không ai dùng — giám đốc mở link sẽ phải chờ ~1 phút màn hình trắng.

5. Kéo xuống **Environment Variables**, bấm **Add Environment Variable** 5 lần:

   | Key | Value | Để làm gì |
   |---|---|---|
   | `GEMINI_API_KEY` | dán API key của anh | |
   | `EXTRACT_MODEL` | `gemini-3.1-flash-lite` | |
   | `PYTHONUNBUFFERED` | `1` | |
   | `TSUCHO_COOKIE_SECURE` | `1` | Cookie phiên chỉ đi qua HTTPS |
   | `TSUCHO_TRUST_PROXY` | `1` | **Bắt buộc trên Render** — xem bên dưới |

   > ⚠ `TSUCHO_TRUST_PROXY` liên quan đến chức năng khoá khi gõ sai mật khẩu
   > nhiều lần. App đếm số lần sai theo địa chỉ IP; nhưng trên Render mọi lượt
   > truy cập đều đi qua máy trung gian, nên nếu không bật biến này thì **cả
   > thế giới bị đếm chung một IP** — một người gõ sai nhiều là mọi người khác
   > bị khoá theo. Bật biến này thì app đọc IP thật từ header của Render.
   >
   > Ngược lại, chạy ở máy nhà **đừng bật** — lúc đó header ấy do trình duyệt
   > gửi nên giả được, kẻ dò mật khẩu chỉ cần đổi header là thoát khoá.

6. Bấm **Create Web Service**. Render bắt đầu build (~5–10 phút lần đầu).

---

## Bước 3 — Gắn ổ đĩa lưu trữ (5 phút) — **QUAN TRỌNG NHẤT**

Chưa làm bước này thì **mỗi lần cập nhật app là mất sạch** ảnh, tài khoản và
kết quả của giám đốc.

1. Trong dịch vụ vừa tạo → tab **Disks** (menu trái) → **Add Disk**.
2. Điền:

   | Ô | Điền gì |
   |---|---|
   | Name | `data` |
   | Mount Path | `/app/.data` |
   | Size | `5` GB |

3. **Save**. Render sẽ khởi động lại dịch vụ.

Đường dẫn `/app/.data` phải **đúng từng ký tự**. Sai chỗ này là mất dữ liệu mà
không có thông báo lỗi nào.

---

## Bước 4 — Kiểm tra trước khi gửi link (5 phút)

Render cho anh địa chỉ dạng `https://tsucho-scan.onrender.com`.

Tự làm đủ 6 việc này **trước khi** gửi cho giám đốc:

1. Mở link → phải thấy màn hình đăng nhập.
2. Bấm「Chưa có tài khoản? Đăng ký」→ tạo tài khoản **của anh** trước.
   → Người đăng ký **đầu tiên** thành admin.
3. Bấm **✨ Thử với sổ mẫu** → phải hiện bảng có dữ liệu (bước này **không tốn tiền**).
4. Tải lên một ảnh sổ thật → bấm **Quét** → xem kết quả có ra không.
5. Bấm **Xuất file** → mở file Excel xem có mở được không.
6. **Thử lại sau khi Render restart**: vào tab **Manual Deploy** → **Restart
   service** → đợi rồi mở lại link. **Dữ liệu phải còn nguyên.** Nếu mất thì
   bước 3 (ổ đĩa) đã sai — sửa xong mới gửi cho giám đốc.

---

## Bước 5 — Gửi cho giám đốc

Gửi ông ấy link + đoạn nhắn tiếng Nhật này:

```
通帳スキャンのデモです。
https://tsucho-scan.onrender.com

1.「新規登録」からメールアドレスとパスワードでアカウントを作成してください
2. 右上の「日本語」を押すと日本語表示になります
3. まず「サンプル通帳で試す」で動作をご確認ください
4. 実際の通帳は、画像をドラッグ＆ドロップ →「スキャン」

※ 斜めから撮影した画像は「台形補正」で4つの角をページに合わせると
　 精度が上がります。
※ 黄色いセルは自動チェックで疑わしいと判定した箇所です。
　 画像と見比べて直接修正できます。
```

**Nói trước cho đúng sự thật, đừng hứa 100%:**

> 機械が速く読み、怪しい行だけを黄色で指し示し、人が30秒で直す。

Số tiền và số dư đạt 93–100%, nhưng **tên đối tác katakana chỉ 60–95%**. Giá
trị của tool là chỉ đúng chỗ cần soát, không phải đọc đúng tuyệt đối. Nói trước
thì đó là tính năng; giấu đi rồi bị phát hiện thì đó là lỗi.

---

## Còn thiếu gì trước khi dùng thật (không chỉ demo)

| Việc | Vì sao |
|---|---|
| **Chặn tự do đăng ký** | Hiện ai có link cũng tạo được tài khoản. Demo thì tiện, nhưng dùng thật nên chỉ cho phép email đã mời. |
| **Quên mật khẩu** | Chưa có. Giám đốc quên là phải nhờ anh xoá tài khoản trong CSDL. Đây cũng là lý do khoá đăng nhập sai chỉ kéo dài 15 phút rồi tự mở. |
| **Sao lưu định kỳ** | Ổ đĩa Render không tự backup. Dữ liệu tài chính nên có bản sao. |
| **Nhật ký (ai quét file nào, lúc nào)** | Dữ liệu tài chính nên có vết. |
| **Xoá dữ liệu tự động sau N ngày** | Ảnh sổ ngân hàng không nên nằm mãi trên máy chủ. |

---

## Nếu có trục trặc

| Hiện tượng | Nguyên nhân thường gặp |
|---|---|
| Build đỏ ở Render | Mở tab **Logs**, kéo xuống dòng `ERROR`. Hay gặp: quên `GEMINI_API_KEY`. |
| Mở link ra trang trắng | Đợi thêm — lần deploy đầu mất ~10 phút. |
| Đăng nhập xong bị đá ra ngay | Cookie không lưu được. Kiểm tra link có **https** không (Render tự có sẵn). |
| Quét báo lỗi hạn mức | Chưa bật trả phí ở Bước 0(a). |
| Báo「sai quá nhiều lần」dù gõ đúng | Đã gõ sai 5 lần trong 15 phút. Đợi 15 phút là tự mở, không phải sửa gì. Nếu nhiều người cùng bị thì thiếu `TSUCHO_TRUST_PROXY=1` (Bước 2). |
| Mất hết dữ liệu sau khi cập nhật | Ổ đĩa chưa gắn, hoặc Mount Path không phải `/app/.data`. |

---

## Cập nhật app về sau

Sửa code trên máy → `git push` → Render **tự build và cập nhật**. Dữ liệu của
giám đốc không bị ảnh hưởng vì nằm trên ổ đĩa riêng.
