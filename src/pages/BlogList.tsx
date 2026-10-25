import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  AlertTriangle,
  Eye,
  FileText,
  Heart,
  Lock,
  MessageSquare,
  PenLine,
  RotateCw,
  Search,
  Send,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import type { BlogListItem, CategoryDTO, Paginated } from '@shared/types';
import { http } from '../lib/api';
import { useApi, useDocumentTitle } from '../lib/hooks';
import { useAuth } from '../lib/auth';
import { cn, formatDate, formatNumber, relativeTime } from '../lib/utils';
import { Avatar, Badge, Button, EmptyState, Input, PageHeader, Pagination, Skeleton } from '../components/ui';

const PAGE_SIZE = 9;
const SEARCH_DEBOUNCE = 400;

type SortKey = 'latest' | 'views';

export default function BlogList() {
  useDocumentTitle('博客');
  const [params, setParams] = useSearchParams();
  const { user } = useAuth();
  const navigate = useNavigate();

  const query = params.get('q') ?? '';
  const sort: SortKey = params.get('sort') === 'views' ? 'views' : 'latest';
  const rawCategory = params.get('category') ?? '';
  const categoryId = /^\d+$/.test(rawCategory) ? Number(rawCategory) : null;
  const page = Math.max(1, Number.parseInt(params.get('page') ?? '1', 10) || 1);

  const categories = useApi(() => http.get<{ items: CategoryDTO[] }>('/api/blog/categories'), []);

  const posts = useApi<Paginated<BlogListItem>>(() => {
    const search = new URLSearchParams();
    search.set('page', String(page));
    search.set('pageSize', String(PAGE_SIZE));
    if (query.trim()) search.set('q', query.trim());
    if (categoryId) search.set('categoryId', String(categoryId));
    if (sort === 'views') search.set('sort', 'views');
    return http.get<Paginated<BlogListItem>>(`/api/blog/posts?${search.toString()}`);
  }, [page, query, categoryId, sort]);

  const patchParams = useCallback(
    (patch: Record<string, string | null>) => {
      setParams(
        (previous) => {
          const merged = new URLSearchParams(previous);
          for (const [key, value] of Object.entries(patch)) {
            if (value === null || value === '') merged.delete(key);
            else merged.set(key, value);
          }
          return merged;
        },
        { replace: true },
      );
    },
    [setParams],
  );

  /* ------------------------------------------------ search box (debounced → URL) */
  const [searchInput, setSearchInput] = useState(query);
  const timerRef = useRef<number | null>(null);
  const pushedRef = useRef<string | null>(null);

  // Keep the input in sync when the URL changes from elsewhere (back / forward / clear link).
  useEffect(() => {
    const next = params.get('q') ?? '';
    if (pushedRef.current === next) return;
    setSearchInput(next);
  }, [params]);

  useEffect(
    () => () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    },
    [],
  );

  const commitSearch = useCallback(
    (value: string) => {
      pushedRef.current = value;
      patchParams({ q: value, page: null });
    },
    [patchParams],
  );

  const changeSearch = (value: string) => {
    setSearchInput(value);
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      commitSearch(value.trim());
    }, SEARCH_DEBOUNCE);
  };

  const clearSearch = () => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setSearchInput('');
    commitSearch('');
  };

  const changeFilter = (patch: Record<string, string | null>) => patchParams({ ...patch, page: null });

  const goPage = (next: number) => {
    patchParams({ page: next <= 1 ? null : String(next) });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Guard against stale page numbers (e.g. a filter shrank the result set).
  useEffect(() => {
    const totalPages = posts.data?.totalPages;
    if (!totalPages || page <= totalPages) return;
    patchParams({ page: totalPages <= 1 ? null : String(totalPages) });
  }, [posts.data, page, patchParams]);

  const canPublish = Boolean(user && user.role >= 1);
  const startWriting = () =>
    navigate(!user ? '/login?next=/submit/blog' : canPublish ? '/blog/new' : '/submit/blog');

  const items = posts.data?.items ?? [];
  const total = posts.data?.total ?? 0;
  const showSkeleton = posts.loading && items.length === 0;
  const hasFilter = query.trim() !== '' || categoryId !== null || sort !== 'latest';

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
      <PageHeader
        eyebrow="博客"
        title="技术分享与实践笔记"
        description="来自社区的工具玩法、开发笔记与经验总结。文章支持 Markdown、公式与代码块，登录后即可点赞与评论。"
        actions={
          <>
            <Link to="/submit/blog" className="btn-secondary btn-sm">
              <Send className="size-3.5" /> 投稿文章
            </Link>
            {canPublish ? (
              <Button size="sm" icon={PenLine} onClick={startWriting}>
                写文章
              </Button>
            ) : null}
          </>
        }
      />

      {/* ------------------------------------------------------------- filters */}
      <div className="mt-7 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="scrollbar-none flex items-center gap-1.5 overflow-x-auto pb-1">
          <span className="flex shrink-0 items-center gap-1.5 pr-1 text-xs subtle">
            <SlidersHorizontal className="size-3.5" /> 分类
          </span>
          <button
            type="button"
            onClick={() => changeFilter({ category: null })}
            className={cn('chip shrink-0', categoryId === null && 'chip-active')}
          >
            全部
          </button>
          {(categories.data?.items ?? []).map((category) => (
            <button
              key={category.id}
              type="button"
              onClick={() => changeFilter({ category: String(category.id) })}
              className={cn('chip shrink-0', categoryId === category.id && 'chip-active')}
            >
              {category.name}
              {typeof category.blogCount === 'number' ? (
                <span
                  className={cn(
                    'rounded-full px-1 text-[10px]',
                    categoryId === category.id ? 'bg-white/20' : 'bg-black/5 dark:bg-white/10',
                  )}
                >
                  {category.blogCount}
                </span>
              ) : null}
            </button>
          ))}
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <form
            className="relative"
            onSubmit={(event) => {
              event.preventDefault();
              if (timerRef.current !== null) {
                window.clearTimeout(timerRef.current);
                timerRef.current = null;
              }
              commitSearch(searchInput.trim());
            }}
          >
            <Search className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-slate-400" />
            <Input
              value={searchInput}
              onChange={(event) => changeSearch(event.target.value)}
              placeholder="搜索标题或正文…"
              className="h-9 pl-8.5 text-xs sm:w-56"
              aria-label="搜索文章"
            />
            {searchInput ? (
              <button
                type="button"
                onClick={clearSearch}
                className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-0.5 text-slate-400 hover:text-slate-600"
                aria-label="清除搜索"
              >
                <X className="size-3.5" />
              </button>
            ) : null}
          </form>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => changeFilter({ sort: null })}
              className={cn('chip shrink-0', sort === 'latest' && 'chip-active')}
            >
              最新
            </button>
            <button
              type="button"
              onClick={() => changeFilter({ sort: 'views' })}
              className={cn('chip shrink-0', sort === 'views' && 'chip-active')}
            >
              最多阅读
            </button>
          </div>
        </div>
      </div>

      <div className="mt-5 mb-4 flex items-center justify-between text-sm">
        <p className="subtle">
          {posts.loading && !posts.data ? (
            '正在加载文章…'
          ) : (
            <>
              共 <span className="font-medium text-[var(--text-primary)]">{formatNumber(total)}</span> 篇文章
              {total > 0 ? ` · 第 ${page} / ${posts.data?.totalPages ?? 1} 页` : ''}
            </>
          )}
        </p>
        {hasFilter ? (
          <button
            type="button"
            onClick={() => {
              clearSearch();
              patchParams({ category: null, sort: null, page: null });
            }}
            className="text-xs text-indigo-600 hover:underline dark:text-indigo-400"
          >
            清除筛选
          </button>
        ) : null}
      </div>

      {/* --------------------------------------------------------------- list */}
      {posts.error ? (
        <EmptyState
          icon={AlertTriangle}
          title="文章列表加载失败"
          description={posts.error}
          action={
            <Button variant="secondary" icon={RotateCw} onClick={posts.reload}>
              重新加载
            </Button>
          }
        />
      ) : showSkeleton ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: PAGE_SIZE }).map((_, index) => (
            <div key={index} className="card space-y-3 p-5">
              <Skeleton className="h-5 w-20" />
              <Skeleton className="h-6 w-4/5" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-2/3" />
              <div className="flex items-center gap-2 pt-2">
                <Skeleton className="size-7 rounded-full" />
                <Skeleton className="h-3 w-24" />
              </div>
            </div>
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={FileText}
          title={hasFilter ? '没有找到匹配的文章' : '还没有公开文章'}
          description={
            hasFilter ? '换个关键词或者切换分类试试。' : '成为第一个分享的人，把你的经验写下来吧。'
          }
          action={
            hasFilter ? (
              <Button
                variant="secondary"
                onClick={() => {
                  clearSearch();
                  patchParams({ category: null, sort: null, page: null });
                }}
              >
                清除筛选
              </Button>
            ) : (
              <Button icon={PenLine} onClick={startWriting}>
                写第一篇文章
              </Button>
            )
          }
        />
      ) : (
        <>
          <div className={cn('grid gap-4 sm:grid-cols-2 lg:grid-cols-3', posts.loading && 'opacity-60')}>
            {items.map((post) => (
              <BlogCard key={post.id} post={post} />
            ))}
          </div>
          <Pagination className="mt-8" page={page} totalPages={posts.data?.totalPages ?? 1} onChange={goPage} />
        </>
      )}
    </div>
  );
}

