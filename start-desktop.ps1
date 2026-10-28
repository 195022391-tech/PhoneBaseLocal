$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$dir = Join-Path $root "应用\本地投屏-桌面端"
if (-not (Test-Path -LiteralPath $dir)) {
  Write-Host "找不到目录: $dir"
  Read-Host "按回车退出"
  exit 1
}
Set-Location -LiteralPath $dir
$electron = Join-Path $dir "node_modules\electron\dist\electron.exe"
if (-not (Test-Path -LiteralPath $electron)) {
  Write-Host "正在安装依赖..."
  npm install
  if ($LASTEXITCODE -ne 0) {
    Write-Host "npm install 失败"
    Read-Host "按回车退出"
    exit 1
  }
}
Start-Process -FilePath $electron -ArgumentList "." -WorkingDirectory $dir