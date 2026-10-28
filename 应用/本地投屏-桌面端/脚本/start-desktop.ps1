$ErrorActionPreference = "Stop"
$dir = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location -LiteralPath $dir
$electron = Join-Path $dir "node_modules\electron\dist\electron.exe"
if (-not (Test-Path -LiteralPath $electron)) {
  Write-Host "正在安装依赖..."
  npm install
}
Start-Process -FilePath $electron -ArgumentList "." -WorkingDirectory $dir