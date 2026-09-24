import { describe, expect, it } from 'vitest';
import {
  HOUR_PX,
  blockStyle,
  entriesForDay,
  layoutWeek,
  nowLinePx,
  subjectHue,
  toMinutes,
} from '../src/features/timetable/layout';
import type { TimetableEntry } from '../src/types';

/**
 * Regression tests for the audited §2.1 defect: the shipped grid matched
 * entries against a hardcoded list of exact hourly strings, so 5 of 6
 * plausible entries never rendered.
 */
const entry = (over: Partial<TimetableEntry> & { id: string }): TimetableEntry => ({
  day: 1,
  startTime: '09:00',
  endTime: '10:00',
  subject: 'Subject',
  room: '',
  note: '',
  ...over,
});

const SIX_CASES: TimetableEntry[] = [
  entry({ id: 'a', startTime: '09:00', endTime: '10:00', subject: 'Maths' }),
  entry({ id: 'b', startTime: '09:30', endTime: '10:30', subject: 'Physics' }),
  entry({ id: 'c', startTime: '07:30', endTime: '08:30', subject: 'Lab' }),
  entry({ id: 'd', startTime: '21:00', endTime: '22:00', subject: 'Evening class' }),
  entry({ id: 'e', startTime: '09:00', endTime: '12:00', subject: '3hr Workshop' }),
  entry({ id: 'f', day: 2, startTime: '11:15', endTime: '12:45', subject: 'Chemistry' }),
];

describe('layoutWeek', () => {
  it('renders every valid entry, including the ones the shipped build hid', () => {
    const { entries, invalid } = layoutWeek(SIX_CASES);
    expect(entries).toHaveLength(6);
    expect(invalid).toHaveLength(0);
    expect(entries.map((e) => e.id).sort()).toEqual(['a', 'b', 'c', 'd', 'e', 'f']);
  });

  it('honours endTime so a multi-hour class spans multiple hours', () => {
    const { entries } = layoutWeek(SIX_CASES);
    expect(entries.find((e) => e.id === 'e')?.heightMin).toBe(180);
    expect(entries.find((e) => e.id === 'f')?.heightMin).toBe(90);
  });

  it('derives the axis from data instead of a hardcoded 08:00-20:00 window', () => {
    const { startHour, endHour } = layoutWeek(SIX_CASES);
    expect(startHour).toBeLessThanOrEqual(7); // Lab starts 07:30
    expect(endHour).toBeGreaterThanOrEqual(22); // Evening class ends 22:00
  });

  it('gives overlapping classes distinct lanes that never collide', () => {
    const { entries } = layoutWeek(SIX_CASES);
    const monday = entries.filter((e) => e.day === 1);
    // Maths 09:00-10:00, Workshop 09:00-12:00, Physics 09:30-10:30 all overlap.
    const overlapping = monday.filter((e) => ['a', 'b', 'e'].includes(e.id));
    expect(overlapping).toHaveLength(3);
    expect(new Set(overlapping.map((e) => e.lane)).size).toBe(3);

    for (const p of monday) {
      for (const q of monday) {
        if (p.id === q.id || p.lane !== q.lane) continue;
        const overlaps =
          toMinutes(p.startTime)! < toMinutes(q.endTime)! &&
          toMinutes(q.startTime)! < toMinutes(p.endTime)!;
        expect(overlaps, `${p.subject} and ${q.subject} share lane ${p.lane}`).toBe(false);
      }
    }
  });

  it('reports unrenderable entries instead of dropping them silently', () => {
    const { entries, invalid } = layoutWeek([
      entry({ id: 'x', startTime: '25:00', endTime: '10:00', subject: 'Bad hour' }),
      entry({ id: 'y', startTime: '14:00', endTime: '13:00', subject: 'Ends before start' }),
      entry({ id: 'z', day: 9, subject: 'Bad day index' }),
      entry({ id: 'ok', subject: 'Fine' }),
    ]);
    expect(invalid.map((e) => e.id).sort()).toEqual(['x', 'y', 'z']);
    expect(entries.map((e) => e.id)).toEqual(['ok']);
  });

  it('keeps an empty week usable with a default window', () => {
    const { entries, startHour, endHour } = layoutWeek([]);
    expect(entries).toHaveLength(0);
    expect(endHour).toBeGreaterThan(startHour);
  });

  it('never produces a block shorter than the clickable minimum', () => {
    const { entries } = layoutWeek([entry({ id: 's', startTime: '09:00', endTime: '09:05' })]);
    expect(entries[0]?.heightMin).toBeGreaterThanOrEqual(22);
  });
});

