# 面板部署（宝塔面板 / 小皮面板）

本文说明在宝塔面板与小皮面板上部署 Lith Tools 的步骤，部署方式与 LCZOJ 一致。

**部署模型**：面板站点（Nginx）占用 80 / 443 端口，Lith Tools 监听 `127.0.0.1:8787`，由站点反向代理转发请求。

---

## 1. 部署流程概览

| 步骤 | 操作 | 执行方 |
| --- | --- | --- |
| ① 安装 Node.js | 在面板软件商店安装 **v24** | 手动，约 1 分钟 |
| ② 执行准备命令 | `node deploy/panel-install.js`：装依赖、构建、写配置、后台启动、生成反代配置 | 脚本自动 |
| ③ 配置站点 | 将生成的 `deploy/panel-nginx.conf` 内容合并到站点配置，并申请 SSL 证书 | 手动，约 1 分钟 |

命令执行完成后会输出服务就绪状态、管理员初始密码与后续操作清单。

---

## 2. 宝塔面板（Linux）

### 2.1 安装 Node.js v24

1. 左侧「软件商店」→ 搜索并安装 **Node.js 版本管理器**（部分版本名为 **PM2管理器**）；
2. 打开该插件 → 安装 **Node 版本 v24** → 设为默认版本。

Lith Tools 使用 Node.js 内置的 `node:sqlite` 模块，要求 Node.js ≥ 22.5（推荐 v24）；版本过低时启动会报
`Cannot find module 'node:sqlite'`。

### 2.2 上传项目并执行准备命令

1. 左侧「文件」→ 进入 `/www/wwwroot/` → 新建目录（建议以域名命名，例如 `tools.example.com`）；
2. 上传项目压缩包并解压，解压后该目录下应直接包含 `package.json`、`server/`、`src/`、`deploy/`；
3. 打开左侧「终端」，依次执行：

```bash
cd /www/wwwroot/tools.example.com     # 替换为实际目录
chown -R www:www .
node deploy/panel-install.js          # 装依赖 + 构建 + 写配置 + 后台启动 + 生成反代配置
```

该命令依次执行：检查 Node.js → 准备 `data/` → 首次生成 `.env`（随机管理员密码）→ 写入
`deploy/panel.env` → `npm ci --include=dev` + `npm run build` → 后台启动并等待 `/api/health` 通过 →
生成 `deploy/panel-nginx.conf` → 运行环境自检。

常用附加参数：

```bash
node deploy/panel-install.js --check     # 只检查环境，不修改文件
node deploy/panel-install.js --start     # 只启动后台服务
node deploy/panel-install.js --stop      # 停止后台服务
node deploy/panel-install.js --port 8080 # 换端口（同步改反向代理）
node deploy/panel-install.js --origin https://tools.example.com
node deploy/panel-install.js --no-build  # 已构建过，跳过装依赖/构建
```

### 2.3 配置站点反向代理

方式 A（使用面板的反向代理功能）：进入目标站点 →「反向代理」→「添加反向代理」，填写：

| 字段 | 值 |
| --- | --- |
| 代理名称 | `lith-tools` |
| 目标 URL | `http://127.0.0.1:8787` |
| 发送域名 | `$host` |

方式 B（直接编辑站点配置）：进入目标站点 →「配置文件」，把 `deploy/panel-nginx.conf` 的内容合并到
`server { }` 中，并修改 `server_name` 为实际域名。

保存后通过域名访问站点。

> 还没有域名时可以先直接用 `http://服务器公网IP:8787/` 访问（需把 `deploy/panel.env` 的 `HOST` 改成 `0.0.0.0`，
> 并在安全组放行端口）。默认管理员账号为 `admin`，**初始密码在首次运行 `panel-install.js` 时随机生成并打印**，
> 同时写入项目根目录的 `.env`。

### 2.4 申请 SSL 证书

站点 →「SSL」→「Let's Encrypt」→ 勾选域名 → 申请 → 开启「强制 HTTPS」。

注意事项（与 3.6 相同）：

