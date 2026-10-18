import { Link } from 'react-router-dom';
import type { ToolDTO } from '@shared/types';
import { ArrowUpRight, ChevronRight } from 'lucide-react';
import { toolIcon } from '../icons';
import { cn } from '../lib/utils';

export function ToolCard({ tool, className, compact = false }: { tool: ToolDTO; className?: string; compact?: boolean }) {
  const Icon = toolIcon(tool.icon);
  const tint = `tint-${tool.category?.slug ?? 'others'}`;

  const content = (
    <>
      <div className="flex items-start justify-between gap-3">
        <span className={cn('icon-tile transition-transform duration-200 group-hover:scale-105', tint)}>
          <Icon className="size-5" />
        </span>
        {tool.isExternal ? (
          <ArrowUpRight className="size-4 text-[var(--text-muted)] transition-colors group-hover:text-[var(--brand)]" />
        ) : (
          <ChevronRight className="size-4 -translate-x-1 text-[var(--text-muted)] opacity-0 transition-all duration-200 group-hover:translate-x-0 group-hover:text-[var(--brand)] group-hover:opacity-100" />
        )}
      </div>
      <div className="mt-3">
        <p className="font-semibold tracking-tight">{tool.name}</p>
        {!compact ? (
          <p className="mt-1 line-clamp-2 text-[12.5px] leading-relaxed text-[var(--text-muted)]">{tool.description}</p>
        ) : null}
      </div>
      {!compact && tool.category ? (
        <p className="mt-3 flex items-center gap-1.5 text-[11px] font-semibold tracking-wide text-[var(--brand)]">
          <span className="size-1 rounded-full bg-current" />
          {tool.category.name}
        </p>
      ) : null}
    </>
  );

  const classes = cn(
    'group card block p-4 transition-all duration-200 hover:-translate-y-1 hover:border-[var(--border-strong)] hover:shadow-[0_18px_40px_-28px_rgba(13,25,45,0.45)]',
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
