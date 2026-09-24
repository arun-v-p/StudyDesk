/**
 * Timetable layout engine.
 *
 * THE BUG THIS REPLACES
 * ---------------------
 * The original rendered a table over a hardcoded list of hourly strings and
 * matched entries with an exact string comparison:
 *
 *     const timeSlots = ['08:00','09:00', … '20:00'];
 *     entries.find(e => e.day === day && e.startTime === time)
 *
 * Verified against the shipped logic: 5 of 6 plausible entries never rendered.
 *   - a startTime that is not an exact hour in that list is invisible
 *   - anything before 08:00 or after 20:00 is invisible
 *   - endTime is ignored, so a 3-hour lecture occupies one 1-hour row
 *   - `find` returns the first match, so overlapping classes are unreachable
 *
 * THE FIX
 * -------
 * Position blocks absolutely on a continuous minute axis derived from the data,
 * and assign overlap lanes so concurrent classes sit side by side.
 *
 * This module is pure — no React, no DOM, no storage — so it is unit-testable,
 * which is exactly what the original lacked.
 */
import type { TimetableEntry } from '../../types';
import { toMinutes } from '../../lib/dates';

export type { TimetableEntry };
export { toMinutes };

export interface LaidOutEntry extends TimetableEntry {
  /** Offset in minutes from the axis start. */
  topMin: number;
  /** Duration in minutes, floored at MIN_BLOCK_MIN so short blocks stay clickable. */
  heightMin: number;
  /** 0-based column within its overlap cluster. */
  lane: number;
  /** Total lanes in its overlap cluster. */
  lanes: number;
  /** Stable hue for the subject, so a course keeps one colour all week. */
  hue: number;
}

export interface TimetableLayout {
  /** First hour rendered, inclusive. Derived from data, clamped to a sane window. */
  startHour: number;
  /** Last hour rendered, exclusive. */
  endHour: number;
  entries: LaidOutEntry[];
  /** Rejected as unrenderable, so the UI can warn instead of silently hiding them. */
  invalid: TimetableEntry[];
}

export const MIN_BLOCK_MIN = 22;
export const HOUR_PX = 52;

/**
 * Deterministic hue from a subject name: same course -> same colour every week,
 * with no manual picking. The original painted every cell the identical grey,
 * which is the main reason the timetable looked monotone.
 */
export function subjectHue(subject: string): number {
  let h = 0;
  for (let i = 0; i < subject.length; i++) {
    h = (h * 31 + subject.charCodeAt(i)) >>> 0;
  }
  return h % 360;
}

/** HSL palette for a subject hue, tuned per theme for contrast. */
export function subjectColors(hue: number, theme: 'dark' | 'light') {
  return theme === 'dark'
    ? {
        bg: `hsl(${hue} 45% 20%)`,
        border: `hsl(${hue} 40% 32%)`,
        rail: `hsl(${hue} 70% 62%)`,
        fg: `hsl(${hue} 65% 88%)`,
      }
    : {
        bg: `hsl(${hue} 70% 96%)`,
        border: `hsl(${hue} 45% 84%)`,
        rail: `hsl(${hue} 60% 48%)`,
        fg: `hsl(${hue} 60% 24%)`,
      };
}

interface LaneAssignment {
  lane: number;
  lanes: number;
}

/**
 * Greedy sweep to assign overlap lanes. Entries sharing any minute land in the
 * same cluster and get distinct lanes; `lanes` is the cluster width so each
 * block can size itself to `100 / lanes` percent.
 */
function assignLanes(dayEntries: TimetableEntry[]): Map<string, LaneAssignment> {
  const sorted = [...dayEntries].sort(
    (a, b) => (toMinutes(a.startTime) ?? 0) - (toMinutes(b.startTime) ?? 0),
  );

  const result = new Map<string, LaneAssignment>();
  let cluster: { endByLane: number[]; ids: string[] } = { endByLane: [], ids: [] };
  let clusterMax = 0;

  const flush = () => {
    for (const id of cluster.ids) {
      const lane = result.get(id)?.lane ?? 0;
      result.set(id, { lane, lanes: clusterMax });
    }
    cluster = { endByLane: [], ids: [] };
    clusterMax = 0;
  };

  for (const entry of sorted) {
    const start = toMinutes(entry.startTime);
    const end = toMinutes(entry.endTime);
    if (start == null || end == null || end <= start) {
      result.set(entry.id, { lane: 0, lanes: 1 });
      continue;
    }

    const clusterEnd = cluster.endByLane.length ? Math.max(...cluster.endByLane) : -1;
    if (cluster.endByLane.length > 0 && start >= clusterEnd) flush();

    let lane = cluster.endByLane.findIndex((laneEnd) => laneEnd <= start);
    if (lane === -1) {
      lane = cluster.endByLane.length;
      cluster.endByLane.push(end);
    } else {
      cluster.endByLane[lane] = end;
    }

    cluster.ids.push(entry.id);
    clusterMax = Math.max(clusterMax, cluster.endByLane.length);
    result.set(entry.id, { lane, lanes: 1 }); // `lanes` is corrected in flush()
  }
  flush();

  return result;
}

