import { addDays, differenceInCalendarDays } from 'date-fns';
import { dayKey, fromDayKey, fromMinutes, isResolvableDayKey, toMinutes } from '../../lib/dates';

export interface ScheduledReview {
  subjectId: string;
  scheduledDate: string;
  scheduledTime: string;
}

export type ScheduleResult =
  | { ok: true; sessions: ScheduledReview[] }
  | {
      ok: false;
      reason:
        | 'invalid-exam'
        | 'invalid-start-time'
        | 'past-exam'
        | 'exam-today'
        | 'no-subjects'
        | 'insufficient-days';
      availableDays: number;
    };

function isValidLocalExamDateTime(value: string): boolean {
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})$/.exec(value);
  return Boolean(match && isResolvableDayKey(match[1]!) && toMinutes(match[2]!) != null);
}

/** Allocate one review per subject, evenly across eligible local days before exam day. */
export function generateReviewSchedule(
  subjectIds: string[],
  examAt: string,
  today = new Date(),
  sessionDurationMinutes = 45,
  preferredStartTime = '09:00',
): ScheduleResult {
  if (subjectIds.length === 0) return { ok: false, reason: 'no-subjects', availableDays: 0 };
  if (!isValidLocalExamDateTime(examAt))
    return { ok: false, reason: 'invalid-exam', availableDays: 0 };
  const preferredStartMinutes = toMinutes(preferredStartTime);
  if (preferredStartMinutes == null || preferredStartMinutes + sessionDurationMinutes > 22 * 60)
    return { ok: false, reason: 'invalid-start-time', availableDays: 0 };

  const todayKey = dayKey(today);
  const examDate = examAt.slice(0, 10);
  if (examDate < todayKey) return { ok: false, reason: 'past-exam', availableDays: 0 };
  if (examDate === todayKey) return { ok: false, reason: 'exam-today', availableDays: 0 };

  const currentMinutes = today.getHours() * 60 + today.getMinutes();
  const sameDayMinutes = Math.max(preferredStartMinutes, Math.ceil((currentMinutes + 1) / 30) * 30);
  const canUseToday = sameDayMinutes + sessionDurationMinutes <= 22 * 60;
  const firstStudyDate = canUseToday ? todayKey : dayKey(addDays(fromDayKey(todayKey), 1));
  const firstStudyTime = canUseToday ? fromMinutes(sameDayMinutes) : preferredStartTime;
  const lastStudyDay = fromDayKey(examDate);
  lastStudyDay.setDate(lastStudyDay.getDate() - 1);
  const availableDays = Math.max(
    0,
    differenceInCalendarDays(lastStudyDay, fromDayKey(firstStudyDate)) + 1,
  );
  if (subjectIds.length > availableDays)
    return { ok: false, reason: 'insufficient-days', availableDays };

  const sessions = subjectIds.map((subjectId, index) => {
    const dayOffset =
      subjectIds.length === 1
        ? 0
        : Math.round((index * (availableDays - 1)) / (subjectIds.length - 1));
    return {
      subjectId,
      scheduledDate: dayKey(addDays(fromDayKey(firstStudyDate), dayOffset)),
      scheduledTime: dayOffset === 0 ? firstStudyTime : preferredStartTime,
    };
  });
  return { ok: true, sessions };
}
