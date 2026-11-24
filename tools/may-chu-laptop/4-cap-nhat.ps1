# Cập nhật lên bản code mới nhất trên GitHub. Chạy bằng «Run as administrator».
# Sao lưu dữ liệu TRƯỚC, cập nhật lỗi thì máy chủ vẫn chạy bản cũ (không dừng máy chủ cho tới khi bản mới dựng xong).
param([string]$Root = "C:\TsuchoScan", [string]$Branch = "web-app-giai-doan-2", [int]$Port = 8000)
$ErrorActionPreference = "Continue"
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$app = Join-Path $Root "app"; $py = Join-Path $Root "venv\Scripts\python.exe"
$tools = Join-Path $app "tools\may-chu-laptop"
function Dung([string]$t) { Write-Host "✗ $t" -ForegroundColor Red; exit 1 }

Write-Host "1/4 Sao lưu dữ liệu…"
& "$tools\sao-luu.ps1" -Root $Root
Write-Host "2/4 Tải code mới…"
$before = (& git -C $app rev-parse HEAD)
& git -C $app pull --ff-only origin $Branch
if ($LASTEXITCODE -ne 0) { Dung "Không tải được code (mạng, hoặc ai đó sửa tay trong $app)." }
$after = (& git -C $app rev-parse HEAD)
if ($before -eq $after) { Write-Host "✓ Đã là bản mới nhất, không cần làm gì." -ForegroundColor Green; exit 0 }
Write-Host "3/4 Cài thư viện + dựng lại trang web…"
& $py -m pip install --quiet -r (Join-Path $app "requirements.txt") -r (Join-Path $app "requirements-rowmap.txt")
if ($LASTEXITCODE -ne 0) { & git -C $app reset --hard $before; Dung "Cài thư viện lỗi — đã trả code về bản cũ, máy chủ vẫn chạy bản cũ." }
Push-Location (Join-Path $app "web")
& npm ci --no-audit --no-fund; if ($LASTEXITCODE -eq 0) { & npm run build }
$ok = $LASTEXITCODE -eq 0; Pop-Location
if (-not $ok) { & git -C $app reset --hard $before; Dung "Dựng trang web lỗi — đã trả code về bản cũ. Chạy lại sau (thường do mạng)." }
Write-Host "4/4 Khởi động lại máy chủ…"
& "$tools\3-khoi-dong-lai.ps1" -Root $Root -Port $Port