/**
 * Build the week layout.
 *
 * @param padHours margin above the earliest / below the latest class
 * @param bounds   hard clamp so an empty week still shows a usable window
 */
export function layoutWeek(
  entries: TimetableEntry[],
  padHours = 1,
  bounds: { minStart: number; maxEnd: number } = { minStart: 7, maxEnd: 22 },
): TimetableLayout {
  const valid: TimetableEntry[] = [];
  const invalid: TimetableEntry[] = [];

  for (const e of entries) {
    const s = toMinutes(e.startTime);
    const en = toMinutes(e.endTime);
    if (s == null || en == null || en <= s || e.day < 0 || e.day > 6) invalid.push(e);
    else valid.push(e);
  }

  let earliest = bounds.minStart * 60;
  let latest = bounds.maxEnd * 60;
  for (const e of valid) {
    const s = toMinutes(e.startTime);
    const en = toMinutes(e.endTime);
    if (s != null) earliest = Math.min(earliest, s);
    if (en != null) latest = Math.max(latest, en);
  }
  const startHour = Math.max(0, Math.floor((earliest - padHours * 60) / 60));
  const endHour = Math.min(24, Math.ceil((latest + padHours * 60) / 60));

  const laid: LaidOutEntry[] = [];
  for (let day = 0; day <= 6; day++) {
    const dayEntries = valid.filter((e) => e.day === day);
    if (dayEntries.length === 0) continue;
    const lanes = assignLanes(dayEntries);

    for (const e of dayEntries) {
      const start = toMinutes(e.startTime);
      const end = toMinutes(e.endTime);
      if (start == null || end == null) continue;
      const assignment = lanes.get(e.id) ?? { lane: 0, lanes: 1 };

      laid.push({
        ...e,
        topMin: start - startHour * 60,
        heightMin: Math.max(MIN_BLOCK_MIN, end - start),
        lane: assignment.lane,
        lanes: assignment.lanes,
        hue: subjectHue(e.subject),
      });
    }
  }

  return { startHour, endHour, entries: laid, invalid };
}

/**
 * Pixel geometry for a laid-out block. `topMin` is already relative to the axis
 * start, so no startHour is needed here. The ±2/±3px insets leave a 1px gap
 * between adjacent lanes so they read as separate blocks.
 */
export function blockStyle(entry: LaidOutEntry, hourPx = HOUR_PX) {
  const widthPct = 100 / entry.lanes;
  return {
    top: `${(entry.topMin / 60) * hourPx + 2}px`,
    height: `${Math.max(0, (entry.heightMin / 60) * hourPx - 4)}px`,
    left: `calc(${entry.lane * widthPct}% + 3px)`,
    width: `calc(${widthPct}% - 6px)`,
  };
}

/** Minutes since local midnight. */
export function nowMinutes(d = new Date()): number {
  return d.getHours() * 60 + d.getMinutes();
}

/** Offset in px for the current-time line, or null when outside the visible axis. */
export function nowLinePx(
  startHour: number,
  endHour: number,
  hourPx = HOUR_PX,
  now = nowMinutes(),
): number | null {
  if (now < startHour * 60 || now > endHour * 60) return null;
  return ((now - startHour * 60) / 60) * hourPx;
}

/** Entries for a given weekday, ordered by start time. */
export function entriesForDay(entries: TimetableEntry[], day: number): TimetableEntry[] {
  return entries
    .filter((e) => e.day === day)
    .sort((a, b) => (toMinutes(a.startTime) ?? 0) - (toMinutes(b.startTime) ?? 0));
}
