import { useCallback, useEffect, useState } from 'react';
import { http } from './api';
import type { ToolCategoryDTO, ToolDTO } from '@shared/types';

export interface CatalogData {
  categories: ToolCategoryDTO[];
  tools: ToolDTO[];
}

let cache: Promise<CatalogData> | null = null;

export function loadCatalog(force = false): Promise<CatalogData> {
  if (!cache || force) {
    cache = http.get<CatalogData>('/api/tools').catch((error) => {
      cache = null;
      throw error;
    });
  }
  return cache;
}

export function invalidateCatalog(): void {
  cache = null;
}

export function useCatalog(): {
  categories: ToolCategoryDTO[];
  tools: ToolDTO[];
  loading: boolean;
  error: string | null;
  reload: () => void;
} {
  const [data, setData] = useState<CatalogData>({ categories: [], tools: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const reload = useCallback(() => setTick((value) => value + 1), []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    loadCatalog(tick > 0)
      .then((catalog) => {
        if (active) {
          setData(catalog);
          setError(null);
        }
      })
      .catch((reason: Error) => {
        if (active) setError(reason.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [tick]);

  return { ...data, loading, error, reload };
}
