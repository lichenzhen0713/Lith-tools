import { Link } from 'react-router-dom';
import { ArrowRight, Code2, Database, ShieldCheck, Sparkles, Zap } from 'lucide-react';
import { useDocumentTitle } from '../lib/hooks';
import { Badge, Card } from '../components/ui';

const stack = [
  { icon: Code2, name: 'React 19 + TypeScript', detail: '函数组件、懒加载路由、严格类型约束的前端。' },
  { icon: Zap, name: 'Vite 7', detail: '极速开发服务器与按工具拆分的产物打包。' },
  { icon: Database, name: 'SQLite (node:sqlite)', detail: '单文件数据库，零外部依赖，备份即复制文件。' },
  { icon: ShieldCheck, name: 'Fastify 5', detail: '会话、CSRF 来源校验、限流、IP 封禁与审计日志。' },
];

const faq = [
  {
    question: '文件会被上传到服务器吗？',
    answer:
      '不会。图片压缩、格式转换、ZIP 打包等操作全部在你的浏览器里通过 Canvas / Web Crypto / JSZip 完成，文件不会离开你的设备。只有 IP/DNS 查询、汇率和 AI 助手需要服务器代为请求。',
  },
  {
    question: '账号能做什么？',
    answer:
      '注册后可以收藏工具、发布博客文章、参与论坛讨论、提交反馈与工具推荐。普通用户发布的内容会遵守社区规范，管理员可对违规内容进行管理。',
  },
  {
    question: '如何备份数据？',
    answer:
      '所有数据保存在 data/lith-tools.db 这一个 SQLite 文件中。停止服务后复制该文件即可完成备份；恢复时替换回去并重启即可。',
  },
  {
    question: '旧版页面去哪了？',
    answer:
      '旧版 PHP 站点保留在项目根目录作为参考，新版是 F:\\web\\tools\\lith-tools 中的独立应用。两者可以并行运行，方便对照功能。',
  },
];

export default function About() {
  useDocumentTitle('关于本站');
  return (
    <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6 sm:py-16">
      <Badge tone="brand">
        <Sparkles className="size-3.5" /> 关于
      </Badge>
      <h1 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">把工具做得简单、快速、可信</h1>
      <p className="mt-4 max-w-2xl text-sm leading-relaxed muted sm:text-base">
        Lith Tools 最初是一个个人练手项目，收录了日常会用到的计算器、转换器和文本工具。2.0
        版本对整个站点进行了重写：更清晰的界面、更安全的账户体系、更快的加载速度，以及可持续维护的代码结构。
      </p>

      <section className="mt-10">
        <h2 className="text-lg font-semibold tracking-tight">技术栈</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {stack.map((item) => (
            <Card key={item.name} className="p-5">
              <span className="flex size-9 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-300">
                <item.icon className="size-4" />
              </span>
              <p className="mt-3 text-sm font-medium">{item.name}</p>
              <p className="mt-1 text-xs leading-relaxed subtle">{item.detail}</p>
            </Card>
          ))}
        </div>
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-semibold tracking-tight">常见问题</h2>
        <div className="mt-4 space-y-3">
          {faq.map((item) => (
            <details key={item.question} className="group card p-5">
              <summary className="cursor-pointer list-none text-sm font-medium marker:hidden">
                <span className="flex items-center justify-between gap-3">
                  {item.question}
                  <span className="text-slate-400 transition-transform group-open:rotate-90">›</span>
                </span>
              </summary>
              <p className="mt-3 text-sm leading-relaxed muted">{item.answer}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="mt-10 rounded-2xl border bg-gradient-to-br from-indigo-50 to-violet-50 p-6 dark:from-indigo-500/10 dark:to-violet-500/10 sm:p-8">
        <h2 className="text-lg font-semibold tracking-tight">一起把它做得更好</h2>
        <p className="mt-2 max-w-xl text-sm leading-relaxed muted">
          发现 bug、想要新工具，或者愿意贡献一篇教程？我们非常欢迎你的参与。
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link to="/feedback" className="btn-primary">
            意见反馈 <ArrowRight className="size-4" />
          </Link>
          <Link to="/submit/tool" className="btn-secondary">
            推荐工具
          </Link>
          <Link to="/blog" className="btn-secondary">
            阅读博客
          </Link>
        </div>
      </section>
    </div>
  );
}
