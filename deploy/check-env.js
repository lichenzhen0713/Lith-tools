#!/usr/bin/env node
'use strict';

/**
 * Lith Tools 环境自检（面板 / Docker / 裸机都能用）
 *
 *   node deploy/check-env.js
 *
 * 只做检查，不修改任何数据。检查项：
 *   1. Node.js 版本与 node:sqlite 是否可用
 *   2. .env / deploy/panel.env 是否存在、包含哪些配置项（不打印密钥）
 *   3. data/ 是否可写、数据库文件是否存在
 *   4. dist/ 与 dist-server/ 是否已构建
 *   5. 端口是否空闲 / 已有服务是否健康
 */

const fs = require('node:fs');
const net = require('node:net');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');
const DB_FILE = path.join(DATA_DIR, 'lith-tools.db');

function readEnv(file) {
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
    /* ignore */
  }
  return result;
}

const panel = readEnv(path.join(ROOT, 'deploy', 'panel.env'));
const port = Number.parseInt(panel.PORT || '8787', 10);
const host = panel.HOST || '127.0.0.1';

function line(char = '-') {
  console.log(char.repeat(64));
}
function title(text) {
  console.log('');
  console.log(`== ${text} ${'-'.repeat(Math.max(0, 60 - text.length))}`);
}
function ok(text) {
  console.log(`  ✓ ${text}`);
}
function warn(text) {
  console.log(`  ! ${text}`);
}
function info(text) {
  console.log(`  · ${text}`);
}

function packageVersion() {
  try {
    return require(path.join(ROOT, 'package.json')).version || '未知';
  } catch {
    return '未知';
  }
}

function nodeCheck() {
  const [major, minor] = process.versions.node.split('.').map((value) => Number.parseInt(value, 10));
  const versionOk = major > 22 || (major === 22 && minor >= 5);
  if (versionOk) ok(`Node.js v${process.versions.node}（要求 ≥ 22.5）`);
  else warn(`Node.js v${process.versions.node} 过低，需要 ≥ 22.5（推荐 24）`);

  try {
    const { DatabaseSync } = require('node:sqlite');
    if (typeof DatabaseSync === 'function') ok('node:sqlite 可用');
    else warn('node:sqlite 导出异常');
  } catch (error) {
    warn(`node:sqlite 不可用：${(error && error.message) || error}`);
  }
  return versionOk;
}

function envCheck() {
  const dotEnv = path.join(ROOT, '.env');
  if (fs.existsSync(dotEnv)) {
    const values = readEnv(dotEnv);
    ok(`.env 存在（${Object.keys(values).length} 个配置项）`);
    const important = ['ADMIN_USERNAME', 'ADMIN_PASSWORD', 'SMTP_HOST', 'DEEPSEEK_API_KEY', 'LCZOJ_BASE_URL'];
    info(`关键项：${important.map((key) => `${key}=${values[key] ? '已配置' : '未配置'}`).join(' · ')}`);
  } else {
    warn('.env 不存在：首次运行 node deploy/panel-install.js 或 deploy/init-env.cjs 生成');
  }

  const panelFile = path.join(ROOT, 'deploy', 'panel.env');
  if (fs.existsSync(panelFile)) {
    ok('deploy/panel.env 存在');
    info(`PORT=${panel.PORT || '默认 8787'} · HOST=${panel.HOST || '默认 127.0.0.1'} · PUBLIC_ORIGIN=${panel.PUBLIC_ORIGIN || '未设置'}`);
  } else {
    warn('deploy/panel.env 不存在：面板启动将使用默认 127.0.0.1:8787');
  }
}

function dataCheck() {
  if (!fs.existsSync(DATA_DIR)) {
    warn(`data/ 不存在：${DATA_DIR}`);
    return;
  }
  try {
    const probe = path.join(DATA_DIR, '.lith-tools-check');
    fs.writeFileSync(probe, 'ok');
    fs.unlinkSync(probe);
    ok(`data/ 可写：${DATA_DIR}`);
  } catch (error) {
    warn(`data/ 不可写：${(error && error.message) || error}`);
  }
  if (fs.existsSync(DB_FILE)) {
    const size = fs.statSync(DB_FILE).size;
    ok(`数据库存在：data/lith-tools.db（${(size / 1024).toFixed(0)} KB）`);
  } else {
    info('数据库尚未创建，首次启动时自动建库并写入默认管理员');
  }
}

function buildCheck() {
  const dist = path.join(ROOT, 'dist', 'index.html');
  const server = path.join(ROOT, 'dist-server', 'server', 'index.js');
  if (fs.existsSync(dist)) ok('前端已构建：dist/index.html');
  else warn('前端未构建：缺少 dist/index.html（执行 npm run build）');
  if (fs.existsSync(server)) ok('服务端已构建：dist-server/server/index.js');
  else warn('服务端未构建：缺少 dist-server/server/index.js（执行 npm run build）');
}

function probePort() {
  return new Promise((resolve) => {
    const target = host === '0.0.0.0' ? '127.0.0.1' : host;
    const socket = net.connect({ port, host: target });
    socket.setTimeout(1500);
    socket.once('connect', () => {
      socket.destroy();
      resolve('occupied');
    });
    socket.once('timeout', () => {
      socket.destroy();
      resolve('unknown');
    });
    socket.once('error', () => {
      const server = net.createServer();
      server.once('error', () => resolve('denied'));
      server.once('listening', () => server.close(() => resolve('free')));
      try {
        server.listen(port, host);
      } catch {
        resolve('denied');
      }
    });
  });
}

async function portCheck() {
  const state = await probePort();
  if (state === 'free') {
    ok(`端口 ${port} 空闲（监听 ${host}）`);
    return;
  }
  if (state === 'occupied') {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/health`, { signal: AbortSignal.timeout(3000) });
      const data = await response.json();
      if (response.ok && data.ok) ok(`端口 ${port} 上已有 Lith Tools 在运行（/api/health 正常）`);
      else warn(`端口 ${port} 已被占用，但不是健康的 Lith Tools（HTTP ${response.status}）`);
    } catch {
      warn(`端口 ${port} 已被占用（无法连接 /api/health）`);
    }
    return;
  }
  warn(`端口 ${port} 无法监听（可能是权限不足或地址不可用）`);
}

(async () => {
  line('=');
  console.log(`  Lith Tools 环境自检（v${packageVersion()}）`);
  console.log(`  项目目录：${ROOT}`);
  line('=');

  title('Node.js');
  const versionOk = nodeCheck();

  title('配置文件');
  envCheck();

  title('数据目录');
  dataCheck();

  title('构建产物');
  buildCheck();

  title('端口');
  await portCheck();

  line('=');
  if (!versionOk) {
    console.log(' 结论：Node.js 版本不满足要求，请升级到 22.5+（推荐 24）。');
    process.exit(1);
  }
  console.log(' 自检完成。若上方有「!」项，请按提示处理后再启动。');
  line('=');
})();
