import { useEffect, useRef, useState, Suspense } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  ChevronDown,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  Search,
  Settings,
  Sun,
  User as UserIcon,
  X,
} from 'lucide-react';
import { useAuth } from '../lib/auth';
import { useTheme } from '../lib/theme';
import { cn } from '../lib/utils';
import { useOnClickOutside } from '../lib/hooks';
import { Avatar, Button, Kbd, PageLoader } from './ui';
import { ErrorBoundary } from './ErrorBoundary';
import { SearchPalette } from './SearchPalette';

const navItems = [
  { to: '/tools', label: '工具库' },
  { to: '/blog', label: '博客' },
  { to: '/forum', label: '论坛' },
  { to: '/assistant', label: 'AI 助手' },
];

function Logo() {
  return (
    <Link to="/" className="flex items-center gap-2.5" aria-label="Lith Tools 首页">
      <span className="grid size-9 place-items-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 text-lg font-bold text-white shadow-sm shadow-indigo-500/30">
        L
      </span>
      <span className="flex flex-col leading-none">
        <span className="text-[15px] font-semibold tracking-tight">Lith Tools</span>
        <span className="mt-1 text-[10px] tracking-[0.14em] text-[var(--text-muted)] uppercase">Toolbox</span>
      </span>
    </Link>
  );
}

function UserMenu() {
  const { user, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  useOnClickOutside(ref, () => setOpen(false));

  if (!user) {
    return (
      <div className="flex items-center gap-2">
        <Link to="/login" className="btn-ghost btn-sm">
          登录
        </Link>
        <Link to="/register" className="btn-primary btn-sm">
          免费注册
        </Link>
      </div>
    );
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex items-center gap-2 rounded-full border py-1 pr-2 pl-1 transition-colors hover:bg-[var(--hover-bg)]"
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <Avatar name={user.username} size="sm" />
        <span className="hidden max-w-24 truncate text-sm font-medium sm:block">{user.username}</span>
        <ChevronDown className={cn('size-3.5 text-slate-400 transition-transform', open && 'rotate-180')} />
      </button>
      {open ? (
        <div
          className="absolute right-0 z-50 mt-2 w-56 overflow-hidden rounded-xl border bg-[var(--card-bg)] py-1 shadow-xl animate-fade-up"
          role="menu"
        >
          <div className="border-b px-3 py-2.5">
            <p className="truncate text-sm font-medium">{user.username}</p>
            <p className="truncate text-xs subtle">
              {user.role === 2 ? '超级管理员' : user.role === 1 ? '管理员' : '普通用户'}
            </p>
          </div>
          <MenuItem icon={UserIcon} label="个人中心" onClick={() => { setOpen(false); navigate('/dashboard'); }} />
          <MenuItem icon={Settings} label="账户设置" onClick={() => { setOpen(false); navigate('/dashboard?tab=settings'); }} />
          {user.role >= 1 ? (
            <MenuItem icon={LayoutDashboard} label="管理后台" onClick={() => { setOpen(false); navigate('/admin'); }} />
          ) : null}
          <div className="my-1 border-t" />
          <MenuItem
            icon={LogOut}
            label="退出登录"
            danger
            onClick={async () => {
              setOpen(false);
              await signOut();
              navigate('/');
            }}
          />
        </div>
      ) : null}
    </div>
  );
}

function MenuItem({
  icon: Icon,
  label,
  onClick,
  danger,
}: {
  icon: typeof UserIcon;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors hover:bg-[var(--hover-bg)]',
        danger ? 'text-rose-600 dark:text-rose-400' : 'text-[var(--text-secondary)]',
      )}
    >
      <Icon className="size-4" />
      {label}
    </button>
  );
}

