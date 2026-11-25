# CÀI MỘT LẦN: biến laptop này thành máy chủ tsucho-scan chạy liên tục.
#
# Cách chạy (xem docs/MAY_CHU_LAPTOP.md): bấm chuột phải «Windows PowerShell» → «Run as administrator», rồi dán:
#   Set-ExecutionPolicy -Scope Process Bypass -Force; & "C:\TsuchoScan-cai-dat\1-cai-dat.ps1"
#
# Script làm lần lượt (chạy lại nhiều lần cũng được — bước nào xong rồi thì bỏ qua):
#   1. kiểm máy (quyền quản trị, RAM, ổ đĩa, winget)
#   2. cài Git, Python 3.12, Node.js, Tesseract, cloudflared (qua winget của Microsoft)
#   3. tải code tsucho-scan từ GitHub về C:\TsuchoScan\app
#   4. cài thư viện Python + dựng trang web
#   5. hỏi khoá Gemini, ghi vào C:\TsuchoScan\config.env (chỉ quản trị viên đọc được)
#   6. chỉnh nguồn điện: cắm sạc thì không bao giờ ngủ, gập màn hình không làm gì
#   7. tạo tác vụ Windows chạy máy chủ lúc khởi động + tự bật lại khi chết, và tác vụ sao lưu mỗi đêm
#   8. kiểm đường hầm Cloudflare Tunnel (tạo trên trang Cloudflare, xem docs) → link https cố định cho khách

param(
    [string]$Root   = "C:\TsuchoScan",
    [string]$Repo   = "https://github.com/huynh2104-stack/tsucho-scan.git",
    [string]$Branch = "web-app-giai-doan-2",
    [int]$Port      = 8000
)

# "Continue" chứ không "Stop": PowerShell 5.1 coi mọi dòng chương trình ngoài (git, npm, winget) ghi ra stderr là
# lỗi và dừng ngang. Mỗi bước tự kiểm $LASTEXITCODE.
$ErrorActionPreference = "Continue"
[Console]::OutputEncoding = [Text.Encoding]::UTF8
function Buoc([string]$t) { Write-Host ""; Write-Host "==> $t" -ForegroundColor Cyan }
function Ok([string]$t)   { Write-Host "    ✓ $t" -ForegroundColor Green }
function Canh([string]$t) { Write-Host "    ! $t" -ForegroundColor Yellow }
function Dung([string]$t) { Write-Host ""; Write-Host "DỪNG: $t" -ForegroundColor Red; exit 1 }
function NapPath {
    $env:Path = [Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [Environment]::GetEnvironmentVariable("Path", "User")
}
function Co([string]$cmd) { [bool](Get-Command $cmd -ErrorAction SilentlyContinue) }

# ── 1. Kiểm máy ───────────────────────────────────────────────────────
Buoc "1/8 Kiểm tra máy"
$admin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $admin) { Dung "Hãy mở PowerShell bằng «Run as administrator» rồi chạy lại." }
$ramGB = [math]::Round((Get-CimInstance Win32_ComputerSystem).TotalPhysicalMemory / 1GB, 1)
$freeGB = [math]::Round((Get-PSDrive C).Free / 1GB, 1)
Ok "RAM $ramGB GB · ổ C còn trống $freeGB GB"
$ocr = "1"
if ($ramGB -lt 3.5) {
    Canh "RAM dưới 4 GB: TẮT bộ đọc chữ cục bộ (khung đỏ chỉ ước lượng nét đứt) để máy không bị đơ."
    $ocr = "0"
}
if ($freeGB -lt 5) { Dung "Ổ C cần trống ít nhất 5 GB." }
if (-not (Co "winget")) { Dung "Máy chưa có winget. Mở Microsoft Store, cài «App Installer», rồi chạy lại script." }

