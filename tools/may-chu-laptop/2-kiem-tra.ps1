# Xem nhanh máy chủ có ổn không. Chạy được bằng PowerShell thường (không cần quản trị) — nhưng muốn đọc
# nhật ký lỗi đầy đủ thì mở bằng «Run as administrator».

param([string]$Root = "C:\TsuchoScan", [int]$Port = 8000, [string]$PublicUrl = "https://app.tsucho-scan.com")
[Console]::OutputEncoding = [Text.Encoding]::UTF8
function Dong([string]$ten, [bool]$ok, [string]$chu) {
    $mau = if ($ok) { "Green" } else { "Red" }
    $dau = if ($ok) { "✓" } else { "✗" }
    Write-Host ("  {0} {1,-22} {2}" -f $dau, $ten, $chu) -ForegroundColor $mau
}

Write-Host "Tình trạng máy chủ tsucho-scan — $(Get-Date -Format 'yyyy-MM-dd HH:mm')" -ForegroundColor Cyan
$task = Get-ScheduledTask -TaskName "TsuchoScan-MayChu" -ErrorAction SilentlyContinue
Dong "Tác vụ giám sát" ($task -and $task.State -eq "Running") $(if ($task) { "$($task.State)" } else { "chưa cài — chạy 1-cai-dat.ps1" })

$alive = $false
try { $alive = (Invoke-WebRequest -UseBasicParsing -TimeoutSec 10 "http://127.0.0.1:$Port/api/health").StatusCode -eq 200 } catch {}
Dong "Máy chủ trả lời" $alive $(if ($alive) { "http://127.0.0.1:$Port" } else { "không trả lời — xem nhật ký bên dưới" })

$cf = Get-Service -Name "Cloudflared" -ErrorAction SilentlyContinue
Dong "Đường hầm Cloudflare" ($cf -and $cf.Status -eq "Running") $(if ($cf) { "$($cf.Status)" } else { "chưa cài — xem docs/MAY_CHU_LAPTOP.md" })
$pub = $false
try { $pub = (Invoke-WebRequest -UseBasicParsing -TimeoutSec 20 "$PublicUrl/api/health").StatusCode -eq 200 } catch {}
Dong "Từ internet vào được" $pub $(if ($pub) { $PublicUrl } else { "chưa — mạng vừa rớt thì chờ 1–2 phút, cloudflared tự nối lại" })

$os = Get-CimInstance Win32_OperatingSystem
$freeRam = [math]::Round($os.FreePhysicalMemory / 1MB, 1)
$freeDisk = [math]::Round((Get-PSDrive C).Free / 1GB, 1)
Dong "RAM còn trống" ($freeRam -gt 0.5) "$freeRam GB"
Dong "Ổ C còn trống" ($freeDisk -gt 3) "$freeDisk GB"
$power = (Get-CimInstance -Namespace root\wmi -ClassName BatteryStatus -ErrorAction SilentlyContinue | Select-Object -First 1).PowerOnline
if ($null -ne $power) { Dong "Đang cắm sạc" ([bool]$power) $(if ($power) { "có" } else { "KHÔNG — cắm sạc, chạy pin máy sẽ ngủ" }) }

$bk = Get-ChildItem (Join-Path $Root "backup") -Filter *.zip -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1
Dong "Sao lưu gần nhất" ([bool]$bk) $(if ($bk) { "$($bk.Name)" } else { "chưa có (chạy lúc 3 giờ sáng)" })

$log = Join-Path $Root "logs\giam-sat.log"
if (Test-Path $log) {
    Write-Host ""; Write-Host "10 dòng nhật ký giám sát gần nhất:" -ForegroundColor Cyan
    Get-Content $log -Tail 10 -Encoding UTF8 | ForEach-Object { "  $_" }
}
