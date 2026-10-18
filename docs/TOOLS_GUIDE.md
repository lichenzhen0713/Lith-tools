# Lith Tools — 工具实现指南（给实现者）

本项目是旧 PHP 工具站的完整重写：**Node.js + TypeScript + Fastify + SQLite + React 19 + Vite + Tailwind CSS v4**。
你的任务是：把分配给你的旧工具页面，重写为新的 React 工具组件。旧代码是**功能参考**，不是 UI 参考。

## 1. 文件约定

- 每个工具一个文件：`src/tools/<slug>.tsx`。
- **默认导出**一个 React 组件：`export default function XxxTool() { ... }`。
- 文件名必须与分配给你的 slug 完全一致（`registry.tsx` 通过 `import.meta.glob` 自动发现，无需注册）。
- 只创建/修改分配给你的文件。**不要修改其它文件**、不要改 `package.json`、不要新增依赖。
- TypeScript 严格模式（`strict: true`）。不要用 `any` 绕过类型（确实需要时可局部 `unknown` + 收窄）。

## 2. 页面容器与视觉

工具页外壳（标题、面包屑、收藏、同类推荐）由 `pages/ToolPage.tsx` 提供，你的组件**只渲染内容主体**：

```tsx
export default function ExampleTool() {
  return (
    <div className="space-y-4">
      <Panel title="输入" description="...">...</Panel>
      <Panel title="结果">...</Panel>
    </div>
  );
}
```

- 使用 Tailwind CSS v4 工具类；主题色 `indigo`，中性色由 CSS 变量控制。
- 常用语义类：`card`（白/深色卡片）、`input`（表单控件）、`muted`（次要文字）、`subtle`（更浅）、`btn-primary` / `btn-secondary` / `btn-ghost`。
- 文字颜色用 `text-[var(--text-primary)]`、`text-[var(--text-secondary)]` 或 `muted`；不要写死浅色背景/文字导致深色模式不可读。
- 响应式：控件区 `grid gap-4 sm:grid-cols-2`；画布/编辑器可占满宽度；避免固定像素宽度。
- 中文界面，标题简洁；按钮文案明确（如「计算」「生成」「下载 PNG」）。

## 3. 可复用模块（已存在）

```tsx
// 组件
import { Panel, ToolSplit, Actions, Hint, Result, KeyValue, Field, Input, Select, Textarea, CopyButton } from './kit';
import {
  Button, Badge, Alert, EmptyState, StatCard, Tabs, Modal, Checkbox, Switch, Stars,
  Kbd, Skeleton, Spinner, PageLoader, FormRow, Divider,
} from '../components/ui';
import { Markdown } from '../components/Markdown'; // 渲染 Markdown（已 DOMPurify 消毒 + KaTeX）

// 工具函数
import { formatNumber, formatBytes, formatDate, relativeTime, download, copyText,
         readFileAsText, readFileAsDataUrl, readFileAsArrayBuffer, clamp, truncate, cn } from '../lib/utils';

// hooks / 请求 / 提示
import { useApi, useLocalStorage, useDebouncedValue, useInterval } from '../lib/hooks';
import { http, errorMessage } from '../lib/api';
import { useToast } from '../lib/toast';

// 图标（lucide-react 已安装）
import { Calculator, Download, Play, Pause } from 'lucide-react';

// 工具图标映射（按分类图标名取）
import { toolIcon } from '../icons';
```

`Panel`：内容卡片（`title`、`description`、`footer` 可选）。
`ToolSplit`：`grid gap-4 lg:grid-cols-2` 双栏。
`Result`：只读结果块（`label`、`value`、`mono`、`hint`），自带复制按钮。
`KeyValue`：键值对列表。
`Field`：`label` + `hint` + `error` + children。

## 4. 交互规范

- **受控输入**；数值输入做 `Number()` 校验并处理 `NaN`。
- 空输入时给出引导（`EmptyState`/`Hint`），不要直接抛错。
- 计算类操作即时响应即可；耗时操作（图片/压缩/PDF）显示 `loading` 并防止重复提交。
- 错误提示：表单级用 `Alert tone="error"`，字段级用 `Field error`。
- 成功操作可用 `useToast().success(...)`（例如复制、下载完成）。
- 副作用要清理：`setInterval`/`setTimeout`、`AudioContext`、事件监听、`URL.createObjectURL`（用后 `revokeObjectURL`）。
- 不要使用 `window.alert` / `confirm`（用 `Modal` 或 toast；破坏性操作用 `Modal` 二次确认）。
- 键盘可用性：主要操作支持 Enter 提交（`<form onSubmit>`）。

## 5. 依赖与数据来源

已安装且允许使用：

- `jszip`（ZIP 打包/解压）
- `qrcode`（二维码：`import QRCode from 'qrcode'`，`QRCode.toDataURL(text, { width, margin, color })`）
- `katex`（公式渲染：`import katex from 'katex'` + `import 'katex/dist/katex.min.css'`）
- `marked` + `dompurify`（Markdown，已封装在 `components/Markdown.tsx`，优先直接用）
- `html2canvas` + `jspdf`（导出图片/PDF）
- `cropperjs`（图片裁剪，需 `import 'cropperjs/dist/cropper.css'`）
- `lucide-react`

**禁止**：CDN `<script>`、新增 npm 依赖、请求第三方接口（除非使用下面的本站代理接口）。

## 6. 必须本地处理

文件与图片**不得上传**：用 `FileReader` / `Canvas` / `Image` / `Blob` / `JSZip` / `Web Audio` 在浏览器内完成。

网络类工具使用本站服务端代理（避免 CORS 与密钥泄漏）：

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/net/ip?ip=8.8.8.8` | IP 归属地（留空查询本机） |
| GET | `/api/net/dns?name=example.com&type=A` | DNS 记录（A/AAAA/MX/TXT/NS/CNAME） |
| POST | `/api/net/ping` | body `{ host, port }`（端口限 80/443/8080/8443），返回 3 次 TCP 延迟 |
| GET | `/api/net/rates?base=USD` | 汇率表 |

## 7. 旧页面参考

旧实现位于旧版 PHP 站点的 `<legacyPath>`（页面第一行 `<?php include ... ?>` 与内联 CSS 可忽略）。请先通读旧实现，理解字段、算法、输出，再用新组件重写并修正常见问题（无校验、XSS、假转换等）。

## 8. 质量清单

- [ ] 默认导出、文件名与 slug 一致
- [ ] 无未使用 import、无 `@ts-ignore`
- [ ] 深色/浅色模式都可读
- [ ] 移动端可用（`sm:` / `lg:` 断点）
- [ ] 空状态、错误状态、加载状态齐全
- [ ] 定时器/音频/对象 URL 已清理
- [ ] 不发送文件到服务器、不调用第三方 API
- [ ] 功能与原页面等价，明显 bug 已修复
