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
Compress-Archive -Path (Join-Path $tmp "*") -DestinationPath $zip -Force
Remove-Item -Recurse -Force $tmp
Get-ChildItem $dst -Filter "data-*.zip" | Sort-Object LastWriteTime -Descending | Select-Object -Skip $Keep | Remove-Item -Force