# ── 2. Cài phần mềm ──────────────────────────────────────────────────
Buoc "2/8 Cài phần mềm cần thiết (lần đầu mất 5–15 phút)"
$pkgs = @(
    @{ id = "Git.Git";                    ten = "Git";        co = { Co "git" } },
    @{ id = "Python.Python.3.12";         ten = "Python 3.12"; co = { (Co "py") -and ((& py -3.12 -c "print(1)" 2>$null) -eq "1") } },
    @{ id = "OpenJS.NodeJS.LTS";          ten = "Node.js";    co = { Co "npm" } },
    @{ id = "UB-Mannheim.TesseractOCR";   ten = "Tesseract";  co = { Test-Path "C:\Program Files\Tesseract-OCR\tesseract.exe" } },
    @{ id = "Cloudflare.cloudflared";     ten = "cloudflared"; co = { (Co "cloudflared") -or (Test-Path "C:\Program Files (x86)\cloudflared\cloudflared.exe") } }
)
foreach ($p in $pkgs) {
    NapPath
    if (& $p.co) { Ok "$($p.ten) đã có"; continue }
    Write-Host "    … đang cài $($p.ten)"
    & winget install --id $p.id -e --silent --accept-package-agreements --accept-source-agreements --scope machine
    if ($LASTEXITCODE -ne 0) {
        # Một số gói không có bản «cho cả máy»: thử lại không chỉ định phạm vi
        & winget install --id $p.id -e --silent --accept-package-agreements --accept-source-agreements
    }
    NapPath
    if (& $p.co) { Ok "đã cài $($p.ten)" } else { Dung "Không cài được $($p.ten). Thử cài tay rồi chạy lại script." }
}

# ── 3. Tải code ──────────────────────────────────────────────────────
Buoc "3/8 Tải code tsucho-scan (nhánh $Branch)"
$app = Join-Path $Root "app"
New-Item -ItemType Directory -Force -Path $Root, (Join-Path $Root "data"), (Join-Path $Root "logs"), (Join-Path $Root "backup") | Out-Null
if (Test-Path (Join-Path $app ".git")) {
    & git -C $app fetch origin $Branch; & git -C $app checkout $Branch; & git -C $app pull --ff-only origin $Branch
} else {
    & git clone --branch $Branch $Repo $app
}
if ($LASTEXITCODE -ne 0) { Dung "Không tải được code từ GitHub. Kiểm tra mạng rồi chạy lại." }
Ok "code ở $app"

# ── 4. Thư viện + trang web ──────────────────────────────────────────
Buoc "4/8 Cài thư viện Python và dựng trang web (5–10 phút)"
$venv = Join-Path $Root "venv"
$py = Join-Path $venv "Scripts\python.exe"
if (-not (Test-Path $py)) { & py -3.12 -m venv $venv }
& $py -m pip install --upgrade pip --quiet
& $py -m pip install --quiet -r (Join-Path $app "requirements.txt") -r (Join-Path $app "requirements-rowmap.txt")
if ($LASTEXITCODE -ne 0) { Dung "Cài thư viện Python lỗi (xem dòng đỏ ở trên)." }
Ok "thư viện Python xong"
Push-Location (Join-Path $app "web")
& npm ci --no-audit --no-fund
if ($LASTEXITCODE -eq 0) { & npm run build }
$webOk = $LASTEXITCODE -eq 0
Pop-Location
if (-not $webOk) { Dung "Dựng trang web lỗi. Nếu lỗi nói về «fonts.googleapis» thì do mạng chập chờn — chạy lại script." }
Ok "trang web đã dựng"

# ── 5. Khoá API ──────────────────────────────────────────────────────
Buoc "5/8 Cấu hình"
$cfg = Join-Path $Root "config.env"
if (-not (Test-Path $cfg)) {
    Write-Host "    Dán khoá GEMINI_API_KEY (lấy ở https://aistudio.google.com/apikey). Chữ sẽ không hiện ra khi dán — bình thường."
    $sec = Read-Host "    GEMINI_API_KEY" -AsSecureString
    $key = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec))
    @(
        "# Cài đặt máy chủ tsucho-scan. Sửa xong thì chạy 3-khoi-dong-lai.ps1.",
        "GEMINI_API_KEY=$key",
        "EXTRACT_MODEL=gemini-3.1-flash-lite",
        "# 1 = bật bộ đọc chữ cục bộ (khung đỏ chính xác, cần RAM ≥ 4 GB); 0 = tắt",
        "TSUCHO_LOCAL_OCR=$ocr"
    ) | Set-Content -Path $cfg -Encoding UTF8
    $key = $null
    # Chỉ Administrators và SYSTEM đọc được file chứa khoá
    & icacls $cfg /inheritance:r /grant:r "*S-1-5-32-544:F" "*S-1-5-18:F" | Out-Null
    Ok "đã lưu $cfg (chỉ quản trị viên đọc được)"
} else { Ok "giữ nguyên $cfg đã có" }

