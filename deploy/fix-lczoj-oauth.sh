#!/usr/bin/env bash
# =============================================================================
#  一键修正 Lith Tools ↔ LCZOJ OAuth 登录配置
#
#  用法：
#    OJ_OAUTH_CLIENT_SECRET=你的密钥 bash deploy/fix-lczoj-oauth.sh
#
#  可选环境变量：
#    TOOLS_DIR=/xp/www/tools.lichenzhen.cn
#    OJ_DIR=/xp/www/oj.lichenzhen.cn
#    TOOLS_ORIGIN=https://tools.lichenzhen.cn
#    OJ_ORIGIN=https://oj.lichenzhen.cn
#    CLIENT_ID=lith-tools
#    CLIENT_NAME=LCZOJ
#
#  脚本会：
#    1. 备份并写入两端的 .env / deploy/panel.env；
#    2. 杀掉仍在运行的旧 Node 进程并重新启动；
#    3. 验证 Lith Tools 的 302 是否已经指向 OJ 域名；
#    4. 验证 LCZOJ 授权端点是否接受回调地址。
#
#  只改配置不重启：NO_RESTART=1 OJ_OAUTH_CLIENT_SECRET=... bash ...
# =============================================================================
set -euo pipefail

TOOLS_DIR="${TOOLS_DIR:-/xp/www/tools.lichenzhen.cn}"
OJ_DIR="${OJ_DIR:-/xp/www/oj.lichenzhen.cn}"
TOOLS_ORIGIN="${TOOLS_ORIGIN:-https://tools.lichenzhen.cn}"
OJ_ORIGIN="${OJ_ORIGIN:-https://oj.lichenzhen.cn}"
CLIENT_ID="${CLIENT_ID:-lith-tools}"
CLIENT_NAME="${CLIENT_NAME:-LCZOJ}"
SECRET="${OJ_OAUTH_CLIENT_SECRET:-${LCZOJ_CLIENT_SECRET:-}}"
CALLBACK="${TOOLS_ORIGIN%/}/api/auth/lczoj/callback"

say() { printf '\033[1;34m[lczoj-oauth]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[lczoj-oauth]\033[0m %s\n' "$*" >&2; }
die() { printf '\033[1;31m[lczoj-oauth]\033[0m %s\n' "$*" >&2; exit 1; }

[ -n "$SECRET" ] || die "缺少密钥。请这样运行：OJ_OAUTH_CLIENT_SECRET=... bash $0"
[ -d "$TOOLS_DIR" ] || die "Lith Tools 目录不存在：$TOOLS_DIR"
[ -d "$OJ_DIR" ] || die "LCZOJ 目录不存在：$OJ_DIR"
command -v node >/dev/null 2>&1 || die "找不到 node"
command -v curl >/dev/null 2>&1 || die "找不到 curl"

say "Lith Tools：$TOOLS_DIR"
say "LCZOJ：$OJ_DIR"
say "回调地址：$CALLBACK"

# ---------------------------------------------------------------- env writer
write_env() {
  local file=$1
  shift
  mkdir -p "$(dirname "$file")"
  if [ -f "$file" ]; then
    cp -a "$file" "$file.bak.$(date +%Y%m%d-%H%M%S)" 2>/dev/null || true
  else
    : > "$file"
    chown "$(stat -c '%u:%g' "$(dirname "$file")")" "$file" 2>/dev/null || true
  fi

  local tmp
  tmp="$(mktemp "${file}.XXXXXX")"
  cp -a "$file" "$tmp"

  local pair key value
  for pair in "$@"; do
    key="${pair%%=*}"
    value="${pair#*=}"
    grep -vE "^[[:space:]]*(export[[:space:]]+)?${key}=" "$tmp" > "$tmp.new" || true
    printf '%s=%s\n' "$key" "$value" >> "$tmp.new"
    mv "$tmp.new" "$tmp"
  done

  cat "$tmp" > "$file"
  rm -f "$tmp"
  chmod 600 "$file" 2>/dev/null || true
}

