import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, NavLink, Outlet, useLocation, useSearchParams } from 'react-router-dom';
import {
  Activity,
  Ban,
  BookOpen,
  ChevronRight,
  ExternalLink,
  FolderTree,
  Inbox,
  LayoutDashboard,
  Menu,
  MessageSquare,
  RefreshCw,
  ShieldCheck,
  Users,
  Wrench,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useAuth } from '../../lib/auth';
import { useDocumentTitle } from '../../lib/hooks';
import { cn, formatNumber } from '../../lib/utils';
import { Alert, Avatar, Button, Pagination, Skeleton } from '../../components/ui';

/** Every admin list uses the same page size so pagination stays predictable. */
export const ADMIN_PAGE_SIZE = 20;

interface AdminNavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  /** Only visible / usable for role === 2. */
  superOnly?: boolean;
}

const ADMIN_NAV: AdminNavItem[] = [
  { to: '/admin', label: '概览', icon: LayoutDashboard },
  { to: '/admin/users', label: '用户', icon: Users, superOnly: true },
  { to: '/admin/tools', label: '工具', icon: Wrench, superOnly: true },
  { to: '/admin/blogs', label: '博客', icon: BookOpen },
  { to: '/admin/categories', label: '分类', icon: FolderTree, superOnly: true },
  { to: '/admin/feedback', label: '反馈', icon: MessageSquare },
  { to: '/admin/submissions', label: '投稿', icon: Inbox },
  { to: '/admin/bans', label: '封禁 IP', icon: Ban, superOnly: true },
  { to: '/admin/access-logs', label: '访问记录', icon: Activity },
];

/** Breadcrumb / title lookup: longest matching path wins. */
function findCurrentNav(pathname: string): AdminNavItem | undefined {
  const sorted = [...ADMIN_NAV].sort((a, b) => b.to.length - a.to.length);
  return sorted.find((item) =>
    item.to === '/admin' ? pathname === '/admin' || pathname === '/admin/' : pathname === item.to || pathname.startsWith(`${item.to}/`),
  );
}

function roleLabel(role: number | undefined): string {
  if (role === 2) return '超级管理员';
  if (role === 1) return '管理员';
  return '普通用户';
}

/* ------------------------------------------------------------------ shared */

export function useIsSuperAdmin(): boolean {
  const { user } = useAuth();
  return user?.role === 2;
}

/** Renders a friendly alert instead of a crashing page for non-super admins. */
export function AdminGuard({ children }: { children: ReactNode }) {
  const isSuper = useIsSuperAdmin();
  if (!isSuper) {
    return (
      <div className="space-y-4">
        <Alert tone="warning" title="需要超级管理员权限">
          当前账户是普通管理员，只能访问概览、博客、反馈、投稿与访问记录。用户、工具、分类与封禁相关的数据仅超级管理员可以管理。
        </Alert>
        <div className="flex flex-wrap gap-2">
          <Link to="/admin" className="btn-secondary btn-sm">
            返回管理概览
          </Link>
          <Link to="/admin/submissions" className="btn-secondary btn-sm">
            前往投稿审核
          </Link>
        </div>
      </div>
    );
  }
  return <>{children}</>;
}

/**
 * URL-backed list state: page number plus plain string filters.
 * Filters always reset the page to 1 so results do not land on an empty page.
 */
