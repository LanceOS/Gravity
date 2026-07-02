const TICKET_DATE_OPTIONS = { month: 'short', day: 'numeric' } as const;
const TICKET_DATETIME_OPTIONS = { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' } as const;
const TIMELINE_DATE_OPTIONS = {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
} as const;

const shortDateFormatter = new Intl.DateTimeFormat(undefined, TICKET_DATE_OPTIONS);
const longDateFormatter = new Intl.DateTimeFormat(undefined, TICKET_DATETIME_OPTIONS);
const timelineDateFormatter = new Intl.DateTimeFormat(undefined, TIMELINE_DATE_OPTIONS);

const shortDateCache = new Map<string, string>();
const longDateCache = new Map<string, string>();
const timelineDateCache = new Map<string, string>();

function getCachedFormat(formatter: Intl.DateTimeFormat, cache: Map<string, string>, value: string): string {
  const cached = cache.get(value);
  if (cached) {
    return cached;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    cache.set(value, 'No date');
    return 'No date';
  }

  const formatted = formatter.format(date);
  cache.set(value, formatted);
  return formatted;
}

export function formatTicketDate(value: string): string {
  return getCachedFormat(shortDateFormatter, shortDateCache, value);
}

export function formatTicketDateTime(value: string): string {
  return getCachedFormat(longDateFormatter, longDateCache, value);
}

export function formatTicketTimelineDate(value: string): string {
  return getCachedFormat(timelineDateFormatter, timelineDateCache, value);
}
