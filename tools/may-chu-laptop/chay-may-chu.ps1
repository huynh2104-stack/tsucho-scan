# Giữ cho máy chủ tsucho-scan LUÔN chạy trên laptop.
#
# Tác vụ «TsuchoScan-MayChu» của Windows chạy file này lúc máy khởi động (không cần ai đăng nhập).
# Nó bật máy chủ, rồi cứ 30 giây hỏi «còn sống không?» (/api/health):
#   • tiến trình tự thoát (lỗi, hết RAM…)        → 5 giây sau bật lại
#   • còn chạy mà 3 lần liền không trả lời (treo) → tắt hẳn rồi bật lại
# Mất mạng không làm máy chủ chết: nó chỉ nghe ở 127.0.0.1, đường hầm Cloudflare (cloudflared) tự nối lại khi có mạng.
#
# Tham số chỉ để thử trên máy khác; trên laptop máy chủ cứ để mặc định.

param(
    [string]$Root     = "C:\TsuchoScan",
    [string]$AppDir   = "",
    [string]$Python   = "",
    [string]$DataDir  = "",
    [string]$LogDir   = "",
    [string]$Config   = "",
    [int]$Port        = 8000,
    [int]$CheckEvery  = 30,
    [int]$MaxMisses   = 3
)

$ErrorActionPreference = "Continue"
if (-not $AppDir)  { $AppDir  = Join-Path $Root "app" }
if (-not $Python)  { $Python  = Join-Path $Root "venv\Scripts\python.exe" }
if (-not $DataDir) { $DataDir = Join-Path $Root "data" }
if (-not $LogDir)  { $LogDir  = Join-Path $Root "logs" }
if (-not $Config)  { $Config  = Join-Path $Root "config.env" }
New-Item -ItemType Directory -Force -Path $DataDir, $LogDir | Out-Null

$journal = Join-Path $LogDir "giam-sat.log"
function Ghi([string]$msg) {
    $line = "{0}  {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $msg
    Add-Content -Path $journal -Value $line -Encoding UTF8
}
# Nhật ký không được phình mãi trên một laptop chạy hàng tháng: quá 5 MB thì cất bản cũ (giữ đúng một bản)
function Xoay([string]$path) {
    if ((Test-Path $path) -and ((Get-Item $path).Length -gt 5MB)) {
        Move-Item -Force $path ($path + ".cu")
    }
}

# Biến môi trường: khoá API và cài đặt nằm trong config.env (KEY=VALUE mỗi dòng, # là ghi chú)
if (Test-Path $Config) {
    foreach ($raw in Get-Content -Path $Config -Encoding UTF8) {
        $line = $raw.Trim()
        if (-not $line -or $line.StartsWith("#") -or -not $line.Contains("=")) { continue }
        $k, $v = $line.Split("=", 2)
        [Environment]::SetEnvironmentVariable($k.Trim(), $v.Trim().Trim('"'), "Process")
    }
}
$env:TSUCHO_DATA_DIR  = $DataDir
$env:PYTHONIOENCODING = "utf-8"
$env:PYTHONUNBUFFERED = "1"
# Laptop có đủ RAM: bật bộ đọc chữ cục bộ (khung đỏ khớp theo nội dung, tự xoay ảnh). Máy yếu thì đặt =0 trong config.env.
if (-not $env:TSUCHO_LOCAL_OCR) { $env:TSUCHO_LOCAL_OCR = "1" }
# Người ngoài vào qua https (đường hầm) nên cookie đăng nhập phải có cờ Secure
if (-not $env:TSUCHO_COOKIE_SECURE) { $env:TSUCHO_COOKIE_SECURE = "1" }
# Người ngoài vào qua Cloudflare Tunnel: lấy IP thật từ CF-Connecting-IP để khoá đăng nhập theo từng người
# (app chỉ nghe ở 127.0.0.1 nên không ai gọi thẳng vào giả được header này; thiếu header thì app tự bỏ qua)
if (-not $env:TSUCHO_TRUST_PROXY) { $env:TSUCHO_TRUST_PROXY = "cloudflare" }

$health = "http://127.0.0.1:$Port/api/health"
function Song {
    try {
        $r = Invoke-WebRequest -UseBasicParsing -TimeoutSec 10 -Uri $health
        return $r.StatusCode -eq 200
    } catch { return $false }
}

Ghi "=== Bắt đầu giám sát (thư mục app: $AppDir, cổng $Port) ==="
while ($true) {
    if (-not (Test-Path $Python)) { Ghi "Không thấy Python ở $Python — chờ 60 giây rồi thử lại"; Start-Sleep 60; continue }
    Xoay (Join-Path $LogDir "may-chu.log"); Xoay (Join-Path $LogDir "may-chu-loi.log"); Xoay $journal

    # Chỉ nghe ở 127.0.0.1: không ai trong mạng Wi-Fi gõ thẳng vào được, chỉ đường hầm Cloudflare mới tới.
    # MỘT tiến trình (không --workers): danh sách lần quét đang chạy nằm trong bộ nhớ của tiến trình.
    $proc = Start-Process -FilePath $Python -WorkingDirectory $AppDir -WindowStyle Hidden -PassThru `
        -ArgumentList @("-m", "uvicorn", "api.main:app", "--host", "127.0.0.1", "--port", "$Port") `
        -RedirectStandardOutput (Join-Path $LogDir "may-chu.log") `
        -RedirectStandardError  (Join-Path $LogDir "may-chu-loi.log")
    $null = $proc.Handle      # giữ tay cầm tiến trình, không thì PowerShell 5.1 trả mã thoát rỗng
    Ghi "Đã bật máy chủ (PID $($proc.Id))"

    # Khởi động lần đầu nạp bộ đọc chữ khá lâu: cho tối đa 2 phút trước khi bắt đầu đếm «không trả lời»
    $deadline = (Get-Date).AddMinutes(2)
    while (-not $proc.HasExited -and -not (Song) -and (Get-Date) -lt $deadline) { Start-Sleep 3 }
    if (-not $proc.HasExited -and (Song)) { Ghi "Máy chủ đã trả lời" }

    $misses = 0
    while (-not $proc.HasExited) {
        Start-Sleep $CheckEvery
        if ($proc.HasExited) { break }
        if (Song) { $misses = 0; continue }
        $misses++
        Ghi "Máy chủ không trả lời ($misses/$MaxMisses)"
        if ($misses -ge $MaxMisses) {
            Ghi "Coi như treo — tắt hẳn để bật lại"
            # Tắt cả cây tiến trình (uvicorn có thể sinh tiến trình con)
            & taskkill.exe /PID $proc.Id /T /F | Out-Null
            Start-Sleep 2
            break
        }
    }
    $code = if ($proc.HasExited) { $proc.ExitCode } else { "?" }
    Ghi "Máy chủ đã dừng (mã $code) — bật lại sau 5 giây"
    Start-Sleep 5
}
