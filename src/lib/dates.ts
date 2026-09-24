/**
 * Date helpers.
 *
 * RULE: day keys are always LOCAL `yyyy-MM-dd`. `new Date(y, m, d).toISOString()`
 * shifts backwards a day in any UTC+ timezone — verified: local 24 Sep in
 * Asia/Shanghai serialises to `2026-09-23`. Never use toISOString() for a day key.
 */
import { format, isToday, isTomorrow, isPast, parseISO } from 'date-fns';

export const DAY_KEY_FORMAT = 'yyyy-MM-dd';

/** Local yyyy-MM-dd. */
export function dayKey(date: Date): string {
  return format(date, DAY_KEY_FORMAT);
}

/** Parse a local yyyy-MM-dd day key back to a Date at local midnight. */
export function fromDayKey(key: string): Date {
  return parseISO(key);
}

/** Local day key `offsetDays` from `from`. */
export function dayKeyOffset(offsetDays: number, from = new Date()): string {
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate() + offsetDays);
  return dayKey(d);
}

/** `HH:mm` -> minutes since local midnight, or null if malformed. */
export function toMinutes(hhmm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm?.trim() ?? '');
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(min) || h > 23 || min > 59) return null;
  return h * 60 + min;
}

/** minutes -> `HH:mm` */
export function fromMinutes(total: number): string {
  const clamped = Math.max(0, Math.min(24 * 60 - 1, Math.round(total)));
  return `${String(Math.floor(clamped / 60)).padStart(2, '0')}:${String(clamped % 60).padStart(2, '0')}`;
}

/**
 * Sort key for a date + optional time. Fixes the audited bug where
 * `dueDate.localeCompare(dueDate)` ignored the time, so a 23:00 deadline
 * sorted before an 08:00 one on the same day.
 */
export function dateTimeKey(date: string, time?: string): string {
  const mins = time ? (toMinutes(time) ?? 24 * 60) : 24 * 60;
  return `${date}T${String(mins).padStart(4, '0')}`;
}

export function isValidDayKey(key: unknown): key is string {
  return typeof key === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(key);
}

/** True when the value is a real, resolvable local day key. Accepts unknown
 *  so validators can pass untrusted parsed JSON straight in. */
export function isResolvableDayKey(key: unknown): key is string {
  if (!isValidDayKey(key)) return false;
  const d = parseISO(key);
  return !Number.isNaN(d.getTime());
}

export { isToday, isTomorrow, isPast, parseISO, format };
