@echo off
chcp 65001 >nul
rem 面板一键准备 / 一键启动（Windows 小皮面板 / 宝塔 Windows / 本机）
rem 等价于：node deploy\panel-install.js，可传 --check / --start / --stop / --port 等参数。
cd /d "%~dp0.."
node deploy\panel-install.js %*
set "EXITCODE=%ERRORLEVEL%"
echo.
pause
exit /b %EXITCODE%
