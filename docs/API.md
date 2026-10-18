# API 参考

所有接口以 `/api` 为前缀，请求与响应均为 JSON（`Content-Type: application/json`）。认证通过 HttpOnly 会话 Cookie `lith_session` 完成，浏览器端使用 `credentials: 'include'`。

## 约定

### 认证级别

| 标记 | 含义 |
| --- | --- |
| 公开 | 无需登录 |
| 登录 | 需要有效会话 |
| 管理员 | `role >= 1` |
| 超级管理员 | `role = 2` |

### 错误格式

```json
{ "error": "人类可读的错误信息", "details": [] }
```

`details` 仅在参数校验失败时出现（zod issues）。常见状态码：

| 状态 | 含义 |
| --- | --- |
| 400 | 参数不合法 / 业务校验失败 |
| 401 | 未登录或会话失效 |
| 403 | 无权限 / IP 被封禁 / 来源校验失败 |
| 404 | 资源不存在或不可见 |
| 409 | 唯一性冲突（用户名、邮箱、板块名等） |
| 429 | 触发限流 |
| 500/502/504 | 服务端或上游服务异常 |

### 分页

接受 `page`（默认 1）与 `pageSize`（默认见各接口，上限 50）的接口返回：

```json
{ "items": [], "total": 0, "page": 1, "pageSize": 10, "totalPages": 1 }
```

### 限流

| 场景 | 限制 |
| --- | --- |
| 登录 | 10 次 / 15 分钟（按 IP 与用户名） |
| 注册 | 5 次 / 小时（按 IP） |
| 发送验证码 | 10 次 / 15 分钟（IP），3 次 / 15 分钟（邮箱） |
| 找回密码 | 5 次 / 30 分钟（IP），3 次 / 30 分钟（邮箱） |
| 重置密码 | 10 次 / 30 分钟（IP） |
| 创建博客 | 10 次 / 小时（用户） |
| 评论 | 30 次 / 小时（用户） |
| 点赞 | 120 次 / 小时（用户） |
| 博客投稿 | 10 次 / 小时（用户） |
| 论坛主题 | 10 次 / 小时（用户） |
| 论坛回复 | 30 次 / 小时（用户） |
| 反馈 | 5 次 / 24 小时（用户） |
| 工具投稿 | 5 次 / 24 小时（用户） |
| AI 对话 | 20 次 / 小时（用户） |
| IP 封禁操作 | 60 次 / 分钟（管理员） |

## 认证

| 方法 | 路径 | 权限 | 说明 |
| --- | --- | --- | --- |
| GET | `/api/auth/me` | 公开 | 当前用户；未登录返回 `{ "user": null }` |
| POST | `/api/auth/send-code` | 公开 | `{ email }` → 发送 6 位验证码；开发模式返回 `devCode` |
| POST | `/api/auth/register` | 公开 | `{ username, email, code, password }` → 201 `{ user }` 并登录 |
| POST | `/api/auth/login` | 公开 | `{ username, password }` → `{ user }` |
| POST | `/api/auth/logout` | 登录 | 删除当前会话 |
| POST | `/api/auth/forgot` | 公开 | `{ email }` → 始终返回通用提示；存在用户时发送重置链接 |
| POST | `/api/auth/reset` | 公开 | `{ token, password }` → 重置密码并清除该用户会话 |
| POST | `/api/auth/change-password` | 登录 | `{ currentPassword, newPassword }` → 清除其他会话 |
| PATCH | `/api/auth/profile` | 登录 | `{ username?, email? }` → 更新资料 |
| GET | `/api/auth/sessions` | 登录 | 当前用户会话列表（含 `current` 标记） |
| DELETE | `/api/auth/sessions/:id` | 登录 | 退出指定会话 |
| DELETE | `/api/auth/account` | 登录 | `{ password }` → 注销账户（超级管理员不可注销） |

密码规则：8–128 位，必须同时包含字母与数字。用户名 3–32 位，允许字母、数字、下划线、点、短横线与中文。

示例：

```bash
curl -c cookies.txt -X POST http://localhost:8787/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"admin123456"}'
```

## 站点与工具

