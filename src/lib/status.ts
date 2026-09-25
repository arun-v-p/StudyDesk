/**
 * ONE implementation of deadline status.
 *
 * The audited build had this logic copy-pasted into Today.tsx and
 * Deadlines.tsx under two different names. Keeping a single source of truth is
 * what stops them drifting apart.
 */
import { addDays, isSameDay, parseISO } from 'date-fns';
import { dateTimeKey, isResolvableDayKey, toMinutes } from './dates';
import type { Deadline } from '../types';

export type DeadlineStatus = 'overdue' | 'today' | 'tomorrow' | 'upcoming' | 'done';

export const STATUS_LABEL: Record<DeadlineStatus, string> = {
  overdue: 'Overdue',
  today: 'Due today',
  tomorrow: 'Due tomorrow',
  upcoming: 'Upcoming',
  done: 'Completed',
};

/** Semantic chip tone per status — maps straight onto the token colours. */
export const STATUS_TONE: Record<
  DeadlineStatus,
  'danger' | 'warning' | 'info' | 'success' | 'neutral'
> = {
  overdue: 'danger',
  today: 'warning',
  tomorrow: 'info',
  upcoming: 'neutral',
  done: 'success',
};

/**
 * A deadline is overdue only once its actual due moment has passed. The audited
 * version compared against local midnight, so a deadline due today at 09:00
 * still read "Due today" nine hours after it slipped.
 */
export function deadlineStatus(
  deadline: Pick<Deadline, 'completed' | 'dueDate' | 'dueTime'>,
  now = new Date(),
): DeadlineStatus {
  if (deadline.completed) return 'done';
  if (!isResolvableDayKey(deadline.dueDate)) return 'upcoming';

  const due = parseISO(deadline.dueDate);
  const mins = toMinutes(deadline.dueTime);
  if (mins != null) due.setHours(Math.floor(mins / 60), mins % 60, 0, 0);
  else due.setHours(23, 59, 59, 999); // all-day: slips at the end of the day

  if (due.getTime() <= now.getTime()) return 'overdue';
  if (isSameDay(due, now)) return 'today';
  if (isSameDay(due, addDays(now, 1))) return 'tomorrow';
  return 'upcoming';
}

/** Human relative time: "2 days overdue", "in 3 days", "7h left". */
export function relativeDue(
  deadline: Pick<Deadline, 'dueDate' | 'dueTime' | 'completed'>,
  now = new Date(),
): string {
  if (!isResolvableDayKey(deadline.dueDate)) return '';
  const due = parseISO(deadline.dueDate);
  const mins = toMinutes(deadline.dueTime);
  if (mins != null) due.setHours(Math.floor(mins / 60), mins % 60, 0, 0);
  else due.setHours(23, 59, 59, 999);

  const diffMs = due.getTime() - now.getTime();
  const abs = Math.abs(diffMs);
  const past = diffMs < 0;
  const MIN = 60_000;
  const HOUR = 60 * MIN;
  const DAY = 24 * HOUR;

  const plural = (value: number, one: string, many: string) => (value === 1 ? one : many);
  const fmt = (value: number, one: string, many: string) =>
    `${past ? '' : 'in '}${value} ${plural(value, one, many)}${past ? ' overdue' : ''}`;

  if (abs < HOUR) return fmt(Math.max(1, Math.round(abs / MIN)), 'minute', 'minutes');
  if (abs < DAY) return fmt(Math.max(1, Math.round(abs / HOUR)), 'hour', 'hours');
  if (abs < 30 * DAY) return fmt(Math.round(abs / DAY), 'day', 'days');
  return fmt(Math.round(abs / (30 * DAY)), 'month', 'months');
}

/** Stable ordering: incomplete first, then by composed date+time. */
export function sortDeadlines(list: Deadline[]): Deadline[] {
  return [...list].sort((a, b) => {
    if (a.completed !== b.completed) return a.completed ? 1 : -1;
    return dateTimeKey(a.dueDate, a.dueTime).localeCompare(dateTimeKey(b.dueDate, b.dueTime));
  });
}
