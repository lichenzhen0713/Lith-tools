# deploy/

| 文件 | 用途 |
| --- | --- |
| `install.sh` | Linux 一键部署：检查/安装 Node 24、安装依赖、构建、生成 `.env`、安装 systemd |
| `install.bat` | Windows 一键部署：安装依赖、构建、生成 `.env`、前台启动 |
| `init-env.cjs` | 首次生成 `.env`（已存在则不改动），随机管理员密码；安装脚本与面板脚本共用 |
| `panel-install.js` | 面板一键准备 + 启动（与 LCZOJ 一致）：检查环境、装依赖、构建、写 `panel.env`、后台启动、生成反代配置 |
| `panel-install.bat` | Windows 下双击运行 `panel-install.js`（小皮 / 宝塔 Windows） |
| `panel.env.example` | 面板启动参数模板（端口、监听地址、PUBLIC_ORIGIN、Cookie 等） |
| `panel-start.sh` / `panel-start.bat` | 宝塔 / 小皮 / PM2 的启动命令（工作目录 = 项目根目录，自动读取 `panel.env`） |
| `check-env.js` | 环境自检：Node、配置文件、数据目录、构建产物、端口健康 |
| `fix-lczoj-oauth.sh` | 一键修正 Lith Tools ↔ LCZOJ OAuth 配置并重启验证 |
| `ecosystem.config.cjs` | PM2 配置（自动读取 `deploy/panel.env`） |
| `lith-tools.service` | systemd 模板（install.sh 会生成真实路径版本） |
| `nginx-lith-tools.conf` | Nginx HTTP 反向代理模板（反向代理到 `127.0.0.1:8787`） |
| `nginx-lith-tools-ssl.conf` | Nginx HTTPS 完整模板（80 跳转 + 443 TLS 1.2 + 全站反代） |
| `panel-nginx.conf` | 由 `panel-install.js` 生成，可直接粘贴到面板站点配置 |

详细步骤见：

- [docs/PANEL.md](../docs/PANEL.md) — 宝塔 / 小皮面板
- [docs/DEPLOYMENT.md](../docs/DEPLOYMENT.md) — systemd / Nginx / Docker / 备份升级
