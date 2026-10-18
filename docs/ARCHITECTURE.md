# 架构说明

本文描述 Lith Tools 2.0 的整体设计、模块边界与关键决策。面向需要维护或扩展本项目的开发者。

## 1. 设计目标

1. **本地优先**：所有文件与图片处理在浏览器内完成；服务端只负责账户、内容与需要代理的网络查询。
2. **一套技术栈**：前后端都用 TypeScript，共享 `shared/types.ts` 契约，避免接口与前端类型漂移。
3. **低部署成本**：SQLite + 单进程 Node，无需 MySQL、PHP、Redis 或原生编译模块。
4. **安全默认**：认证、授权、输入校验、XSS 防护、限流与封禁都由框架层统一处理，而不是每个页面各写一套。
5. **可增量扩展**：新增工具只需一个组件文件 + 一条目录元数据，无需改路由或导航。

## 2. 运行时拓扑

```text
┌──────────────────────────── 浏览器 ────────────────────────────┐
│  React 19 SPA (Vite 构建)                                      │
│  ├─ 页面路由：首页 / 工具 / 博客 / 论坛 / 账户 / 管理后台       │
│  ├─ 工具组件：按需加载（每工具一个 chunk）                      │
│  └─ 本地处理：Canvas / Web Crypto / Web Audio / JSZip          │
└───────────────────────────────┬────────────────────────────────┘
                                │ fetch /api/*（HttpOnly Cookie）
┌───────────────────────────────▼────────────────────────────────┐
│  Fastify 5（单进程）                                            │
│  ├─ onRequest：安全头 → Origin 校验 → IP 封禁 → 访问计数        │
│  ├─ 路由层：zod 校验 → 业务逻辑 → 权限检查                      │
│  ├─ 数据层：node:sqlite（WAL、外键、参数化 SQL）                │
│  ├─ 静态层：dist/ + SPA 回退                                    │
│  └─ 维护任务：清理会话、归档过期封禁（每 10 分钟）              │
└───────────────────────────────┬────────────────────────────────┘
                                │
                    ┌───────────▼───────────┐
                    │ data/lith-tools.db    │
                    │ SQLite（单文件）       │
                    └───────────────────────┘
```

外部依赖（均可选/可降级）：

- SMTP：验证码、重置链接、审核/封禁通知。
- `ipinfo.io`、`open.er-api.com`：IP 归属地与实时汇率（服务端缓存代理）。
- OpenRouter（或兼容接口）：AI 助手。

## 3. 请求生命周期

`server/app.ts` 在 `onRequest` 钩子中按固定顺序处理所有请求：

1. **安全响应头**：`X-Content-Type-Options`、`X-Frame-Options`、`Referrer-Policy`、`Permissions-Policy`、`COOP`。
2. **IP 封禁**：查询 `banned_ips`（未过期）；命中时 API 返回 403 JSON、页面返回内联样式的 403 HTML。
3. **CSRF 来源校验**：非 GET/HEAD/OPTIONS 请求若带 `Origin`，其 Host 必须与请求 Host 或 `PUBLIC_ORIGIN` 一致。
4. **访问计数**：仅对 `Accept: text/html` 的文档导航请求执行（两级计数，见 §7）。
5. **路由处理**：zod 校验 → 权限检查 → SQLite 读写。
6. **统一错误处理**：`ApiError` 映射为 `{ error, details? }`；未知错误记录日志并返回 500，不泄露内部信息。

静态资源与 SPA 回退只对非 `/api` 路径生效；`/api` 未命中返回 JSON 404。

## 4. 服务端模块

| 路径 | 职责 |
| --- | --- |
| `server/index.ts` | 启动：迁移 → 种子 → 监听 → 定时维护 → 优雅退出 |
| `server/app.ts` | Fastify 实例、钩子、路由注册、静态资源、404/错误处理 |
| `server/config.ts` | 环境变量（`process.loadEnvFile` + 默认值） |
| `server/db/client.ts` | `DatabaseSync` 单例、`all/get/run/count`、嵌套事务 |
| `server/db/schema.ts` | 顺序迁移（`PRAGMA user_version`） |
| `server/db/seed.ts` | 幂等种子：分类、70 个工具、管理员、示例内容 |
| `server/lib/auth.ts` | 会话签发/解析、Cookie、角色守卫、过期清理 |
| `server/lib/security.ts` | scrypt、随机令牌、限流、SHA-256 |
| `server/lib/email.ts` | 可选 SMTP 与邮件模板 |
| `server/lib/access.ts` | IP 封禁、解封、过期归档、访问计数、403 页面 |
| `server/lib/validation.ts` | zod 规则、分页、ID/URL 校验、Markdown 摘要 |
| `server/routes/*.ts` | 按领域划分的 HTTP 路由 |

路由模块之间不互相引用；共享逻辑放在 `lib/` 或 `db/`。

## 5. 数据模型

迁移定义见 `server/db/schema.ts`。

| 领域 | 表 | 关键关系 |
| --- | --- | --- |
| 账户 | `users`、`sessions`、`email_verifications`、`password_resets` | 会话/验证码按用户或邮箱关联；重置令牌只存哈希 |
| 工具 | `tool_categories`、`tools` | 工具属于分类；内置工具用 `slug` 指向 SPA 路由，外链工具用 `link` |
| 博客 | `blogs`、`blog_comments`、`blog_likes`、`blog_submissions`、`categories` | 博客属于作者与分类；评论/点赞级联删除；投稿保留审核状态 |
| 论坛 | `forums`、`threads`、`posts` | 板块 → 主题 → 回复，级联删除 |
| 互动 | `user_feedback`、`user_submissions` | 保留状态（open/resolved/ignored、pending/approved/rejected） |
| 安全 | `banned_ips`、`ban_history`、`access_logs`、`temporary_access_logs` | 封禁到期后归档；访问计数两级提升 |

