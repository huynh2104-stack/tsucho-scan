# Sao lưu thư mục dữ liệu (ảnh sổ, kết quả, tài khoản) thành một file zip; giữ 14 bản mới nhất.
# Tác vụ «TsuchoScan-SaoLuu» chạy file này lúc 3 giờ sáng. File zip nằm trên CHÍNH laptop này —
# muốn an toàn hơn (laptop hỏng ổ) thì thỉnh thoảng chép thư mục backup sang USB.
param([string]$Root = "C:\TsuchoScan", [int]$Keep = 14)
$data = Join-Path $Root "data"; $dst = Join-Path $Root "backup"
New-Item -ItemType Directory -Force -Path $dst | Out-Null
if (-not (Test-Path $data)) { exit 0 }
$zip = Join-Path $dst ("data-{0}.zip" -f (Get-Date -Format "yyyyMMdd-HHmm"))
# Chép sang thư mục tạm trước rồi mới nén: máy chủ đang ghi file thì Compress-Archive báo «file đang mở» và hỏng cả bản
$tmp = Join-Path $env:TEMP ("tsucho-bk-" + [guid]::NewGuid().ToString("N"))
& robocopy $data $tmp /E /R:2 /W:1 /NFL /NDL /NJH /NJS /NP | Out-Null
# CSDL tài khoản chạy chế độ WAL: thay bản chép thô bằng ảnh chụp nhất quán (lỗi thì giữ bản chép thô)
$py = Join-Path $Root "venv\Scripts\python.exe"; $db = Join-Path $data "app.db"
if ((Test-Path $py) -and (Test-Path $db)) {
    $snap = Join-Path $tmp "app.db.snap"
    & $py -I (Join-Path $PSScriptRoot "sao-luu-db.py") $db $snap
    if ($LASTEXITCODE -eq 0 -and (Test-Path $snap)) {
        $out = Join-Path $tmp "app.db"
        Remove-Item -Force -ErrorAction SilentlyContinue $out, "$out-wal", "$out-shm"
        Move-Item $snap $out
    } else {
        Remove-Item -Force -ErrorAction SilentlyContinue $snap
        Write-Host "! Không chụp được app.db nhất quán — giữ bản chép thô" -ForegroundColor Yellow
    }
}
Compress-Archive -Path (Join-Path $tmp "*") -DestinationPath $zip -Force
Remove-Item -Recurse -Force $tmp
Get-ChildItem $dst -Filter "data-*.zip" | Sort-Object LastWriteTime -Descending | Select-Object -Skip $Keep | Remove-Item -Force
