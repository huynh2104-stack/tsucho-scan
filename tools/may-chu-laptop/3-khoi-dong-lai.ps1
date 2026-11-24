# Khởi động lại máy chủ (sau khi sửa config.env, hoặc khi thấy app lạ). Chạy bằng «Run as administrator».
param([string]$Root = "C:\TsuchoScan", [int]$Port = 8000)
[Console]::OutputEncoding = [Text.Encoding]::UTF8
Stop-ScheduledTask -TaskName "TsuchoScan-MayChu" -ErrorAction SilentlyContinue
# Tắt tác vụ chỉ dừng script giám sát; máy chủ con của nó có thể còn giữ cổng → tắt nốt
$c = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if ($c) { & taskkill.exe /PID $c.OwningProcess /T /F | Out-Null }
Start-Sleep 2
Start-ScheduledTask -TaskName "TsuchoScan-MayChu"
Write-Host "Đang khởi động lại…"
for ($i = 0; $i -lt 60; $i++) {
    Start-Sleep 3
    try { if ((Invoke-WebRequest -UseBasicParsing -TimeoutSec 5 "http://127.0.0.1:$Port/api/health").StatusCode -eq 200) { Write-Host "✓ Máy chủ đã chạy lại" -ForegroundColor Green; exit 0 } } catch {}
}
Write-Host "✗ Chưa lên sau 3 phút — xem $Root\logs\may-chu-loi.log" -ForegroundColor Red
exit 1
