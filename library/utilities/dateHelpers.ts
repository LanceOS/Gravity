/**
 * Returns the number of days in a Gregorian calendar month.
 *
 * `month` uses JavaScript's zero-based month convention (`0` for January
 * through `11` for December). The calculation uses UTC so it is unaffected by
 * the runtime time zone or locale.
 */
export function getDaysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

/**
 * Returns the weekday of the first day in a Gregorian calendar month.
 *
 * `month` uses JavaScript's zero-based month convention (`0` for January
 * through `11` for December). The returned index is fixed at `0` for Sunday
 * through `6` for Saturday to match this library's Sunday-first calendar
 * grids; it is not locale-specific. The calculation uses UTC so it is
 * unaffected by the runtime time zone.
 */
export function getFirstDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 1)).getUTCDay();
}

/**
 * Formats a timestamp as a short relative label (e.g. "2 hours ago", "Yesterday").
 * Falls back to a locale date string once the timestamp is more than a week old.
 */
export function formatRelativeTime(value: string | number | Date, now: Date = new Date()): string {
  const target = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(target.getTime())) {
    return '';
  }

  const diffMs = now.getTime() - target.getTime();
  const diffSeconds = Math.round(diffMs / 1000);

  if (diffSeconds < 30) {
    return 'Just now';
  }

  const diffMinutes = Math.round(diffSeconds / 60);
  if (diffMinutes < 60) {
    return `${diffMinutes} minute${diffMinutes === 1 ? '' : 's'} ago`;
  }

  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) {
    return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`;
  }

  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfTarget = new Date(target.getFullYear(), target.getMonth(), target.getDate());
  const dayDiff = Math.round((startOfToday.getTime() - startOfTarget.getTime()) / (24 * 60 * 60 * 1000));

  if (dayDiff === 0) {
    return 'Today';
  }

  if (dayDiff === 1) {
    return 'Yesterday';
  }

  if (dayDiff < 7) {
    return `${dayDiff} days ago`;
  }

  return target.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: target.getFullYear() === now.getFullYear() ? undefined : 'numeric' });
}