fix_owner() {
  local file=$1 ref=$2 owner
  [ -f "$file" ] || return 0
  if [ -e "$ref" ]; then
    owner="$(stat -c '%U' "$ref" 2>/dev/null || true)"
    if [ -n "$owner" ] && [ "$owner" != "root" ]; then
      chown "$owner" "$file" 2>/dev/null || true
    fi
  fi
}

# ------------------------------------------------------------- process utils
port_pid() {
  local port=$1
  if command -v ss >/dev/null 2>&1; then
    ss -lntp 2>/dev/null | grep -E "[:.]$port[[:space:]]" | grep -o 'pid=[0-9]*' | head -1 | cut -d= -f2
  elif command -v lsof >/dev/null 2>&1; then
    lsof -ti "tcp:$port" 2>/dev/null | head -1
  fi
}

tools_pids() {
  {
    pgrep -f "$TOOLS_DIR/dist-server/server/index.js" 2>/dev/null || true
    port_pid 8787 || true
  } | grep -E '^[0-9]+$' | sort -u || true
}

oj_pids() {
  local pid cwd args
  for pid in $(pgrep -f 'server\.js' 2>/dev/null || true); do
    cwd="$(readlink "/proc/$pid/cwd" 2>/dev/null || true)"
    args="$(tr '\0' ' ' < "/proc/$pid/cmdline" 2>/dev/null || true)"
    if [ "$cwd" = "$OJ_DIR" ] || [[ "$args" == *"$OJ_DIR"* ]]; then
      echo "$pid"
    fi
  done
}

stop_pids() {
  local pids=$1
  local round pid
  for round in 1 2 3; do
    pids="$(echo "$pids" | tr ' ' '\n' | grep -E '^[0-9]+$' | sort -u | tr '\n' ' ' || true)"
    [ -z "$pids" ] && return 0
    for pid in $pids; do
      kill -TERM "$pid" 2>/dev/null || true
    done
    sleep 2
    pids="$(echo "$pids" | tr ' ' '\n' | while read -r pid; do [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null && echo "$pid"; done | tr '\n' ' ')"
  done
  for pid in $pids; do
    kill -KILL "$pid" 2>/dev/null || true
  done
  return 0
}

# --------------------------------------------------------------- write config
say "写入 Lith Tools 配置..."
write_env "$TOOLS_DIR/.env" \
  "LCZOJ_BASE_URL=$OJ_ORIGIN" \
  "LCZOJ_CLIENT_ID=$CLIENT_ID" \
  "LCZOJ_CLIENT_SECRET=$SECRET" \
  "LCZOJ_REDIRECT_URI=$CALLBACK" \
  "LCZOJ_NAME=$CLIENT_NAME"

if [ -f "$TOOLS_DIR/deploy/panel.env" ]; then
  write_env "$TOOLS_DIR/deploy/panel.env" \
    "LCZOJ_BASE_URL=$OJ_ORIGIN" \
    "LCZOJ_CLIENT_ID=$CLIENT_ID" \
    "LCZOJ_CLIENT_SECRET=$SECRET" \
    "LCZOJ_REDIRECT_URI=$CALLBACK" \
    "LCZOJ_NAME=$CLIENT_NAME"
fi
fix_owner "$TOOLS_DIR/.env" "$TOOLS_DIR/data/lith-tools.db"
[ -f "$TOOLS_DIR/deploy/panel.env" ] && fix_owner "$TOOLS_DIR/deploy/panel.env" "$TOOLS_DIR/data/lith-tools.db"