function Header({ onOpenSearch }: { onOpenSearch: () => void }) {
  const { theme, toggle } = useTheme();
  const { user } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  return (
    <header className="sticky top-0 z-40 border-b backdrop-blur-xl" style={{ background: 'var(--header-bg)' }}>
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4 sm:px-6">
        <Logo />
        <nav className="ml-4 hidden items-center gap-1 md:flex">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                cn(
                  'rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-300'
                    : 'text-[var(--text-secondary)] hover:bg-[var(--hover-bg)] hover:text-[var(--text-primary)]',
                )
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-1.5">
          <button
            type="button"
            onClick={onOpenSearch}
            className="hidden items-center gap-2 rounded-xl border px-3 py-2 text-sm text-[var(--text-muted)] transition-colors hover:bg-[var(--hover-bg)] sm:flex"
          >
            <Search className="size-4" />
            <span>搜索工具</span>
            <Kbd>⌘K</Kbd>
          </button>
          <button
            type="button"
            onClick={onOpenSearch}
            className="btn-ghost size-9 rounded-xl p-0 sm:hidden"
            aria-label="搜索"
          >
            <Search className="size-4" />
          </button>
          <button
            type="button"
            onClick={toggle}
            className="btn-ghost size-9 rounded-xl p-0"
            aria-label={theme === 'dark' ? '切换到浅色模式' : '切换到深色模式'}
            title={theme === 'dark' ? '浅色模式' : '深色模式'}
          >
            {theme === 'dark' ? <Sun className="size-4" /> : <Moon className="size-4" />}
          </button>
          <div className="hidden sm:block">
            <UserMenu />
          </div>
          <button
            type="button"
            className="btn-ghost size-9 rounded-xl p-0 md:hidden"
            onClick={() => setMobileOpen((value) => !value)}
            aria-label="菜单"
            aria-expanded={mobileOpen}
          >
            {mobileOpen ? <X className="size-4" /> : <Menu className="size-4" />}
          </button>
        </div>
      </div>

      {mobileOpen ? (
        <div className="border-t bg-[var(--card-bg)] px-4 py-3 md:hidden">
          <nav className="flex flex-col">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  cn(
                    'rounded-lg px-3 py-2.5 text-sm font-medium',
                    isActive ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-300' : 'muted',
                  )
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
          <div className="mt-2 flex items-center gap-2 border-t pt-3">
            {user ? (
              <>
                <Link to="/dashboard" className="btn-secondary flex-1">
                  个人中心
                </Link>
                {user.role >= 1 ? (
                  <Link to="/admin" className="btn-primary flex-1">
                    管理后台
                  </Link>
                ) : null}
              </>
            ) : (
              <>
                <Link to="/login" className="btn-secondary flex-1">
                  登录
                </Link>
                <Link to="/register" className="btn-primary flex-1">
                  注册
                </Link>
              </>
            )}
          </div>
        </div>
      ) : null}
    </header>
  );
}

function Footer() {
  return (
    <footer className="mt-20 border-t bg-[var(--card-bg)]">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div>
          <Logo />
          <p className="mt-4 max-w-xs text-sm leading-relaxed subtle">
            一站式在线工具箱：计算、转换、文本、图像与开发者工具，全部在浏览器本地完成处理。
          </p>
        </div>
        <FooterColumn
          title="工具"
          links={[
            { to: '/tools', label: '全部工具' },
            { to: '/tools?category=development', label: '开发工具' },
            { to: '/tools?category=photo', label: '图像处理' },
            { to: '/tools?category=text', label: '文本处理' },
          ]}
        />
        <FooterColumn
          title="社区"
          links={[
            { to: '/blog', label: '博客' },
            { to: '/forum', label: '论坛' },
            { to: '/assistant', label: 'AI 助手' },
            { to: '/submit/blog', label: '投稿文章' },
          ]}
        />
        <FooterColumn
          title="支持"
          links={[
            { to: '/feedback', label: '意见反馈' },
            { to: '/submit/tool', label: '推荐工具' },
            { to: '/dashboard', label: '个人中心' },
            { to: '/about', label: '关于本站' },
          ]}
        />
      </div>
      <div className="border-t">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-2 px-4 py-5 text-xs subtle sm:flex-row sm:px-6">
          <p>© {new Date().getFullYear()} Lith Tools · 多功能在线工具箱</p>
          <p>Node.js · React · TypeScript · SQLite</p>
        </div>
      </div>
    </footer>
  );
}

function FooterColumn({ title, links }: { title: string; links: { to: string; label: string }[] }) {
  return (
    <div>
      <p className="text-xs font-semibold tracking-[0.12em] text-[var(--text-primary)] uppercase">{title}</p>
      <ul className="mt-3 space-y-2 text-sm">
        {links.map((link) => (
          <li key={`${link.to}-${link.label}`}>
            <Link to={link.to} className="subtle transition-colors hover:text-[var(--text-primary)]">
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  }, [pathname]);
  return null;
}

export function Layout() {
  const [searchOpen, setSearchOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setSearchOpen((value) => !value);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="flex min-h-dvh flex-col">
      <ScrollToTop />
      <Header onOpenSearch={() => setSearchOpen(true)} />
      <main className="flex-1">
        <ErrorBoundary key={location.pathname} label="页面渲染出错">
          <Suspense fallback={<PageLoader />}>
            <Outlet />
          </Suspense>
        </ErrorBoundary>
      </main>
      <Footer />
      <SearchPalette open={searchOpen} onClose={() => setSearchOpen(false)} />
    </div>
  );
}
