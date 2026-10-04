import { describe, expect, it } from 'vitest';
import { generateReviewSchedule } from '../src/features/revision/schedule';

describe('revision schedule generation', () => {
  it('spaces one session per subject across eligible days before the exam', () => {
    const result = generateReviewSchedule(
      ['math', 'biology', 'history'],
      '2026-10-10T14:00',
      new Date(2026, 9, 1, 12),
    );
    expect(result).toEqual({
      ok: true,
      sessions: [
        { subjectId: 'math', scheduledDate: '2026-10-01', scheduledTime: '12:30' },
        { subjectId: 'biology', scheduledDate: '2026-10-05', scheduledTime: '09:00' },
        { subjectId: 'history', scheduledDate: '2026-10-09', scheduledTime: '09:00' },
      ],
    });
  });

  it('does not schedule sessions on the exam day', () => {
    expect(
      generateReviewSchedule(['math'], '2026-10-02T09:00', new Date(2026, 9, 1)),
    ).toMatchObject({
      ok: true,
      sessions: [{ scheduledDate: '2026-10-01' }],
    });
  });

  it('explains when the exam is today or in the past', () => {
    const today = new Date(2026, 9, 1, 8);
    expect(generateReviewSchedule(['math'], '2026-10-01T09:00', today)).toMatchObject({
      ok: false,
      reason: 'exam-today',
    });
    expect(generateReviewSchedule(['math'], '2026-09-30T09:00', today)).toMatchObject({
      ok: false,
      reason: 'past-exam',
    });
  });

  it('reports the number of days when subjects cannot fit before exam day', () => {
    expect(
      generateReviewSchedule(['math', 'biology'], '2026-10-02T09:00', new Date(2026, 9, 1)),
    ).toEqual({ ok: false, reason: 'insufficient-days', availableDays: 1 });
  });

  it('does not schedule today when the target session would finish after 22:00', () => {
    expect(
      generateReviewSchedule(['math'], '2026-10-02T09:00', new Date(2026, 9, 1, 21, 30), 60),
    ).toEqual({ ok: false, reason: 'insufficient-days', availableDays: 0 });
  });

  it('reports malformed local exam date/time explicitly', () => {
    expect(
      generateReviewSchedule(['math'], '2026-10-01T25:00', new Date(2026, 8, 30)),
    ).toMatchObject({
      ok: false,
      reason: 'invalid-exam',
    });
  });
});