export function useAdminSearch() {
  const [searchParams, setSearchParams] = useSearchParams();
  const page = Math.max(1, Number(searchParams.get('page') ?? 1) || 1);

  const get = useCallback((key: string, fallback = '') => searchParams.get(key) ?? fallback, [searchParams]);

  const update = useCallback(
    (values: Record<string, string | null>, options: { resetPage?: boolean } = {}) => {
      setSearchParams(
        (previous) => {
          const next = new URLSearchParams(previous);
          for (const [key, value] of Object.entries(values)) {
            if (value === null || value === '') next.delete(key);
            else next.set(key, value);
          }
          if (options.resetPage !== false) next.delete('page');
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const setPage = useCallback(
    (value: number) => {
      setSearchParams(
        (previous) => {
          const next = new URLSearchParams(previous);
          if (value <= 1) next.delete('page');
          else next.set('page', String(value));
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  return { page, get, update, setPage, searchParams };
}

/** Table body placeholder used while a list request is in flight. */
export function TableSkeleton({ rows = 6, cols = 6 }: { rows?: number; cols?: number }) {
  return (
    <tbody>
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <tr key={`skeleton-row-${rowIndex}`}>
          {Array.from({ length: cols }).map((__, colIndex) => (
            <td key={`skeleton-cell-${rowIndex}-${colIndex}`}>
              <Skeleton className={cn('h-4', colIndex === 0 ? 'w-8' : colIndex === 1 ? 'w-32' : 'w-20')} />
            </td>
          ))}
        </tr>
      ))}
    </tbody>
  );
}

/** Table body error row with a retry action. */
export function TableError({ error, colSpan, onRetry }: { error: string; colSpan: number; onRetry: () => void }) {
  return (
    <tbody>
      <tr>
        <td colSpan={colSpan} className="px-4 py-6">
          <Alert tone="error" title="加载失败">
            {error}
          </Alert>
          <div className="mt-3 text-center">
            <Button variant="secondary" size="sm" icon={RefreshCw} onClick={onRetry}>
              重新加载
            </Button>
          </div>
        </td>
      </tr>
    </tbody>
  );
}

/** Table body empty row. */
export function TableEmpty({
  colSpan,
  icon: Icon,
  title,
  description,
  action,
}: {
  colSpan: number;
  icon?: LucideIcon;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <tbody>
      <tr>
        <td colSpan={colSpan} className="px-4 py-12">
          <div className="flex flex-col items-center justify-center gap-2 text-center">
            {Icon ? <Icon className="size-6 text-slate-400 dark:text-slate-500" /> : null}
            <p className="text-sm font-medium">{title}</p>
            {description ? <p className="max-w-sm text-xs leading-relaxed subtle">{description}</p> : null}
            {action ? <div className="mt-2">{action}</div> : null}
          </div>
        </td>
      </tr>
    </tbody>
  );
}

/** Footer for list cards: record count + numbered pagination. */
export function TablePager({
  page,
  totalPages,
  total,
  onChange,
}: {
  page: number;
  totalPages: number;
  total: number;
  onChange: (page: number) => void;
}) {
  const safeTotalPages = Math.max(1, totalPages);
  return (
    <div className="flex flex-col items-center justify-between gap-3 border-t px-4 py-3 sm:flex-row">
      <p className="text-xs subtle">
        共 {formatNumber(total)} 条记录 · 第 {page} / {safeTotalPages} 页
      </p>
      <Pagination page={page} totalPages={safeTotalPages} onChange={onChange} />
    </div>
  );
}

/* ------------------------------------------------------------------ layout */

export default function AdminLayout() {
  const { user } = useAuth();
  const location = useLocation();
  const isSuper = useIsSuperAdmin();
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  const items = useMemo(() => ADMIN_NAV.filter((item) => !item.superOnly || isSuper), [isSuper]);
  const current = useMemo(() => findCurrentNav(location.pathname), [location.pathname]);

  useDocumentTitle(current ? `${current.label} · 管理后台` : '管理后台');

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="lg:grid lg:grid-cols-[15rem_minmax(0,1fr)] lg:items-start lg:gap-6">
        {/* ------------------------------------------------------------ sidebar */}
        <aside className="hidden lg:sticky lg:top-20 lg:block lg:max-h-[calc(100dvh-6rem)] lg:self-start lg:overflow-y-auto">
          <div className="card p-3">
            <div className="flex items-center gap-2.5 px-2 py-2">
              <span className="grid size-9 place-items-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-sm shadow-indigo-500/30">
                <ShieldCheck className="size-4.5" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold tracking-tight">管理后台</p>
                <p className="text-[11px] subtle">Lith Tools Console</p>
              </div>
            </div>
            <nav className="mt-2 space-y-0.5" aria-label="管理导航">
              {items.map((item) => {
                const Icon = item.icon;
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.to === '/admin'}
                    className={({ isActive }) =>
                      cn(
                        'flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium transition-colors',
                        isActive
                          ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-300'
                          : 'text-[var(--text-secondary)] hover:bg-[var(--hover-bg)] hover:text-[var(--text-primary)]',
                      )
                    }
                  >
                    <Icon className="size-4 shrink-0" />
                    <span className="truncate">{item.label}</span>
                  </NavLink>
                );
              })}
            </nav>
          </div>

          <div className="card mt-3 p-4">
            <p className="flex items-center gap-1.5 text-xs font-medium text-[var(--text-secondary)]">
              <ShieldCheck className="size-3.5" /> {roleLabel(user?.role)}模式
            </p>
            <p className="mt-1.5 text-[11px] leading-relaxed subtle">
              封禁、删除等操作不可撤销，并会通知相关用户。请谨慎处理。
            </p>
            <Link to="/" className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:underline dark:text-indigo-400">
              返回前台 <ExternalLink className="size-3" />
            </Link>
          </div>
        </aside>

        <div className="min-w-0">
          {/* ------------------------------------------------------- mobile nav */}
          <div className="mb-3 lg:hidden">
            <div className="card px-3 py-2.5">
              <button
                type="button"
                onClick={() => setMobileOpen((value) => !value)}
                className="flex w-full items-center gap-2 text-left"
                aria-expanded={mobileOpen}
                aria-controls="admin-mobile-nav"
              >
                <LayoutDashboard className="size-4 shrink-0 text-indigo-500" />
                <span className="truncate text-sm font-medium">{current?.label ?? '管理后台'}</span>
                <span className="ml-auto rounded-lg border p-1 text-slate-500 dark:text-slate-400">
                  {mobileOpen ? <X className="size-3.5" /> : <Menu className="size-3.5" />}
                </span>
              </button>
              {mobileOpen ? (
                <nav id="admin-mobile-nav" className="scrollbar-none mt-3 flex gap-2 overflow-x-auto pb-1" aria-label="管理导航">
                  {items.map((item) => (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      end={item.to === '/admin'}
                      className={({ isActive }) => cn('chip shrink-0', isActive && 'chip-active')}
                    >
                      {item.label}
                    </NavLink>
                  ))}
                </nav>
              ) : null}
            </div>
          </div>

          {/* ----------------------------------------------------------- topbar */}
          <header className="flex flex-wrap items-center gap-2 rounded-2xl border bg-[var(--card-bg)] px-3 py-2.5 sm:gap-3 sm:px-4 sm:py-3">
            <nav className="flex min-w-0 items-center gap-1.5 text-sm" aria-label="面包屑">
              <Link to="/admin" className="shrink-0 subtle transition-colors hover:text-[var(--text-primary)]">
                管理后台
              </Link>
              <ChevronRight className="size-3.5 shrink-0 text-slate-400" />
              <span className="truncate font-medium">{current?.to === '/admin' ? '概览' : (current?.label ?? '概览')}</span>
            </nav>

            <div className="ml-auto flex items-center gap-2">
              <Link to="/" className="btn-secondary btn-sm">
                <ExternalLink className="size-3.5" /> 返回前台
              </Link>
              <div className="flex items-center gap-2 rounded-full border py-1 pr-2.5 pl-1">
                <Avatar name={user?.username ?? 'A'} size="sm" />
                <div className="hidden leading-tight sm:block">
                  <p className="max-w-28 truncate text-xs font-medium">{user?.username ?? '未登录'}</p>
                  <p className="text-[10px] subtle">{roleLabel(user?.role)}</p>
                </div>
              </div>
            </div>
          </header>

          <div className="mt-5">
            <Outlet />
          </div>
        </div>
      </div>
    </div>
  );
}
