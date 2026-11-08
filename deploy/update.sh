#!/usr/bin/env bash
# =============================================================================
#  Lith Tools 一键更新脚本（含 LCZOJ 授权配置同步）
#
#  用法：
#    cd /xp/www/tools.lichenzhen.cn
#    bash deploy/update.sh
#
#  可选：
#    bash deploy/update.sh --no-pull      # 代码已上传，不执行 git pull
#    bash deploy/update.sh --no-build     # 已构建，跳过 npm ci / npm run build
#    bash deploy/update.sh --no-oauth     # 不更新 LCZOJ 授权配置
#
#  密钥查找顺序：
#    1. 环境变量 OJ_OAUTH_CLIENT_SECRET
#    2. Lith Tools 的 .env / deploy/panel.env
#    3. LCZOJ 的 .env / deploy/panel.env
#  都找不到时会跳过授权更新并提示。
#
#  脚本会：
#    1. 备份 data/、.env、deploy/panel.env；
#    2. git pull（可选）；
#    3. 同步两端 LCZOJ OAuth 配置；
#    4. npm ci + npm run build；
#    5. 杀掉真正占用 8787 的旧进程并重启；
#    6. 验证新 JS/CSS 的 Content-Type 和 OAuth 跳转。
# =============================================================================
set -euo pipefail

TOOLS_DIR="${TOOLS_DIR:-/xp/www/tools.lichenzhen.cn}"
OJ_DIR="${OJ_DIR:-/xp/www/oj.lichenzhen.cn}"
TOOLS_ORIGIN="${TOOLS_ORIGIN:-https://tools.lichenzhen.cn}"
OJ_ORIGIN="${OJ_ORIGIN:-https://oj.lichenzhen.cn}"
CLIENT_ID="${CLIENT_ID:-lith-tools}"
CLIENT_NAME="${CLIENT_NAME:-LCZOJ}"
CALLBACK="${TOOLS_ORIGIN%/}/api/auth/lczoj/callback"

DO_PULL=1
DO_BUILD=1
DO_OAUTH=1

say() { printf '\033[1;34m[update]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[update]\033[0m %s\n' "$*" >&2; }
die() { printf '\033[1;31m[update]\033[0m %s\n' "$*" >&2; exit 1; }

while [ $# -gt 0 ]; do
  case "$1" in
    --no-pull) DO_PULL=0; shift ;;
    --no-build) DO_BUILD=0; shift ;;
    --no-oauth) DO_OAUTH=0; shift ;;
    -h|--help) sed -n '2,28p' "$0"; exit 0 ;;
    *) die "未知参数：$1" ;;
  esac
done

[ -d "$TOOLS_DIR" ] || die "Lith Tools 目录不存在：$TOOLS_DIR"
[ -d "$OJ_DIR" ] || die "LCZOJ 目录不存在：$OJ_DIR"
command -v node >/dev/null 2>&1 || die "找不到 node"
command -v curl >/dev/null 2>&1 || die "找不到 curl"

say "Lith Tools：$TOOLS_DIR"
say "LCZOJ：$OJ_DIR"
say "回调地址：$CALLBACK"

# ------------------------------------------------------------------ backup
STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP_DIR="$TOOLS_DIR/backups/$STAMP"
mkdir -p "$BACKUP_DIR"
if [ -d "$TOOLS_DIR/data" ]; then cp -a "$TOOLS_DIR/data" "$BACKUP_DIR/data"; fi
if [ -f "$TOOLS_DIR/.env" ]; then cp -a "$TOOLS_DIR/.env" "$BACKUP_DIR/env"; fi
if [ -f "$TOOLS_DIR/deploy/panel.env" ]; then cp -a "$TOOLS_DIR/deploy/panel.env" "$BACKUP_DIR/panel.env"; fi
say "已备份到 $BACKUP_DIR"

# ------------------------------------------------------------------- pull
if [ "$DO_PULL" -eq 1 ]; then
  if [ -d "$TOOLS_DIR/.git" ]; then
    say "git pull --ff-only"
    (cd "$TOOLS_DIR" && git pull --ff-only) || warn "git pull 失败，继续使用当前代码"
  else
    warn "不是 git 仓库，跳过 git pull（按 --no-pull 处理）"
  fi