describe('blockStyle', () => {
  it('positions a block relative to the derived axis start', () => {
    // padHours defaults to 1 and bounds.minStart to 07:00, so a lone 09:00 class
    // yields an axis starting at 06:00 and the block sits 3 hours down.
    const { entries, startHour } = layoutWeek([
      entry({ id: 'a', startTime: '09:00', endTime: '10:00' }),
    ]);
    expect(startHour).toBe(6);
    const style = blockStyle(entries[0]!, HOUR_PX);
    expect(style.top).toBe(`${3 * HOUR_PX + 2}px`);
    expect(style.height).toBe(`${HOUR_PX - 4}px`);
    expect(style.width).toBe('calc(100% - 6px)');
  });

  it('honours explicit bounds', () => {
    const { startHour, endHour } = layoutWeek(
      [entry({ id: 'a', startTime: '09:00', endTime: '10:00' })],
      0,
      { minStart: 8, maxEnd: 18 },
    );
    expect(startHour).toBe(8);
    expect(endHour).toBe(18);
    expect(
      blockStyle(
        layoutWeek([entry({ id: 'a', startTime: '09:00', endTime: '10:00' })], 0, {
          minStart: 8,
          maxEnd: 18,
        }).entries[0]!,
        HOUR_PX,
      ).top,
    ).toBe(`${HOUR_PX + 2}px`);
  });

  it('halves the width for two concurrent classes', () => {
    const { entries } = layoutWeek([
      entry({ id: 'a', startTime: '09:00', endTime: '10:00' }),
      entry({ id: 'b', startTime: '09:00', endTime: '10:00', subject: 'Other' }),
    ]);
    const widths = entries.map((e) => blockStyle(e, HOUR_PX).width);
    expect(new Set(widths)).toEqual(new Set(['calc(50% - 6px)']));
  });
});

describe('subjectHue', () => {
  it('is stable for the same subject and differs across subjects', () => {
    expect(subjectHue('Thermodynamics')).toBe(subjectHue('Thermodynamics'));
    expect(subjectHue('Thermodynamics')).not.toBe(subjectHue('Linear Algebra'));
  });

  it('stays within the hue range', () => {
    for (const s of ['A', 'Materials Science Lab', '日本語', 'x'.repeat(80)]) {
      const h = subjectHue(s);
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThan(360);
    }
  });
});

describe('nowLinePx', () => {
  it('returns null outside the visible axis', () => {
    expect(nowLinePx(8, 20, HOUR_PX, 7 * 60)).toBeNull();
    expect(nowLinePx(8, 20, HOUR_PX, 21 * 60)).toBeNull();
  });

  it('maps 14:30 on a 07:00 axis to 7.5 hours of pixels', () => {
    expect(nowLinePx(7, 22, HOUR_PX, 14 * 60 + 30)).toBeCloseTo(7.5 * HOUR_PX);
  });
});

describe('entriesForDay', () => {
  it('sorts by start time, not insertion order', () => {
    const sorted = entriesForDay(
      [
        entry({ id: 'late', startTime: '15:00', endTime: '16:00' }),
        entry({ id: 'early', startTime: '08:30', endTime: '09:30' }),
        entry({ id: 'mid', startTime: '11:00', endTime: '12:00' }),
      ],
      1,
    );
    expect(sorted.map((e) => e.id)).toEqual(['early', 'mid', 'late']);
  });
});
