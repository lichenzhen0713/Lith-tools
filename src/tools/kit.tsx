import type { ReactNode } from 'react';
import { Copy } from 'lucide-react';
import { cn, copyText } from '../lib/utils';
import { useToast } from '../lib/toast';
import { CopyButton, Field, Input, Select, Textarea } from '../components/ui';

/** Standard content card used by every tool page. */
export function Panel({
  title,
  description,
  children,
  className,
  footer,
}: {
  title?: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  className?: string;
  footer?: ReactNode;
}) {
  return (
    <section className={cn('card p-5 sm:p-6', className)}>
      {title ? (
        <header className="mb-4">
          <h2 className="text-base font-semibold">{title}</h2>
          {description ? <p className="mt-1 text-sm muted">{description}</p> : null}
        </header>
      ) : null}
      {children}
      {footer ? <footer className="mt-5 border-t pt-4">{footer}</footer> : null}
    </section>
  );
}

/** Two-column responsive layout for tool controls + results. */
export function ToolSplit({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('grid gap-4 lg:grid-cols-2', className)}>{children}</div>;
}

export function Actions({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('mt-4 flex flex-wrap items-center gap-2', className)}>{children}</div>;
}

export function Hint({ children }: { children: ReactNode }) {
  return <p className="text-xs leading-relaxed subtle">{children}</p>;
}

/** Read-only result with an inline copy button. */
export function Result({
  label,
  value,
  mono = false,
  hint,
  className,
}: {
  label: ReactNode;
  value: ReactNode;
  mono?: boolean;
  hint?: ReactNode;
  className?: string;
}) {
  const toast = useToast();
  const text = typeof value === 'string' || typeof value === 'number' ? String(value) : '';
  return (
    <div className={cn('rounded-xl border bg-[var(--hover-bg)] px-4 py-3', className)}>
      <p className="text-xs subtle">{label}</p>
      <div className="mt-1 flex items-start gap-2">
        <p className={cn('min-w-0 flex-1 text-lg font-semibold break-words', mono && 'font-mono text-base')}>{value}</p>
        {text ? (
          <button
            type="button"
            className="shrink-0 rounded-md p-1 text-slate-400 transition-colors hover:bg-white hover:text-indigo-600 dark:hover:bg-slate-800"
            onClick={async () => {
              const ok = await copyText(text);
              if (ok) toast.success('已复制到剪贴板');
              else toast.error('复制失败');
            }}
            aria-label="复制结果"
          >
            <Copy className="size-3.5" />
          </button>
        ) : null}
      </div>
      {hint ? <p className="mt-1 text-xs subtle">{hint}</p> : null}
    </div>
  );
}

export function KeyValue({ items }: { items: { label: ReactNode; value: ReactNode }[] }) {
  return (
    <dl className="divide-y rounded-xl border">
      {items.map((item, index) => (
        <div key={index} className="flex items-start justify-between gap-4 px-4 py-2.5 text-sm">
          <dt className="subtle">{item.label}</dt>
          <dd className="text-right font-medium break-all">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export { Field, Input, Select, Textarea, CopyButton };
