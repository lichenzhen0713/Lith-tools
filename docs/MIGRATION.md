# 从旧版迁移

本仓库是对旧版 PHP/MySQL 站点的整体重写（旧代码不包含在本仓库中）。迁移是**产品级重写**，不是逐行翻译。

## 已保留

- 70 个工具的功能与中文名称（两个重复的“随机密码生成器”合并为一个）。
- 博客、论坛、反馈、工具投稿、账户、IP 封禁、访问统计、管理后台的产品概念。
- 三种角色：普通用户（0）、管理员（1）、超级管理员（2）。
- 邮箱验证码注册、找回密码、个人中心、审核流转。
- 主要中文文案与站点定位（Lith Tools / 多功能工具箱）。

## 有意改变

| 旧版 | 新版 | 原因 |
| --- | --- | --- |
| 明文数据库/SMTP/AI 密钥 | 全部环境变量；DeepSeek 密钥仅服务端 | 安全 |
| 手写 SQL + 个别字符串拼接 | 参数化查询 + zod 校验 | 防注入 |
| Markdown → `innerHTML` | `marked` + `DOMPurify` + KaTeX | 防存储型 XSS |
| 缺少 CSRF/限流 | Origin 校验 + 分组限流 | 防 CSRF/暴力破解 |
| 封禁仅在登录时检查 | 每次请求检查，封禁即时踢下线 | 安全 |
| 普通用户可编辑任意文章、任意用户可审核投稿 | 资源级归属/角色校验 | 越权修复 |
| 审核/反馈直接删除记录 | 保留状态（pending/approved/rejected、open/resolved/ignored） | 可追溯 |
| `+480 分钟`时区补丁 | UTC ISO 存储，前端本地化 | 正确性 |
| 假格式转换（只改 MIME/扩展名） | 真实能力 + 明确限制 | 诚实、可用 |
| DES 加密 | AES-GCM（Web Crypto） | DES 已不安全 |
| 浏览器直连大模型并携带密钥 | 服务端代理 + 登录 + 限流 | 防密钥盗用 |
| 多套内联 CSS / Font Awesome CDN | Tailwind 设计系统 + lucide 图标 | 可维护性、离线可用 |
| 工具分类与博客分类混用 | 两套独立分类 | 数据模型清晰 |

## URL 对照

完整的“旧页面路径 → 新版路由”映射见 [`URL-MAP.md`](URL-MAP.md)。

## 数据迁移

仓库**不包含** MySQL → SQLite 的自动迁移脚本，因为旧库结构、字符集与实际数据只有部署者掌握。推荐两种方式：

### 方案 A：重新开始（推荐）

1. 备份旧站与数据库。
2. 部署新版，运行 `npm run db:seed` 创建工具目录与管理员。
3. 管理员通过后台重新创建必要内容；用户重新注册（邮箱验证）。

适合内容不多、希望清理历史数据的场景。

### 方案 B：写一次性导入脚本

从 MySQL 导出为 JSON/CSV，再用 Node 脚本读取旧库并写入新库。字段映射参考：

| 旧表 | 新表 | 映射说明 |
| --- | --- | --- |
| `users` | `users` | `password`（bcrypt）无法直接迁移到 scrypt；用户需重置密码。`role` 直接映射 |
| `categories` | `categories` | `name` 唯一化 |
| `blogs` | `blogs` | `latest_at` → `latest_at`；`content` 原样保留（Markdown） |
| `blog_comments` | `blog_comments` | `comment` → 同名 |
| `blog_likes` | `blog_likes` | 需去重（旧表无唯一约束时） |
| `forums` / `threads` / `posts` | 同名 | `author_id` 对应新用户 ID |
| `user_feedback` | `user_feedback` | 补 `status='open'`；旧库删除的记录无法恢复 |
| `user_submissions` | `user_submissions` | 补 `status`；`username` 保留用于展示 |
| `blog_submissions` | `blog_submissions` | `status` 默认 pending |
| `banned_ips` / `ban_history` | 同名 | 日期转为 ISO；补 `admin_id` 可空 |
| `access_logs` | `access_logs` | `access_time` 转 ISO；计数保留 |

注意：

- 旧密码是 bcrypt 哈希，新版使用 scrypt。可以保留旧哈希并在登录时校验后重新哈希（需要额外兼容代码），或要求用户重置密码。
- 时间字段统一转为 UTC ISO 字符串（`new Date(value).toISOString()`）。
- 导入前先备份新库；在事务中执行，失败回滚。

## 切换清单

1. 备份旧站文件与 MySQL。
2. 部署新版并完成 `.env` 配置（域名、SMTP、管理员）。
3. 运行 `npm run db:seed`，登录后台检查工具目录。
4. 如需导入内容，执行迁移脚本并抽样校验（文章、评论、主题、封禁）。
5. 在测试域名验证：注册/登录、发帖、评论、投稿审核、封禁 IP、找回密码。
6. 切换 DNS / 反向代理，观察日志与错误。
7. 保留旧站只读备份至少一个发布周期，便于回滚。

## 回滚

旧版站点与数据库未被修改，可直接指回原目录与 MySQL。新版使用独立的 SQLite 文件，删除 `data/` 即可重新开始。
