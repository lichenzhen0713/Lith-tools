# 部署指南

本项目是单进程 Node.js 应用：同一端口提供 API、静态资源与 SPA 回退。生产部署只需要 Node.js 与一个可写的数据目录。

## 环境要求

- **Node.js ≥ 22.5**（推荐 24；22.5 起内置 `node:sqlite`）
- npm 10+
- 可写的 `data/` 目录（或通过 `DB_PATH` 指定位置）
- 反向代理（推荐 Nginx / Caddy）与 HTTPS

不需要 MySQL、PHP、Redis、Docker 或原生编译工具链。

## 构建与启动

```bash
npm ci
cp .env.example .env       # 填写 PUBLIC_ORIGIN、SMTP 等
npm run db:seed            # 首次部署：建库 + 工具目录 + 管理员
npm run build              # dist/ + dist-server/
NODE_ENV=production node dist-server/server/index.js
```

默认监听 `127.0.0.1:8787`。可用 `HOST=0.0.0.0` 直接对外（不推荐），或交给反向代理。

首次启动后立即登录并修改默认管理员密码。

## 环境变量

完整列表见 [`.env.example`](../.env.example) 与 README 的「配置」章节。生产环境至少确认：

| 变量 | 建议值 | 说明 |
| --- | --- | --- |
| `NODE_ENV` | `production` | 启用 Secure Cookie（默认）与更严格的日志级别 |
| `HOST` / `PORT` | `127.0.0.1` / `8787` | 由反向代理转发 |
| `PUBLIC_ORIGIN` | `https://tools.example.com` | 邮件重置链接与 Origin 校验 |
| `TRUST_PROXY` | `true` | 位于 Nginx/Cloudflare 后 |
| `DB_PATH` | `/var/lib/lith-tools/lith-tools.db` | 建议放在持久化目录 |
| `ADMIN_PASSWORD` | 强密码 | 仅首次创建超级管理员时使用 |
| `SMTP_*` | 你的邮件服务 | 不配置则注册/找回密码无法收到验证码 |
| `DEEPSEEK_API_KEY` | 你的 DeepSeek Key | 启用 AI 助手；仅服务端使用 |
| `DEEPSEEK_BASE_URL` | `https://api.deepseek.com/v1` | OpenAI 兼容接口地址 |
| `COOKIE_SECURE` | 保持默认 | 本地 HTTP 验证生产构建时临时设为 `false` |

> SMTP 与 DeepSeek 也可以在 **管理后台 → 系统设置** 中配置，保存后立即生效；后台值优先于环境变量。密钥保存在 SQLite 的 `settings` 表中，请确保 `data/` 目录仅服务账户可读。

## systemd 示例

```ini
# /etc/systemd/system/lith-tools.service
[Unit]
Description=Lith Tools
After=network.target

[Service]
Type=simple
User=lith
Group=lith
WorkingDirectory=/opt/lith-tools
EnvironmentFile=/opt/lith-tools/.env
ExecStart=/usr/bin/node dist-server/server/index.js
Restart=on-failure
RestartSec=3
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=full

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now lith-tools
sudo journalctl -u lith-tools -f
```

## Nginx 反向代理

```nginx
server {
    listen 80;
    server_name tools.example.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name tools.example.com;

    ssl_certificate     /etc/letsencrypt/live/tools.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/tools.example.com/privkey.pem;

    client_max_body_size 2m;

    location / {
        proxy_pass http://127.0.0.1:8787;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

启用后设置：

```env
TRUST_PROXY=true
PUBLIC_ORIGIN=https://tools.example.com
```

## 数据备份与恢复

所有数据保存在一个 SQLite 文件中（默认 `data/lith-tools.db`）。WAL 模式下还有 `-wal` / `-shm` 文件。

**推荐备份方式（运行中）：**

```bash
sqlite3 data/lith-tools.db ".backup 'backup-$(date +%F).db'"
```

**简单方式（短暂停服）：**

```bash
sudo systemctl stop lith-tools
cp data/lith-tools.db backup-$(date +%F).db
sudo systemctl start lith-tools
```

恢复：停服 → 用备份替换 `data/lith-tools.db` → 删除同名 `-wal`/`-shm` → 启动。启动时会自动执行未应用的迁移。

建议将备份纳入定时任务，并定期做一次恢复演练。

## 升级

```bash
git pull
npm ci
npm run build
sudo systemctl restart lith-tools
```

数据库迁移由服务端启动时自动执行（`PRAGMA user_version` 顺序迁移）。升级前先备份数据库。

## Docker（可选）

仓库提供 `Dockerfile` 与 `docker-compose.yml`：

```bash
docker compose up -d --build
```

- 数据卷：`./data:/app/data`
- 端口：`8787:8787`
- 通过环境变量覆盖配置；未设置 `PUBLIC_ORIGIN` 时默认为 `http://localhost:8787`

> 说明：该 Docker 配置为多阶段构建，尚未在本项目的 CI 中做容器构建验证。请在正式部署前自行构建并检查镜像、权限与数据卷。

## 健康检查与日志

- 健康检查：`GET /api/health` → `{ "ok": true, "uptime": 123 }`
- 访问日志默认不记录每个请求；错误写入 stderr，由 systemd/journald 或容器日志收集。
- 启动日志会输出工具数量、是否创建管理员、示例内容、封禁归档数量。

## 常见问题

| 现象 | 排查 |
| --- | --- |
| 启动报端口占用 | `lsof -i :8787` / 修改 `PORT` |
| 登录成功但刷新后掉线 | 生产环境未用 HTTPS 却启用了 Secure Cookie；为测试设 `COOKIE_SECURE=false`，生产请配置 HTTPS |
| 注册收不到验证码 | 未配置 SMTP；查看服务端日志中的验证码，或配置 `SMTP_*` |
| 写操作返回 403「请求来源校验失败」 | 反向代理未透传 `Host`，或 `PUBLIC_ORIGIN` 与访问域名不一致 |
| 返回 429 | 触发限流，等待窗口结束；限流为进程内实现，重启会清零 |
| IP 查询/汇率失败 | 服务器无法访问外部网络，或上游限流；工具页面会提示稍后重试 |
| AI 助手 503 | 未配置 `DEEPSEEK_API_KEY`，或修改 `.env` 后未重启 |
| 页面 404 / 空白 | 未执行 `npm run build`，或反向代理没有把请求交给 Node 进程 |

## 安全清单

- [ ] 修改默认管理员密码，必要时创建独立管理员账户
- [ ] 全站 HTTPS，`COOKIE_SECURE` 保持默认
- [ ] 配置 `PUBLIC_ORIGIN` 与 `TRUST_PROXY`
- [ ] `.env` 权限设为 `600`，不要提交到版本库
- [ ] 定期备份 `data/`
- [ ] SMTP 使用授权码而非邮箱登录密码
- [ ] 限制服务器出网（仅放行 SMTP 与所需第三方 API）
- [ ] 定期 `npm audit` 与升级依赖
