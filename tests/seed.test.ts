import { beforeEach, describe, expect, it } from 'vitest';
import {
  SEED_KEYS,
  buildSampleDeadlines,
  buildSampleTasks,
  buildSampleTimetable,
  clearAllData,
  dayFromToday,
  isFirstRun,
  loadSampleTerm,
} from '../src/store/seed';
import { dayKey } from '../src/lib/dates';
import { isValidDeadline, isValidTimetableEntry } from '../src/store/validators';
import { deadlineStatus } from '../src/lib/status';
import { layoutWeek } from '../src/features/timetable/layout';

beforeEach(() => localStorage.clear());

describe('sample data', () => {
  it('dates everything relative to today so the demo never goes stale', () => {
    const now = new Date();
    const deadlines = buildSampleDeadlines(now);
    const statuses = new Set(deadlines.map((d) => deadlineStatus(d, now)));
    // A useful demo exercises every group the UI renders.
    expect(statuses.has('overdue')).toBe(true);
    expect(statuses.has('today')).toBe(true);
    expect(statuses.has('upcoming')).toBe(true);
    expect(statuses.has('done')).toBe(true);
  });

  it('has a class on the current weekday so Today is never empty', () => {
    const today = new Date().getDay();
    expect(buildSampleTimetable().some((e) => e.day === today)).toBe(true);
  });

  it('produces records that pass the real validators', () => {
    for (const t of buildSampleTasks()) expect(t.id).toBeTruthy();
    for (const d of buildSampleDeadlines()) expect(isValidDeadline(d)).toBe(true);
    for (const e of buildSampleTimetable()) expect(isValidTimetableEntry(e)).toBe(true);
  });

  it('includes the cases the old grid could not render, so the fix is visible', () => {
    const entries = buildSampleTimetable();
    expect(entries.some((e) => e.startTime.endsWith(':30'))).toBe(true);
    expect(entries.some((e) => e.startTime.endsWith(':15'))).toBe(true);
    expect(entries.some((e) => e.startTime < '08:00')).toBe(true);
    expect(entries.some((e) => e.startTime > '20:00')).toBe(true);
    const { entries: laid, invalid } = layoutWeek(entries);
    expect(laid).toHaveLength(entries.length);
    expect(invalid).toHaveLength(0);
  });

  it('uses local day keys that never shift across a UTC boundary', () => {
    expect(dayFromToday(0)).toBe(dayKey(new Date()));
    expect(dayFromToday(0)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('loadSampleTerm', () => {
  it('reports isFirstRun before and after seeding', () => {
    expect(isFirstRun()).toBe(true);
    loadSampleTerm('replace', true);
    expect(isFirstRun()).toBe(false);
    clearAllData();
    expect(isFirstRun()).toBe(true);
  });

  it('writes every collection in the versioned envelope', () => {
    const res = loadSampleTerm('replace', true);
    expect(res.ok).toBe(true);
    for (const key of Object.values(SEED_KEYS)) {
      const raw = localStorage.getItem(key);
      expect(raw, key).toBeTruthy();
      const parsed = JSON.parse(raw!) as { v: number; data: unknown[] };
      expect(parsed.v).toBe(1);
      expect(Array.isArray(parsed.data)).toBe(true);
      expect(parsed.data.length).toBeGreaterThan(0);
    }
  });

  it('preserves existing data in merge mode', () => {
    localStorage.setItem(
      SEED_KEYS.tasks,
      JSON.stringify({
        v: 1,
        data: [{ id: 'mine', title: 'Kept', completed: false, createdAt: 'x' }],
      }),
    );
    loadSampleTerm('merge', true);
    const parsed = JSON.parse(localStorage.getItem(SEED_KEYS.tasks)!) as { data: unknown[] };
    expect(parsed.data).toHaveLength(1);
    // Other collections were empty, so they get seeded.
    expect(JSON.parse(localStorage.getItem(SEED_KEYS.notes)!).data.length).toBeGreaterThan(0);
  });
});
