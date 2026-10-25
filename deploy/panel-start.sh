#!/usr/bin/env bash
# 宝塔 / 小皮 / PM2 / supervisor 等面板的 Node 项目启动命令。
# 工作目录必须是项目根目录；配置从项目根目录的 .env 读取。
set -euo pipefail
cd "$(dirname "$0")/.."
export NODE_ENV="${NODE_ENV:-production}"
exec node dist-server/server/index.js
