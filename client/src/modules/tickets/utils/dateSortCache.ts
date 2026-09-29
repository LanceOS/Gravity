// Bound process-lifetime retention, including invalid timestamp strings.
export const DATE_SORT_CACHE_LIMIT = 2048;

export function createDateSortCache() {
  const values = new Map<string, number | null>();
  return {
    get size() { return values.size; },
    parse(value: string): number | null {
      const cached = values.get(value);
      if (cached !== undefined) return cached;
      const parsed = Date.parse(value);
      const result = Number.isNaN(parsed) ? null : parsed;
      if (values.size >= DATE_SORT_CACHE_LIMIT) {
        values.delete(values.keys().next().value!);
      }
      values.set(value, result);
      return result;
    },
  };
}
