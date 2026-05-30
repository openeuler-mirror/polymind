# ============================================================
# PolyMind 一键安装 & 启动脚本 (Windows PowerShell)
# ============================================================

$ErrorActionPreference = "Stop"
$Host.UI.RawUI.WindowTitle = "PolyMind Installer"

# ---------- helper ----------
function Write-Section {
    param([string]$Title)
    Write-Host ""
    Write-Host ("=" * 48) -ForegroundColor Cyan
    Write-Host "  $Title" -ForegroundColor Cyan
    Write-Host ("=" * 48) -ForegroundColor Cyan
}

function Write-Info  { Write-Host "[INFO]  $args" -ForegroundColor Cyan }
function Write-OK    { Write-Host "[OK]    $args" -ForegroundColor Green }
function Write-Warn  { Write-Host "[WARN]  $args" -ForegroundColor Yellow }
function Write-Err   { Write-Host "[ERR]   $args" -ForegroundColor Red }

# ---------- 1. check deps ----------
Write-Section "1/5  环境检测"

$missing = @()

foreach ($cmd in @("node", "npm")) {
    try {
        $ver = & $cmd --version 2>&1
        Write-OK "$cmd (v$ver)"
    } catch {
        Write-Err "$cmd 未安装"
        $missing += $cmd
    }
}

# Python / pip detection
$pythonCmd = $null
foreach ($c in @("python3", "python")) {
    if (Get-Command $c -ErrorAction SilentlyContinue) {
        $pythonCmd = $c
        $ver = & $c --version 2>&1
        Write-OK "$c ($ver)"
        break
    }
}
if (-not $pythonCmd) {
    Write-Err "python 未安装"
    $missing += "python"
}

$pipCmd = $null
foreach ($c in @("pip3", "pip")) {
    if (Get-Command $c -ErrorAction SilentlyContinue) {
        $pipCmd = $c
        $ver = & $c --version 2>&1
        Write-OK "$c ($ver)"
        break
    }
}
if (-not $pipCmd) {
    Write-Err "pip 未安装"
    $missing += "pip"
}

if ($missing.Count -gt 0) {
    Write-Host ""
    Write-Err "请先安装缺少的依赖后重新运行本脚本"
    Write-Host "  Node.js: https://nodejs.org/"
    Write-Host "  Python:  https://www.python.org/downloads/"
    Write-Host ""
    Write-Host "  提示: 按任意键退出..."
    $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
    exit 1
}

# ---------- 2. mirror ----------
Write-Section "2/5  镜像源"

Write-Host ""
Write-Host "  检测到国内网络环境, 推荐使用清华/阿里镜像加速"
Write-Host ""
$choice = Read-Host "  是否使用国内镜像源? [Y/n]"
if ($choice -eq "" -or $choice -match "^[yY]") {
    $useMirror = $true
    $npmMirror  = "https://registry.npmmirror.com"
    $pipMirror  = "https://pypi.tuna.tsinghua.edu.cn/simple"
    Write-Info "npm 镜像:  $npmMirror"
    Write-Info "pip 镜像:  $pipMirror"
} else {
    $useMirror = $false
    Write-Info "使用官方源"
}

# ---------- 3. install packages ----------
Write-Section "3/5  安装依赖包"

# --- npm: polymind ---
Write-Info "安装前端包 polymind ..."
if ($useMirror) {
    npm install -g polymind --registry="$npmMirror"
} else {
    npm install -g polymind
}
Write-OK "polymind 安装完成"

# --- pip: witty-service ---
Write-Info "安装后端包 witty-service ..."
if ($useMirror) {
    & $pipCmd install witty-service -i $pipMirror --trusted-host pypi.tuna.tsinghua.edu.cn
} else {
    & $pipCmd install witty-service
}
Write-OK "witty-service 安装完成"

# ---------- 4. config ----------
Write-Section "4/5  生成配置"

$polymindDir = Join-Path $HOME ".polymind"
$envFile = Join-Path $polymindDir ".env"

if (-not (Test-Path $polymindDir)) {
    New-Item -ItemType Directory -Path $polymindDir -Force | Out-Null
}

if (Test-Path $envFile) {
    Write-Warn "配置文件已存在, 跳过生成"
    Write-Info "如需重新生成, 请先删除: $envFile"
} else {
    $envContent = @"
# PolyMind 全局配置文件
# 修改后重启服务即可生效
# ==============================================
# 后端API地址
NEXT_PUBLIC_AGENTD_API_URL=http://127.0.0.1:8000
# WebSocket地址
NEXT_PUBLIC_WS_URL=ws://127.0.0.1:8000/ws
# API请求超时时间(毫秒)
NEXT_PUBLIC_API_TIMEOUT=30000
# 最大重连次数
NEXT_PUBLIC_MAX_RECONNECT_ATTEMPTS=5
# 重连间隔(毫秒)
NEXT_PUBLIC_RECONNECT_INTERVAL=3000
# 应用名称
NEXT_PUBLIC_APP_NAME=PolyMind
# 应用版本
NEXT_PUBLIC_APP_VERSION=1.0.0
# 调试模式
NEXT_PUBLIC_DEBUG=false
"@
    Set-Content -Path $envFile -Value $envContent -Encoding UTF8
    Write-OK "配置文件已生成: $envFile"
}

# ---------- 5. start services ----------
Write-Section "5/5  启动服务"

# 启动后端
Write-Info "启动后端 witty-service (端口 8000) ..."
$backendProc = Start-Process -FilePath "witty-service" -ArgumentList "--port","8000" -NoNewWindow -PassThru
Start-Sleep -Seconds 2

if (-not $backendProc.HasExited) {
    Write-OK "后端已启动  PID=$($backendProc.Id)  http://127.0.0.1:8000"
} else {
    Write-Err "后端启动失败, 请检查日志"
    exit 1
}

# 启动前端
Write-Info "启动前端 polymind (端口 3000) ..."
Write-Host ""
$frontendProc = Start-Process -FilePath "polymind" -ArgumentList "--port","3000" -NoNewWindow -PassThru
Start-Sleep -Seconds 2

if (-not $frontendProc.HasExited) {
    Write-OK "前端已启动  PID=$($frontendProc.Id)  http://localhost:3000"
} else {
    Write-Err "前端启动失败, 请检查日志"
    Stop-Process -Id $backendProc.Id -Force -ErrorAction SilentlyContinue
    exit 1
}

# ---------- done ----------
Write-Host ""
Write-Host ("=" * 48) -ForegroundColor Green
Write-Host "  PolyMind 启动成功!" -ForegroundColor Green
Write-Host ("=" * 48) -ForegroundColor Green
Write-Host ""
Write-Host "  前端:  http://localhost:3000" -ForegroundColor White
Write-Host "  后端:  http://127.0.0.1:8000" -ForegroundColor White
Write-Host ""
Write-Host "  后端 PID:  $($backendProc.Id)"
Write-Host "  前端 PID:  $($frontendProc.Id)"
Write-Host ""
Write-Host ("  停止服务:  Stop-Process -Id {0},{1}" -f $backendProc.Id, $frontendProc.Id) -ForegroundColor Yellow
Write-Host "  修改配置:  $envFile" -ForegroundColor Yellow
Write-Host ""
Write-Host "  提示: 按任意键退出..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
