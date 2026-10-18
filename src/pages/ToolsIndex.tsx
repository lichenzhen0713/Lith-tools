import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Search, SlidersHorizontal, X } from 'lucide-react';
import { useCatalog } from '../lib/tools';
import { EmptyState, Skeleton } from '../components/ui';
import { ToolCard } from '../components/ToolCard';
import { toolIcon } from '../icons';
import { cn } from '../lib/utils';

export default function ToolsIndex() {
  const [params, setParams] = useSearchParams();
  const { tools, categories, loading, error } = useCatalog();
  const query = params.get('q') ?? '';
  const category = params.get('category') ?? 'all';

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    return tools.filter((tool) => {
      if (category !== 'all' && tool.category?.slug !== category) return false;
      if (!term) return true;
      return `${tool.name} ${tool.description} ${tool.category?.name ?? ''}`.toLowerCase().includes(term);
    });
  }, [tools, query, category]);

  const update = (next: { q?: string; category?: string }) => {
    const merged = new URLSearchParams(params);
    for (const [key, value] of Object.entries(next)) {
      if (value === undefined || value === '' || (key === 'category' && value === 'all')) merged.delete(key);
      else merged.set(key, value);
    }
    setParams(merged, { replace: true });
  };

  return (
    <>
      <section className="page-hero">
        <div className="mx-auto max-w-6xl px-4 py-14 text-center sm:px-6 sm:py-16">
          <p className="eyebrow">Toolbox · 工具库</p>
          <h1 className="mt-4 text-4xl font-extrabold tracking-[-0.04em] sm:text-5xl">所有工具，一处找到</h1>
          <p className="lede max-w-2xl">
            共 {tools.length} 个工具，覆盖 13 个分类。输入关键词即可筛选，所有处理都在浏览器本地完成。
          </p>
          <div className="mx-auto mt-7 flex max-w-xl items-center gap-2 rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)] p-2 shadow-[var(--shadow-lg)]">
            <Search className="ml-2 size-5 shrink-0 text-[var(--text-muted)]" />
            <input
              value={query}
              onChange={(event) => update({ q: event.target.value })}
              placeholder="搜索工具名称、描述或分类…"
              aria-label="搜索工具"
              className="h-10 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-[var(--text-muted)]"
            />
            {query ? (
              <button
                type="button"
                onClick={() => update({ q: '' })}
                className="rounded-lg p-1.5 text-[var(--text-muted)] transition-colors hover:bg-[var(--hover-bg)] hover:text-[var(--text-primary)]"
                aria-label="清除搜索"
              >
                <X className="size-4" />
              </button>
            ) : null}
            <span className="hidden shrink-0 pr-2 text-[11.5px] text-[var(--text-muted)] sm:inline">
              70 个工具
            </span>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
        <div className="flex flex-wrap items-center gap-2 pb-2">
          <span className="flex shrink-0 items-center gap-1.5 pr-1 text-xs text-[var(--text-muted)]">
            <SlidersHorizontal className="size-3.5" /> 分类
          </span>
          <button
            type="button"
            onClick={() => update({ category: 'all' })}
            className={cn('chip shrink-0', category === 'all' && 'chip-active')}
          >
            全部
            <span className={cn('rounded-full px-1 text-[10px]', category === 'all' ? 'bg-white/20' : 'bg-black/5 dark:bg-white/10')}>
              {tools.length}
            </span>
          </button>
          {categories.map((item) => {
            const Icon = toolIcon(item.icon);
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => update({ category: item.slug })}
                className={cn('chip shrink-0', category === item.slug && 'chip-active')}
              >
                <Icon className="size-3.5" />
                {item.name}
                <span
                  className={cn(
                    'rounded-full px-1 text-[10px]',
                    category === item.slug ? 'bg-white/20' : 'bg-black/5 dark:bg-white/10',
                  )}
                >
                  {item.toolCount ?? 0}
                </span>
              </button>
            );
          })}
        </div>

        <div className="mt-5 mb-5 flex flex-wrap items-center justify-between gap-3 text-sm">
          <p className="text-[var(--text-muted)]">
            {loading ? (
              '正在加载…'
            ) : (
              <>
                找到 <span className="font-semibold text-[var(--text-primary)]">{filtered.length}</span> 个工具
              </>
            )}
          </p>
          {query || category !== 'all' ? (
            <button
              type="button"
              onClick={() => update({ q: '', category: 'all' })}
              className="text-xs font-medium text-[var(--brand)] hover:underline"
            >
              清除筛选
            </button>
          ) : null}
        </div>

        {error ? (
          <EmptyState
            title="工具加载失败"
            description={error}
            action={
              <button type="button" className="btn-secondary" onClick={() => window.location.reload()}>
                重新加载
              </button>
            }
          />
        ) : loading ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 12 }).map((_, index) => (
              <Skeleton key={index} className="h-40" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={Search}
            title="没有找到匹配的工具"
            description="换个关键词试试，或者浏览全部分类。"
            action={
              <Link to="/tools" className="btn-primary">
                查看全部工具
              </Link>
            }
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filtered.map((tool) => (
              <ToolCard key={tool.id} tool={tool} />
            ))}
          </div>
        )}
      </div>
    </>
  );
}
