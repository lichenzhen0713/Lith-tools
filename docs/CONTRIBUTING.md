# 贡献指南

感谢你愿意改进 Lith Tools！本文说明开发环境、编码约定、测试方式，以及如何新增一个工具或接口。

参与本项目即表示你同意遵守 [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md)。

## 参与方式

- 报告 Bug：使用 [Bug 模板](../.github/ISSUE_TEMPLATE/bug_report.yml)，附版本、浏览器、复现步骤与截图。
- 提出功能建议：使用 [Feature 模板](../.github/ISSUE_TEMPLATE/feature_request.yml)，说明使用场景。
- 提交代码：Fork → 分支 → 修改 → 测试 → Pull Request。
- 改进文档：README、`docs/`、`TOOLS_GUIDE.md` 都欢迎修订。
- **安全问题**：不要开公开 Issue，请按 [`SECURITY.md`](SECURITY.md) 私下报告。

## 开发环境

要求 Node.js ≥ 22.5（推荐 24）。

```bash
npm install
cp .env.example .env       # Windows: copy .env.example .env
npm run db:seed
npm run dev
```

- API：<http://127.0.0.1:8787>
- 前端：<http://localhost:5173>（Vite 代理 `/api`）
- 默认管理员：`admin / admin123456`（首次种子创建，请本地自行修改）

常用命令：

```bash
npm run typecheck          # 前端 + 服务端 strict 检查
npm run build              # 生产构建
npm run smoke              # API 冒烟（服务需运行）
npm run tools:check        # 70 个工具页渲染检查（需本机 Chrome）
npm run ui:check           # 浏览器 UI 流程检查
npm run db:reset           # 重置数据库（会删除 data/ 内数据库文件）
```

## 编码约定

### 通用

- TypeScript **strict**；不要用 `any` 绕过类型（必要时 `unknown` + 收窄）。
- 不要提交 `.env`、`data/`、`dist/`、`screenshots/`。
- 不引入明文密钥；新配置项写入 `.env.example` 与 README 配置表。
- 新增依赖前先开 Issue 讨论：能用 Web API 或现有依赖就不加包。

### 服务端

- 所有写接口使用 `zod` 校验（`parse(schema, req.body)`）。
- SQL 必须参数化；新增表/索引通过 `server/db/schema.ts` 追加迁移，**不要修改已应用的迁移**。
- 权限检查放在路由内：`requireUser` / `requireAdmin` / `requireSuperAdmin` + 资源归属校验。
- 新增路由放在 `server/routes/<domain>.ts`，并在 `server/app.ts` 注册；同步更新 `docs/API.md`。

### 前端

- 复用 `src/components/ui.tsx` 的组件与 `src/styles/index.css` 的设计令牌；不要写死浅色背景/文字。
- 页面默认导出并放在 `src/pages/`，路由在 `src/App.tsx` 懒加载。
- 数据请求使用 `src/lib/api.ts` 的 `http` 与 `src/lib/hooks.ts` 的 `useApi`，处理 loading/error/empty 三态。
- 破坏性操作用 `Modal` 二次确认；不要使用 `window.alert/confirm`。
- 提交成功/失败都要有反馈（toast 或内联提示）。

### 工具

- 每个工具一个文件：`src/tools/<slug>.tsx`，默认导出 React 组件。
- **文件不得上传服务器**（网络类工具除外，且必须走 `/api/net/*`）。
- 不依赖 CDN；图标使用 `lucide-react`。
- 清理定时器、音频上下文、对象 URL 与事件监听。
- 详细规范见 [`TOOLS_GUIDE.md`](TOOLS_GUIDE.md)。

## 如何新增一个工具

1. **登记元数据**：在 `shared/catalog.ts` 的 `toolCatalog` 中追加：

   ```ts
   {
     slug: 'my-tool',              // 同时是组件文件名与路由 /tools/my-tool
     name: '我的工具',
     category: 'development',       // 必须是 toolCategories 中的 id
     icon: 'Wrench',                // src/icons.ts 中存在的 lucide 图标名
     description: '一句话说明。',
     keywords: ['关键词'],
     legacyPath: 'development/index9.php', // 可选，便于追溯
     server: false,                 // 需要服务端代理时设为 true
   }
   ```

2. **创建组件**：`src/tools/my-tool.tsx`

   ```tsx
   import { useState } from 'react';
   import { Panel, Field, Input, Result } from './kit';
   import { Button } from '../components/ui';

   export default function MyTool() {
     const [value, setValue] = useState('');
     return (
       <div className="space-y-4">
         <Panel title="输入">
           <Field label="数值" htmlFor="v">
             <Input id="v" value={value} onChange={(e) => setValue(e.target.value)} />
           </Field>
           <Button className="mt-3">计算</Button>
         </Panel>
         <Panel title="结果"><Result label="输出" value={value || '—'} /></Panel>
       </div>
     );
   }
   ```

   无需修改路由或 `registry.tsx`：`import.meta.glob` 会自动发现组件。

3. **同步数据与文档**：

   ```bash
   npm run db:seed     # 将新工具写入已有数据库（幂等）
   npm run docs:map    # 更新 docs/URL-MAP.md
   ```

4. **验证**：

   ```bash
   npm run typecheck
   npm run tools:check
   ```

   截图与失败列表会输出到 `screenshots/`。

> 注意：种子只在工具表为空时插入目录；已有数据库请通过管理后台或 `npm run db:reset`（会清空数据）同步。生产环境建议用后台“新增工具”或编写一次性同步脚本。

## 如何新增接口

1. 在对应 `server/routes/*.ts` 中添加路由，使用 zod 校验与角色守卫。
2. 返回结构在 `shared/types.ts` 中定义（前后端共享）。
3. 在 `server/app.ts` 注册（若为新模块）。
4. 更新 `docs/API.md`。
5. 在 `scripts/smoke.mjs` 中补充一条端到端检查（如适用）。

## 提交与分支

- 分支命名：`feat/<topic>`、`fix/<topic>`、`docs/<topic>`、`chore/<topic>`。
- 提交信息遵循 [Conventional Commits](https://www.conventionalcommits.org/)：
  - `feat: add password generator tool`
  - `fix: correct BMI unit conversion`
  - `docs: document backup procedure`
- 一个 PR 聚焦一件事；避免混入无关格式化。
- PR 描述请说明动机、改动、验证方式与截图（UI 改动）。

## Pull Request 检查清单

- [ ] `npm run typecheck` 通过
- [ ] `npm run build` 通过
- [ ] 相关接口/工具已在本地手动验证（或补充自动化检查）
- [ ] 新增配置项已写入 `.env.example` 与文档
- [ ] 新增工具已更新 `shared/catalog.ts` 与 `docs/URL-MAP.md`
- [ ] 没有提交密钥、数据库、构建产物或临时文件
- [ ] UI 改动包含浅色/深色、桌面/移动端截图或说明

## 发布流程（维护者）

1. 更新 `CHANGELOG.md` 与版本号（`package.json`）。
2. `npm ci && npm run typecheck && npm run build && npm run smoke`。
3. 打 tag：`git tag v2.x.0 && git push --tags`。
4. 部署并按 `docs/DEPLOYMENT.md` 做备份与健康检查。

感谢你的贡献！
