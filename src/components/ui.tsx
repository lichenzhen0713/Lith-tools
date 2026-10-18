import {
  useEffect,
  useId,
  useMemo,
  useState,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { Check, ChevronLeft, ChevronRight, Copy, Loader2, Star, X, type LucideIcon } from 'lucide-react';
import { cn, copyText } from '../lib/utils';
import { useToast } from '../lib/toast';

/* ------------------------------------------------------------------ Button */
type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'soft';
type ButtonSize = 'sm' | 'md' | 'lg' | 'icon';

const buttonVariants: Record<ButtonVariant, string> = {
  primary: 'btn-primary',
  secondary: 'btn-secondary',
  ghost: 'btn-ghost',
  danger: 'btn-danger',
  soft: 'btn bg-indigo-50 text-indigo-700 hover:bg-indigo-100 dark:bg-indigo-500/10 dark:text-indigo-300 dark:hover:bg-indigo-500/20',
};

const buttonSizes: Record<ButtonSize, string> = {
  sm: 'btn-sm',
  md: '',
  lg: 'px-6 py-3 text-base',
  icon: 'size-9 rounded-xl p-0',
};

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  icon: Icon,
  className,
  children,
  disabled,
  type = 'button',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: LucideIcon;
}) {
  return (
    <button
      type={type}
      className={cn(buttonVariants[variant], buttonSizes[size], className)}
      disabled={disabled || loading}
      {...rest}
    >
      {loading ? <Loader2 className="size-4 animate-spin" /> : Icon ? <Icon className="size-4" /> : null}
      {children}
    </button>
  );
}

/* ------------------------------------------------------------------- Input */
export function Input({ className, error, ...rest }: InputHTMLAttributes<HTMLInputElement> & { error?: boolean }) {
  return <input className={cn('input', error && 'border-rose-400 focus:border-rose-400', className)} {...rest} />;
}

export function Textarea({ className, error, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement> & { error?: boolean }) {
  return <textarea className={cn('input min-h-24 resize-y', error && 'border-rose-400', className)} {...rest} />;
}

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cn('input cursor-pointer appearance-none bg-no-repeat pr-9', className)} {...rest}>
      {children}
    </select>
  );
}

export function Field({
  label,
  htmlFor,
  hint,
  error,
  required,
  children,
  className,
}: {
  label?: string;
  htmlFor?: string;
  hint?: string;
  error?: string | null;
  required?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('space-y-1.5', className)}>
      {label ? (
        <label htmlFor={htmlFor} className="label mb-0">
          {label}
          {required ? <span className="ml-0.5 text-rose-500">*</span> : null}
        </label>
      ) : null}
      {children}
      {error ? <p className="text-xs text-rose-500">{error}</p> : hint ? <p className="text-xs subtle">{hint}</p> : null}
    </div>
  );
}

export function Checkbox({
  label,
  className,
  ...rest
}: InputHTMLAttributes<HTMLInputElement> & { label?: ReactNode }) {
  return (
    <label className={cn('inline-flex cursor-pointer items-center gap-2 text-sm', className)}>
      <input type="checkbox" className="size-4 rounded border-slate-300 accent-indigo-600" {...rest} />
      {label ? <span>{label}</span> : null}
    </label>
  );
}

export function Switch({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label?: ReactNode;
  disabled?: boolean;
}) {
  return (
    <label className={cn('inline-flex cursor-pointer items-center gap-2.5 text-sm', disabled && 'opacity-60')}>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative h-6 w-11 shrink-0 rounded-full transition-colors',
          checked ? 'bg-indigo-600' : 'bg-slate-300 dark:bg-slate-700',
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 left-0.5 size-5 rounded-full bg-white shadow transition-transform',
            checked && 'translate-x-5',
          )}
        />
      </button>
      {label}
    </label>
  );
}

