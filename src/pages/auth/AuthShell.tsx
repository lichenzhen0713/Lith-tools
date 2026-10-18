import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ShieldCheck, Sparkles, Zap } from 'lucide-react';

export function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="mx-auto flex max-w-5xl items-center px-4 py-12 sm:px-6 sm:py-16">
      <div className="grid w-full overflow-hidden rounded-3xl border border-[var(--card-border)] bg-[var(--card-bg)] shadow-[var(--shadow-lg)] lg:grid-cols-2">
        <div className="relative hidden flex-col justify-between overflow-hidden bg-[linear-gradient(135deg,#4f46e5_0%,#5b5bf0_48%,#06b6d4_100%)] p-10 text-white lg:flex">
          <div className="absolute -top-24 -right-24 size-64 rounded-full bg-white/10 blur-2xl" aria-hidden="true" />
          <div className="absolute -bottom-20 -left-16 size-56 rounded-full bg-cyan-300/20 blur-2xl" aria-hidden="true" />
          <div>
            <Link to="/" className="flex items-center gap-2.5">
              <span className="grid size-10 place-items-center rounded-xl bg-white p-1.5 shadow-sm">
                <img src="/logo.svg" alt="" className="h-full w-auto" />
              </span>
              <span className="text-[15px] font-bold tracking-tight">Lith Tools</span>
            </Link>
            <h2 className="mt-12 text-3xl leading-tight font-extrabold tracking-[-0.03em]">
              一个账号，
              <br />
              解锁完整工具箱。
            </h2>
            <p className="mt-4 text-sm leading-relaxed text-white/85">
              保存收藏、发布文章、参与论坛讨论，也可以在浏览器里完成所有工具操作 —— 文件永远不上传。
            </p>
          </div>
          <ul className="mt-10 space-y-3 text-sm text-white/85">
            <li className="flex items-center gap-2.5">
              <Zap className="size-4" /> 70 个工具全部免费使用
            </li>
            <li className="flex items-center gap-2.5">
              <ShieldCheck className="size-4" /> 密码使用 scrypt 哈希存储
            </li>
            <li className="flex items-center gap-2.5">
              <Sparkles className="size-4" /> 支持 Markdown、公式与代码块
            </li>
          </ul>
        </div>

        <div className="p-6 sm:p-10">
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          {subtitle ? <p className="mt-2 text-sm leading-relaxed muted">{subtitle}</p> : null}
          <div className="mt-6">{children}</div>
          {footer ? <div className="mt-6 border-t pt-5 text-sm muted">{footer}</div> : null}
        </div>
      </div>
    </div>
  );
}
