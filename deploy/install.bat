@echo off
chcp 65001 >nul
setlocal EnableExtensions
rem ============================================================================
rem  Lith Tools 一键部署脚本（Windows / 小皮面板本机）
rem
rem  用法：双击运行，或在命令行执行：
rem      deploy\install.bat
rem
rem  脚本会安装依赖、构建生产版本、首次生成 .env，然后前台启动服务。
rem  面板部署可把“启动命令”设为：
rem      node dist-server\server\index.js
rem  工作目录设为项目根目录。
rem ============================================================================

cd /d "%~dp0.."

echo.
echo [lith-tools] 项目目录：%CD%

if not exist "package.json" (
  echo [lith-tools] 错误：当前目录不是 Lith Tools 项目根目录
  goto :error
)

where node >nul 2>nul
if errorlevel 1 (
  echo [lith-tools] 错误：未找到 Node.js，请先安装 Node.js 22.5+（推荐 24）
  echo              下载地址：https://nodejs.org/
  goto :error
)

node -e "const [a,b]=process.versions.node.split('.').map(Number);process.exit(a>22||(a===22&&b>=5)?0:1)"
if errorlevel 1 (
  echo [lith-tools] 错误：Node.js 版本过低，需要 22.5 或更高版本
  node -v
  goto :error
)

where npm >nul 2>nul
if errorlevel 1 (
  echo [lith-tools] 错误：未找到 npm，请重新安装 Node.js
  goto :error
)

echo [lith-tools] Node.js 版本：
node -v
echo [lith-tools] npm 版本：
call npm -v

if exist "package-lock.json" (
  echo [lith-tools] 安装依赖：npm ci --include=dev
  call npm ci --include=dev
) else (
  echo [lith-tools] 安装依赖：npm install --include=dev
  call npm install --include=dev
)
if errorlevel 1 goto :error

echo [lith-tools] 构建生产版本：npm run build
call npm run build
if errorlevel 1 goto :error

if not exist "data" mkdir "data"

if "%PORT%"=="" set "PORT=8787"
if "%PUBLIC_ORIGIN%"=="" set "PUBLIC_ORIGIN="
if "%DB_PATH%"=="" set "DB_PATH=%CD%\data\lith-tools.db"
if "%TRUST_PROXY%"=="" set "TRUST_PROXY=false"
if "%COOKIE_SECURE%"=="" set "COOKIE_SECURE=false"
node deploy\init-env.cjs
if errorlevel 1 goto :error

echo.
echo [lith-tools] 启动服务：http://127.0.0.1:%PORT%
echo [lith-tools] 健康检查：http://127.0.0.1:%PORT%/api/health
echo [lith-tools] 按 Ctrl+C 停止；面板部署请把启动命令设为 node dist-server\server\index.js
echo.
node dist-server\server\index.js
goto :eof

:error
echo.
echo [lith-tools] 部署失败，请根据上方错误修复后重试。
pause
exit /b 1
