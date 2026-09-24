import { describe, expect, it } from 'vitest';
import { deadlineStatus, relativeDue, sortDeadlines } from '../src/lib/status';
import {
  dateTimeKey,
  dayKey,
  dayKeyOffset,
  fromMinutes,
  isResolvableDayKey,
  toMinutes,
} from '../src/lib/dates';
import type { Deadline } from '../src/types';

const dl = (over: Partial<Deadline>): Deadline => ({
  id: 'x',
  title: 'T',
  subject: '',
  description: '',
  dueDate: '2026-09-24',
  dueTime: '',
  priority: 'medium',
  completed: false,
  createdAt: '2026-09-01T00:00:00.000Z',
  ...over,
});

/** Fixed "now" so these tests do not rot with the calendar. */
const NOW = new Date(2026, 8, 24, 14, 0, 0); // Thu 24 Sep 2026, 14:00 local

describe('deadlineStatus', () => {
  it('flags a deadline whose TIME has passed today as overdue', () => {
    // The audited build compared against local midnight, so this read "Due today"
    // five hours after it slipped.
    expect(deadlineStatus(dl({ dueDate: '2026-09-24', dueTime: '09:00' }), NOW)).toBe('overdue');
  });

  it('keeps a later-today deadline as "today"', () => {
    expect(deadlineStatus(dl({ dueDate: '2026-09-24', dueTime: '23:59' }), NOW)).toBe('today');
  });

  it('treats an all-day deadline as due at end of day', () => {
    expect(deadlineStatus(dl({ dueDate: '2026-09-24', dueTime: '' }), NOW)).toBe('today');
  });

  it('classifies past, tomorrow and future correctly', () => {
    expect(deadlineStatus(dl({ dueDate: '2026-09-20' }), NOW)).toBe('overdue');
    expect(deadlineStatus(dl({ dueDate: '2026-09-25' }), NOW)).toBe('tomorrow');
    expect(deadlineStatus(dl({ dueDate: '2026-10-10' }), NOW)).toBe('upcoming');
  });

  it('reports completed regardless of date', () => {
    expect(deadlineStatus(dl({ completed: true, dueDate: '2026-09-20' }), NOW)).toBe('done');
  });

  it('does not throw on a malformed date', () => {
    expect(() => deadlineStatus(dl({ dueDate: 'not-a-date' }), NOW)).not.toThrow();
    expect(deadlineStatus(dl({ dueDate: '' }), NOW)).toBe('upcoming');
  });
});

describe('sortDeadlines', () => {
  it('orders same-day deadlines by TIME, not just date', () => {
    // Audited §2.7: `dueDate.localeCompare(dueDate)` put a 23:00 essay
    // before an 08:00 quiz on the same day.
    const sorted = sortDeadlines([
      dl({ id: 'late', title: 'Essay', dueDate: '2026-09-25', dueTime: '23:00' }),
      dl({ id: 'early', title: 'Quiz', dueDate: '2026-09-25', dueTime: '08:00' }),
    ]);
    expect(sorted.map((d) => d.id)).toEqual(['early', 'late']);
  });

  it('puts incomplete before complete', () => {
    const sorted = sortDeadlines([
      dl({ id: 'done', completed: true, dueDate: '2026-09-01' }),
      dl({ id: 'open', dueDate: '2026-12-01' }),
    ]);
    expect(sorted.map((d) => d.id)).toEqual(['open', 'done']);
  });

  it('does not mutate the input array', () => {
    const input = [dl({ id: 'b', dueDate: '2026-10-02' }), dl({ id: 'a', dueDate: '2026-10-01' })];
    const copy = [...input];
    sortDeadlines(input);
    expect(input).toEqual(copy);
  });
});

describe('relativeDue', () => {
  it('reads as overdue in the past and "in" in the future', () => {
    expect(relativeDue(dl({ dueDate: '2026-09-22', dueTime: '14:00' }), NOW)).toMatch(/overdue/);
    expect(relativeDue(dl({ dueDate: '2026-09-27', dueTime: '14:00' }), NOW)).toMatch(/^in /);
  });

  it('uses hours under a day and days beyond it', () => {
    expect(relativeDue(dl({ dueDate: '2026-09-24', dueTime: '21:00' }), NOW)).toBe('in 7 hours');
    expect(relativeDue(dl({ dueDate: '2026-09-27', dueTime: '14:00' }), NOW)).toBe('in 3 days');
  });
});

describe('date helpers', () => {
  it('toMinutes parses and rejects correctly', () => {
    expect(toMinutes('09:30')).toBe(570);
    expect(toMinutes('00:00')).toBe(0);
    expect(toMinutes('23:59')).toBe(1439);
    expect(toMinutes('24:00')).toBeNull();
    expect(toMinutes('9:75')).toBeNull();
    expect(toMinutes('')).toBeNull();
    expect(toMinutes(undefined as unknown as string)).toBeNull();
  });

  it('fromMinutes round-trips', () => {
    for (const t of ['00:00', '07:30', '13:15', '23:59']) {
      expect(fromMinutes(toMinutes(t)!)).toBe(t);
    }
  });

  it('dateTimeKey makes time-aware comparisons sort correctly', () => {
    expect(dateTimeKey('2026-09-25', '08:00') < dateTimeKey('2026-09-25', '23:00')).toBe(true);
    expect(dateTimeKey('2026-09-24') < dateTimeKey('2026-09-25')).toBe(true);
  });

  it('dayKeyOffset stays in local time across a UTC+ boundary', () => {
    // Audited §2.6: toISOString() shifted local midnight back a day in UTC+ zones.
    const base = new Date(2026, 8, 24, 0, 0, 0);
    expect(dayKey(base)).toBe('2026-09-24');
    expect(dayKeyOffset(0, base)).toBe('2026-09-24');
    expect(dayKeyOffset(1, base)).toBe('2026-09-25');
    expect(dayKeyOffset(-1, base)).toBe('2026-09-23');
  });

  it('isResolvableDayKey rejects junk', () => {
    expect(isResolvableDayKey('2026-09-24')).toBe(true);
    expect(isResolvableDayKey('2026-13-45')).toBe(false);
    expect(isResolvableDayKey('nope')).toBe(false);
    expect(isResolvableDayKey(null)).toBe(false);
    expect(isResolvableDayKey(20260924)).toBe(false);
  });
});
