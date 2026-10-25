#!/usr/bin/env bash
# =============================================================================
#  Lith Tools 一键部署脚本（Linux）
#
#  用法：
#    sudo bash deploy/install.sh
#    sudo bash deploy/install.sh --port 8787 --origin https://tools.example.com
#    bash deploy/install.sh --no-service          # 宝塔 / 小皮 / PM2 面板部署
#
#  脚本会：
#    1. 检查 Node.js（缺失或低于 22.5 时尝试安装 Node 24）；
#    2. 安装依赖并构建 dist/ + dist-server/；
#    3. 首次生成 .env（随机管理员密码、SQLite 路径、端口）；
#    4. 在 systemd 可用且以 root 运行时安装并启动 lith-tools 服务；
#       面板部署使用 --no-service，只构建并打印启动命令。
#
#  不会自动修改 Nginx；反向代理示例见 deploy/nginx-lith-tools.conf。
# =============================================================================
set -euo pipefail

APP_NAME="lith-tools"
DEFAULT_PORT="8787"
NODE_MAJOR="24"

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PORT="${PORT:-$DEFAULT_PORT}"
PUBLIC_ORIGIN="${PUBLIC_ORIGIN:-}"
RUN_USER="${RUN_USER:-}"
NO_SERVICE=0
SKIP_BUILD=0

info() { printf '\033[1;34m[%s]\033[0m %s\n' "$APP_NAME" "$*"; }
warn() { printf '\033[1;33m[%s]\033[0m %s\n' "$APP_NAME" "$*"; }
fail() { printf '\033[1;31m[%s]\033[0m %s\n' "$APP_NAME" "$*" >&2; exit 1; }

usage() {
  cat <<'EOF'
Lith Tools 一键部署脚本

用法：
  sudo bash deploy/install.sh [选项]

选项：
  --port <端口>       监听端口，默认 8787
  --origin <地址>     对外访问地址，例如 https://tools.example.com
  --user <用户>       systemd 运行用户，默认自动创建 lith（仅 root）
  --no-service        只构建，不安装 systemd 服务（宝塔 / 小皮 / PM2 部署）
  --skip-build        跳过 npm ci / npm run build（已构建过时使用）
  -h, --help          显示帮助

示例：
  sudo bash deploy/install.sh --origin https://tools.example.com
  bash deploy/install.sh --no-service
EOF
}

while [ $# -gt 0 ]; do
  case "$1" in
    --port) PORT="${2:-}"; shift 2 ;;
    --origin) PUBLIC_ORIGIN="${2:-}"; shift 2 ;;
    --user) RUN_USER="${2:-}"; shift 2 ;;
    --no-service) NO_SERVICE=1; shift ;;
    --skip-build) SKIP_BUILD=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) fail "未知参数：$1（使用 --help 查看用法）" ;;
  esac
done

[ -f "$APP_DIR/package.json" ] || fail "未找到 $APP_DIR/package.json，请在项目目录内运行"
[ "$(uname -s)" = "Linux" ] || fail "此脚本仅支持 Linux；Windows 请使用 deploy\\install.bat"
case "$PORT" in
  ''|*[!0-9]*) fail "端口必须是数字：$PORT" ;;
esac
[ "$PORT" -ge 1 ] && [ "$PORT" -le 65535 ] || fail "端口超出范围：$PORT"

as_root() {
  if [ "$(id -u)" -eq 0 ]; then
    "$@"
  elif command -v sudo >/dev/null 2>&1; then
    sudo "$@"
  else
    fail "需要 root 权限执行：$*（请使用 sudo 运行）"
  fi
}

node_ok() {
  command -v node >/dev/null 2>&1 && node -e '
    const [a, b] = process.versions.node.split(".").map(Number);
    process.exit(a > 22 || (a === 22 && b >= 5) ? 0 : 1);
  ' >/dev/null 2>&1
}

install_node() {
  info "未检测到 Node.js ≥ 22.5，尝试安装 Node ${NODE_MAJOR}（官方二进制）"
  command -v curl >/dev/null 2>&1 || fail "缺少 curl，请先安装：apt install curl / yum install curl"
  command -v tar >/dev/null 2>&1 || fail "缺少 tar"

  case "$(uname -m)" in
    x86_64|amd64) ARCH="linux-x64" ;;
    aarch64|arm64) ARCH="linux-arm64" ;;
    armv7l) ARCH="linux-armv7l" ;;
    *) fail "不支持的 CPU 架构：$(uname -m)，请手动安装 Node.js ≥ 22.5" ;;
  esac

  BASE="https://nodejs.org/dist/latest-v${NODE_MAJOR}.x"
  FILE="$(curl -fsSL "$BASE/SHASUMS256.txt" | awk -v a="-$ARCH.tar.gz" '$2 ~ a"$" { print $2; exit }')"
  [ -n "$FILE" ] || fail "无法从 $BASE 找到 $ARCH 安装包，请手动安装 Node.js"
  EXPECTED="$(curl -fsSL "$BASE/SHASUMS256.txt" | awk -v f="$FILE" '$2 == f { print $1; exit }')"

  TMP_DIR="$(mktemp -d)"
  trap 'rm -rf "$TMP_DIR"' EXIT
  info "下载 Node.js：$FILE"
  curl -fsSL "$BASE/$FILE" -o "$TMP_DIR/$FILE"
  if [ -n "$EXPECTED" ] && command -v sha256sum >/dev/null 2>&1; then
    echo "$EXPECTED  $TMP_DIR/$FILE" | sha256sum -c - >/dev/null
  fi
  as_root tar -xzf "$TMP_DIR/$FILE" -C /usr/local --strip-components=1
  hash -r
  node_ok || fail "Node.js 安装后仍不可用，请检查 PATH"
}

