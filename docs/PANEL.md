# 宝塔 / 小皮面板部署

Lith Tools 是单进程 Node.js 应用：Node 进程监听 `127.0.0.1:8787`，由面板的 Nginx 反向代理到域名。
不需要 PHP、MySQL、Redis 或 Docker。

> 最低要求 **Node.js 22.5**（推荐 24）。面板自带的 Node 版本管理器如果只有 20 或更低，请先升级到 22/24，
> 否则启动会报 `Cannot find module 'node:sqlite'`。

## 一、一键部署脚本

### Linux（宝塔 / 小皮 Linux 版 / 普通服务器）

```bash
cd /www/wwwroot/lith-tools      # 换成你的项目目录
sudo bash deploy/install.sh --origin https://tools.example.com
```

脚本会检查/安装 Node 24、执行 `npm ci` 与 `npm run build`、生成 `.env`（随机管理员密码）、
创建 `lith-tools` systemd 服务并启动。

面板部署不要 systemd，使用：

```bash
bash deploy/install.sh --no-service
```

然后回到面板创建 Node 项目 / 进程守护（见下文），启动命令：

```bash
node dist-server/server/index.js
```

### Windows（小皮 Windows 版本机 / 本机试运行）

双击或在命令行执行：

```bat
deploy\install.bat
```

脚本会安装依赖、构建、生成 `.env` 并前台启动。面板部署时把「启动命令」设为：

```bat
node dist-server\server\index.js
```

## 二、宝塔面板

### 1. 安装 Node.js

宝塔 → 软件商店 → 安装 **Node.js 版本管理器**（或 PM2 管理器），安装 **Node 22 或 24**。

> 如果面板只提供旧版本，可在终端用 nvm / 官方二进制安装 Node 22+，并让面板使用该 node 路径。

### 2. 上传代码并构建

把项目上传到 `/www/wwwroot/lith-tools`（或 `git clone`），在宝塔终端执行：

```bash
cd /www/wwwroot/lith-tools
npm ci
npm run build
bash deploy/install.sh --no-service --skip-build --origin https://tools.example.com
```

`install.sh --no-service` 只生成 `.env` 和构建产物，不安装 systemd 服务。
也可以直接复制 `.env.example` 为 `.env` 后手动修改。

### 3. 创建 Node 项目

宝塔 → 网站 → **Node 项目** → 添加：

| 配置项 | 值 |
| --- | --- |
| 项目目录 | `/www/wwwroot/lith-tools` |
| 启动命令 | `node dist-server/server/index.js`（或 `npm start`） |
| 项目端口 | `8787` |
| 运行用户 | `www`（不要用 root） |
| Node 版本 | 22 / 24 |

保存后启动，访问 `http://127.0.0.1:8787/api/health` 应返回 `{"ok":true,...}`。

也可以使用 PM2：

```bash
cd /www/wwwroot/lith-tools
pm2 start deploy/ecosystem.config.cjs
pm2 save
```

宝塔 PM2 管理器里会看到 `lith-tools`。

### 4. 反向代理与 HTTPS

宝塔 → 网站 → 你的站点 → 设置：

1. **反向代理** → 目标 URL 填 `http://127.0.0.1:8787`，开启「发送域名」为 `$host`；
2. **SSL** → 申请 Let's Encrypt 证书并开启强制 HTTPS；
3. 修改 `.env`：

```ini
PUBLIC_ORIGIN=https://tools.example.com
TRUST_PROXY=true
COOKIE_SECURE=true
```

4. 重启 Node 项目。

### 5. 权限与数据

```bash
chown -R www:www /www/wwwroot/lith-tools
chmod 600 /www/wwwroot/lith-tools/.env
```

数据库默认在 `data/lith-tools.db`。面板备份时把整个 `data/` 目录纳入备份计划。

## 三、小皮面板

小皮面板（phpstudy / xp.cn）不同版本菜单名略有差异，整体步骤与宝塔一致：

1. **软件管理 → Node.js**：安装 Node 22 / 24；
2. **网站 → 创建网站**：绑定域名，根目录填项目目录；
3. 在项目目录执行：

```bash
npm ci
npm run build
bash deploy/install.sh --no-service --skip-build --origin https://tools.example.com
```

Windows 小皮可直接双击 `deploy\install.bat`，或手动：

```bat
npm ci
npm run build
node deploy\init-env.cjs
```

4. **网站设置 → 反向代理**：目标 `http://127.0.0.1:8787`；
5. **进程守护 / Node 项目**：工作目录项目根目录，启动命令：

```text
node dist-server/server/index.js
```

6. 开启 SSL，并把 `.env` 的 `PUBLIC_ORIGIN`、`TRUST_PROXY`、`COOKIE_SECURE` 改好；
7. 放行面板/系统防火墙的 80、443；**不要**对公网开放 8787。

## 四、环境变量

首次运行 `deploy/init-env.cjs` 会生成 `.env`（已存在则不改动）：

```ini
NODE_ENV=production
HOST=127.0.0.1
PORT=8787
PUBLIC_ORIGIN=https://tools.example.com
TRUST_PROXY=true
DB_PATH=/www/wwwroot/lith-tools/data/lith-tools.db
COOKIE_SECURE=true
ADMIN_USERNAME=admin
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=随机生成的密码
```

按需补充 SMTP、DeepSeek、LCZOJ 授权登录配置（见 `.env.example`）。
修改 `.env` 后必须重启 Node 进程。

## 五、升级

```bash
cd /www/wwwroot/lith-tools
git pull
npm ci
npm run build
# 面板里重启 Node 项目 / PM2 restart lith-tools / systemctl restart lith-tools
```

升级前先备份 `data/`。数据库迁移在启动时自动执行。

## 六、常见问题

| 现象 | 处理 |
| --- | --- |
| 启动报 `Cannot find module 'node:sqlite'` | Node 低于 22.5，切换到 Node 22/24 |
| 502 Bad Gateway | Node 进程未启动、端口不是 8787，或反向代理目标写错 |
| 登录后刷新掉线 | 未配置 HTTPS 却 `COOKIE_SECURE=true`；本地测试先设 `false`，生产请上 HTTPS |
| 写操作 403「请求来源校验失败」 | 反向代理未透传 `Host`，或 `PUBLIC_ORIGIN` 与访问域名不一致 |
| 页面空白 / 404 | 未执行 `npm run build`，或启动目录不是项目根目录 |
| 上传大文件失败 | 在 Nginx / 面板中设置 `client_max_body_size 2m`（默认请求体上限 2MB） |
| 收不到验证码 | 未配置 SMTP；开发模式会在服务端日志打印验证码 |
| 数据库只读 / 无法写入 | `data/` 目录属主不是运行用户，执行 `chown -R www:www data` |
