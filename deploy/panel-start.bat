@echo off
chcp 65001 >nul
rem ============================================================================
rem  Lith Tools 前台启动脚本（Windows 面板 / 宝塔 Windows / 小皮面板 / 计划任务）
rem
rem  用法：双击运行，或在面板「计划任务 / 进程守护」里把启动命令填成：
rem        cmd /c "cd /d C:\path\to\lith-tools && deploy\panel-start.bat"
rem
rem  参数可用 deploy\panel.env 同名的环境变量覆盖，
rem  也可以在运行前用 set 命令临时指定（见下方默认值）。
rem ============================================================================
setlocal EnableExtensions

cd /d "%~dp0.."

rem 读取 deploy\panel.env（存在才读）：KEY=VALUE，以 # 开头的行视为注释
if exist "deploy\panel.env" (
  for /f "usebackq eol=# tokens=1,* delims==" %%A in ("deploy\panel.env") do (
    if not "%%A"=="" set "%%A=%%B"
  )
  echo [lith-tools] 已加载 deploy\panel.env
)

if "%PORT%"=="" set PORT=8787
if "%HOST%"=="" set HOST=127.0.0.1
if "%NODE_ENV%"=="" set NODE_ENV=production

where node >nul 2>nul
if errorlevel 1 (
  echo [lith-tools] 错误：找不到 node 命令。请先安装 Node.js v24（或 ^>= v22.5）。
  exit /b 1
)

node -e "const [a,b]=process.versions.node.split('.').map(Number);process.exit(a>22||(a===22&&b>=5)?0:1)"
if errorlevel 1 (
  echo [lith-tools] 错误：Node.js 版本过低，需要 22.5 或更高版本
  node -v
  exit /b 1
)

if not exist "dist-server\server\index.js" (
  echo [lith-tools] 错误：未找到 dist-server\server\index.js
  echo              请先执行：npm ci --include=dev ^&^& npm run build
  exit /b 1
)

echo [lith-tools] 启动中：监听 %HOST%:%PORT%，数据目录 %CD%\data
node dist-server\server\index.js
endlocal
