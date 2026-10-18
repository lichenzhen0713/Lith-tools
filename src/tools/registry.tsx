import { lazy, Suspense, type ComponentType, type LazyExoticComponent, type ReactNode } from 'react';
import { PageLoader } from '../components/ui';

/**
 * Tool implementations are auto-discovered from this folder: every `*.tsx`
 * file default-exporting a component is addressable as `/tools/<file-name>`.
 * Using import.meta.glob keeps the registry in sync with the filesystem and
 * lets Vite split each tool into its own lazy chunk.
 */
const modules = import.meta.glob<{ default: ComponentType }>('./*.tsx');

const cache = new Map<string, LazyExoticComponent<ComponentType> | null>();

export function getToolComponent(slug: string): LazyExoticComponent<ComponentType> | null {
  if (cache.has(slug)) return cache.get(slug) ?? null;
  const loader = modules[`./${slug}.tsx`];
  const component = loader ? lazy(loader) : null;
  cache.set(slug, component);
  return component;
}

export function hasToolComponent(slug: string): boolean {
  return Boolean(modules[`./${slug}.tsx`]);
}

export function ToolSuspense({ children, fallback }: { children: ReactNode; fallback?: ReactNode }) {
  return <Suspense fallback={fallback ?? <PageLoader label="正在加载工具…" />}>{children}</Suspense>;
}

/** Tools that ship with the app (used by the admin page / diagnostics). */
export const implementedToolSlugs: string[] = Object.keys(modules)
  .map((key) => key.replace(/^\.\//, '').replace(/\.tsx$/, ''))
  .filter((slug) => slug !== 'kit' && slug !== 'registry')
  .sort();
