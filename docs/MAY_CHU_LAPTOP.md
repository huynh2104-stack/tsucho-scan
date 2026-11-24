# Chạy tsucho-scan trên laptop phụ làm máy chủ (bản demo)

> Viết cho người **không rành kỹ thuật**. Làm một lần ~45 phút, sau đó máy tự chạy.
> Chi phí: **$0** (điện của laptop + tiền Gemini như trước).
> Phù hợp cho **demo**. Khi có khách dùng thật thì nên chuyển sang máy chủ thuê (xem cuối trang).

---

## Kết quả sau khi làm xong

- Laptop phụ chạy app **24/24**, khách mở một đường link cố định dạng `https://ten-may.ten-mang.ts.net`.
- **Tự hồi phục**, không ai phải làm gì:

  | Chuyện xảy ra | Máy tự làm gì |
  |---|---|
  | Wi-Fi/mạng rớt rồi có lại | Đường hầm Tailscale tự nối lại (thường trong 1–2 phút) |
  | App bị lỗi, tự tắt | Bật lại sau 5 giây |
  | App treo, không trả lời | Sau 90 giây tự tắt hẳn và bật lại |
  | Windows Update khởi động lại máy | App tự chạy khi máy lên, không cần đăng nhập |
  | Mất điện ngắn | Laptop còn pin nên vẫn chạy (nhớ cắm sạc lại) |

- Dữ liệu được **sao lưu mỗi đêm** lúc 3 giờ sáng, giữ 14 bản gần nhất.

**Máy KHÔNG tự hồi phục khi:** laptop bị tắt hẳn (hết pin, bấm nút nguồn) — bật lại là app tự chạy.

---

## Cần chuẩn bị

1. **Laptop phụ** chạy Windows 10 hoặc 11, **RAM 4 GB trở lên** (8 GB càng tốt), ổ C trống ≥ 5 GB.
   - RAM dưới 4 GB vẫn chạy được, nhưng script tự tắt bộ đọc chữ cục bộ → khung đỏ chỉ là nét đứt ước lượng.
