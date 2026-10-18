import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  MessageSquare,
  Search,
  Send,
  Sparkles,
  TrendingUp,
  Wrench,
} from 'lucide-react';
import { toolCatalog } from '@shared/catalog';
import type { BlogListItem, PublicStats, ThreadListItem } from '@shared/types';
import { useCatalog } from '../lib/tools';
import { http } from '../lib/api';
import { useApi } from '../lib/hooks';
import { formatNumber, relativeTime } from '../lib/utils';
import { Badge, Card, Skeleton } from '../components/ui';
import { ToolCard } from '../components/ToolCard';
import { toolIcon } from '../icons';

const featuredSlugs = toolCatalog.filter((tool) => tool.featured).map((tool) => tool.slug);

export default function Home() {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const { tools, categories, loading } = useCatalog();
  const stats = useApi(() => http.get<PublicStats>('/api/stats/public'), []);
  const blogs = useApi(() => http.get<{ items: BlogListItem[] }>('/api/blog/recent?limit=3'), []);
  const threads = useApi(() => http.get<{ items: ThreadListItem[] }>('/api/forum/recent?limit=5'), []);

  const featured = useMemo(() => {
    const bySlug = new Map(tools.map((tool) => [tool.slug, tool]));
    return featuredSlugs.map((slug) => bySlug.get(slug)).filter((tool): tool is NonNullable<typeof tool> => Boolean(tool)).slice(0, 8);
  }, [tools]);

  const grouped = useMemo(() => {
    const map = new Map<string, typeof tools>();
    for (const tool of tools) {
      const key = tool.category?.slug ?? 'other';
      const list = map.get(key) ?? [];
      list.push(tool);
      map.set(key, list);
    }
    return map;
  }, [tools]);

  const submitSearch = (event: React.FormEvent) => {
    event.preventDefault();
    navigate(query.trim() ? `/tools?q=${encodeURIComponent(query.trim())}` : '/tools');
  };

  return (
    <>
      {/* ------------------------------------------------------------- hero */}
      <section className="relative overflow-hidden border-b">
        <div className="hero-glow absolute inset-0" aria-hidden="true" />
        <div className="grid-pattern absolute inset-0" aria-hidden="true" />
        <div className="relative mx-auto max-w-6xl px-4 pt-16 pb-14 text-center sm:px-6 sm:pt-24 sm:pb-20">
          <Badge tone="brand" className="mx-auto">
            <Sparkles className="size-3.5" />
            {stats.data ? `${formatNumber(stats.data.tools)} 个在线工具 · 全部本地处理` : '多功能在线工具箱'}
          </Badge>
          <h1 className="mx-auto mt-6 max-w-3xl text-3xl leading-[1.18] font-semibold tracking-tight text-balance sm:text-5xl lg:text-[3.4rem]">
            把常用工具，
            <span className="inline-block bg-gradient-to-r from-indigo-600 via-violet-600 to-sky-500 bg-clip-text text-transparent dark:from-indigo-400 dark:via-violet-400 dark:to-sky-300">
              放在同一个地方
            </span>
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-balance muted sm:text-lg">
            计算器、单位换算、文本与图像处理、开发者工具……无需安装、无需上传，打开即用。
          </p>

          <form onSubmit={submitSearch} className="mx-auto mt-8 max-w-xl">
            <div className="flex items-center gap-2 rounded-2xl border bg-[var(--card-bg)] p-2 shadow-lg shadow-indigo-500/5 transition-shadow focus-within:shadow-indigo-500/15">
              <Search className="ml-2 size-5 shrink-0 text-slate-400" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="搜索工具，例如 JSON 格式化、二维码、BMI…"
                className="h-10 flex-1 bg-transparent text-sm outline-none placeholder:text-slate-400 sm:text-base"
                aria-label="搜索工具"
              />
              <button type="submit" className="btn-primary shrink-0">
                <span className="hidden sm:inline">搜索</span>
                <ArrowRight className="size-4 sm:hidden" />
              </button>
            </div>
          </form>

          <div className="mt-4 flex flex-wrap items-center justify-center gap-2 text-xs">
            <span className="subtle">热门：</span>
            {['json-formatter', 'image-compress', 'qr-code', 'world-clock', 'gpa-calculator'].map((slug) => {
              const tool = tools.find((item) => item.slug === slug);
              if (!tool) return null;
              return (
                <Link key={slug} to={`/tools/${slug}`} className="chip">
                  {tool.name}
                </Link>
              );
            })}
          </div>

          <div className="mx-auto mt-10 grid max-w-3xl grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: '在线工具', value: stats.data?.tools ?? 70 },
              { label: '工具分类', value: stats.data?.categories ?? 13 },
              { label: '社区文章', value: stats.data?.blogs ?? 0 },
              { label: '论坛主题', value: stats.data?.threads ?? 0 },
            ].map((item) => (
              <div key={item.label} className="rounded-xl border bg-[var(--card-bg)]/80 px-3 py-3 backdrop-blur">
                <p className="text-xl font-semibold tracking-tight">{formatNumber(item.value)}</p>
                <p className="mt-0.5 text-xs subtle">{item.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-6xl space-y-16 px-4 py-14 sm:px-6">
        {/* --------------------------------------------------------- featured */}
        <section>
          <SectionHeader
            icon={TrendingUp}
            title="热门工具"
            description="大家最常打开的高频工具，覆盖计算、开发与图像处理。"
            to="/tools"
          />
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {loading
              ? Array.from({ length: 8 }).map((_, index) => <Skeleton key={index} className="h-36" />)
              : featured.map((tool) => <ToolCard key={tool.id} tool={tool} />)}
          </div>
        </section>

        {/* ------------------------------------------------------- categories */}
        <section>
          <SectionHeader
            icon={Wrench}
            title="按分类浏览"
            description="13 个分类覆盖日常与专业场景，找到你需要的工具。"
            to="/tools"
            linkLabel="全部工具"
          />
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {categories.map((category) => {
              const Icon = toolIcon(category.icon);
              const list = (grouped.get(category.slug) ?? []).slice(0, 3);
              return (
                <Card key={category.id} className="group p-5 transition-colors hover:border-indigo-200 dark:hover:border-indigo-500/30">
                  <div className="flex items-start gap-3">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-300">
                      <Icon className="size-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <Link to={`/tools?category=${category.slug}`} className="font-medium hover:text-indigo-600 dark:hover:text-indigo-400">
                          {category.name}
                        </Link>
                        <span className="text-xs subtle">{category.toolCount ?? 0} 个</span>
                      </div>
                      <p className="mt-1 text-xs leading-relaxed subtle">{category.description}</p>
                    </div>
                  </div>
                  <ul className="mt-4 space-y-1.5 border-t pt-3">
                    {list.map((tool) => (
                      <li key={tool.id}>
                        <Link
                          to={`/tools/${tool.slug}`}
                          className="flex items-center justify-between gap-2 rounded-md px-1.5 py-1 text-sm text-[var(--text-secondary)] transition-colors hover:bg-[var(--hover-bg)] hover:text-[var(--text-primary)]"
                        >
                          <span className="truncate">{tool.name}</span>
                          <ArrowUpRight className="size-3.5 shrink-0 opacity-0 transition-opacity group-hover:opacity-60" />
                        </Link>
                      </li>
                    ))}
                  </ul>
                </Card>
              );
            })}
          </div>
        </section>

        {/* ------------------------------------------------------ blog + forum */}
        <section className="grid gap-8 lg:grid-cols-[1.35fr_1fr]">
          <div>
            <SectionHeader icon={BookOpen} title="最新博客" description="来自社区的技术分享与使用技巧。" to="/blog" />
            <div className="mt-5 space-y-3">
              {blogs.loading ? (
                Array.from({ length: 3 }).map((_, index) => <Skeleton key={index} className="h-28" />)
              ) : (blogs.data?.items.length ?? 0) === 0 ? (
                <Card className="p-6 text-sm subtle">还没有公开文章，来写第一篇吧。</Card>
              ) : (
                blogs.data?.items.map((blog) => (
                  <Link key={blog.id} to={`/blog/${blog.id}`} className="card group block p-5 transition-colors hover:border-indigo-200 dark:hover:border-indigo-500/30">
                    <div className="flex items-center gap-2 text-xs subtle">
                      <span>{blog.author.username}</span>
                      {blog.category ? <span>· {blog.category.name}</span> : null}
                      <span>· {relativeTime(blog.createdAt)}</span>
                      <span className="ml-auto flex items-center gap-3">
                        <span>{formatNumber(blog.views)} 阅读</span>
                        <span>{blog.likes} 赞</span>
                      </span>
                    </div>
                    <h3 className="mt-2 font-medium tracking-tight transition-colors group-hover:text-indigo-600 dark:group-hover:text-indigo-400">
                      {blog.title}
                    </h3>
                    <p className="mt-1.5 line-clamp-2 text-sm leading-relaxed muted">{blog.summary}</p>
                  </Link>
                ))
              )}
              <div className="flex gap-2">
                <Link to="/blog" className="btn-secondary btn-sm">
                  浏览全部文章 <ArrowRight className="size-3.5" />
                </Link>
                <Link to="/submit/blog" className="btn-ghost btn-sm">
                  投稿文章
                </Link>
              </div>
            </div>
          </div>

          <div>
            <SectionHeader icon={MessageSquare} title="论坛动态" description="提问、讨论与建议。" to="/forum" linkLabel="进入论坛" />
            <Card className="mt-5 divide-y">
              {threads.loading ? (
                <div className="space-y-3 p-4">
                  {Array.from({ length: 4 }).map((_, index) => (
                    <Skeleton key={index} className="h-10" />
                  ))}
                </div>
              ) : (threads.data?.items.length ?? 0) === 0 ? (
                <p className="p-5 text-sm subtle">论坛还很安静，欢迎发起第一个话题。</p>
              ) : (
                threads.data?.items.map((thread) => (
                  <Link key={thread.id} to={`/forum/thread/${thread.id}`} className="block px-4 py-3 transition-colors hover:bg-[var(--hover-bg)]">
                    <p className="line-clamp-1 text-sm font-medium">{thread.title}</p>
                    <p className="mt-1 flex items-center gap-2 text-xs subtle">
                      <span>{thread.forumName}</span>
                      <span>· {thread.author.username}</span>
                      <span className="ml-auto">{thread.replyCount} 回复 · {relativeTime(thread.lastReplyAt ?? thread.createdAt)}</span>
                    </p>
                  </Link>
                ))
              )}
            </Card>
          </div>
        </section>

        {/* ---------------------------------------------------------------- CTA */}
        <section className="overflow-hidden rounded-3xl border bg-gradient-to-br from-indigo-600 to-violet-700 p-8 text-white sm:p-10">
          <div className="flex flex-wrap items-center justify-between gap-6">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight">有好用的工具或文章？</h2>
              <p className="mt-2 max-w-xl text-sm leading-relaxed text-indigo-100">
                推荐一个工具、投稿一篇教程，或者告诉我们哪里可以做得更好。每一条反馈都会被认真查看。
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link to="/submit/tool" className="btn bg-white text-indigo-700 hover:bg-indigo-50">
                <Send className="size-4" /> 推荐工具
              </Link>
              <Link to="/submit/blog" className="btn border border-white/30 bg-white/10 text-white hover:bg-white/20">
                <BookOpen className="size-4" /> 投稿文章
              </Link>
              <Link to="/feedback" className="btn border border-white/30 bg-white/10 text-white hover:bg-white/20">
                <MessageSquare className="size-4" /> 意见反馈
              </Link>
            </div>
          </div>
        </section>
      </div>
    </>
  );
}

function SectionHeader({
  icon: Icon,
  title,
  description,
  to,
  linkLabel = '查看全部',
}: {
  icon: typeof Wrench;
  title: string;
  description?: string;
  to?: string;
  linkLabel?: string;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 className="flex items-center gap-2 text-lg font-semibold tracking-tight">
          <span className="flex size-7 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-300">
            <Icon className="size-4" />
          </span>
          {title}
        </h2>
        {description ? <p className="mt-1.5 text-sm subtle">{description}</p> : null}
      </div>
      {to ? (
        <Link to={to} className="flex items-center gap-1 text-sm font-medium text-indigo-600 hover:underline dark:text-indigo-400">
          {linkLabel} <ArrowRight className="size-3.5" />
        </Link>
      ) : null}
    </div>
  );
}
