import { describe, expect, it } from 'vitest';
import {
  completeRevisionSession,
  editRevisionSession,
  removeRevisionSession,
} from '../src/features/revision/plan';
import type { RevisionPlan } from '../src/types';

const plan: RevisionPlan = {
  id: 'plan-1',
  title: 'Finals',
  examAt: '2026-10-10T09:00',
  subjectIds: ['math'],
  materialIds: [],
  targetSessionMinutes: 45,
  sessions: [
    {
      id: 'session-1',
      subjectId: 'math',
      materialIds: [],
      scheduledDate: '2026-10-01',
      scheduledTime: '09:00',
      durationMinutes: 45,
      completed: false,
      createdAt: '2026-09-30T00:00:00.000Z',
      updatedAt: '2026-09-30T00:00:00.000Z',
    },
  ],
  status: 'active',
  createdAt: '2026-09-30T00:00:00.000Z',
  updatedAt: '2026-09-30T00:00:00.000Z',
};

describe('revision plan sessions', () => {
  it('edits and reschedules a session without changing its identity', () => {
    const result = editRevisionSession(
      plan,
      'session-1',
      { scheduledDate: '2026-10-05', scheduledTime: '14:30', durationMinutes: 60 },
      '2026-10-01',
      '2026-10-01T08:00:00.000Z',
    );
    expect(result).toMatchObject({
      ok: true,
      plan: {
        sessions: [
          {
            id: 'session-1',
            scheduledDate: '2026-10-05',
            scheduledTime: '14:30',
            durationMinutes: 60,
          },
        ],
      },
    });
  });

  it('rejects rescheduling before today or on and after the exam date', () => {
    expect(
      editRevisionSession(plan, 'session-1', { scheduledDate: '2026-09-30' }, '2026-10-01'),
    ).toMatchObject({
      ok: false,
      reason: 'past-date',
    });
    expect(
      editRevisionSession(plan, 'session-1', { scheduledDate: '2026-10-10' }, '2026-10-01'),
    ).toMatchObject({
      ok: false,
      reason: 'after-exam',
    });
  });

  it('rejects same-day times in the past and sessions that end after 22:00', () => {
    expect(
      editRevisionSession(
        plan,
        'session-1',
        { scheduledDate: '2026-10-01', scheduledTime: '11:30' },
        '2026-10-01',
        '2026-10-01T12:00:00.000Z',
        '12:00',
      ),
    ).toMatchObject({ ok: false, reason: 'past-time' });
    expect(
      editRevisionSession(
        plan,
        'session-1',
        { scheduledTime: '21:30', durationMinutes: 60 },
        '2026-10-01',
        '2026-10-01T12:00:00.000Z',
        '12:00',
      ),
    ).toMatchObject({ ok: false, reason: 'too-late' });
  });

  it('completes the plan when all sessions are done and reopens it when undone', () => {
    const completed = completeRevisionSession(plan, 'session-1', true, '2026-10-01T08:00:00.000Z');
    expect(completed.status).toBe('completed');
    expect(completed.sessions[0]?.completedAt).toBe('2026-10-01T08:00:00.000Z');
    expect(completeRevisionSession(completed, 'session-1', false).status).toBe('active');
  });

  it('removes a session and retains the plan as active', () => {
    const removed = removeRevisionSession(plan, 'session-1', '2026-10-01T08:00:00.000Z');
    expect(removed.sessions).toEqual([]);
    expect(removed.status).toBe('active');
  });
});
