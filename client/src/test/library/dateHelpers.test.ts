import { afterEach, describe, expect, it } from 'vitest';
import { getDaysInMonth, getFirstDayOfMonth } from '@library/utilities/dateHelpers';

const originalTimeZone = process.env.TZ;

afterEach(() => {
  if (originalTimeZone === undefined) {
    delete process.env.TZ;
  } else {
    process.env.TZ = originalTimeZone;
  }
});

describe('calendar date helpers', () => {
  it('returns Gregorian month lengths, including century leap-year rules', () => {
    expect(getDaysInMonth(2023, 1)).toBe(28);
    expect(getDaysInMonth(2024, 1)).toBe(29);
    expect(getDaysInMonth(2000, 1)).toBe(29);
    expect(getDaysInMonth(2100, 1)).toBe(28);
  });

  it('uses zero-based month indexes', () => {
    expect(getDaysInMonth(2024, 0)).toBe(31);
    expect(getDaysInMonth(2024, 11)).toBe(31);
  });

  it('returns Sunday-first weekday indexes for known month starts', () => {
    expect(getFirstDayOfMonth(2024, 0)).toBe(1);
    expect(getFirstDayOfMonth(2023, 9)).toBe(0);
    expect(getFirstDayOfMonth(2024, 2)).toBe(5);
  });

  it('is unaffected by local time-zone calendar transitions', () => {
    process.env.TZ = 'Pacific/Kiritimati';

    expect(getDaysInMonth(1994, 11)).toBe(31);
  });
});
