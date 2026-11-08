#!/usr/bin/env node
'use strict';

/**
 * Lith Tools 面板一键准备 + 一键启动（与 LCZOJ 的面板部署方式一致）
 *
 *   node deploy/panel-install.js                # 一键准备（装依赖/构建） + 后台启动
 *   node deploy/panel-install.js --check        # 只看环境，不做任何修改
 *   node deploy/panel-install.js --start        # 只启动服务（后台运行）
 *   node deploy/panel-install.js --stop         # 停止后台服务
 *   node deploy/panel-install.js --port 8080    # 换端口（要与反向代理一致）
 *   node deploy/panel-install.js --origin https://tools.example.com
 *   node deploy/panel-install.js --no-build     # 已构建过，跳过 npm ci / npm run build
 *
 * 它会依次完成：
 *   1. 检查 Node.js 版本（要求 ≥ 22.5，推荐 24）
 *   2. 准备 data/ 并确认可写（root 下自动修正属主）
 *   3. 首次生成 .env（随机管理员密码）并写入 deploy/panel.env
 *   4. 安装依赖并构建 dist/ + dist-server/
 *   5. 后台启动服务（deploy/panel.pid，日志 logs/lith-tools.log），等待 /api/health 就绪
 *   6. 生成 deploy/panel-nginx.conf（可直接粘到宝塔 / 小皮站点配置）
 *
 * 只做部署准备，不会删除数据库；data/ 已存在时只做权限检查。
 */

const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const isWin = process.platform === 'win32';
const PID_FILE = path.join(ROOT, 'deploy', 'panel.pid');
const LOG_FILE = path.join(ROOT, 'logs', 'lith-tools.log');
const PANEL_ENV = path.join(ROOT, 'deploy', 'panel.env');
const NGINX_FILE = path.join(ROOT, 'deploy', 'panel-nginx.conf');
const DOT_ENV = path.join(ROOT, '.env');
const DATA_DIR = path.join(ROOT, 'data');
const DB_PATH = path.join(DATA_DIR, 'lith-tools.db');

const args = process.argv.slice(2);
const argValue = (name, fallback) => {
  const index = args.indexOf(name);
  if (index >= 0 && args[index + 1] && !args[index + 1].startsWith('--')) return args[index + 1];
  const eq = args.find((item) => item.startsWith(`${name}=`));
  return eq ? eq.slice(name.length + 1) : fallback;
};
const has = (name) => args.includes(name);
const argGiven = (name) => args.some((item) => item === name || item.startsWith(`${name}=`));

if (has('--help') || has('-h')) {
  console.log(`
Lith Tools 面板一键准备 / 一键启动

  node deploy/panel-install.js                  一键准备 + 后台启动（默认 127.0.0.1:8787）
  node deploy/panel-install.js --check          只检查环境，不做任何修改
  node deploy/panel-install.js --start          只启动服务（后台运行）
  node deploy/panel-install.js --stop           停止后台服务
  node deploy/panel-install.js --port 8080      指定端口
  node deploy/panel-install.js --host 0.0.0.0   允许直接访问端口（不用 Nginx 反代时）
  node deploy/panel-install.js --origin https://tools.example.com
  node deploy/panel-install.js --user www       数据目录属主（宝塔站点用户通常是 www）
  node deploy/panel-install.js --no-build       跳过 npm ci / npm run build
  node deploy/panel-install.js --force          覆盖已有 deploy/panel.env
  node deploy/panel-install.js --help           显示本帮助
`);
  process.exit(0);
}

function readEnvFile(file) {
  const result = {};
  try {
    for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const index = trimmed.indexOf('=');
      if (index < 0) continue;
      result[trimmed.slice(0, index).trim()] = trimmed.slice(index + 1).trim();
    }
  } catch {
    /* not found */
  }
  return result;
}

const existingPanel = readEnvFile(PANEL_ENV);
const PORT = Number.parseInt(argGiven('--port') ? argValue('--port', '8787') : existingPanel.PORT || '8787', 10);
const HOST = argGiven('--host') ? argValue('--host', '127.0.0.1') : existingPanel.HOST || '127.0.0.1';
const ORIGIN = argGiven('--origin')
  ? argValue('--origin', '')
  : existingPanel.PUBLIC_ORIGIN || '';
