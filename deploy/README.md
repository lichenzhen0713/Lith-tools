# deploy/

| 文件 | 用途 |
| --- | --- |
| `install.sh` | Linux 一键部署：检查/安装 Node 24、安装依赖、构建、生成 `.env`、安装 systemd |
| `install.bat` | Windows 一键部署：安装依赖、构建、生成 `.env`、前台启动 |
| `init-env.cjs` | 首次生成 `.env`（已存在则不改动），随机管理员密码；两个安装脚本共用 |
| `panel-start.sh` / `panel-start.bat` | 宝塔 / 小皮 / PM2 的启动命令（工作目录 = 项目根目录） |
| `ecosystem.config.cjs` | PM2 配置：`pm2 start deploy/ecosystem.config.cjs` |
| `lith-tools.service` | systemd 模板（install.sh 会生成真实路径版本） |
| `nginx-lith-tools.conf` | Nginx 反向代理模板（反向代理到 `127.0.0.1:8787`） |

详细步骤见：

- [docs/PANEL.md](../docs/PANEL.md) — 宝塔 / 小皮面板
- [docs/DEPLOYMENT.md](../docs/DEPLOYMENT.md) — systemd / Nginx / Docker / 备份升级
