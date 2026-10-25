@echo off
chcp 65001 >nul
rem 宝塔 / 小皮 / Windows 计划任务的启动命令。
rem 工作目录必须是项目根目录；配置从 .env 读取。
cd /d "%~dp0.."
if "%NODE_ENV%"=="" set "NODE_ENV=production"
node dist-server\server\index.js