const COOKIE_SECURE = argGiven('--origin')
  ? ORIGIN.startsWith('https://')
    ? 'true'
    : 'false'
  : existingPanel.COOKIE_SECURE || (ORIGIN.startsWith('https://') ? 'true' : 'false');
const CHECK_ONLY = has('--check');
const SKIP_BUILD = has('--no-build');

if (!Number.isFinite(PORT) || PORT < 1 || PORT > 65535) {
  console.error(`端口不合法：${argValue('--port', '')}（应为 1~65535）`);
  process.exit(1);
}

const out = (line = '') => console.log(line);
const step = (index, total, title) => {
  out('');
  out(`【${index}/${total}】${title}`);
};
const okLine = (text) => out(`   ✓ ${text}`);
const warnLine = (text) => out(`   ! ${text}`);
const infoLine = (text) => out(`   · ${text}`);

function run(command, commandArgs, options = {}) {
  try {
    const result = spawnSync(command, commandArgs, {
      cwd: ROOT,
      encoding: 'utf8',
      timeout: options.timeout || 900000,
      windowsHide: true,
      stdio: options.inherit ? 'inherit' : 'pipe',
      env: { ...process.env, ...(options.env || {}) },
    });
    return { code: result.status == null ? 1 : result.status, out: String((result.stdout || '') + (result.stderr || '')) };
  } catch {
    return { code: 1, out: '' };
  }
}

