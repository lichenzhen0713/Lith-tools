'use strict';

/**
 * PM2 配置（宝塔 PM2 管理器 / 小皮进程守护 / 手动 PM2 均可使用）：
 *   pm2 start deploy/ecosystem.config.cjs
 *   pm2 save
 *   pm2 startup    # 开机自启（按提示执行输出的命令）
 *
 * 运行参数优先读取 deploy/panel.env（与 panel-start 脚本一致），
 * SMTP / DeepSeek / LCZOJ 等配置仍从项目根目录的 .env 读取。
 * 注意：SQLite 是单进程模型，instances 必须保持 1。
 */

const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

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
    /* panel.env 不存在时使用默认值 */
  }
  return result;
}

const panel = readEnv(path.join(__dirname, 'panel.env'));

module.exports = {
  apps: [
    {
      name: 'lith-tools',
      cwd: root,
      script: 'dist-server/server/index.js',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      kill_timeout: 10000,
      merge_logs: true,
      time: true,
      env: {
        NODE_ENV: 'production',
        PORT: panel.PORT || '8787',
        HOST: panel.HOST || '127.0.0.1',
        PUBLIC_ORIGIN: panel.PUBLIC_ORIGIN || '',
        TRUST_PROXY: panel.TRUST_PROXY || 'true',
        COOKIE_SECURE: panel.COOKIE_SECURE || 'false',
        ...(panel.DB_PATH ? { DB_PATH: panel.DB_PATH } : {}),
      },
    },
  ],
};
