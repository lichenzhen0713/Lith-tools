import { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Bookmark, Check, ExternalLink, Server, Share2, ShieldCheck } from 'lucide-react';
import { toolMap } from '@shared/catalog';
import { useCatalog } from '../lib/tools';
import { getToolComponent, ToolSuspense } from '../tools/registry';
import { useDocumentTitle, useLocalStorage } from '../lib/hooks';
import { Badge, Button, EmptyState, Skeleton } from '../components/ui';
import { toolIcon } from '../icons';
import { cn, copyText } from '../lib/utils';
import { useToast } from '../lib/toast';
import { ToolCard } from '../components/ToolCard';
import { ErrorBoundary } from '../components/ErrorBoundary';

export default function ToolPage() {
  const { slug = '' } = useParams();
  const { tools, categories, loading } = useCatalog();
  const [bookmarks, setBookmarks] = useLocalStorage<string[]>('lith:bookmarks', []);
  const toast = useToast();

  const tool = tools.find((item) => item.slug === slug);
  useDocumentTitle(tool?.name ?? '工具');

  const ToolComponent = useMemo(() => getToolComponent(slug), [slug]);
  const category = categories.find((item) => item.slug === tool?.category?.slug);
  const related = useMemo(
    () => tools.filter((item) => item.category?.slug === tool?.category?.slug && item.slug !== slug).slice(0, 4),
    [tools, tool?.category?.slug, slug],
  );
  const bookmarked = bookmarks.includes(slug);

  if (loading) {
    return (
      <div className="mx-auto max-w-5xl space-y-4 px-4 py-10 sm:px-6">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-20" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  if (!tool) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-20 sm:px-6">
        <EmptyState
          icon={ExternalLink}
          title="工具不存在或已被禁用"
          description="该工具可能已被管理员下架，去工具库看看其他工具吧。"
          action={
            <Link to="/tools" className="btn-primary">
              返回工具库
            </Link>
          }
        />
      </div>
    );
  }

  const Icon = toolIcon(tool.icon || category?.icon);

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-10">
      <nav className="flex items-center gap-2 text-xs subtle" aria-label="面包屑">
        <Link to="/" className="hover:text-[var(--text-primary)]">首页</Link>
        <span>/</span>
        <Link to={category ? `/tools?category=${category.slug}` : '/tools'} className="hover:text-[var(--text-primary)]">
          {category?.name ?? '工具库'}
        </Link>
        <span>/</span>
        <span className="text-[var(--text-secondary)]">{tool.name}</span>
      </nav>

      <header className="tool-hero mt-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-4">
            <span className={`icon-tile icon-tile-lg tint-${tool.category?.slug ?? 'others'}`}>
              <Icon className="size-7" />
            </span>
            <div className="min-w-0">
              <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">{tool.name}</h1>
              <p className="mt-1.5 max-w-2xl text-sm leading-relaxed muted">{tool.description}</p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {category ? <Badge tone="brand">{category.name}</Badge> : null}
                {toolMap.get(slug)?.server ? (
                  <Badge tone="warning">
                    <Server className="size-3" /> 经由服务器查询
                  </Badge>
                ) : (
                  <Badge tone="success">
                    <ShieldCheck className="size-3" /> 浏览器本地处理
                  </Badge>
                )}
                <Badge>无需注册</Badge>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              icon={bookmarked ? Check : Bookmark}
              onClick={() => {
                setBookmarks((previous) => (previous.includes(slug) ? previous.filter((item) => item !== slug) : [...previous, slug]));
                toast.success(bookmarked ? '已取消收藏' : '已加入收藏');
              }}
            >
              {bookmarked ? '已收藏' : '收藏'}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              icon={Share2}
              onClick={async () => {
                const ok = await copyText(window.location.href);
                if (ok) toast.success('工具链接已复制');
                else toast.error('复制失败');
              }}
            >
              分享
            </Button>
          </div>
        </div>
      </header>

      <div className="mt-6">
        {tool.isExternal ? (
          <div className="card flex flex-col items-center gap-3 p-10 text-center">
            <p className="text-sm muted">该工具由社区推荐，将在新窗口打开。</p>
            <a href={tool.href} target="_blank" rel="noopener noreferrer" className="btn-primary">
              打开工具 <ExternalLink className="size-4" />
            </a>
          </div>
        ) : ToolComponent ? (
          <ErrorBoundary key={slug} label="工具运行出错">
            <ToolSuspense fallback={<ToolLoading />}>
              <ToolComponent />
            </ToolSuspense>
          </ErrorBoundary>
        ) : (
          <EmptyState
            title="该工具正在迁移中"
            description="新版本尚未包含这个工具的实现，旧版本仍然可以使用。"
            action={
              <Link to="/tools" className="btn-secondary">
                返回工具库
              </Link>
            }
          />
        )}
      </div>

      {related.length > 0 ? (
        <section className="mt-14">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="eyebrow">继续探索</p>
              <h2 className="mt-2 text-xl font-bold tracking-tight">同类工具</h2>
            </div>
            <Link
              to={category ? `/tools?category=${category.slug}` : '/tools'}
              className="text-sm font-semibold text-[var(--brand)] hover:underline"
            >
              查看全部
            </Link>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {related.map((item) => (
              <ToolCard key={item.id} tool={item} compact />
            ))}
          </div>
        </section>
      ) : null}

      <div className="mt-10 flex items-center justify-between border-t pt-5 text-sm">
        <Link to="/tools" className={cn('flex items-center gap-1.5 text-[var(--text-secondary)] hover:text-[var(--text-primary)]')}>
          <ArrowLeft className="size-4" /> 返回工具库
        </Link>
        <Link to="/feedback" className="font-medium text-[var(--brand)] hover:underline">
          这个工具不好用？告诉我们
        </Link>
      </div>
    </div>
  );
}

function ToolLoading() {
  return (
    <div className="card space-y-4 p-6" role="status" aria-label="工具加载中">
      <Skeleton className="h-5 w-40" />
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-36 w-full" />
      <div className="flex gap-2">
        <Skeleton className="h-9 w-24" />
        <Skeleton className="h-9 w-24" />
      </div>
    </div>
  );
}
