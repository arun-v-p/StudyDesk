import { describe, expect, it } from 'vitest';
import { examStatus } from '../src/store/examTimetable';
import { isValidExamTimetableEntry } from '../src/store/validators';
import type { ExamTimetableEntry } from '../src/types';

const exam: ExamTimetableEntry = {
  id: 'exam-1',
  subject: 'Linear Algebra',
  date: '2026-10-20',
  startTime: '09:00',
  endTime: '12:00',
  room: 'A-101',
  note: '',
  validFrom: '2026-10-01',
  validUntil: '2026-10-31',
};

describe('Exam Timetable', () => {
  it('derives upcoming, active, and expired from validity dates', () => {
    expect(examStatus(exam, '2026-09-30')).toBe('upcoming');
    expect(examStatus(exam, '2026-10-01')).toBe('active');
    expect(examStatus(exam, '2026-10-31')).toBe('active');
    expect(examStatus(exam, '2026-11-01')).toBe('expired');
  });

  it('validates exam entries independently of regular timetable entries', () => {
    expect(isValidExamTimetableEntry(exam)).toBe(true);
    expect(isValidExamTimetableEntry({ ...exam, validUntil: '2026-09-01' })).toBe(false);
    expect(isValidExamTimetableEntry({ ...exam, date: 'not-a-date' })).toBe(false);
  });
});
