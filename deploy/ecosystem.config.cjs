'use strict';

/**
 * PM2 配置（宝塔 PM2 管理器 / 小皮进程守护 / 手动 PM2 均可使用）：
 *   pm2 start deploy/ecosystem.config.cjs
 *   pm2 save
 *   pm2 startup    # 开机自启（按提示执行输出的命令）
 *
 * 配置从项目根目录的 .env 读取；不要在这里写 SMTP / DeepSeek 等密钥。
 */

const path = require('node:path');

module.exports = {
  apps: [
    {
      name: 'lith-tools',
      cwd: path.resolve(__dirname, '..'),
      script: 'dist-server/server/index.js',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      time: true,
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};
