import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Search, SlidersHorizontal, X } from 'lucide-react';
import { useCatalog } from '../lib/tools';
import { Badge, EmptyState, Input, Skeleton } from '../components/ui';
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
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
      <div className="mx-auto max-w-2xl text-center">
        <Badge tone="brand">工具库</Badge>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">所有工具，一处找到</h1>
        <p className="mt-3 text-sm leading-relaxed muted sm:text-base">
          共 {tools.length} 个工具，覆盖 13 个分类。输入关键词即可筛选，所有处理都在浏览器本地完成。
        </p>
        <div className="relative mt-6">
          <Search className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-slate-400" />
          <Input
            value={query}
            onChange={(event) => update({ q: event.target.value })}
            placeholder="搜索工具名称、描述或分类…"
            className="h-12 pl-11 text-base"
            aria-label="搜索工具"
          />
          {query ? (
            <button
              type="button"
              onClick={() => update({ q: '' })}
              className="absolute top-1/2 right-3 -translate-y-1/2 rounded p-1 text-slate-400 hover:text-slate-600"
              aria-label="清除搜索"
            >
              <X className="size-4" />
            </button>
          ) : null}
        </div>
      </div>

      <div className="mt-8 flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none">
        <span className="flex shrink-0 items-center gap-1.5 pr-1 text-xs subtle">
          <SlidersHorizontal className="size-3.5" /> 分类
        </span>
        <button type="button" onClick={() => update({ category: 'all' })} className={cn('chip shrink-0', category === 'all' && 'chip-active')}>
          全部
          <span className={cn('rounded-full px-1 text-[10px]', category === 'all' ? 'bg-white/20' : 'bg-black/5 dark:bg-white/10')}>{tools.length}</span>
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
              <span className={cn('rounded-full px-1 text-[10px]', category === item.slug ? 'bg-white/20' : 'bg-black/5 dark:bg-white/10')}>
                {item.toolCount ?? 0}
              </span>
            </button>
          );
        })}
      </div>

      <div className="mt-6 mb-4 flex items-center justify-between text-sm">
        <p className="subtle">
          {loading ? '正在加载…' : <>找到 <span className="font-medium text-[var(--text-primary)]">{filtered.length}</span> 个工具</>}
        </p>
        {query || category !== 'all' ? (
          <button type="button" onClick={() => update({ q: '', category: 'all' })} className="text-xs text-indigo-600 hover:underline dark:text-indigo-400">
            清除筛选
          </button>
        ) : null}
      </div>

      {error ? (
        <EmptyState title="工具加载失败" description={error} action={<button type="button" className="btn-secondary" onClick={() => window.location.reload()}>重新加载</button>} />
      ) : loading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 12 }).map((_, index) => (
            <Skeleton key={index} className="h-36" />
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
  );
}
