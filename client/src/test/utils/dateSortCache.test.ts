import { expect, it } from 'vitest';
import { createDateSortCache, DATE_SORT_CACHE_LIMIT } from '../../modules/tickets/utils/dateSortCache';
it('bounds retention after 100,000 distinct updates, including invalid dates', () => {
  const cache = createDateSortCache();
  for (let i = 0; i < 100000; i++) {
    const date = new Date(1700000000000 + i).toISOString();
    expect(cache.parse(date)).toBe(Date.parse(date));
    cache.parse(`invalid-${i}-not-a-date`);
  }
  expect(cache.size).toBe(DATE_SORT_CACHE_LIMIT);
  expect(cache.parse('invalid-99999-not-a-date')).toBeNull();
});
