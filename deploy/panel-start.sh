#!/usr/bin/env bash
# =============================================================================
#  Lith Tools 前台启动脚本（宝塔 / 小皮 / PM2 / supervisor / systemd 通用）
#
#  作用：读取 deploy/panel.env（如果存在）→ 检查环境 → 前台启动服务。
#        必须“前台启动”：进程守护工具需要一直盯着这个进程，脚本退出 = 服务停止。
#
#  用法：
#    bash deploy/panel-start.sh
#    宝塔：网站 → Node 项目 → 启动命令填 bash deploy/panel-start.sh
#    小皮：计划任务 / 进程守护 → 启动命令填 bash deploy/panel-start.sh
#    PM2 ：pm2 start deploy/ecosystem.config.cjs
# =============================================================================
set -e

cd "$(dirname "$0")/.."

# 1) 读取面板环境变量文件（存在才读）
if [ -f deploy/panel.env ]; then
  set -a
  # shellcheck disable=SC1091
  . deploy/panel.env
  set +a
  echo "[lith-tools] 已加载 deploy/panel.env"
fi

# 2) 默认值（panel.env 里没写的用这里）
export PORT="${PORT:-8787}"
export HOST="${HOST:-127.0.0.1}"
export NODE_ENV="${NODE_ENV:-production}"

# 3) 监听地址提示：127.0.0.1 = 只允许本机访问，必须由面板 Nginx 反代才能从外网打开
if [ "$HOST" = "127.0.0.1" ] && ! command -v nginx >/dev/null 2>&1; then
  echo "[lith-tools] 提示：HOST=127.0.0.1 只监听本机，而本机没有 Nginx → 外网会打不开。"
  echo "             用面板反代：把 deploy/panel-nginx.conf 粘进站点配置（proxy_pass http://127.0.0.1:${PORT}）；"
  echo "             要直接 IP:端口 访问：把 deploy/panel.env 里的 HOST 改成 0.0.0.0"
fi

# 4) 基础检查：Node 存在、版本够用
if ! command -v node >/dev/null 2>&1; then
  echo "[lith-tools] 错误：找不到 node 命令。请先在面板里安装 Node.js v24（或 ≥ v22.5）。" >&2
  exit 1
fi
if ! node -e '
  const [a, b] = process.versions.node.split(".").map(Number);
  process.exit(a > 22 || (a === 22 && b >= 5) ? 0 : 1);
' >/dev/null 2>&1; then
  echo "[lith-tools] 错误：Node.js 版本过低（当前 $(node -v)），需要 ≥ v22.5，推荐 v24。" >&2
  exit 1
fi

if [ ! -f dist-server/server/index.js ]; then
  echo "[lith-tools] 错误：未找到 dist-server/server/index.js，请先执行 npm ci --include=dev && npm run build" >&2
  exit 1
fi

echo "[lith-tools] 启动中：监听 ${HOST}:${PORT}，数据目录 ${DB_PATH:-$PWD/data}"

# 5) 前台启动（exec 让 SIGTERM 直接送达 node，面板“停止 / 重启”才能优雅退出）
exec node dist-server/server/index.js