| 方法 | 路径 | 权限 | 说明 |
| --- | --- | --- | --- |
| GET | `/api/health` | 公开 | 健康检查 |
| GET | `/api/site` | 公开 | 站点名称、版本、SMTP/AI 是否配置 |
| GET | `/api/stats/public` | 公开 | 工具/分类/博客/主题/回复/用户数 |
| GET | `/api/tools` | 公开 | 分类与工具（超级管理员可见禁用项） |
| GET | `/api/tools/:slug` | 公开 | 单个工具元数据 |

`GET /api/tools` 响应：

```json
{
  "categories": [{ "id": 1, "slug": "calculator", "name": "计算器", "icon": "Calculator", "toolCount": 4 }],
  "tools": [{
    "id": 1, "slug": "basic-calculator", "name": "标准计算器",
    "description": "…", "href": "/tools/basic-calculator", "icon": "Calculator",
    "isExternal": false, "disabled": false,
    "category": { "id": 1, "slug": "calculator", "name": "计算器", "icon": "Calculator", "description": "…" }
  }]
}
```

## 博客

| 方法 | 路径 | 权限 | 说明 |
| --- | --- | --- | --- |
| GET | `/api/blog/posts` | 公开 | 列表；`page`、`pageSize`（默认 9）、`categoryId`、`q`、`authorId`、`mine=1`、`sort=latest\|views` |
| GET | `/api/blog/recent?limit=3` | 公开 | 最新公开文章 |
| GET | `/api/blog/categories` | 公开 | 分类与文章数 |
| GET | `/api/blog/posts/:id` | 公开 / 作者 / 超级管理员 | 详情并递增阅读量；含评论第 1 页与点赞状态 |
| POST | `/api/blog/posts` | 登录 | `{ title, content, categoryId?, isPublic? }` |
| PATCH | `/api/blog/posts/:id` | 作者 / 超级管理员 | 同上字段；更新 `latest_at` |
| DELETE | `/api/blog/posts/:id` | 作者 / 管理员 | 级联删除评论与点赞 |
| POST | `/api/blog/posts/:id/like` | 登录 | 切换点赞 → `{ liked, likes }` |
| GET | `/api/blog/posts/:id/comments` | 公开/可见 | 评论分页（默认 5） |
| POST | `/api/blog/posts/:id/comments` | 登录 | `{ comment }`（≤2000 字） |
| DELETE | `/api/blog/comments/:id` | 作者 / 博主 / 管理员 | 删除评论 |
| POST | `/api/blog/submissions` | 登录 | `{ title, content }` → 待审核投稿 |
| GET | `/api/blog/submissions/mine` | 登录 | 我的投稿（状态与时间） |
| GET | `/api/blog/submissions/:id` | 作者 / 管理员 | 投稿详情 |
| PATCH | `/api/blog/submissions/:id` | 作者（待审核） | 修改标题/内容 |
| DELETE | `/api/blog/submissions/:id` | 作者 / 管理员 | 删除投稿 |

私有文章（`isPublic=false`）仅作者、超级管理员可见；不可见时返回 404，避免泄露存在性。

## 论坛

| 方法 | 路径 | 权限 | 说明 |
| --- | --- | --- | --- |
| GET | `/api/forum/forums` | 公开 | 板块列表（主题数、回复数、最近活动） |
| GET | `/api/forum/recent?limit=5` | 公开 | 最近更新的主题 |
| POST | `/api/forum/forums` | 超级管理员 | `{ name, description? }` |
| PATCH | `/api/forum/forums/:id` | 超级管理员 | 修改板块 |
| DELETE | `/api/forum/forums/:id` | 超级管理员 | 级联删除主题与回复 |
| GET | `/api/forum/forums/:id` | 公开 | 板块 + 主题分页（默认 15） |
| POST | `/api/forum/forums/:id/threads` | 登录 | `{ title, content }` → 主题 + 首帖 |
| GET | `/api/forum/threads/:id` | 公开 | 主题 + 回复分页（默认 20） |
| POST | `/api/forum/threads/:id/posts` | 登录 | `{ content }` 回复 |
| PATCH | `/api/forum/posts/:id` | 作者 / 管理员 | 修改回复 |
| DELETE | `/api/forum/posts/:id` | 作者 / 管理员 | 删除回复 |
| DELETE | `/api/forum/threads/:id` | 作者 / 超级管理员 | 删除主题 |

