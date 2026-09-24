import { describe, it, expect, beforeEach } from 'vitest';
import { MemoryCache } from '../api/cache';

describe('MemoryCache (Pure In-Memory Client Cache)', () => {
  let cache: MemoryCache;

  beforeEach(() => {
    cache = new MemoryCache(1000); // 1-second TTL for testing
    localStorage.clear();
    sessionStorage.clear();
  });

  it('stores and retrieves items purely in JavaScript heap memory', () => {
    cache.set('test_key', { count: 42 });
    const val = cache.get<{ count: number }>('test_key');
    expect(val).toEqual({ count: 42 });

    // Ensure zero writes to disk/browser storage
    expect(localStorage.getItem('test_key')).toBeNull();
    expect(sessionStorage.getItem('test_key')).toBeNull();
  });

  it('isolates cache entries strictly by user ID', () => {
    cache.set('students', [{ id: 'std_1' }], 'user_alpha');
    cache.set('students', [{ id: 'std_2' }], 'user_beta');

    expect(cache.get('students', 'user_alpha')).toEqual([{ id: 'std_1' }]);
    expect(cache.get('students', 'user_beta')).toEqual([{ id: 'std_2' }]);
    expect(cache.get('students', 'user_gamma')).toBeNull();
    expect(cache.get('students')).toBeNull();
  });

  it('returns stale status correctly for Stale-While-Revalidate', async () => {
    cache.set('resource', 'fresh_data', null, 50); // 50ms TTL

    const immediate = cache.getWithStaleStatus<string>('resource');
    expect(immediate).toEqual({ data: 'fresh_data', isStale: false });

    // Wait 60ms for expiration
    await new Promise((r) => setTimeout(r, 60));

    const stale = cache.getWithStaleStatus<string>('resource');
    expect(stale).toEqual({ data: 'fresh_data', isStale: true });

    // Strict get should return null when expired
    expect(cache.get('resource')).toBeNull();
  });

  it('invalidates entries matching pattern or substring', () => {
    cache.set('students_list', [1, 2, 3]);
    cache.set('students_details_1', { id: 1 });
    cache.set('tasks_list', ['task_a']);

    cache.invalidate('students');

    expect(cache.get('students_list')).toBeNull();
    expect(cache.get('students_details_1')).toBeNull();
    expect(cache.get('tasks_list')).toEqual(['task_a']);
  });

  it('clears all entries immediately upon clear() (logout/session expiry)', () => {
    cache.set('key1', 'val1');
    cache.set('key2', 'val2', 'user_123');
    expect(cache.size()).toBe(2);

    cache.clear();

    expect(cache.size()).toBe(0);
    expect(cache.get('key1')).toBeNull();
    expect(cache.get('key2', 'user_123')).toBeNull();
  });
});
