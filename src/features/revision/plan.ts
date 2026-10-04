import { format, isResolvableDayKey, toMinutes } from '../../lib/dates';
import type { RevisionPlan, RevisionSession } from '../../types';

export type SessionUpdateResult =
  | { ok: true; plan: RevisionPlan }
  | {
      ok: false;
      reason:
        | 'missing-session'
        | 'invalid-date'
        | 'past-date'
        | 'after-exam'
        | 'invalid-time'
        | 'invalid-duration'
        | 'past-time'
        | 'too-late';
    };

function withUpdatedStatus(
  plan: RevisionPlan,
  sessions: RevisionSession[],
  now: string,
): RevisionPlan {
  const complete = sessions.length > 0 && sessions.every((session) => session.completed);
  return {
    ...plan,
    sessions,
    status: plan.status === 'archived' ? 'archived' : complete ? 'completed' : 'active',
    updatedAt: now,
  };
}

export function editRevisionSession(
  plan: RevisionPlan,
  sessionId: string,
  patch: Partial<Pick<RevisionSession, 'scheduledDate' | 'scheduledTime' | 'durationMinutes'>>,
  todayKey: string,
  now = new Date().toISOString(),
  currentTime = format(new Date(), 'HH:mm'),
): SessionUpdateResult {
  const current = plan.sessions.find((session) => session.id === sessionId);
  if (!current) return { ok: false, reason: 'missing-session' };
  const scheduledDate = patch.scheduledDate ?? current.scheduledDate;
  const scheduledTime = patch.scheduledTime ?? current.scheduledTime;
  if (!isResolvableDayKey(scheduledDate)) return { ok: false, reason: 'invalid-date' };
  if (scheduledDate < todayKey) return { ok: false, reason: 'past-date' };
  if (scheduledDate >= plan.examAt.slice(0, 10)) return { ok: false, reason: 'after-exam' };
  if (toMinutes(scheduledTime) == null) return { ok: false, reason: 'invalid-time' };
  const duration = patch.durationMinutes ?? current.durationMinutes;
  if (!Number.isInteger(duration) || duration < 5 || duration > 480)
    return { ok: false, reason: 'invalid-duration' };
  const startMinutes = toMinutes(scheduledTime)!;
  if (startMinutes + duration > 22 * 60) return { ok: false, reason: 'too-late' };
  if (scheduledDate === todayKey && startMinutes < (toMinutes(currentTime) ?? 0))
    return { ok: false, reason: 'past-time' };
  const sessions = plan.sessions.map((session) =>
    session.id === sessionId ? { ...session, ...patch, updatedAt: now } : session,
  );
  return { ok: true, plan: withUpdatedStatus(plan, sessions, now) };
}

export function completeRevisionSession(
  plan: RevisionPlan,
  sessionId: string,
  completed: boolean,
  now = new Date().toISOString(),
): RevisionPlan {
  const sessions = plan.sessions.map((session) =>
    session.id === sessionId
      ? {
          ...session,
          completed,
          ...(completed ? { completedAt: now } : { completedAt: undefined }),
          updatedAt: now,
        }
      : session,
  );
  return withUpdatedStatus(plan, sessions, now);
}

export function removeRevisionSession(
  plan: RevisionPlan,
  sessionId: string,
  now = new Date().toISOString(),
): RevisionPlan {
  return withUpdatedStatus(
    plan,
    plan.sessions.filter((session) => session.id !== sessionId),
    now,
  );
}