say "写入 LCZOJ 配置..."
oj_env_files=()
[ -f "$OJ_DIR/deploy/panel.env" ] && oj_env_files+=("$OJ_DIR/deploy/panel.env")
[ -f "$OJ_DIR/.env" ] && oj_env_files+=("$OJ_DIR/.env")
[ ${#oj_env_files[@]} -eq 0 ] && oj_env_files=("$OJ_DIR/.env")

for file in "${oj_env_files[@]}"; do
  write_env "$file" \
    "OJ_OAUTH_CLIENT_ID=$CLIENT_ID" \
    "OJ_OAUTH_CLIENT_SECRET=$SECRET" \
    "OJ_OAUTH_CLIENT_NAME=$CLIENT_NAME" \
    "OJ_OAUTH_REDIRECT_URIS=$CALLBACK"
  fix_owner "$file" "$OJ_DIR/data/oj.db"
done

# ------------------------------------------------------------------- restart
if [ "${NO_RESTART:-0}" = "1" ]; then
  warn "NO_RESTART=1：只写配置，不重启进程"
else
  say "停止旧的 Lith Tools 进程..."
  stop_pids "$(tools_pids | tr '\n' ' ')"
  say "启动 Lith Tools..."
  cd "$TOOLS_DIR"
  mkdir -p logs
  if [ -f deploy/panel-install.js ]; then
    node deploy/panel-install.js --start
  else
    nohup bash deploy/panel-start.sh >> logs/oauth-restart.log 2>&1 &
    echo $! > deploy/panel.pid
  fi

  say "停止旧的 LCZOJ 进程..."
  stop_pids "$(oj_pids | tr '\n' ' ')"
  say "启动 LCZOJ..."
  cd "$OJ_DIR"
  mkdir -p logs
  if [ -f deploy/panel-start.sh ]; then
    nohup bash deploy/panel-start.sh >> logs/oauth-restart.log 2>&1 &
  else
    nohup node server.js >> logs/oauth-restart.log 2>&1 &
  fi
  echo $! > deploy/panel.pid 2>/dev/null || true
fi

if [ "${NO_RESTART:-0}" = "1" ]; then
  say "配置已写入。请手动重启 Lith Tools 与 LCZOJ 后生效。"
  exit 0
fi

# ------------------------------------------------------------------- verify
wait_url() {
  local url=$1 index
  for index in $(seq 1 30); do
    if curl -fsS -o /dev/null "$url" 2>/dev/null; then return 0; fi
    sleep 1
  done
  return 1
}

say "等待服务就绪..."
wait_url "$TOOLS_ORIGIN/api/health" || warn "Lith Tools 健康检查未通过"
wait_url "$OJ_ORIGIN/api/health" || warn "LCZOJ 健康检查未通过"

sleep 1
STATUS="$(curl -sS "$TOOLS_ORIGIN/api/auth/lczoj/status" 2>/dev/null || true)"
say "Lith Tools 状态：$STATUS"

LOCATION="$(curl -sS -D - -o /dev/null "$TOOLS_ORIGIN/api/auth/lczoj?next=%2Fdashboard" 2>/dev/null \
  | awk 'tolower($1) == "location:" { print $2; exit }' | tr -d '\r' | head -1)"

say "登录跳转：${LOCATION:-（空）}"

ENC_CALLBACK="$(node -p 'encodeURIComponent(process.argv[1])' "$CALLBACK")"
AUTH_CODE="$(curl -sS -o /dev/null -w '%{http_code}' \
  "$OJ_ORIGIN/api/oauth/authorize?response_type=code&client_id=$CLIENT_ID&redirect_uri=$ENC_CALLBACK&state=script-check" 2>/dev/null || true)"
say "LCZOJ 授权端点 HTTP：$AUTH_CODE"

ok=1
case "$LOCATION" in
  "$OJ_ORIGIN"/*) ;;
  *) warn "跳转地址不是 $OJ_ORIGIN，检查 Lith Tools 进程是否真的重启"; ok=0 ;;
esac
case "$AUTH_CODE" in
  200|302) ;;
  *) warn "LCZOJ 授权端点返回 $AUTH_CODE（400 通常是回调地址未生效）"; ok=0 ;;
esac

if [ "$ok" -eq 1 ]; then
  say "完成：OAuth 配置已生效，刷新 Lith Tools 登录页重试。"
  exit 0
fi

warn "脚本已写完配置，但验证未全部通过。请检查："
warn "  1. /xp/www/tools.lichenzhen.cn/.env 与 deploy/panel.env"
warn "  2. /xp/www/oj.lichenzhen.cn/.env 与 deploy/panel.env"
warn "  3. 面板 / PM2 是否又用旧环境变量把进程拉起来了"
warn "  4. 日志：$TOOLS_DIR/logs/lith-tools.log、$OJ_DIR/logs/oauth-restart.log"
exit 1
