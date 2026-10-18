# 更新日志

本项目遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/) 与 [语义化版本](https://semver.org/lang/zh-CN/)。

## [2.0.0] - 2026-10-18

首个基于新架构的正式版本，是对旧版 PHP/MySQL 站点的完整重写。

### 新增

- **70 个工具 / 13 个分类**：计算器、数学、时间、单位转换、文本、颜色、开发、文件、健康、图像、网络、娱乐、其它。
- **品牌与视觉系统**：参考 LCZOJ 的靛蓝→青色渐变、全新 `<L>` 括号 logo、Hero 搜索卡片、分类色板、亮暗双主题与统一排版节奏。
- **工具系统**：`shared/catalog.ts` 单一元数据源 + `import.meta.glob` 自动注册 + 按工具懒加载。
- **博客**：Markdown 编辑与实时预览、KaTeX 公式、代码块、分类、公开/私密、点赞、分页评论、投稿审核。
- **论坛**：板块、主题、回复、编辑/删除、板块管理。
- **账户**：邮箱验证码注册、登录、找回密码、资料/密码修改、会话管理、账户注销。
- **管理后台**：数据概览、用户管理（角色/封禁/删除）、工具管理、博客与分类管理、反馈处理、投稿审核、IP 封禁与历史、访问记录。
- **反馈与工具推荐**：评分反馈、审核流转、可选邮件通知。
- **网络工具服务端代理**：IP 归属地、DNS、TCP 连通性、实时汇率（含缓存与内网/端口限制）。
- **AI 助手**：服务端代理 OpenRouter，密钥不下发浏览器，登录 + 限流。
- **工程化**：TypeScript strict、zod 校验、SQLite 迁移与种子、Dockerfile、GitHub Actions、Issue/PR 模板、Dependabot。

### 变更

- 运行时从 PHP 8 + MySQL 改为 Node.js + Fastify + SQLite（`node:sqlite`）。
- 前端从多页内联 HTML 改为 React 19 SPA + Vite + Tailwind CSS v4。
- 时间统一存 UTC ISO，移除旧版 `+480 分钟` 时区补丁。
- 工具分类与博客分类拆分；工具图标统一为 lucide。
- 访问统计仅统计文档导航，沿用两级计数语义。
- 审核/反馈保留状态，不再直接删除记录。
- 文本加密改为 AES-GCM（Web Crypto），不再提供 DES。
- 音频仅导出 WAV，视频仅提取音频/封面，不提供假转码。

### 修复

- 旧版用户搜索的 SQL 注入。
- 管理员/博客/投稿的存储型 XSS。
- 普通用户可编辑任意文章、任意登录用户可审核投稿等越权问题。
- 缺失 CSRF、限流、输入校验与会话固定问题。
- IP 封禁仅在登录时生效、过期封禁只在后台加载时清理。
- 博客私有文章先增阅读量再做权限检查的问题。
- 旧版 `script.js` 在缺少元素时抛错、`submit_comment.php` 输出导致跳转失败等前端/后端缺陷。

### 安全

- 密码使用 scrypt（随机盐 + `timingSafeEqual`）。
- 会话 Cookie `HttpOnly` / `SameSite=Lax` / 生产 `Secure`；登录轮换会话，封禁即时失效。
- 非 GET 请求校验 `Origin` 与 Host。
- 登录/注册/验证码/找回密码/发帖/评论/投稿/AI 分组限流。
- Markdown 经 `DOMPurify` 消毒；SQL 全参数化。
- SMTP 与 OpenRouter 密钥仅存服务端环境变量。
- 移除旧仓库中泄露的数据库口令、SMTP 授权码与 AI API Key。

### 移除

- 旧版 PHP 页面、PHPMailer 副本、Font Awesome 与多个 CDN 依赖。
- 硬编码的“小皮面板”外部后台链接与服务器地址。
- 伪造的 MP3/MP4 等格式转换功能。
- `blog_posts` 死代码、失效的聊天室页面与重复工具页。

### 文档

- 重写 README、架构、API、部署、迁移、URL 对照与工具实现指南。
- 新增贡献指南、安全策略、行为准则、更新日志与 GitHub 模板。

### 验证

- `npm run typecheck`：0 错误。
- `npm run build`：成功。
- `npm run smoke`：API 端到端全部通过。
- `npm run tools:check`：70/70 工具页渲染无错误。
- `npm run ui:check`：核心页面、暗色模式、移动端与后台全部通过。
