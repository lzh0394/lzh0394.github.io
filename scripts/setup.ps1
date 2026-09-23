# 下载本项目所需的 Hugo 二进制到 .tools/hugo/
#
# 之所以不把 hugo.exe 提交进仓库：它接近 60 MB，超过 GitHub 建议的 50 MB 上限。
# 这里改成一次性下载，并把版本写死，保证任何人拿到仓库都得到同一个 Hugo。
#
# 用法：powershell -ExecutionPolicy Bypass -File scripts/setup.ps1
#       powershell -ExecutionPolicy Bypass -File scripts/setup.ps1 -Force   # 强制重装

param(
  [switch]$Force
)

$ErrorActionPreference = 'Stop'

# 与 .github/workflows/deploy.yml 里的 hugo-version 保持一致
$version = '0.166.0'
$repoRoot = Split-Path -Parent $PSScriptRoot
$destDir = Join-Path $repoRoot '.tools\hugo'
$exe = Join-Path $destDir 'hugo.exe'

if ((Test-Path $exe) -and -not $Force) {
  Write-Host "Hugo 已存在：$exe" -ForegroundColor Green
  & $exe version
  exit 0
}

$name = "hugo_${version}_windows-amd64"
$url = "https://github.com/gohugoio/hugo/releases/download/v$version/$name.zip"
$tmp = Join-Path ([System.IO.Path]::GetTempPath()) "$name.zip"

Write-Host "正在下载 Hugo v$version ..." -ForegroundColor Cyan
Write-Host "  $url"

# Windows PowerShell 5.1 默认走 TLS 1.0，会被 GitHub 拒绝
if ($PSVersionTable.PSVersion.Major -lt 6) {
  [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
}

# 优先用 curl.exe：它在 Windows 10+ 自带，且比 Invoke-WebRequest 稳定
$curl = Get-Command curl.exe -ErrorAction SilentlyContinue
if ($curl) {
  & $curl.Source -sSL --fail --max-time 600 -o $tmp $url
  if ($LASTEXITCODE -ne 0) { throw "下载失败（curl 退出码 $LASTEXITCODE）" }
} else {
  Invoke-WebRequest -Uri $url -OutFile $tmp -UseBasicParsing
}

New-Item -ItemType Directory -Force -Path $destDir | Out-Null
Write-Host '正在解压 ...' -ForegroundColor Cyan
Expand-Archive -Path $tmp -DestinationPath $destDir -Force
Remove-Item $tmp -Force -ErrorAction SilentlyContinue

if (-not (Test-Path $exe)) { throw "解压后找不到 $exe" }

Write-Host ''
Write-Host 'Hugo 安装完成：' -ForegroundColor Green
& $exe version
Write-Host ''
Write-Host '下一步：npm install && npm run build'
