import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, Search, X } from 'lucide-react';
import type { ToolDTO } from '@shared/types';
import { loadCatalog } from '../lib/tools';
import { cn } from '../lib/utils';
import { toolIcon } from '../icons';
import { Kbd } from './ui';

export function SearchPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [query, setQuery] = useState('');
  const [tools, setTools] = useState<ToolDTO[]>([]);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setActive(0);
    window.setTimeout(() => inputRef.current?.focus(), 30);
    let cancelled = false;
    loadCatalog()
      .then((catalog) => {
        if (!cancelled) setTools(catalog.tools);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [open]);

  const results = useMemo(() => {
    const term = query.trim().toLowerCase();
    const filtered = term
      ? tools.filter((tool) =>
          `${tool.name} ${tool.description} ${tool.category?.name ?? ''} ${tool.category?.slug ?? ''}`
            .toLowerCase()
            .includes(term),
        )
      : tools.filter((tool) => !tool.isExternal).slice(0, 8);
    return filtered.slice(0, 9);
  }, [tools, query]);

  useEffect(() => {
    setActive(0);
  }, [query]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      } else if (event.key === 'ArrowDown') {
        event.preventDefault();
        setActive((value) => Math.min(value + 1, results.length - 1));
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        setActive((value) => Math.max(value - 1, 0));
      } else if (event.key === 'Enter') {
        const item = results[active];
        if (!item) return;
        event.preventDefault();
        select(item);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, results, active]);

  const select = (tool: ToolDTO) => {
    onClose();
    if (tool.isExternal || !tool.slug) {
      window.open(tool.href, '_blank', 'noopener');
      return;
    }
    navigate(`/tools/${tool.slug}`);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[95] flex items-start justify-center bg-slate-950/45 p-4 pt-[12vh] backdrop-blur-sm animate-fade-in" onClick={onClose}>
      <div
        className="w-full max-w-xl overflow-hidden rounded-2xl border bg-[var(--card-bg)] shadow-2xl animate-fade-up"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="搜索工具"
      >
        <div className="flex items-center gap-3 border-b px-4">
          <Search className="size-4 shrink-0 text-slate-400" />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索工具，例如 JSON、二维码、BMI…"
            className="h-12 flex-1 bg-transparent text-sm outline-none placeholder:text-slate-400"
          />
          <button type="button" onClick={onClose} className="rounded p-1 text-slate-400 hover:text-slate-600" aria-label="关闭搜索">
            <X className="size-4" />
          </button>
        </div>
        <div className="max-h-[52vh] overflow-y-auto p-2">
          {results.length === 0 ? (
            <p className="px-3 py-8 text-center text-sm subtle">没有找到匹配的工具</p>
          ) : (
            results.map((tool, index) => {
              const Icon = toolIcon(tool.icon);
              return (
                <button
                  key={`${tool.id}-${tool.slug}`}
                  type="button"
                  onMouseEnter={() => setActive(index)}
                  onClick={() => select(tool)}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors',
                    index === active ? 'bg-indigo-50 dark:bg-indigo-500/10' : 'hover:bg-[var(--hover-bg)]',
                  )}
                >
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-white text-indigo-600 ring-1 ring-slate-200 dark:bg-slate-800 dark:text-indigo-300 dark:ring-slate-700">
                    <Icon className="size-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{tool.name}</span>
                    <span className="block truncate text-xs subtle">{tool.category?.name ?? '工具'} · {tool.description}</span>
                  </span>
                  <ArrowRight className="size-4 text-slate-300" />
                </button>
              );
            })
          )}
        </div>
        <div className="flex items-center justify-between border-t px-4 py-2.5 text-[11px] subtle">
          <span className="flex items-center gap-1.5">
            <Kbd>↑</Kbd><Kbd>↓</Kbd> 选择 <Kbd>↵</Kbd> 打开 <Kbd>esc</Kbd> 关闭
          </span>
          <Link to="/tools" onClick={onClose} className="text-indigo-600 hover:underline dark:text-indigo-400">
            浏览全部工具
          </Link>
        </div>
      </div>
    </div>
  );
}