if ! node_ok; then
  install_node
fi
NODE_BIN="$(command -v node)"
NPM_BIN="$(command -v npm)"
info "Node.js $("$NODE_BIN" -v) · npm $("$NPM_BIN" -v)"
info "项目目录：$APP_DIR"

cd "$APP_DIR"

if [ "$SKIP_BUILD" -eq 0 ]; then
  if [ -f package-lock.json ]; then
    info "安装依赖：npm ci --include=dev"
    "$NPM_BIN" ci --include=dev
  else
    info "安装依赖：npm install --include=dev"
    "$NPM_BIN" install --include=dev
  fi
  info "构建生产版本：npm run build"
  "$NPM_BIN" run build
else
  warn "已跳过依赖安装与构建（--skip-build）"
fi

mkdir -p "$APP_DIR/data"
chmod 700 "$APP_DIR/data" 2>/dev/null || true

export PORT PUBLIC_ORIGIN
export DB_PATH="${DB_PATH:-$APP_DIR/data/lith-tools.db}"
export TRUST_PROXY="${TRUST_PROXY:-true}"
"$NODE_BIN" "$APP_DIR/deploy/init-env.cjs"

if [ "$NO_SERVICE" -eq 0 ] && command -v systemctl >/dev/null 2>&1 && [ "$(id -u)" -eq 0 ]; then
  if [ -z "$RUN_USER" ]; then
    RUN_USER="${SUDO_USER:-lith}"
    if [ "$RUN_USER" = "root" ]; then
      RUN_USER="lith"
    fi
  fi
  if ! id -u "$RUN_USER" >/dev/null 2>&1; then
    if command -v useradd >/dev/null 2>&1; then
      useradd --system --home "$APP_DIR" --shell /usr/sbin/nologin "$RUN_USER"
    else
      warn "系统没有 useradd，服务将以 root 运行（不建议）"
      RUN_USER="root"
    fi
  fi

  chown -R "$RUN_USER" "$APP_DIR" 2>/dev/null || true
  chmod 600 "$APP_DIR/.env" 2>/dev/null || true

  SERVICE_FILE="/etc/systemd/system/${APP_NAME}.service"
  info "写入 systemd 服务：$SERVICE_FILE"
  cat > "$SERVICE_FILE" <<EOF
[Unit]
Description=Lith Tools
After=network.target

[Service]
Type=simple
User=${RUN_USER}
WorkingDirectory=${APP_DIR}
EnvironmentFile=${APP_DIR}/.env
ExecStart=${NODE_BIN} ${APP_DIR}/dist-server/server/index.js
Restart=on-failure
RestartSec=3
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=full
ReadWritePaths=${APP_DIR}/data

[Install]
WantedBy=multi-user.target
EOF

  systemctl daemon-reload
  if systemctl enable --now "${APP_NAME}.service"; then
    info "服务已启动：systemctl status ${APP_NAME}"
  else
    warn "systemd 服务启动失败，请查看：journalctl -u ${APP_NAME} -n 100"
  fi
else
  if [ "$NO_SERVICE" -eq 1 ]; then
    info "已按 --no-service 跳过 systemd（适用于宝塔 / 小皮 / PM2）"
  elif [ "$(id -u)" -ne 0 ]; then
    warn "当前不是 root，未安装 systemd 服务"
  else
    warn "未检测到 systemd，未安装系统服务"
  fi
  info "手动启动命令：cd \"$APP_DIR\" && NODE_ENV=production $NODE_BIN dist-server/server/index.js"
  info "或使用 PM2：pm2 start deploy/ecosystem.config.cjs && pm2 save"
fi

echo
info "部署完成"
info "本机地址：http://127.0.0.1:${PORT}"
info "健康检查：http://127.0.0.1:${PORT}/api/health"
info "反向代理模板：${APP_DIR}/deploy/nginx-lith-tools.conf"
info "如使用域名，请在面板 / Nginx 反向代理到 127.0.0.1:${PORT}，并将 PUBLIC_ORIGIN 设为 https://你的域名"
info "初始管理员密码见 ${APP_DIR}/.env 或本次 init-env 输出，登录后请立即修改"