/** Windows 下 .cmd 不能直接 spawn，统一走 cmd.exe /c；参数固定，无注入风险。 */
function runNpm(commandArgs, options = {}) {
  if (isWin) {
    return run(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', `npm ${commandArgs.join(' ')}`], options);
  }
  return run('npm', commandArgs, options);
}

function nodeVersionOk() {
  const [major, minor] = process.versions.node.split('.').map((value) => Number.parseInt(value, 10));
  return { major, minor, ok: major > 22 || (major === 22 && minor >= 5), best: major >= 24 };
}

function isRoot() {
  return typeof process.getuid === 'function' && process.getuid() === 0;
}

function detectPanelUser() {
  const given = argValue('--user', '');
  if (given) return given;
  if (isWin) return os.userInfo().username;
  if (fs.existsSync('/www')) return 'www';
  return os.userInfo().username;
}

const PANEL_USER = detectPanelUser();

/** 以面板站点用户启动（root 运行时），避免数据库文件变成 root 属主。 */
function serviceUserIds() {
  if (isWin || !isRoot() || !PANEL_USER || PANEL_USER === 'root') return null;
  try {
    const uid = Number.parseInt(String(spawnSync('id', ['-u', PANEL_USER], { encoding: 'utf8' }).stdout).trim(), 10);
    const gid = Number.parseInt(String(spawnSync('id', ['-g', PANEL_USER], { encoding: 'utf8' }).stdout).trim(), 10);
    if (Number.isFinite(uid) && Number.isFinite(gid)) return { uid, gid };
  } catch {
    /* ignore */
  }
  return null;
}

function isPortFree(port, host) {
  return new Promise((resolve) => {
    const target = host === '0.0.0.0' ? '127.0.0.1' : host;
    const socket = net.connect({ port, host: target });
    socket.setTimeout(1200);
    socket.once('connect', () => {
      socket.destroy();
      resolve(false);
    });
    socket.once('timeout', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('error', () => {
      const server = net.createServer();
      server.once('error', () => resolve(false));
      server.once('listening', () => server.close(() => resolve(true)));
      try {
        server.listen(port, host);
      } catch {
        resolve(false);
      }
    });
  });
}

function readPid() {
  try {
    return Number.parseInt(fs.readFileSync(PID_FILE, 'utf8').trim(), 10);
  } catch {
    return Number.NaN;
  }
}

function isAlive(pid) {
  if (!Number.isFinite(pid)) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function loadPanelEnv() {
  return readEnvFile(PANEL_ENV);
}

function startService() {
  const pid = readPid();
  if (isAlive(pid)) return { already: true, pid };

  fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true });
  const logFd = fs.openSync(LOG_FILE, 'a');
  const panel = loadPanelEnv();
  const userIds = serviceUserIds();
  const child = spawn(process.execPath, [path.join('dist-server', 'server', 'index.js')], {
    cwd: ROOT,
    detached: true,
    stdio: ['ignore', logFd, logFd],
    ...(userIds || {}),
    env: {
      ...process.env,
      ...panel,
      PORT: String(PORT),
      HOST,
      NODE_ENV: 'production',
      PUBLIC_ORIGIN: ORIGIN,
      TRUST_PROXY: panel.TRUST_PROXY || 'true',
      COOKIE_SECURE,
      DB_PATH: panel.DB_PATH || DB_PATH,
    },
  });
  child.unref();
  fs.writeFileSync(PID_FILE, String(child.pid));
  return { pid: child.pid };
}

async function stopService() {
  const pid = readPid();
  if (!isAlive(pid)) {
    try {
      fs.unlinkSync(PID_FILE);
    } catch {
      /* ignore */
    }
    return { already: true };
  }
  try {
    process.kill(pid, 'SIGTERM');
  } catch {
    /* ignore */
  }
  for (let index = 0; index < 30 && isAlive(pid); index += 1) {
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  const stillAlive = isAlive(pid);
  if (stillAlive) {
    try {
      process.kill(pid, 'SIGKILL');
    } catch {
      /* ignore */
    }
  }
  try {
    fs.unlinkSync(PID_FILE);
  } catch {
    /* ignore */
  }
  return { pid, forced: stillAlive };
}

async function waitReady(port, timeoutMs = 60000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/health`, {
        signal: AbortSignal.timeout(2500),
      });
      if (response.ok) return await response.json();
    } catch {
      /* not ready yet */
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  return null;
}

function writeNginxSnippet() {
  const body = `# =============================================================================
#  Lith Tools 站点反向代理配置（由 deploy/panel-install.js 生成）
#
#  用法：
#    宝塔：网站 → 你的站点 → 配置文件 → 把下面的 server { } 内容合并进去
#          （或使用「反向代理」功能，目标 URL 填 http://127.0.0.1:${PORT}）
#    小皮：网站 → 站点 → 配置文件 → 同样合并进 server { }
#
#  只需要改一处：server_name 换成自己的域名。
# =============================================================================

server {
    listen 80;
    server_name tools.example.com;          # ← 换成你的域名

    # 站点请求体上限（Lith Tools 服务端上限 2MB）
    client_max_body_size 2m;

    location / {
        proxy_pass http://127.0.0.1:${PORT};
        proxy_http_version 1.1;
        proxy_read_timeout 120s;
        proxy_send_timeout 120s;
        proxy_connect_timeout 30s;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_buffering off;
    }

    location = /api/health {
        proxy_pass http://127.0.0.1:${PORT}/api/health;
        access_log off;
    }
}
`;
  try {
    fs.writeFileSync(NGINX_FILE, body, 'utf8');
    return NGINX_FILE;
  } catch {
    return null;
  }
}

function ensureDotEnv() {
  if (fs.existsSync(DOT_ENV)) return { created: false };
  const result = spawnSync(process.execPath, [path.join(ROOT, 'deploy', 'init-env.cjs')], {
    cwd: ROOT,
    stdio: 'inherit',
    env: {
      ...process.env,
      PORT: String(PORT),
      PUBLIC_ORIGIN: ORIGIN,
      DB_PATH,
      TRUST_PROXY: 'true',
      COOKIE_SECURE,
    },
  });
  if (result.status !== 0) warnLine('生成 .env 失败，请检查项目目录权限');
  return { created: result.status === 0 };
}

/** root 运行时把 .env / data 交给面板用户，避免子进程（www）读不到配置或写不了数据库。 */
function fixOwnership() {
  if (isWin || !isRoot() || !PANEL_USER || PANEL_USER === 'root') return;
  run('chown', ['-R', `${PANEL_USER}:${PANEL_USER}`, DATA_DIR]);
  const logsDir = path.join(ROOT, 'logs');
  try {
    fs.mkdirSync(logsDir, { recursive: true });
    run('chown', ['-R', `${PANEL_USER}:${PANEL_USER}`, logsDir]);
  } catch {
    /* ignore */
  }
  if (fs.existsSync(DOT_ENV)) {
    run('chown', [`${PANEL_USER}:${PANEL_USER}`, DOT_ENV]);
    try {
      fs.chmodSync(DOT_ENV, 0o600);
    } catch {
      /* ignore */
    }
  }
}

function writePanelEnv() {
  const body = `# Lith Tools 启动参数（由 deploy/panel-install.js 生成，可修改后重启）
# 面板站点的 80/443 由 Nginx 使用，应用监听高位端口后由站点反向代理
PORT=${PORT}
# 127.0.0.1 = 仅本机（推荐，由 Nginx 反代）；直接 IP:端口 访问改成 0.0.0.0
HOST=${HOST}
NODE_ENV=production
# 对外访问地址；配置 HTTPS 后改成 https://你的域名
PUBLIC_ORIGIN=${ORIGIN}
# 位于 Nginx / Cloudflare 后面时保持 true
TRUST_PROXY=true
# HTTPS 部署请设为 true；本地 HTTP 测试为 false
COOKIE_SECURE=${COOKIE_SECURE}
# SQLite 数据库（data/ 目录请一并备份）
DB_PATH=${DB_PATH}
`;
  if (CHECK_ONLY) return false;
  if (fs.existsSync(PANEL_ENV) && !has('--force')) {
    infoLine('deploy/panel.env 已存在，保留原有配置（想覆盖可加 --force）');
    return true;
  }
  fs.writeFileSync(PANEL_ENV, body, 'utf8');
  return true;
}

/* ------------------------------------------------------------------ main */
(async () => {
  out('');
  out('============================================================');
  out('  Lith Tools 面板部署准备（依赖 + 构建 + 启动 + 反向代理配置）');
  out('============================================================');
  out(`  项目目录：${ROOT}`);
  out(`  计划端口：${PORT}　监听地址：${HOST}　数据目录：${DATA_DIR}`);
  if (CHECK_ONLY) out('  模式：只检查（--check），不会修改任何文件');

  const TOTAL = 6;
  const todo = [];

  if (has('--stop')) {
    const result = await stopService();
    out('');
    if (result.already) okLine('当前没有由本脚本启动的服务（没有找到 deploy/panel.pid）');
    else okLine(`已停止服务（PID ${result.pid}${result.forced ? '，超时后强制结束' : ''}），数据保留在 ${DATA_DIR}`);
    out('');
    process.exit(0);
  }

  if (has('--start')) {
    out('');
    fixOwnership();
    if (!fs.existsSync(path.join(ROOT, 'dist-server', 'server', 'index.js'))) {
      warnLine('尚未构建（dist-server 不存在），请先运行：node deploy/panel-install.js');
      process.exit(1);
    }
    const started = startService();
    if (started.already) infoLine(`服务已在运行（PID ${started.pid}）`);
    else okLine(`服务已启动（PID ${started.pid}），日志：logs/lith-tools.log`);
    const health = await waitReady(PORT);
    if (health) okLine(`已就绪：http://127.0.0.1:${PORT}/`);
    else warnLine('还没就绪，稍等几秒；或查看 logs/lith-tools.log');
    const snippet = writeNginxSnippet();
    if (snippet) infoLine(`反向代理配置已生成：${path.relative(ROOT, snippet)}`);
    out('');
    process.exit(0);
  }

  /* 1. Node */
  step(1, TOTAL, '检查 Node.js');
  const node = nodeVersionOk();
  if (node.ok) {
    okLine(`Node.js v${process.versions.node}${node.best ? '（推荐版本）' : '（可用；建议升级到 v24）'}`);
  } else {
    warnLine(`Node.js v${process.versions.node} 版本过低，需要 ≥ 22.5（推荐 v24）`);
    if (isWin) infoLine('到 https://nodejs.org/ 下载 v24 安装包，安装后重新打开终端再运行本脚本');
    else infoLine('Ubuntu / Debian：curl -fsSL https://deb.nodesource.com/setup_24.x | bash - && apt-get install -y nodejs');
    todo.push('升级 Node.js 到 22.5+（推荐 24）后重新运行');
  }

  /* 2. data */
  step(2, TOTAL, '准备数据目录');
  const hadDb = fs.existsSync(DB_PATH);
  if (hadDb) infoLine('检测到已有数据库 data/lith-tools.db —— 只做权限检查，不会动里面的数据');
  if (CHECK_ONLY) {
    infoLine('（--check 模式，跳过创建）');
  } else {
    try {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      const probe = path.join(DATA_DIR, '.lith-tools-write-test');
      fs.writeFileSync(probe, 'ok');
      fs.unlinkSync(probe);
      okLine(`数据目录存在且可写：${DATA_DIR}`);
    } catch (error) {
      warnLine(`数据目录不可写：${(error && error.message) || error}`);
      infoLine('通常是权限问题，执行（www 换成面板站点用户）：');
      out(`     chown -R www:www "${DATA_DIR}"`);
      todo.push('修正 data 目录权限');
    }
  }
  const panelUser = detectPanelUser();
  if (!isWin && isRoot() && !CHECK_ONLY) {
    const result = run('chown', ['-R', `${panelUser}:${panelUser}`, DATA_DIR]);
    if (result.code === 0) okLine(`数据目录属主已设为 ${panelUser}（面板站点用户）`);
    else warnLine(`chown ${panelUser} 失败，可手动执行：chown -R ${panelUser}:${panelUser} ${DATA_DIR}`);
  } else if (!isWin) {
    infoLine(`当前用户：${os.userInfo().username}，面板站点用户通常为 ${panelUser}（需要时用管理员执行 chown）`);
  }

  /* 3. .env + panel.env */
  step(3, TOTAL, '写入 .env 与 deploy/panel.env');
  let dotEnvCreated = false;
  if (CHECK_ONLY) {
    infoLine(fs.existsSync(DOT_ENV) ? '.env 已存在' : '.env 不存在（正式运行时会自动生成，含随机管理员密码）');
  } else {
    const result = ensureDotEnv();
    dotEnvCreated = result.created;
    if (dotEnvCreated) okLine('.env 已生成（随机管理员密码见上方输出）');
    else infoLine('.env 已存在，保留原有 SMTP / DeepSeek / LCZOJ 配置');
  }
  if (CHECK_ONLY) {
    infoLine(`（--check 模式，跳过写入 panel.env；将写入 PORT=${PORT} HOST=${HOST}）`);
  } else {
    writePanelEnv();
    fixOwnership();
    okLine(`已写入 deploy/panel.env（PORT=${PORT}，HOST=${HOST}）`);
  }

  const free = await isPortFree(PORT, HOST);
  if (free) okLine(`端口 ${PORT} 目前空闲，可以启动`);
  else {
    warnLine(`端口 ${PORT} 已被占用（可能是已经启动过的 Lith Tools）`);
    infoLine('可运行 node deploy/check-env.js 查看，或修改 deploy/panel.env 的 PORT 后重启');
  }

  /* 4. 依赖 + 构建 */
  step(4, TOTAL, '安装依赖并构建生产版本');
  if (CHECK_ONLY) {
    infoLine('（--check 模式，跳过；正式运行会执行 npm ci --include=dev && npm run build）');
  } else if (!node.ok) {
    warnLine('Node 版本不满足要求，跳过构建；升级 Node 后重新运行本脚本');
    todo.push('升级 Node 后重新运行 node deploy/panel-install.js');
  } else if (SKIP_BUILD) {
    infoLine('（--no-build，已跳过依赖安装与构建）');
  } else if (!fs.existsSync(path.join(ROOT, 'dist-server', 'server', 'index.js'))) {
    infoLine('正在安装依赖（约 1~3 分钟）……');
    const install = runNpm(['ci', '--include=dev'], { inherit: true });
    if (install.code !== 0) {
      warnLine('npm ci 失败，请检查网络或 Node/npm 安装');
      todo.push('修复 npm ci 错误后重新运行');
    } else {
      infoLine('正在构建（约 1 分钟）……');
      const build = runNpm(['run', 'build'], { inherit: true });
      if (build.code !== 0) {
        warnLine('npm run build 失败，请查看上方日志');
        todo.push('修复构建错误后重新运行');
      } else {
        okLine('构建完成：dist/ + dist-server/');
      }
    }
  } else {
    infoLine('检测到已有构建产物，跳过构建（强制重建请删除 dist-server 后重跑，或不要加 --no-build）');
  }

  /* 5. 启动 */
  step(5, TOTAL, '启动服务（后台运行，关闭终端也不停）');
  if (CHECK_ONLY) {
    infoLine('（--check 模式，跳过启动；启动命令：node deploy/panel-install.js --start）');
  } else if (!node.ok || !fs.existsSync(path.join(ROOT, 'dist-server', 'server', 'index.js'))) {
    warnLine('尚未构建或 Node 版本不足，跳过启动');
    todo.push('修复构建/Node 后运行 node deploy/panel-install.js --start');
  } else if (!free) {
    const health = await waitReady(PORT, 3000);
    if (health) okLine(`端口上已有 Lith Tools 在运行，直接使用即可`);
    else {
      warnLine(`端口 ${PORT} 被其他程序占用，请修改 deploy/panel.env 的 PORT 后重试`);
      todo.push('更换端口后重启');
    }
  } else {
    const started = startService();
    if (started.already) infoLine(`服务已在运行（PID ${started.pid}）`);
    else infoLine(`已后台启动（PID ${started.pid}），日志：logs/lith-tools.log`);
    const health = await waitReady(PORT);
    if (health) okLine(`网站已就绪：http://127.0.0.1:${PORT}/`);
    else {
      warnLine('启动后 60 秒内健康检查未通过，请查看 logs/lith-tools.log');
      todo.push('查看 logs/lith-tools.log 里的报错');
    }
  }

  /* 6. Nginx + 检查 */
  step(6, TOTAL, '生成站点反向代理配置 + 环境检查');
  if (CHECK_ONLY) {
    infoLine('（--check 模式，跳过生成）');
  } else {
    const snippet = writeNginxSnippet();
    if (snippet) okLine(`反向代理配置已生成：${path.relative(ROOT, snippet)}（复制到面板站点配置）`);
    else warnLine('生成 deploy/panel-nginx.conf 失败，请检查目录权限');
  }
  if (!CHECK_ONLY) run(process.execPath, [path.join(ROOT, 'deploy', 'check-env.js')], { inherit: true });

  const startCommand = isWin ? 'deploy\\panel-start.bat' : 'bash deploy/panel-start.sh';
  out('');
  out('============================================================');
  out(CHECK_ONLY ? '  检查完成。确认无误后去掉 --check 正式执行。' : '  准备完成。接下来在面板里完成两步配置');
  out('============================================================');
  out('');
  out('  ① 让域名能访问（面板站点反向代理）');
  out(`     宝塔：网站 → 你的站点 → 反向代理 → 目标 URL 填 http://127.0.0.1:${PORT}`);
  out('           或在「配置文件」里粘贴 deploy/panel-nginx.conf（记得改 server_name）');
  out('     小皮：网站 → 站点 → 配置文件，粘贴 deploy/panel-nginx.conf 的内容');
  out('');
  out('  ② 上 HTTPS');
  out('     面板站点 → SSL → Let\'s Encrypt 一键申请 → 开启强制 HTTPS');
  out('     然后把 deploy/panel.env 里 COOKIE_SECURE 改为 true，并重启服务');
  out('');
  out('  打开网站');
  out(`     本机：http://127.0.0.1:${PORT}/`);
  out(`     管理员：admin　初始密码见 .env 或首次运行本脚本的输出（登录后请立即修改）`);
  out('');
  out('  以后交给面板守护进程（开机自启 / 面板里看状态）');
  out(`     先停止本脚本启动的进程：node deploy/panel-install.js --stop`);
  out(`     再建 Node 项目：启动命令 ${startCommand}　端口 ${PORT}　运行用户 ${panelUser}`);
  out('     或 PM2：pm2 start deploy/ecosystem.config.cjs && pm2 save && pm2 startup');
  out('');
  out('  常用命令');
  out('     启动：node deploy/panel-install.js --start　　停止：--stop　　环境检查：node deploy/check-env.js');
  out('  详细教程：docs/PANEL.md');
  if (todo.length) {
    out('');
    out('  还需要手动完成：');
    todo.forEach((item, index) => out(`     ${index + 1}. ${item}`));
  }
  out('');
})();
