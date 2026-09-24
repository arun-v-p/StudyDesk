import { useCollection } from './usePersistentState';
import { isValidExamTimetableEntry } from './validators';
import type { ExamTimetableEntry } from '../types';

export const EXAM_TIMETABLE_KEY = 'studydesk.examTimetable';

export function useExamTimetable() {
  return useCollection<ExamTimetableEntry>({
    key: EXAM_TIMETABLE_KEY,
    fallback: [],
    validateItem: isValidExamTimetableEntry,
  });
}

export type ExamStatus = 'upcoming' | 'active' | 'expired';

export function examStatus(exam: ExamTimetableEntry, date: string): ExamStatus {
  if (date < exam.validFrom) return 'upcoming';
  if (date > exam.validUntil) return 'expired';
  return 'active';
}
