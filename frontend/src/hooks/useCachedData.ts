import { useState, useEffect, useCallback, useRef } from 'react';
import { memoryCache } from '../api/cache';

export interface UseCachedDataOptions {
  userId?: string | null;
  ttlMs?: number;
  enabled?: boolean;
}

export interface UseCachedDataReturn<T> {
  data: T | null;
  loading: boolean;
  isRevalidating: boolean;
  error: Error | null;
  mutate: (newData: T | ((prev: T | null) => T)) => void;
  refresh: () => Promise<T | null>;
}

/**
 * Custom React hook for client-side data fetching with pure in-memory Stale-While-Revalidate (SWR) caching.
 * 
 * Guarantees instant navigation between tabs with zero perceived loading time when returning to previously
 * visited pages, while keeping sensitive data securely restricted to JavaScript runtime memory.
 */
export function useCachedData<T>(
  key: string,
  fetcher: () => Promise<T>,
  options: UseCachedDataOptions = {}
): UseCachedDataReturn<T> {
  const { userId, ttlMs, enabled = true } = options;

  // Check in-memory cache synchronously during component mount
  const initialCache = enabled ? memoryCache.getWithStaleStatus<T>(key, userId) : null;

  const [data, setData] = useState<T | null>(initialCache ? initialCache.data : null);
  const [loading, setLoading] = useState<boolean>(!initialCache && enabled);
  const [isRevalidating, setIsRevalidating] = useState<boolean>(Boolean(initialCache && enabled));
  const [error, setError] = useState<Error | null>(null);

  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const isMountedRef = useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const refresh = useCallback(async (): Promise<T | null> => {
    if (!enabled) return null;

    try {
      if (!initialCache && !data) {
        setLoading(true);
      } else {
        setIsRevalidating(true);
      }
      setError(null);

      const freshData = await fetcherRef.current();

      if (isMountedRef.current) {
        setData(freshData);
        setLoading(false);
        setIsRevalidating(false);
      }

      // Store in memory cache
      memoryCache.set(key, freshData, userId, ttlMs);
      return freshData;
    } catch (err: any) {
      if (isMountedRef.current) {
        setError(err instanceof Error ? err : new Error(String(err)));
        setLoading(false);
        setIsRevalidating(false);
      }
      return null;
    }
  }, [key, userId, ttlMs, enabled, initialCache, data]);

  // Initial fetch / background revalidation
  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;

    async function execute() {
      try {
        const freshData = await fetcherRef.current();
        if (cancelled) return;

        setData(freshData);
        memoryCache.set(key, freshData, userId, ttlMs);
      } catch (err: any) {
        if (cancelled) return;
        // If we already have cached data, don't clobber it with an error, just capture error
        setError(err instanceof Error ? err : new Error(String(err)));
      } finally {
        if (!cancelled) {
          setLoading(false);
          setIsRevalidating(false);
        }
      }
    }

    execute();

    return () => {
      cancelled = true;
    };
  }, [key, userId, ttlMs, enabled]);

  const mutate = useCallback(
    (newData: T | ((prev: T | null) => T)) => {
      setData((prev) => {
        const resolved = typeof newData === 'function' ? (newData as (prev: T | null) => T)(prev) : newData;
        memoryCache.set(key, resolved, userId, ttlMs);
        return resolved;
      });
    },
    [key, userId, ttlMs]
  );

  return {
    data,
    loading,
    isRevalidating,
    error,
    mutate,
    refresh,
  };
}