约定：

- 时间统一存 UTC ISO 字符串（`toISOString()`），前端本地化展示。
- 所有外键启用 `PRAGMA foreign_keys = ON`；删除用户/博客/主题会级联清理关联数据。
- 常用查询都有索引（作者、分类、状态、时间、外键）。

## 6. 认证与权限

- 密码：`scrypt(N=16384, r=8, p=1)`，16 字节随机盐，格式 `scrypt$N.r.p$salt$hash`。
- 会话：32 字节随机 ID，存 `sessions` 表，默认 30 天；Cookie 为 `HttpOnly`、`SameSite=Lax`，生产环境 `Secure`。
- 登录/注册后签发新会话；改密、封禁会清除相关会话。
- 角色：

| 角色 | 值 | 能力 |
| --- | --- | --- |
| 普通用户 | 0 | 工具、博客浏览/评论/点赞、论坛发帖、反馈、投稿、个人中心 |
| 管理员 | 1 | 以上 + 博客/反馈/投稿/访问记录管理、论坛内容管理 |
| 超级管理员 | 2 | 以上 + 用户/工具/分类/IP 封禁管理 |

授权在路由内做资源级检查（作者、角色、资源可见性），客户端隐藏按钮只是体验优化，不作为安全边界。

## 7. 工具系统

数据流：

```text
shared/catalog.ts  ──seed──▶  tools 表 ──GET /api/tools──▶ 首页 / 工具库 / 搜索
        │                                                        │
        └──────────── slug ──────────────────────────────────────┘
                                                                 ▼
                                            src/tools/<slug>.tsx（懒加载组件）
```

- `shared/catalog.ts` 是工具元数据的唯一来源（名称、分类、图标、关键词、旧路径、是否需服务端代理）。
- 种子只在工具表为空时写入目录；管理员可上下架、排序或新增外链工具。
- `src/tools/registry.tsx` 用 `import.meta.glob` 自动发现组件；文件名必须等于 slug。
- 工具页由 `pages/ToolPage.tsx` 提供外壳（面包屑、标题、收藏、同类推荐、错误边界）；工具组件只渲染主体。
- 所有工具都有独立 chunk；`ToolSuspense` 使用骨架屏，渲染异常由 `ErrorBoundary` 兜底。

新增工具见 `CONTRIBUTING.md` 与 `TOOLS_GUIDE.md`。

## 8. 前端结构

- 入口：`src/main.tsx` 组合 `ThemeProvider → ToastProvider → AuthProvider → BrowserRouter`。
- 路由：`src/App.tsx`，页面全部 `React.lazy`；未知路径渲染 404。
- 数据获取：`lib/hooks.ts` 的 `useApi`（带竞态保护、reload）与 `lib/api.ts` 的统一错误类型。
- 设计系统：`src/styles/index.css` 定义 CSS 变量（浅/深色）与 `.card/.btn-*/.input/.badge/.prose-content` 等组件类；组件使用 Tailwind 工具类。
- 状态：无全局状态库；会话由 Context 管理，其余为页面局部状态。
- Markdown：`marked` 渲染 → `DOMPurify` 消毒 → KaTeX 渲染公式文本节点；禁止直接插入未消毒 HTML。

## 9. 安全设计

| 威胁 | 缓解 |
| --- | --- |
| SQL 注入 | 全部参数化查询；不拼接用户输入 |
| 存储型 XSS | React 转义 + Markdown 白名单消毒 |
| CSRF | SameSite=Lax + Origin/Host 校验（同源 JSON API） |
| 暴力破解 | 登录/注册/验证码/找回密码限流 |
| 越权 | 路由级资源归属与角色检查 |
| 会话固定/劫持 | 登录轮换会话；HttpOnly；生产 Secure |
| IP 封禁绕过 | 请求级拦截；内网探测与端口限制 |
| SSRF | 网络工具仅允许公网地址与 80/443/8080/8443 |
| 密钥泄露 | 全部走环境变量；前端不接触 AI/SMTP 密钥 |

细节与部署加固见 [`SECURITY.md`](../SECURITY.md)。

## 10. 性能与扩展性

- **首屏**：React/路由/首页 chunk 约 330 KB（gzip 107 KB），其余页面与工具按需加载。
- **数据库**：WAL 模式、索引、预编译语句；访问统计与封禁归档为轻量写操作。
- **缓存**：IP 归属地 10 分钟、DNS 60 秒、汇率 1 小时（进程内）。
- **限额**：单进程内存限流，适合个人/小团队部署；多实例需替换为 Redis 等共享存储（见 §11）。

## 11. 权衡与已知限制

- **单进程 + SQLite**：部署简单，但不适合多副本水平扩展；写并发受 SQLite 限制。
- **无 SSR**：管理后台/工具站不需要 SEO；博客列表/详情为客户端渲染，社交分享预览有限。
- **内存限流**：重启后清零，多实例不共享。
- **纯浏览器转换**：音频仅可靠导出 WAV；视频仅提取音频/封面，不做真实转码。
- **无对象存储**：当前不提供附件上传；如需图片上传需新增存储层与校验。
- **访问计数**：仅统计文档导航，SPA 内部跳转不会重复计数（与旧版首页计数语义不同）。

## 12. 扩展方向

- 博客全文搜索（SQLite FTS5）。
- 工具使用统计与热门排序（需匿名事件表）。
- 多语言（i18n）与主题自定义。
- WebSocket 通知（评论/审核结果）。
- 可选附件上传（本地磁盘或 S3 兼容存储）。
