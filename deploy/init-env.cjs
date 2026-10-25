#!/usr/bin/env node
'use strict';

/**
 * 首次部署时生成 .env（已存在则完全不改动）。
 * 由 deploy/install.sh 与 deploy/install.bat 调用，也可以手动运行：
 *   node deploy/init-env.cjs
 *
 * 可通过环境变量覆盖：PORT / PUBLIC_ORIGIN / DB_PATH / ADMIN_EMAIL / TRUST_PROXY。
 * 生成的超级管理员密码会写入 .env 并打印到终端；数据库首次初始化时使用。
 */

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const target = path.join(root, '.env');

if (fs.existsSync(target)) {
  console.log('[init-env] .env 已存在，保留原配置');
  process.exit(0);
}

const port = String(process.env.PORT || '8787').trim() || '8787';
const origin = String(process.env.PUBLIC_ORIGIN || '').trim();
const dbPath = String(process.env.DB_PATH || '').trim() || path.join(root, 'data', 'lith-tools.db');
const adminEmail = String(process.env.ADMIN_EMAIL || '').trim() || 'admin@example.com';
const trustProxy = String(process.env.TRUST_PROXY || 'false').trim().toLowerCase() === 'true' ? 'true' : 'false';
const cookieSecure =
  String(process.env.COOKIE_SECURE || '').trim() !== ''
    ? String(process.env.COOKIE_SECURE).trim().toLowerCase() === 'true'
      ? 'true'
      : 'false'
    : origin.startsWith('https://')
      ? 'true'
      : 'false';
const password = crypto.randomBytes(12).toString('base64url');

const lines = [
  '# 由 deploy/init-env.cjs 生成；请勿提交到版本库',
  'NODE_ENV=production',
  'HOST=127.0.0.1',
  `PORT=${port}`,
  `PUBLIC_ORIGIN=${origin}`,
  `TRUST_PROXY=${trustProxy}`,
  `DB_PATH=${dbPath}`,
  `COOKIE_SECURE=${cookieSecure}`,
  'ADMIN_USERNAME=admin',
  `ADMIN_EMAIL=${adminEmail}`,
  `ADMIN_PASSWORD=${password}`,
  '',
];

fs.mkdirSync(path.dirname(target), { recursive: true });
fs.writeFileSync(target, lines.join('\n'), { mode: 0o600 });
try {
  fs.chmodSync(target, 0o600);
} catch {
  /* Windows 上 chmod 语义不同，忽略 */
}

console.log(`[init-env] 已生成 ${target}`);
console.log(`[init-env] 管理员账号：admin`);
console.log(`[init-env] 初始密码：${password}`);
console.log('[init-env] 首次登录后请立即修改密码，并按需补充 SMTP / DeepSeek / LCZOJ 配置');
if (cookieSecure === 'false') {
  console.log('[init-env] 当前 COOKIE_SECURE=false（HTTP 访问）；配置 HTTPS 后请改为 true 并重启');
}
