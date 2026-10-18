import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Layers,
  MessageSquare,
  Search,
  Sparkles,
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
const popularSlugs = ['json-formatter', 'image-compress', 'qr-code', 'world-clock', 'gpa-calculator'];

export default function Home() {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const { tools, categories, loading } = useCatalog();
  const stats = useApi(() => http.get<PublicStats>('/api/stats/public'), []);
  const blogs = useApi(() => http.get<{ items: BlogListItem[] }>('/api/blog/recent?limit=3'), []);
  const threads = useApi(() => http.get<{ items: ThreadListItem[] }>('/api/forum/recent?limit=5'), []);

  const featured = useMemo(() => {
    const bySlug = new Map(tools.map((tool) => [tool.slug, tool]));
    return featuredSlugs
      .map((slug) => bySlug.get(slug))
      .filter((tool): tool is NonNullable<typeof tool> => Boolean(tool))
      .slice(0, 8);
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

  const popular = useMemo(
    () =>
      popularSlugs
        .map((slug) => tools.find((tool) => tool.slug === slug))
        .filter((tool): tool is NonNullable<typeof tool> => Boolean(tool)),
    [tools],
  );

  const submitSearch = (event: React.FormEvent) => {
    event.preventDefault();
    navigate(query.trim() ? `/tools?q=${encodeURIComponent(query.trim())}` : '/tools');
  };

  const statItems = [
    { label: '在线工具', value: stats.data?.tools ?? 70 },
    { label: '工具分类', value: stats.data?.categories ?? 13 },
    { label: '社区文章', value: stats.data?.blogs ?? 0 },
    { label: '论坛主题', value: stats.data?.threads ?? 0 },
  ];

  return (
    <>
      {/* ------------------------------------------------------------- hero */}
      <section className="relative overflow-hidden">
        <div className="hero-glow absolute inset-0" aria-hidden="true" />
        <div className="grid-pattern absolute inset-0" aria-hidden="true" />
        <div className="relative mx-auto max-w-6xl px-4 pt-16 pb-14 text-center sm:px-6 sm:pt-24 sm:pb-16">
          <span className="inline-flex items-center gap-2 rounded-full border border-[var(--card-border)] bg-[var(--card-bg)] px-3.5 py-1.5 text-xs text-[var(--text-secondary)] shadow-[var(--shadow-soft)]">
            <span className="size-1.5 rounded-full bg-gradient-to-r from-indigo-500 to-cyan-400 shadow-[0_0_0_4px_rgba(99,102,241,0.14)]" />
            v2.0
            <span className="text-[var(--border-strong)]">·</span>
            70 个工具
            <span className="text-[var(--border-strong)]">·</span>
            MIT License
            <span className="text-[var(--border-strong)]">·</span>
            本地处理
          </span>

          <h1 className="hero-title">
            把常用工具，
            <br />
            <span className="grad">放进一个工具箱</span>
          </h1>
          <p className="lede">
            计算、转换、文本、图像与开发者工具。无需安装，打开即用；图片与文件只在你的浏览器里处理，从不上传服务器。
          </p>

          <div className="hero-search">
            <div className="hero-search-bar">
              <span className="dot-row" aria-hidden="true">
                <i />
                <i />
                <i />
              </span>
              <span className="font-semibold text-[var(--text-secondary)]">工具搜索</span>
              <span className="ml-auto hidden text-[11.5px] sm:inline">70 个工具 · 全部本地处理</span>
            </div>
            <form onSubmit={submitSearch} className="hero-search-body">
              <Search className="size-5 shrink-0 text-[var(--text-muted)]" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="搜索工具，例如 JSON、二维码…"
                aria-label="搜索工具"
              />
              <button type="submit" className="btn-primary shrink-0">
                <span className="hidden sm:inline">搜索</span>
                <ArrowRight className="size-4 sm:hidden" />
              </button>
            </form>
            <div className="hero-search-foot">
              <span className="mr-1">热门</span>
              {popular.map((tool) => (
                <Link key={tool.id} to={`/tools/${tool.slug}`} className="chip">
                  {tool.name}
                </Link>
              ))}
            </div>
          </div>

          <div className="cta-row">
            <Link to="/tools" className="btn-primary">
              浏览全部工具 <ArrowRight className="size-4" />
            </Link>
            <a href="#categories" className="btn-secondary">
              <Layers className="size-4" /> 按分类浏览
            </a>
            <Link to="/blog" className="btn-ghost">
              <BookOpen className="size-4" /> 阅读博客
            </Link>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------- stats */}
      <section className="stats-band" aria-label="站点数据">
        <div className="mx-auto grid max-w-6xl grid-cols-2 gap-6 px-4 text-center sm:grid-cols-4 sm:px-6">
          {statItems.map((item) => (
            <div key={item.label}>
              <span className="stat-number">{formatNumber(item.value)}</span>
              <span className="mt-1 block text-xs text-[var(--text-muted)]">{item.label}</span>
            </div>
          ))}
        </div>
      </section>

      {/* ---------------------------------------------------------- featured */}
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <section className="section-block" id="featured">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="section-head mb-0">
              <p className="eyebrow">热门推荐</p>
              <h2 className="section-title">最常用的工具，一步直达</h2>
              <p className="section-sub">覆盖计算、开发、图像与文本处理，打开即用。</p>
            </div>
            <Link to="/tools" className="flex items-center gap-1 text-sm font-semibold text-[var(--brand)] hover:underline">
              全部工具 <ArrowRight className="size-3.5" />
            </Link>
          </div>
          <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {loading
              ? Array.from({ length: 8 }).map((_, index) => <Skeleton key={index} className="h-40" />)
              : featured.map((tool) => <ToolCard key={tool.id} tool={tool} />)}
          </div>
        </section>
      </div>

      {/* -------------------------------------------------------- categories */}
      <section className="section-alt" id="categories">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <div className="section-head">
            <p className="eyebrow">分类浏览</p>
            <h2 className="section-title">13 个分类，覆盖日常与专业场景</h2>
            <p className="section-sub">从标准计算器到图像处理，从 JSON 到二维码，按分类快速找到需要的工具。</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {categories.map((category) => {
              const Icon = toolIcon(category.icon);
              const list = (grouped.get(category.slug) ?? []).slice(0, 3);
              return (
                <Card
                  key={category.id}
                  className="group p-5 transition-all duration-200 hover:-translate-y-0.5 hover:border-[var(--border-strong)] hover:shadow-md"
                >
                  <div className="flex items-start gap-3">
                    <span className={`icon-tile tint-${category.slug}`}>
                      <Icon className="size-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <Link
                          to={`/tools?category=${category.slug}`}
                          className="font-semibold tracking-tight transition-colors hover:text-[var(--brand)]"
                        >
                          {category.name}
                        </Link>
                        <span className="text-xs text-[var(--text-muted)]">{category.toolCount ?? 0} 个</span>
                      </div>
                      <p className="mt-1 text-xs leading-relaxed text-[var(--text-muted)]">{category.description}</p>
                    </div>
                  </div>
                  <ul className="mt-4 space-y-1.5 border-t pt-3">
                    {list.map((tool) => (
                      <li key={tool.id}>
                        <Link
                          to={`/tools/${tool.slug}`}
                          className="flex items-center justify-between gap-2 rounded-md px-1.5 py-1 text-[13px] text-[var(--text-secondary)] transition-colors hover:bg-[var(--hover-bg)] hover:text-[var(--text-primary)]"
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
            <Link
              to="/tools"
              className="group flex flex-col justify-center gap-3 rounded-2xl border border-dashed border-[var(--border-strong)] bg-[var(--card-bg)]/60 p-5 transition-all duration-200 hover:-translate-y-0.5 hover:border-[var(--brand)] hover:bg-[var(--card-bg)]"
            >
              <span className="icon-tile tint-others">
                <Layers className="size-5" />
              </span>
              <div>
                <p className="font-semibold tracking-tight">全部 70 个工具</p>
                <p className="mt-1 text-xs leading-relaxed text-[var(--text-muted)]">按关键词搜索、按分类筛选，找到你要的那一个。</p>
              </div>
              <span className="flex items-center gap-1 text-xs font-semibold text-[var(--brand)]">
                进入工具库 <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
              </span>
            </Link>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------- blog + forum */}
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <section className="section-block grid gap-10 lg:grid-cols-[1.35fr_1fr]">
          <div>
            <div className="flex items-end justify-between gap-3">
              <div>
                <p className="eyebrow">社区</p>
                <h2 className="mt-3 text-2xl font-bold tracking-tight sm:text-3xl">最新文章</h2>
              </div>
              <Link to="/blog" className="text-sm font-semibold text-[var(--brand)] hover:underline">
                全部文章
              </Link>
            </div>
            <div className="mt-6 space-y-3">
              {blogs.loading ? (
                Array.from({ length: 3 }).map((_, index) => <Skeleton key={index} className="h-32" />)
              ) : (blogs.data?.items.length ?? 0) === 0 ? (
                <Card className="p-6 text-sm subtle">还没有公开文章，来写第一篇吧。</Card>
              ) : (
                blogs.data?.items.map((blog) => (
                  <Link
                    key={blog.id}
                    to={`/blog/${blog.id}`}
                    className="card group block p-5 transition-all duration-200 hover:-translate-y-0.5 hover:border-[var(--border-strong)] hover:shadow-md"
                  >
                    <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--text-muted)]">
                      <span>{blog.author.username}</span>
                      {blog.category ? (
                        <Badge tone="brand" className="px-2 py-0.5">
                          {blog.category.name}
                        </Badge>
                      ) : null}
                      <span>· {relativeTime(blog.createdAt)}</span>
                      <span className="ml-auto">
                        {formatNumber(blog.views)} 阅读 · {blog.likes} 赞
                      </span>
                    </div>
                    <h3 className="mt-2.5 font-semibold tracking-tight transition-colors group-hover:text-[var(--brand)]">
                      {blog.title}
                    </h3>
                    <p className="mt-1.5 line-clamp-2 text-sm leading-relaxed text-[var(--text-muted)]">{blog.summary}</p>
                  </Link>
                ))
              )}
              <div className="flex gap-2 pt-1">
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
            <div className="flex items-end justify-between gap-3">
              <div>
                <p className="eyebrow">讨论</p>
                <h2 className="mt-3 text-2xl font-bold tracking-tight sm:text-3xl">论坛动态</h2>
              </div>
              <Link to="/forum" className="text-sm font-semibold text-[var(--brand)] hover:underline">
                进入论坛
              </Link>
            </div>
            <Card className="mt-6 divide-y overflow-hidden">
              {threads.loading ? (
                <div className="space-y-3 p-4">
                  {Array.from({ length: 4 }).map((_, index) => (
                    <Skeleton key={index} className="h-12" />
                  ))}
                </div>
              ) : (threads.data?.items.length ?? 0) === 0 ? (
                <p className="p-5 text-sm subtle">论坛还很安静，欢迎发起第一个话题。</p>
              ) : (
                threads.data?.items.map((thread) => (
                  <Link
                    key={thread.id}
                    to={`/forum/thread/${thread.id}`}
                    className="block px-4 py-3.5 transition-colors hover:bg-[var(--hover-bg)]"
                  >
                    <p className="line-clamp-1 text-sm font-medium">{thread.title}</p>
                    <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-[var(--text-muted)]">
                      <span>{thread.forumName}</span>
                      <span>· {thread.author.username}</span>
                      <span className="ml-auto">
                        {thread.replyCount} 回复 · {relativeTime(thread.lastReplyAt ?? thread.createdAt)}
                      </span>
                    </p>
                  </Link>
                ))
              )}
              <div className="flex items-center gap-2 px-4 py-3">
                <MessageSquare className="size-4 text-[var(--brand)]" />
                <span className="text-xs text-[var(--text-muted)]">登录后即可发起主题与回复</span>
                <Link to="/forum" className="ml-auto text-xs font-semibold text-[var(--brand)] hover:underline">
                  去看看
                </Link>
              </div>
            </Card>
          </div>
        </section>

        {/* --------------------------------------------------------------- CTA */}
        <section className="pb-16">
          <div className="cta-card">
            <div className="max-w-2xl min-w-0 flex-1">
              <p className="flex items-center gap-2 text-xs font-bold tracking-[0.14em] text-white/80 uppercase">
                <Sparkles className="size-4" /> 免费 · 开源 · 可自托管
              </p>
              <h2 className="mt-3 text-2xl font-bold tracking-tight text-balance sm:text-3xl">把常用工具，放进你的浏览器</h2>
              <p className="mt-2 text-sm leading-relaxed text-white/85">
                无需安装、无需上传。收藏工具、发布文章、参与讨论，都是可选的；核心工具永远开箱即用。
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link to="/tools" className="btn bg-white text-indigo-700 shadow-lg hover:bg-indigo-50">
                开始使用 <ArrowRight className="size-4" />
              </Link>
              <Link to="/about" className="btn border border-white/35 bg-white/10 text-white hover:bg-white/20">
                <Wrench className="size-4" /> 了解项目
              </Link>
            </div>
          </div>
        </section>
      </div>
    </>
  );
}