- Nginx 1.31 使用 `listen 443 ssl;` + `http2 on;`，不要写 `listen ... http2;`；
- 证书私钥文件名按面板实际文件填写（可能是 `privkey.key`，不是 `privkey.pem`）；
- 如果 Chrome 报 `ERR_SSL_PROTOCOL_ERROR`、`openssl s_client -tls1_3` 报 `handshake failure`，把
  `ssl_protocols` 设为 `TLSv1.2`，详见 [3.6.4](#364-tls-13-握手异常)；
- 不要在站点里配置 `root` / `location ~* \.(js|css)$` 等静态规则，否则 `/assets` 会 404 导致白屏。

然后把 `deploy/panel.env` 改为：

```ini
PUBLIC_ORIGIN=https://tools.example.com
TRUST_PROXY=true
COOKIE_SECURE=true
```

重启服务：

```bash
node deploy/panel-install.js --stop
node deploy/panel-install.js --start
```

### 2.5 交由面板托管进程（可选）

`panel-install.js` 已在后台启动服务，进程号记录于 `deploy/panel.pid`。如需由面板托管并提供开机自启：

```bash
node deploy/panel-install.js --stop       # 先停止脚本启动的进程
```

随后在「网站 → Node 项目 → 添加」中填写：项目目录为站点目录，启动命令为
`bash deploy/panel-start.sh`，端口 `8787`，运行用户 `www`。也可使用 PM2：

```bash
npm i -g pm2
pm2 start deploy/ecosystem.config.cjs && pm2 save && pm2 startup
```

---

## 3. 小皮面板（phpStudy 面板）

### 3.0 三步快路径（推荐）

```
① 装 Node v24（面板软件商店有 Node 版本管理就一键装；否则 nodejs.org 下 .msi，勾 Add to PATH，重开终端）
     验证：node -v   →  v24.x

② 双击项目里的 deploy\panel-install.bat
     （等价于 node deploy\panel-install.js；只想检查环境就双击后在命令行加 --check）
     它会自动装依赖、构建、准备 data/、写配置、后台启动，并生成 deploy\panel-nginx.conf
     ★ 结束时屏幕会打印 admin 初始密码，记下来

③ 小皮面板 → 网站 → 创建网站（填域名，PHP 随便选）→ 该站点「配置文件」→
     把 deploy\panel-nginx.conf 的内容粘进 server { } → 重载配置 →
     浏览器打开 http://你的域名/，用 admin + 初始密码登录并改密码
```

小皮面板以 PHP 环境为主，本站不使用 PHP —— **面板只负责域名、证书与反向代理**；Lith Tools 自己监听
`8787` 端口，由面板的 Nginx（或 Apache）转发过去。

### 3.1 安装 Node.js

1. 面板「软件商店」若有 **Node.js / Node 版本管理**，直接安装 **v24**；
2. 否则手动安装：
   - **Windows**：<https://nodejs.org/zh-cn/download> 下载 v24 的 `.msi`，安装时勾选 **Add to PATH**；
     安装完**重新打开面板终端**；
   - **Linux**：`curl -fsSL https://deb.nodesource.com/setup_24.x | bash - && apt-get install -y nodejs`。
3. 验证：

```bash
node -v
```

### 3.2 上传代码

解压到站点目录：

- Windows 默认 `C:\phpstudy_pro\WWW\lith-tools`
- Linux 默认 `/www/wwwroot/lith-tools`

解压后应能看到 `package.json`、`server/`、`src/`、`deploy/`、`docs/`。

### 3.3 一键准备 + 启动

```bat
cd /d C:\phpstudy_pro\WWW\lith-tools
node deploy\panel-install.js --check   :: 可选：只检查环境
node deploy\panel-install.js           :: 一键准备 + 后台启动
:: 也可以直接双击 deploy\panel-install.bat
```

它会完成：检查 Node → 准备 `data/` → 生成 `.env`（首次）→ 写 `deploy/panel.env` →
`npm ci --include=dev` + `npm run build` → 后台启动（`deploy/panel.pid`，日志
`logs/lith-tools.log`）→ 生成 `deploy/panel-nginx.conf` → 环境自检。

### 3.4 建站 + 反向代理

1. 面板 →「网站」→「创建网站」，填域名，PHP 版本任选；
2. 进入站点 →「配置文件」，把 `deploy/panel-nginx.conf` 的内容合并进 `server { }`，
   把 `server_name` 改成自己的域名；
3. 若面板提供「反向代理」入口，也可直接新建：目标 URL `http://127.0.0.1:8787`，发送域名 `$host`；
4. 关键项：

```nginx
client_max_body_size 2m;
location / {
    proxy_pass http://127.0.0.1:8787;
    proxy_http_version 1.1;
    proxy_read_timeout 120s;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

5. 重载 Nginx / 重启 Apache 使配置生效。

### 3.5 防火墙放行（Windows）

```powershell
netsh advfirewall firewall add rule name="LithTools-80"  dir=in action=allow protocol=TCP localport=80
netsh advfirewall firewall add rule name="LithTools-443" dir=in action=allow protocol=TCP localport=443
```

云服务器还要在**安全组**里放行 80/443。

### 3.6 配置 HTTPS

#### 3.6.1 申请/确认证书

小皮 →「网站」→ 你的站点 →「SSL / 证书」→ 申请 **Let's Encrypt**，或上传已有证书。

确认实际文件名：

```bash
ls -l /xp/panel/vhost/ssl/tools.example.com/cert/
```

不同面板版本的文件名不同，常见：

```text
fullchain.pem
privkey.key      ← 注意不一定是 privkey.pem
```

配置里必须使用**实际存在的文件名**，否则 Nginx 会报：

```text
cannot load certificate key ... privkey.pem: No such file or directory
```

#### 3.6.2 完整 Nginx 配置

先备份原站点配置，再把内容替换为下面这份（域名、路径按实际修改）：

```nginx
server {
    listen 80;
    server_name tools.example.com;

    # Let's Encrypt 续期；若证书由小皮自动续期可保留
    location ^~ /.well-known/acme-challenge/ {
        root /xp/www/tools.example.com;
        default_type text/plain;
    }

    location / {
        return 301 https://$host$request_uri;
    }
}

server {
    listen 443 ssl;
    http2 on;
    server_name tools.example.com;

    # 证书路径按实际填写；私钥可能是 privkey.key
    ssl_certificate     /xp/panel/vhost/ssl/tools.example.com/cert/fullchain.pem;
    ssl_certificate_key /xp/panel/vhost/ssl/tools.example.com/cert/privkey.key;

    # 若 TLS 1.3 握手异常（Chrome 报 ERR_SSL_PROTOCOL_ERROR），只启用 TLS 1.2
    ssl_protocols TLSv1.2;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers on;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 1d;

    client_max_body_size 2m;

    # 禁止访问 .env / .git 等隐藏文件
    location ~ /\. {
        deny all;
    }

    # 所有页面、/assets、SPA 路由全部反代给 Node
    location / {
        proxy_pass http://127.0.0.1:8787;
        proxy_http_version 1.1;

        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Host $host;
        proxy_set_header Connection "";

        proxy_connect_timeout 30s;
        proxy_read_timeout 120s;
        proxy_send_timeout 120s;
        proxy_buffering off;
        proxy_redirect off;
    }

    location = /api/health {
        proxy_pass http://127.0.0.1:8787/api/health;
        access_log off;
    }
}
```

要点：

- Nginx 1.31 必须写 `listen 443 ssl;` + `http2 on;`，不能写 `listen ... http2;`；
- **不要**再配置 `root` / `index` / `location ~* \.(js|css)$` 等静态规则，否则 `/assets` 会被 Nginx 截走导致白屏；
- 如果小皮自动生成了 `ssl.conf` 并且里面有 `ssl_protocols TLSv1.2 TLSv1.3;`，要么删掉站点里的 `include .../ssl.conf;`，要么把 `ssl.conf` 里的协议改成只有 `TLSv1.2`。

#### 3.6.3 检查并重载

先找到面板 Nginx 的完整路径（`nginx` 可能不在 PATH）：

```bash
find /xp -maxdepth 6 -type f -name nginx -perm -u+x 2>/dev/null
```

假设为 `/xp/server/nginx/sbin/nginx`：

```bash
/xp/server/nginx/sbin/nginx -t
/xp/server/nginx/sbin/nginx -s reload
```

确认 TLS 版本真正生效：

```bash
/xp/server/nginx/sbin/nginx -T 2>/dev/null | grep -n "ssl_protocols"
```

应只看到 `ssl_protocols TLSv1.2;`。如果还有 `TLSv1.3`，说明被其他 `include` 覆盖：

```bash
grep -RIn "ssl_protocols" /xp/panel/vhost /xp/server/nginx/conf
```

#### 3.6.4 TLS 1.3 握手异常

如果出现：

- Chrome：`ERR_SSL_PROTOCOL_ERROR`
- `openssl s_client -tls1_3` 报 `handshake failure (alert 40)`
- 但 `openssl s_client -tls1_2` 正常

说明服务器 TLS 1.3 配置有问题。上面的配置已经用 `ssl_protocols TLSv1.2;` 规避；对普通站点 TLS 1.2 足够安全。

确认 TLS 1.2 正常：

```bash
printf '' | openssl s_client -connect 127.0.0.1:443 -servername tools.example.com -tls1_2 2>&1 | grep -E "Protocol|Cipher"
```

#### 3.6.5 应用配置并验证

```bash
cd /xp/www/tools.example.com
nano deploy/panel.env
```

确认：

```ini
PUBLIC_ORIGIN=https://tools.example.com
TRUST_PROXY=true
COOKIE_SECURE=true
```

重启：

```bash
node deploy/panel-install.js --stop
node deploy/panel-install.js --start
```

验证：

```bash
curl -I https://tools.example.com/
curl https://tools.example.com/api/health
curl -s https://tools.example.com/ | grep -o '/assets/[^"]*\.js' | head
curl -I https://tools.example.com/assets/上面的文件名.js
```

`/assets/*.js` 必须是 `200`，不能是 Nginx 的 404。

### 3.7 开机自启（可选，二选一）

- **面板计划任务**（推荐，Windows）：面板 →「计划任务」→ 添加任务
  - 执行程序：`cmd`
  - 参数：`/c "cd /d C:\phpstudy_pro\WWW\lith-tools && deploy\panel-start.bat"`
  - 触发方式：**开机启动**（或每分钟检测进程是否存活）
- **PM2**：`pm2 start deploy/ecosystem.config.cjs && pm2 save && pm2 startup`
  （自行用 PM2 托管时，先 `node deploy\panel-install.js --stop` 停掉脚本启动的进程，避免两份）

---

## 4. 一键部署脚本（可选）

除面板内的 `panel-install.js` 外，仓库还提供普通服务器的一键部署脚本：

```bash
# Linux（会安装 Node、构建、生成 .env、安装 systemd）
sudo bash deploy/install.sh --origin https://tools.example.com

# 只构建、不安装 systemd（面板部署）
bash deploy/install.sh --no-service
```

```bat
:: Windows
deploy\install.bat
```

两者的区别：`panel-install.js` 专为面板设计（写 `panel.env`、后台进程、生成反代配置、不碰 systemd）；
`install.sh` 面向裸机 systemd。面板部署优先使用 `panel-install.js`。

---

## 5. 启动参数

参数保存在 `deploy/panel.env`（由 `panel-install.js` 生成），修改后执行 `--stop` 再 `--start` 生效：

```ini
PORT=8787              # 服务端口；面板站点的 80/443 由 Nginx 使用
HOST=127.0.0.1         # 仅本机访问（由 Nginx 反代），安全性更高
NODE_ENV=production
PUBLIC_ORIGIN=https://tools.example.com
TRUST_PROXY=true
COOKIE_SECURE=true     # HTTPS 部署必须为 true；本地 HTTP 测试为 false
DB_PATH=/www/wwwroot/lith-tools/data/lith-tools.db
```

SMTP、DeepSeek、LCZOJ 授权登录等配置放在项目根目录 `.env`。修改 `PORT` 后需同步修改反向代理目标地址，
否则会出现 502。

---

## 6. 故障排查

| 现象 | 原因与处理 |
| --- | --- |
| 启动报 `Cannot find module 'node:sqlite'` | Node.js 版本过低，安装 v24；或临时用 `node --experimental-sqlite` 启动 |
| 502 Bad Gateway | 后端未启动或端口不一致。执行 `node deploy/panel-install.js --start`，查看 `logs/lith-tools.log` |
| 直接访问 `IP:8787` 无响应、域名可访问 | 正常：`HOST=127.0.0.1` 表示仅本机，由 Nginx 反代 |
| 登录后刷新掉线 | 未配置 HTTPS 却 `COOKIE_SECURE=true`；本地测试先设 `false`，生产请上 HTTPS |
| 写操作 403「请求来源校验失败」 | 反向代理未透传 `Host`，或 `PUBLIC_ORIGIN` 与访问域名不一致 |
| 页面空白，`/assets/*.js` 返回 404 | 站点里仍有 `root` / `location ~* \.(js|css)$` 静态规则，把 `/assets` 截走了；只保留 `location /` 反代 |
| Chrome 报 `ERR_SSL_PROTOCOL_ERROR` | 服务器 TLS 1.3 握手异常；把 `ssl_protocols` 设为 `TLSv1.2`，见 3.6.4 |
| `nginx: [emerg] invalid parameter "http2"` 或 http2 弃用警告 | 改成 `listen 443 ssl;` + `http2 on;` |
| `cannot load certificate key ... privkey.pem` | 私钥文件名不是 `privkey.pem`；`ls` 证书目录，常见为 `privkey.key` |
| `nginx: command not found` | 不要 `apt install nginx`；用面板自带 Nginx 完整路径，如 `/xp/server/nginx/sbin/nginx` |
| 改了 `ssl_protocols` 但 `nginx -T` 仍有 TLSv1.3 | `ssl.conf` 或其他 `include` 覆盖了；修改 `ssl.conf` 或删除该 include |
| 上传文件报 413 | 站点配置缺少或过小的 `client_max_body_size`；模板为 2m |
| 数据库无法写入 | `data/` 属主不是运行用户：`chown -R www:www data`（Windows 在面板权限中授权） |
| 构建失败 | Node 版本不够，或 `NODE_ENV=production` 导致缺 devDependencies；使用 `npm ci --include=dev` |
| 忘记管理员密码 | 删除数据库前请先备份；或在 `.env` 设置新的 `ADMIN_PASSWORD` 后重建空库（会丢失数据） |

---

## 7. 备份与迁移

- **备份**：将 `data/` 目录完整下载（包含 `lith-tools.db`、`-wal`、`-shm`）。建议在面板中创建定时打包任务；
- **迁移**：在新服务器按本文完成部署后，用备份的 `data/` 目录覆盖即可；
- **升级**：

```bash
bash deploy/update.sh
```

脚本会备份 `data/`、`.env`、`deploy/panel.env`，拉取代码，同步 LCZOJ 授权配置，安装依赖并构建，
然后重启实际占用 8787 的进程并验证新 JS/CSS 与 OAuth 跳转。

手动流程：

```bash
git pull
npm ci --include=dev
npm run build
node deploy/panel-install.js --stop
node deploy/panel-install.js --start
```

升级前先备份 `data/`；数据库迁移在启动时自动执行。

---

## 8. 其它部署方式

- 普通 Linux（一键脚本 / systemd）：[DEPLOYMENT.md](DEPLOYMENT.md)
- Docker：[DEPLOYMENT.md](DEPLOYMENT.md#docker可选)
- 环境自检：`node deploy/check-env.js`