fi

# --------------------------------------------------------------- env writer
write_env() {
  local file=$1
  shift
  mkdir -p "$(dirname "$file")"
  if [ -f "$file" ]; then
    cp -a "$file" "$file.bak.$STAMP"
  else
    : > "$file"
    chown "$(stat -c '%u:%g' "$(dirname "$file")")" "$file" 2>/dev/null || true
  fi
  local tmp pair key value
  tmp="$(mktemp "${file}.XXXXXX")"
  cp -a "$file" "$tmp"
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

read_secret() {
  local file
  for file in "$TOOLS_DIR/.env" "$TOOLS_DIR/deploy/panel.env" "$OJ_DIR/.env" "$OJ_DIR/deploy/panel.env"; do
    [ -f "$file" ] || continue
    local value
    value="$(grep -hE '^[[:space:]]*(OJ_OAUTH_CLIENT_SECRET|LCZOJ_CLIENT_SECRET)=' "$file" | head -1 | cut -d= -f2- || true)"
    if [ -n "$value" ]; then
      echo "$value"
      return 0
    fi
  done
  return 1
}

if [ "$DO_OAUTH" -eq 1 ]; then
  SECRET="${OJ_OAUTH_CLIENT_SECRET:-}"
  if [ -z "$SECRET" ]; then
    SECRET="$(read_secret || true)"
  fi
  if [ -z "$SECRET" ]; then
    warn "未找到 OAuth 密钥，跳过授权更新（可设置 OJ_OAUTH_CLIENT_SECRET=... 后重跑）"
    DO_OAUTH=0
  fi
fi

if [ "$DO_OAUTH" -eq 1 ]; then
  say "同步 Lith Tools 授权配置..."
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

  say "同步 LCZOJ 授权配置..."
  oj_files=()
  if [ -f "$OJ_DIR/deploy/panel.env" ]; then oj_files+=("$OJ_DIR/deploy/panel.env"); fi
  if [ -f "$OJ_DIR/.env" ]; then oj_files+=("$OJ_DIR/.env"); fi
  if [ ${#oj_files[@]} -eq 0 ]; then oj_files=("$OJ_DIR/.env"); fi
  for file in "${oj_files[@]}"; do
    write_env "$file" \
      "OJ_OAUTH_CLIENT_ID=$CLIENT_ID" \
      "OJ_OAUTH_CLIENT_SECRET=$SECRET" \
      "OJ_OAUTH_CLIENT_NAME=$CLIENT_NAME" \
      "OJ_OAUTH_REDIRECT_URIS=$CALLBACK"
  done
fi

# ------------------------------------------------------------------ build
if [ "$DO_BUILD" -eq 1 ]; then
  command -v npm >/dev/null 2>&1 || die "找不到 npm"
  say "安装依赖..."
  if [ -f "$TOOLS_DIR/package-lock.json" ]; then
    (cd "$TOOLS_DIR" && npm ci --include=dev)
  else
    (cd "$TOOLS_DIR" && npm install --include=dev)
  fi
  say "构建生产版本..."
  (cd "$TOOLS_DIR" && npm run build)
else
  warn "已跳过构建（--no-build）"
fi

# ---------------------------------------------------------------- restart
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
  local pids=$1 round pid
  for round in 1 2 3; do
    pids="$(echo "$pids" | tr ' ' '\n' | grep -E '^[0-9]+$' | sort -u | tr '\n' ' ' || true)"
    if [ -z "$pids" ]; then return 0; fi
    for pid in $pids; do
      kill -TERM "$pid" 2>/dev/null || true
    done
    sleep 2
    pids="$(echo "$pids" | tr ' ' '\n' | while read -r pid; do if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then echo "$pid"; fi; done | tr '\n' ' ')"
  done
  for pid in $pids; do kill -KILL "$pid" 2>/dev/null || true; done
  return 0
}

say "停止旧的 Lith Tools 进程..."
stop_pids "$(tools_pids | tr '\n' ' ')"
say "启动 Lith Tools..."
cd "$TOOLS_DIR"
mkdir -p logs
if [ -f deploy/panel-install.js ]; then
  node deploy/panel-install.js --start || warn "panel-install --start 返回失败，请查看 logs/lith-tools.log"
else
  nohup bash deploy/panel-start.sh >> logs/update-restart.log 2>&1 &
  echo $! > deploy/panel.pid
fi

if [ "$DO_OAUTH" -eq 1 ]; then
  say "停止旧的 LCZOJ 进程..."
  stop_pids "$(oj_pids | tr '\n' ' ')"
  say "启动 LCZOJ..."
  cd "$OJ_DIR"
  mkdir -p logs
  if [ -f deploy/panel-start.sh ]; then
    nohup bash deploy/panel-start.sh >> logs/update-restart.log 2>&1 &
  else
    nohup node server.js >> logs/update-restart.log 2>&1 &
  fi
  echo $! > deploy/panel.pid 2>/dev/null || true
fi

# ----------------------------------------------------------------- verify
wait_url() {
  local url=$1 index
  for index in $(seq 1 30); do
    curl -fsS -o /dev/null "$url" 2>/dev/null && return 0
    sleep 1
  done
  return 1
}

say "等待服务就绪..."
wait_url "$TOOLS_ORIGIN/api/health" || warn "Lith Tools 健康检查未通过"
if [ "$DO_OAUTH" -eq 1 ]; then
  wait_url "$OJ_ORIGIN/api/health" || warn "LCZOJ 健康检查未通过"
fi

ASSET="$(grep -o '/assets/index-[^"]*\.js' "$TOOLS_DIR/dist/index.html" 2>/dev/null | head -1 || true)"
if [ -z "$ASSET" ]; then
  warn "未找到构建后的 /assets/index-*.js 引用"
else
  say "检查新资源：$ASSET"
  for base in "http://127.0.0.1:8787" "$TOOLS_ORIGIN"; do
    header="$(curl -sI "$base$ASSET" 2>/dev/null || true)"
    code="$(echo "$header" | awk 'NR==1{print $2}')"
    ctype="$(echo "$header" | awk 'tolower($1)=="content-type:"{print $2; exit}' | tr -d '\r')"
    if [ "$code" = "200" ] && [[ "$ctype" == *javascript* ]]; then
      say "  OK  $base$ASSET ($ctype)"
    else
      warn "  FAIL $base$ASSET (HTTP $code, Content-Type ${ctype:-空})"
    fi
  done
fi

if [ "$DO_OAUTH" -eq 1 ]; then
  STATUS="$(curl -sS "$TOOLS_ORIGIN/api/auth/lczoj/status" 2>/dev/null || true)"
  say "授权状态：$STATUS"

  LOCATION="$(curl -sS -D - -o /dev/null "$TOOLS_ORIGIN/api/auth/lczoj?next=%2Fdashboard" 2>/dev/null \
    | awk 'tolower($1) == "location:" { print $2; exit }' | tr -d '\r')"
  say "登录跳转：${LOCATION:-（空）}"

  ENC_CALLBACK="$(node -p 'encodeURIComponent(process.argv[1])' "$CALLBACK")"
  AUTH_CODE="$(curl -sS -o /dev/null -w '%{http_code}' \
    "$OJ_ORIGIN/api/oauth/authorize?response_type=code&client_id=$CLIENT_ID&redirect_uri=$ENC_CALLBACK&state=update-check" 2>/dev/null || true)"
  say "LCZOJ 授权端点：HTTP $AUTH_CODE"

  case "$LOCATION" in
    "$OJ_ORIGIN"/*) ;;
    *) warn "跳转地址仍未指向 $OJ_ORIGIN" ;;
  esac
  case "$AUTH_CODE" in
    200|302) ;;
    *) warn "LCZOJ 授权端点返回 $AUTH_CODE（400 通常是回调地址未生效）" ;;
  esac
fi

say "更新完成。备份：$BACKUP_DIR"
say "如浏览器仍显示旧页面，请按 Ctrl + F5 强制刷新。"