2. **Cắm sạc liên tục**, đặt ở chỗ thoáng (chạy lâu ngày sẽ nóng).
3. Một tài khoản **Google hoặc Microsoft** để đăng nhập Tailscale (miễn phí).
4. Khoá **GEMINI_API_KEY** (lấy ở https://aistudio.google.com/apikey).
5. **Code mới phải có trên GitHub** (nhánh `web-app-giai-doan-2`). Laptop tải code từ đó.
   Nếu bản trên máy chính chưa đưa lên GitHub thì nhờ Claude «commit và push» trước.

---

## Bước 1 — Cài (làm MỘT lần trên laptop phụ)

1. Bấm nút **Start**, gõ `PowerShell`, bấm chuột phải vào **Windows PowerShell** → **Run as administrator** → **Yes**.
2. Dán nguyên khối dưới đây vào cửa sổ xanh rồi bấm **Enter**:

   ```powershell
   New-Item -ItemType Directory -Force C:\TsuchoScan-cai-dat | Out-Null
   Invoke-WebRequest -UseBasicParsing https://raw.githubusercontent.com/huynh2104-stack/tsucho-scan/web-app-giai-doan-2/tools/may-chu-laptop/1-cai-dat.ps1 -OutFile C:\TsuchoScan-cai-dat\1-cai-dat.ps1
   Set-ExecutionPolicy -Scope Process Bypass -Force; & C:\TsuchoScan-cai-dat\1-cai-dat.ps1
   ```

3. Script chạy 8 bước, mỗi bước hiện dòng xanh `✓` khi xong. Có 2 chỗ nó **hỏi anh**:
   - **Bước 5:** dán khoá Gemini → Enter. Chữ **không hiện ra** khi dán, đó là bình thường (để người đứng cạnh không nhìn thấy).
   - **Bước 8:** trình duyệt mở trang **Tailscale** → đăng nhập bằng Google/Microsoft. Nếu nó hỏi bật **HTTPS** hoặc **Funnel** → bấm đồng ý. Xong quay lại cửa sổ PowerShell.
4. Cuối cùng script in dòng `https://….ts.net` — **đó là đường link gửi cho khách**.

Nếu script dừng giữa chừng với chữ đỏ `DỪNG: …`: làm theo câu đó rồi **chạy lại đúng lệnh ở mục 2**. Script tự bỏ qua những bước đã xong.

### Một việc làm tay trên trang Tailscale (2 phút, để link không tự hết hạn sau 6 tháng)

1. Mở https://login.tailscale.com/admin/machines
2. Ở dòng tên laptop phụ, bấm **⋯** → **Disable key expiry**.

---

## Bước 2 — Thử

1. Trên **điện thoại** (tắt Wi-Fi, dùng 4G để chắc là từ ngoài vào), mở đường link `https://….ts.net`.
2. Đăng nhập, bấm **サンプル通帳で試す** (thử sổ mẫu) → quét → bấm một dòng → thấy khung đỏ trên ảnh.
3. Thử «mất mạng»: rút Wi-Fi laptop 1 phút rồi cắm lại → chờ 2 phút → link vẫn mở được.

---

## Dùng hằng ngày

Các file nằm ở `C:\TsuchoScan\app\tools\may-chu-laptop\`. Mở PowerShell **Run as administrator**, chạy:

| Muốn | Lệnh |
|---|---|
| Xem máy chủ có ổn không | `& C:\TsuchoScan\app\tools\may-chu-laptop\2-kiem-tra.ps1` |
| Khởi động lại app | `& C:\TsuchoScan\app\tools\may-chu-laptop\3-khoi-dong-lai.ps1` |
| Cập nhật lên bản mới trên GitHub | `& C:\TsuchoScan\app\tools\may-chu-laptop\4-cap-nhat.ps1` |

(Lần đầu mở cửa sổ mới thì dán trước dòng `Set-ExecutionPolicy -Scope Process Bypass -Force`.)

`2-kiem-tra.ps1` in một bảng `✓`/`✗`: tác vụ chạy chưa, app trả lời chưa, đường link từ internet vào được chưa,
RAM/ổ đĩa, có đang cắm sạc không, bản sao lưu gần nhất, và 10 dòng nhật ký.

`4-cap-nhat.ps1` sao lưu dữ liệu **trước**, và nếu bản mới dựng lỗi thì tự trả về bản cũ — app không bị gián đoạn.

### Nơi để các thứ

| Thư mục | Chứa gì |
|---|---|
| `C:\TsuchoScan\app` | Code (tải từ GitHub) |
| `C:\TsuchoScan\data` | **Dữ liệu**: tài khoản, ảnh sổ, kết quả. Đừng xoá. |
| `C:\TsuchoScan\backup` | Bản sao lưu mỗi đêm (file `.zip`). Thỉnh thoảng chép sang USB. |
| `C:\TsuchoScan\logs` | Nhật ký (tự xoay vòng, không đầy ổ) |
| `C:\TsuchoScan\config.env` | Khoá Gemini + cài đặt. Chỉ quản trị viên mở được. Sửa xong chạy `3-khoi-dong-lai.ps1`. |

---

## Gỡ bỏ (nếu không dùng nữa)

PowerShell **Run as administrator**:

```powershell
Unregister-ScheduledTask -TaskName TsuchoScan-MayChu -Confirm:$false
Unregister-ScheduledTask -TaskName TsuchoScan-SaoLuu -Confirm:$false
& "C:\Program Files\Tailscale\tailscale.exe" funnel reset
```

Rồi xoá thư mục `C:\TsuchoScan` (sau khi đã chép `backup` ra nếu cần giữ dữ liệu).

---

## An toàn — đã tính tới

- App chỉ nghe ở `127.0.0.1`: người cùng mạng Wi-Fi **không** gõ thẳng vào được; chỉ đi qua đường hầm Tailscale (có HTTPS).
- **Không mở cổng modem**, không lộ địa chỉ IP nhà.
- Khoá Gemini nằm trong `config.env`, chỉ tài khoản quản trị và hệ thống đọc được.
- Cookie đăng nhập có cờ `Secure` (chỉ gửi qua HTTPS).

## Giới hạn cần biết (nói thật với khách)

- Đây là **laptop cá nhân**, không phải trung tâm dữ liệu: mất điện lâu, hỏng ổ đĩa, hay laptop bị tắt là app ngừng.
- **Dữ liệu sổ ngân hàng nằm trên laptop của người phát triển.** Với demo dùng sổ mẫu thì không sao; với sổ thật của khách thì phải nói rõ điều này. Câu trả lời trung thực khi khách hỏi「データはどこに保存されますか？」:
  > デモ版のため、通帳の画像と読み取り結果は開発者が管理するパソコン（サーバー）に保存されます。読み取りには Google Gemini API（有料プラン：学習に使われません）を使用します。本番運用ではクラウドのサーバーに移行します。
- Tailscale Funnel đang ở dạng **beta** và có giới hạn băng thông (không công bố con số) — đủ cho demo vài người, không phải cho hàng trăm người cùng lúc.
- Đăng nhập thử sai nhiều lần bị khoá **theo địa chỉ IP**; qua đường hầm mọi người đều hiện cùng một IP (`127.0.0.1`), nên một người đoán sai mật khẩu nhiều lần có thể làm người khác tạm bị khoá. Chấp nhận được cho demo.

## Khi có khách dùng thật

Chuyển sang máy chủ thuê có ≥ 2 GB RAM (Render Standard ~$25/tháng, hoặc VPS ở Nhật ~1.600円/tháng). Toàn bộ dữ liệu
nằm gọn trong `C:\TsuchoScan\data` nên chuyển sang máy mới chỉ là chép thư mục này.
