import { Link } from 'react-router-dom';
import type { ToolDTO } from '@shared/types';
import { ArrowUpRight, ChevronRight } from 'lucide-react';
import { toolIcon } from '../icons';
import { cn } from '../lib/utils';

export function ToolCard({ tool, className, compact = false }: { tool: ToolDTO; className?: string; compact?: boolean }) {
  const Icon = toolIcon(tool.icon);
  const content = (
    <>
      <div className="flex items-start justify-between gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-50 to-violet-50 text-indigo-600 ring-1 ring-indigo-100 transition-transform group-hover:scale-105 dark:from-indigo-500/15 dark:to-violet-500/10 dark:text-indigo-300 dark:ring-indigo-500/20">
          <Icon className="size-5" />
        </span>
        {tool.isExternal ? (
          <ArrowUpRight className="size-4 text-slate-300 transition-colors group-hover:text-indigo-500" />
        ) : (
          <ChevronRight className="size-4 -translate-x-1 text-slate-300 opacity-0 transition-all group-hover:translate-x-0 group-hover:text-indigo-500 group-hover:opacity-100" />
        )}
      </div>
      <div className="mt-3">
        <p className="font-medium tracking-tight">{tool.name}</p>
        {!compact ? <p className="mt-1 line-clamp-2 text-xs leading-relaxed subtle">{tool.description}</p> : null}
      </div>
      {!compact && tool.category ? (
        <p className="mt-3 text-[11px] font-medium tracking-wide text-indigo-600/70 uppercase dark:text-indigo-400/70">
          {tool.category.name}
        </p>
      ) : null}
    </>
  );

  const classes = cn(
    'group card block p-4 transition-all duration-200 hover:-translate-y-0.5 hover:border-indigo-200 hover:shadow-md dark:hover:border-indigo-500/30',
    className,
  );

  if (tool.isExternal || !tool.slug) {
    return (
      <a href={tool.href} target="_blank" rel="noopener noreferrer" className={classes}>
        {content}
      </a>
    );
  }
  return (
    <Link to={`/tools/${tool.slug}`} className={classes}>
      {content}
    </Link>
  );
}