/* -------------------------------------------------------------------- Card */
export function Card({ className, children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('card', className)} {...rest}>
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  description,
  action,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-wrap items-start justify-between gap-3 border-b p-5', className)}>
      <div>
        <h3 className="text-base font-semibold">{title}</h3>
        {description ? <p className="mt-1 text-sm muted">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

/* ------------------------------------------------------------------- Badge */
type Tone = 'default' | 'brand' | 'success' | 'warning' | 'danger';
const toneClasses: Record<Tone, string> = {
  default: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
  brand: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300',
  success: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
  warning: 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
  danger: 'bg-rose-50 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300',
};

export function Badge({ tone = 'default', children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return <span className={cn('badge', toneClasses[tone], className)}>{children}</span>;
}

/* ------------------------------------------------------------------- Alert */
export function Alert({
  tone = 'info',
  title,
  children,
  className,
}: {
  tone?: 'info' | 'success' | 'warning' | 'error';
  title?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  const classes = {
    info: 'border-sky-200 bg-sky-50 text-sky-900 dark:border-sky-800 dark:bg-sky-950 dark:text-sky-100',
    success: 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-100',
    warning: 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100',
    error: 'border-rose-200 bg-rose-50 text-rose-900 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-100',
  } as const;
  return (
    <div className={cn('rounded-xl border px-4 py-3 text-sm leading-relaxed', classes[tone], className)}>
      {title ? <p className="font-medium">{title}</p> : null}
      {children ? <div className={cn(Boolean(title) && 'mt-1 opacity-90')}>{children}</div> : null}
    </div>
  );
}

/* ------------------------------------------------------------- Loading etc */
export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn('size-5 animate-spin text-indigo-500', className)} />;
}

export function PageLoader({ label = '加载中…' }: { label?: string }) {
  return (
    <div className="flex min-h-[45vh] flex-col items-center justify-center gap-3">
      <Spinner className="size-7" />
      <p className="text-sm subtle">{label}</p>
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-lg bg-slate-200/70 dark:bg-slate-800', className)} />;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon?: LucideIcon;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col items-center justify-center rounded-2xl border border-dashed px-6 py-14 text-center', className)}>
      {Icon ? (
        <div className="mb-4 rounded-2xl bg-slate-100 p-3 text-slate-400 dark:bg-slate-800 dark:text-slate-500">
          <Icon className="size-6" />
        </div>
      ) : null}
      <p className="font-medium">{title}</p>
      {description ? <p className="mt-1 max-w-sm text-sm muted">{description}</p> : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

/* ------------------------------------------------------------------- Modal */
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const original = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = original;
    };
  }, [open, onClose]);

  if (!open) return null;
  const widths = { sm: 'max-w-md', md: 'max-w-xl', lg: 'max-w-3xl' } as const;

  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-slate-950/45 p-0 backdrop-blur-sm animate-fade-in sm:items-center sm:p-6" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        className={cn('w-full rounded-t-2xl border bg-[var(--card-bg)] shadow-2xl animate-fade-up sm:rounded-2xl', widths[size])}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b px-5 py-4">
          <div>
            {title ? <h2 className="text-base font-semibold">{title}</h2> : null}
            {description ? <p className="mt-1 text-sm muted">{description}</p> : null}
          </div>
          <button type="button" onClick={onClose} className="btn-ghost -mr-2 size-8 rounded-lg p-0" aria-label="关闭">
            <X className="size-4" />
          </button>
        </div>
        <div className="max-h-[70vh] overflow-y-auto p-5">{children}</div>
        {footer ? <div className="flex items-center justify-end gap-2 border-t px-5 py-4">{footer}</div> : null}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------- Tabs */
export function Tabs<T extends string>({
  items,
  value,
  onChange,
  className,
}: {
  items: { value: T; label: ReactNode; count?: number }[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}) {
  return (
    <div className={cn('scrollbar-none flex gap-1 overflow-x-auto border-b', className)}>
      {items.map((item) => (
        <button
          key={item.value}
          type="button"
          onClick={() => onChange(item.value)}
          className={cn(
            'relative shrink-0 px-3.5 py-2.5 text-sm font-medium transition-colors',
            value === item.value ? 'text-indigo-600 dark:text-indigo-400' : 'muted hover:text-[var(--text-primary)]',
          )}
        >
          {item.label}
          {typeof item.count === 'number' ? (
            <span className="ml-1.5 rounded-full bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-600 dark:bg-slate-800 dark:text-slate-300">
              {item.count}
            </span>
          ) : null}
          {value === item.value ? <span className="absolute inset-x-2 -bottom-px h-0.5 rounded bg-indigo-600 dark:bg-indigo-400" /> : null}
        </button>
      ))}
    </div>
  );
}

/* -------------------------------------------------------------- Pagination */
export function Pagination({
  page,
  totalPages,
  onChange,
  className,
}: {
  page: number;
  totalPages: number;
  onChange: (page: number) => void;
  className?: string;
}) {
  if (totalPages <= 1) return null;
  const pages = useMemo(() => {
    const result: (number | '…')[] = [];
    const push = (value: number | '…') => {
      if (result[result.length - 1] !== value) result.push(value);
    };
    push(1);
    if (page > 3) push('…');
    for (let index = Math.max(2, page - 1); index <= Math.min(totalPages - 1, page + 1); index += 1) push(index);
    if (page < totalPages - 2) push('…');
    if (totalPages > 1) push(totalPages);
    return result;
  }, [page, totalPages]);

  return (
    <nav className={cn('flex items-center justify-center gap-1.5', className)} aria-label="分页">
      <button
        type="button"
        className="btn-secondary btn-sm"
        disabled={page <= 1}
        onClick={() => onChange(page - 1)}
      >
        <ChevronLeft className="size-3.5" /> 上一页
      </button>
      {pages.map((item, index) =>
        item === '…' ? (
          <span key={`ellipsis-${index}`} className="px-1 text-xs subtle">
            …
          </span>
        ) : (
          <button
            key={item}
            type="button"
            onClick={() => onChange(item)}
            className={cn(
              'size-8 rounded-lg text-sm transition-colors',
              item === page
                ? 'bg-indigo-600 font-medium text-white'
                : 'text-[var(--text-secondary)] hover:bg-[var(--hover-bg)]',
            )}
            aria-current={item === page ? 'page' : undefined}
          >
            {item}
          </button>
        ),
      )}
      <button
        type="button"
        className="btn-secondary btn-sm"
        disabled={page >= totalPages}
        onClick={() => onChange(page + 1)}
      >
        下一页 <ChevronRight className="size-3.5" />
      </button>
    </nav>
  );
}

/* ------------------------------------------------------------------ Avatar */
export function Avatar({ name, size = 'md', className }: { name: string; size?: 'sm' | 'md' | 'lg'; className?: string }) {
  const initials = name.trim().slice(0, 1).toUpperCase() || '?';
  const palette = ['from-indigo-500 to-violet-500', 'from-sky-500 to-cyan-500', 'from-emerald-500 to-teal-500', 'from-amber-500 to-orange-500', 'from-rose-500 to-pink-500'];
  const hash = Array.from(name).reduce((sum, char) => sum + char.charCodeAt(0), 0);
  const sizes = { sm: 'size-7 text-xs', md: 'size-9 text-sm', lg: 'size-12 text-lg' } as const;
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br font-semibold text-white',
        palette[hash % palette.length],
        sizes[size],
        className,
      )}
      aria-hidden="true"
    >
      {initials}
    </span>
  );
}