function BlogCard({ post }: { post: BlogListItem }) {
  return (
    <Link
      to={`/blog/${post.id}`}
      className="group card flex flex-col p-5 transition-all duration-200 hover:-translate-y-0.5 hover:border-indigo-200 hover:shadow-md dark:hover:border-indigo-500/30"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {post.category ? <Badge tone="brand">{post.category.name}</Badge> : <Badge>未分类</Badge>}
          {!post.isPublic ? (
            <Badge tone="warning">
              <Lock className="size-3" /> 私有
            </Badge>
          ) : null}
        </div>
        <time dateTime={post.createdAt} title={formatDate(post.createdAt, 'datetime')} className="shrink-0 text-[11px] subtle">
          {relativeTime(post.createdAt)}
        </time>
      </div>

      <h2 className="mt-3 line-clamp-2 text-base leading-snug font-semibold tracking-tight transition-colors group-hover:text-indigo-600 dark:group-hover:text-indigo-400">
        {post.title}
      </h2>
      <p className="mt-2 line-clamp-3 flex-1 text-sm leading-relaxed muted">{post.summary || '暂无摘要'}</p>

      <div className="mt-4 flex items-center justify-between gap-3 border-t pt-3">
        <div className="flex min-w-0 items-center gap-2">
          <Avatar name={post.author.username} size="sm" />
          <span className="truncate text-xs font-medium">{post.author.username}</span>
        </div>
        <div className="flex shrink-0 items-center gap-3 text-xs subtle">
          <span className="flex items-center gap-1" title="阅读数">
            <Eye className="size-3.5" />
            {formatNumber(post.views)}
          </span>
          <span className="flex items-center gap-1" title="点赞数">
            <Heart className="size-3.5" />
            {formatNumber(post.likes)}
          </span>
          <span className="flex items-center gap-1" title="评论数">
            <MessageSquare className="size-3.5" />
            {formatNumber(post.comments)}
          </span>
        </div>
      </div>
    </Link>
  );
}
