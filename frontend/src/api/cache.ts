/**
 * Pure In-Memory Client-Side Cache with Stale-While-Revalidate (SWR) support.
 * 
 * SECURITY NOTICE:
 * To strictly safeguard sensitive student data (identities, contact numbers, emails, student codes),
 * cached items are maintained exclusively in JavaScript heap memory (Map).
 * Data is NEVER persisted to localStorage, sessionStorage, or IndexedDB.
 * The entire cache is immediately flushed upon user logout or session expiration.
 */

export interface CacheEntry<T = unknown> {
  data: T;
  timestamp: number;
  ttlMs: number;
  userId: string | null;
}

export class MemoryCache {
  private cache: Map<string, CacheEntry<any>> = new Map();
  private defaultTtlMs: number;

  constructor(defaultTtlMs: number = 5 * 60 * 1000) { // 5 minutes default TTL
    this.defaultTtlMs = defaultTtlMs;
  }

  /**
   * Generates a compound cache key scoped to user ID to ensure strict tenant and account isolation.
   */
  private makeKey(key: string, userId?: string | null): string {
    const userScope = userId ? `usr:${userId}` : 'anon';
    return `${userScope}::${key}`;
  }

  /**
   * Retrieves an item from memory. Returns null if missing or expired.
   */
  get<T>(key: string, userId?: string | null): T | null {
    const compoundKey = this.makeKey(key, userId);
    const entry = this.cache.get(compoundKey);
    if (!entry) return null;

    // Strict user scoping verification
    if (entry.userId !== (userId || null)) {
      return null;
    }

    const now = Date.now();
    if (now - entry.timestamp > entry.ttlMs) {
      // Expired entry
      this.cache.delete(compoundKey);
      return null;
    }

    return entry.data as T;
  }

  /**
   * Retrieves cached item even if stale, useful for Stale-While-Revalidate pattern.
   * Returns { data, isStale } or null if not found.
   */
  getWithStaleStatus<T>(key: string, userId?: string | null): { data: T; isStale: boolean } | null {
    const compoundKey = this.makeKey(key, userId);
    const entry = this.cache.get(compoundKey);
    if (!entry) return null;

    if (entry.userId !== (userId || null)) {
      return null;
    }

    const now = Date.now();
    const isStale = now - entry.timestamp > entry.ttlMs;
    return { data: entry.data as T, isStale };
  }

  /**
   * Stores data purely in JavaScript runtime memory.
   */
  set<T>(key: string, data: T, userId?: string | null, ttlMs?: number): void {
    const compoundKey = this.makeKey(key, userId);
    this.cache.set(compoundKey, {
      data,
      timestamp: Date.now(),
      ttlMs: ttlMs ?? this.defaultTtlMs,
      userId: userId || null,
    });
  }

  /**
   * Invalidates specific cache keys matching a string prefix or RegExp.
   */
  invalidate(pattern: string | RegExp): void {
    for (const compoundKey of this.cache.keys()) {
      if (typeof pattern === 'string') {
        if (compoundKey.includes(pattern)) {
          this.cache.delete(compoundKey);
        }
      } else if (pattern.test(compoundKey)) {
        this.cache.delete(compoundKey);
      }
    }
  }

  /**
   * Immediately clears all cached entries from memory.
   * Invoked on user logout, 401 unauthenticated errors, or tenant switches.
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Current number of cached items in memory.
   */
  size(): number {
    return this.cache.size;
  }
}

// Global memory cache singleton
export const memoryCache = new MemoryCache();