/* ---------------------------------------------------------------- StatCard */
export function StatCard({
  icon: Icon,
  label,
  value,
  hint,
  className,
}: {
  icon?: LucideIcon;
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('card p-5', className)}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm muted">{label}</p>
        {Icon ? (
          <span className="rounded-xl bg-indigo-50 p-2 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-300">
            <Icon className="size-4" />
          </span>
        ) : null}
      </div>
      <p className="mt-2 text-2xl font-semibold tracking-tight">{value}</p>
      {hint ? <p className="mt-1 text-xs subtle">{hint}</p> : null}
    </div>
  );
}

/* ---------------------------------------------------------------- PageHeader */
export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  className,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-wrap items-end justify-between gap-4', className)}>
      <div>
        {eyebrow ? <p className="eyebrow mb-3">{eyebrow}</p> : null}
        <h1 className="text-2xl font-extrabold tracking-[-0.03em] sm:text-[2rem]">{title}</h1>
        {description ? <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[var(--text-muted)]">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

/* --------------------------------------------------------------- CopyButton */
export function CopyButton({ text, label = '复制', size = 'sm' }: { text: string; label?: string; size?: 'sm' | 'md' }) {
  const [copied, setCopied] = useState(false);
  const toast = useToast();
  return (
    <Button
      variant="secondary"
      size={size}
      icon={copied ? Check : Copy}
      onClick={async () => {
        const ok = await copyText(text);
        if (ok) {
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1600);
        } else {
          toast.error('复制失败，请手动选择文本');
        }
      }}
    >
      {copied ? '已复制' : label}
    </Button>
  );
}

/* -------------------------------------------------------------------- Kbd */
export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="rounded-md border bg-[var(--hover-bg)] px-1.5 py-0.5 font-mono text-[11px] text-[var(--text-secondary)]">
      {children}
    </kbd>
  );
}

/* ------------------------------------------------------------------ Stars */
export function Stars({ value, onChange, size = 'md' }: { value: number; onChange?: (value: number) => void; size?: 'sm' | 'md' | 'lg' }) {
  const [hover, setHover] = useState(0);
  const sizes = { sm: 'size-4', md: 'size-6', lg: 'size-8' } as const;
  return (
    <div className="inline-flex items-center gap-1" onMouseLeave={() => setHover(0)}>
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          disabled={!onChange}
          onClick={() => onChange?.(star)}
          onMouseEnter={() => setHover(star)}
          className={cn('transition-transform', onChange && 'hover:scale-110', !onChange && 'cursor-default')}
          aria-label={`${star} 星`}
        >
          <Star
            className={cn(
              sizes[size],
              star <= (hover || value)
                ? 'fill-amber-400 text-amber-400'
                : 'text-slate-300 dark:text-slate-600',
            )}
          />
        </button>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------- Misc */
export function Divider({ className }: { className?: string }) {
  return <hr className={cn('border-t', className)} />;
}

export function FormRow({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('grid gap-4 sm:grid-cols-2', className)}>{children}</div>;
}

export function useFieldId(prefix: string): string {
  const id = useId();
  return `${prefix}-${id.replace(/:/g, '')}`;
}