论坛回复按发布时间升序；界面使用 `whitespace-pre-wrap` 保留换行，不渲染 Markdown。

## 反馈与投稿

| 方法 | 路径 | 权限 | 说明 |
| --- | --- | --- | --- |
| POST | `/api/feedback` | 登录 | `{ rating: 1-5, feedback }` |
| GET | `/api/feedback/mine` | 登录 | 我的反馈与处理状态 |
| POST | `/api/submissions/tool` | 登录 | `{ toolName, description, toolLink }` |
| GET | `/api/submissions/tool/mine` | 登录 | 我的工具投稿 |
| GET | `/api/profile/overview` | 登录 | 个人中心概览（资料、统计、最近文章） |
| GET | `/api/users/:id/public` | 公开 | 用户公开资料与文章/主题数（不含邮箱） |

## 管理后台

全部接口要求登录；`/api/admin/*` 在插件层统一拦截，标记为超级管理员的接口额外检查 `role === 2`。

| 方法 | 路径 | 权限 | 说明 |
| --- | --- | --- | --- |
| GET | `/api/admin/stats` | 管理员 | 全站统计 |
| GET | `/api/admin/users` | 超级管理员 | `q`、`role`、`banned`、分页 |
| POST | `/api/admin/users` | 超级管理员 | `{ username, email, password, role? }` |
| PATCH | `/api/admin/users/:id` | 超级管理员 | 资料/角色/密码/邮箱验证/封禁字段 |
| DELETE | `/api/admin/users/:id` | 超级管理员 | 不可删除自己或超级管理员 |
| POST | `/api/admin/users/:id/ban` | 超级管理员 | `{ days, reason? }` → 清除会话并邮件通知 |
| POST | `/api/admin/users/:id/unban` | 超级管理员 | 解封并通知 |
| GET | `/api/admin/tools` | 超级管理员 | 含禁用工具 |
| POST | `/api/admin/tools` | 超级管理员 | 新增外链工具 `{ name, description?, link, categoryId?, icon?, disabled? }` |
| PATCH | `/api/admin/tools/:id` | 超级管理员 | 名称/描述/外链/分类/图标/状态/排序 |
| DELETE | `/api/admin/tools/:id` | 超级管理员 | 删除工具 |
| GET | `/api/admin/tool-categories` | 超级管理员 | 工具分类与数量 |
| GET | `/api/admin/blogs` | 管理员 | 全部文章（含私密） |
| GET | `/api/admin/categories` | 超级管理员 | 博客分类与文章数 |
| POST | `/api/admin/categories` | 超级管理员 | 新增分类 |
| PATCH | `/api/admin/categories/:id` | 超级管理员 | 重命名 |
| DELETE | `/api/admin/categories/:id` | 超级管理员 | 删除分类（文章变为未分类） |
| GET | `/api/admin/feedback` | 管理员 | `status=all\|open\|resolved\|ignored`、分页 |
| PATCH | `/api/admin/feedback/:id` | 管理员 | `{ status }` → 触发通知邮件 |
| GET | `/api/admin/submissions` | 管理员 | `type=tool\|blog`、`status=pending\|approved\|rejected` |
| GET | `/api/admin/submissions/tool/:id` | 管理员 | 工具投稿详情 |
| POST | `/api/admin/submissions/tool/:id/review` | 管理员 | `{ action: approve\|reject, categoryId?, reason? }` |
| GET | `/api/admin/submissions/blog/:id` | 管理员 | 博客投稿详情（全文） |
| POST | `/api/admin/submissions/blog/:id/review` | 管理员 | `{ action, categoryId?, title?, content?, reason? }` |
| GET | `/api/admin/bans` | 超级管理员 | 生效中的 IP 封禁 |
| POST | `/api/admin/bans` | 超级管理员 | `{ ip, days, reason? }` |
| DELETE | `/api/admin/bans/:ip` | 超级管理员 | 解封并归档历史 |
| GET | `/api/admin/ban-history` | 超级管理员 | 封禁历史分页 |
| GET | `/api/admin/access-logs` | 管理员 | 访问记录分页（含封禁状态） |
| GET | `/api/admin/settings` | 超级管理员 | SMTP / DeepSeek 脱敏配置、来源（后台/环境变量） |
| PUT | `/api/admin/settings/mail` | 超级管理员 | SMTP 配置；`pass` 留空保留，`clearPassword` 回退环境变量 |
| PUT | `/api/admin/settings/ai` | 超级管理员 | DeepSeek Key / 接口 / 模型；`apiKey` 留空保留 |
| POST | `/api/admin/settings/test-mail` | 超级管理员 | 发送测试邮件到当前管理员邮箱 |
| POST | `/api/admin/settings/test-ai` | 超级管理员 | 用当前配置发起一次最小 DeepSeek 请求 |