# ── 6. Nguồn điện ────────────────────────────────────────────────────
Buoc "6/8 Chỉnh nguồn điện: cắm sạc thì không ngủ, gập màn hình không tắt máy"
& powercfg /change standby-timeout-ac 0
& powercfg /change hibernate-timeout-ac 0
& powercfg /setacvalueindex SCHEME_CURRENT SUB_BUTTONS LIDACTION 0
& powercfg /setactive SCHEME_CURRENT
Ok "xong (khi chạy bằng pin máy vẫn ngủ như cũ để không hết pin)"

# ── 7. Tác vụ Windows ────────────────────────────────────────────────
Buoc "7/8 Tạo tác vụ chạy máy chủ lúc khởi động + sao lưu mỗi đêm"
$tools = Join-Path $app "tools\may-chu-laptop"
$ps = "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe"
$sys = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest
$set = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable `
    -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -MultipleInstances IgnoreNew
$act = New-ScheduledTaskAction -Execute $ps -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$tools\chay-may-chu.ps1`" -Root `"$Root`" -Port $Port"
Register-ScheduledTask -TaskName "TsuchoScan-MayChu" -Action $act -Trigger (New-ScheduledTaskTrigger -AtStartup) `
    -Principal $sys -Settings $set -Force -Description "Máy chủ tsucho-scan (tự bật lại khi dừng)" | Out-Null
$bk = New-ScheduledTaskAction -Execute $ps -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$tools\sao-luu.ps1`" -Root `"$Root`""
Register-ScheduledTask -TaskName "TsuchoScan-SaoLuu" -Action $bk -Trigger (New-ScheduledTaskTrigger -Daily -At 3am) `
    -Principal $sys -Settings (New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries) -Force `
    -Description "Sao lưu dữ liệu tsucho-scan mỗi đêm (giữ 14 bản)" | Out-Null
Stop-ScheduledTask -TaskName "TsuchoScan-MayChu" -ErrorAction SilentlyContinue
Start-ScheduledTask -TaskName "TsuchoScan-MayChu"
Write-Host "    … chờ máy chủ trả lời (tối đa 3 phút)"
$up = $false
for ($i = 0; $i -lt 60 -and -not $up; $i++) {
    Start-Sleep 3
    try { $up = (Invoke-WebRequest -UseBasicParsing -TimeoutSec 5 "http://127.0.0.1:$Port/api/health").StatusCode -eq 200 } catch {}
}
if (-not $up) { Dung "Máy chủ chưa lên. Xem nhật ký: $Root\logs\may-chu-loi.log" }
Ok "máy chủ đang chạy ở http://127.0.0.1:$Port (chỉ máy này vào được)"

# ── 8. Đường hầm ─────────────────────────────────────────────────────
Buoc "8/8 Đường link công khai (Cloudflare Tunnel)"
$cf = Get-Service -Name "Cloudflared" -ErrorAction SilentlyContinue
if ($cf -and $cf.Status -eq "Running") {
    Ok "dịch vụ cloudflared đang chạy (đường hầm tự nối lại khi mạng rớt)"
    Write-Host ""
    Write-Host "XONG. Đường link cho khách: https://app.tsucho-scan.com (route đặt trên trang Cloudflare)." -ForegroundColor Green
} else {
    Canh "Chưa có đường hầm. Làm theo docs/MAY_CHU_LAPTOP.md, mục «Nối ra internet bằng Cloudflare Tunnel»:"
    Write-Host "    tạo tunnel trên dash.cloudflare.com, dán lệnh «cloudflared.exe service install <mã>» vào cửa sổ quản trị này,"
    Write-Host "    rồi thêm route app → http://localhost:$Port. Mã đó như mật khẩu — đừng gửi cho ai."
    Write-Host ""
    Write-Host "Máy chủ đã chạy trong máy; chỉ còn thiếu đường hầm." -ForegroundColor Yellow
}
Write-Host "Kiểm tra bất cứ lúc nào: chạy 2-kiem-tra.ps1 trong $tools"