设置接口不会返回密码或 API Key 明文，只返回 `hasPassword` / `hasApiKey` 与末四位提示；保存后立即生效，无需重启。

## 网络代理

| 方法 | 路径 | 权限 | 说明 |
| --- | --- | --- | --- |
| GET | `/api/net/ip?ip=8.8.8.8` | 公开 | IP 归属地；留空查询调用方 IP；内网地址只返回自身 |
| GET | `/api/net/dns?name=example.com&type=A` | 公开 | A / AAAA / MX / TXT / NS / CNAME |
| POST | `/api/net/ping` | 公开 | `{ host, port }`（端口限 80/443/8080/8443）→ 3 次 TCP 延迟 |
| GET | `/api/net/rates?base=USD` | 公开 | 汇率表（缓存 1 小时） |

限制：拒绝内网/保留地址；DNS 与 IP 查询使用进程内缓存；上游超时返回 502/504。

## AI 助手（DeepSeek）

| 方法 | 路径 | 权限 | 说明 |
| --- | --- | --- | --- |
| GET | `/api/assistant/status` | 公开 | 是否配置、服务商、默认模式与 5 种模式列表 |
| POST | `/api/assistant/chat` | 登录 | `{ mode?, messages: [{ role: "user"\|"assistant", content }] }`（≤20 条） |

模式：

| `mode` | 名称 | 模型 | 说明 |
| --- | --- | --- | --- |
| `chat` | 通用对话 | `deepseek-chat` | 日常问答、工具用法 |
| `reasoning` | 深度思考 | `deepseek-reasoner` | 返回 `reasoning` 字段（推理过程），前端可折叠展示 |
| `code` | 代码助手 | `deepseek-chat` | 代码生成、审查与解释 |
| `translate` | 翻译润色 | `deepseek-chat` | 中英互译与语气调整 |
| `writing` | 写作助手 | `deepseek-chat` | 提纲、文案、文章修改 |

响应：

```json
{
  "reply": "…",
  "reasoning": "…或 null",
  "model": "deepseek-chat",
  "mode": "chat",
  "modeName": "通用对话",
  "tokens": 76
}
```

- 未配置 `DEEPSEEK_API_KEY` 时返回 503。
- Key 无效返回 502，余额不足返回 502，频率限制返回 429，超时返回 504。
- 密钥只存在服务端；请勿在日志或前端暴露。

## 示例：创建博客并评论

```bash
# 1. 登录（保存 Cookie）
curl -c cookies.txt -X POST http://localhost:8787/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"admin123456"}'

# 2. 创建文章
curl -b cookies.txt -X POST http://localhost:8787/api/blog/posts \
  -H 'Content-Type: application/json' \
  -d '{"title":"Hello","content":"# Hello\n\n来自 API。","isPublic":true}'

# 3. 评论（假设文章 id 为 1）
curl -b cookies.txt -X POST http://localhost:8787/api/blog/posts/1/comments \
  -H 'Content-Type: application/json' \
  -d '{"comment":"第一条评论"}'
```

> 写请求如果由浏览器发出，请确保 `Origin` 与站点 Host 一致，否则会被 CSRF 来源校验拒绝。
