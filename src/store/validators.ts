/**
 * Per-record validators. `readStorage` uses these to drop individual corrupt
 * rows instead of crashing the whole app — the shipped build had no validation
 * at all, and a wrong top-level type white-screened it permanently.
 *
 * These are deliberately permissive: they reject only what would actually throw
 * during render, and let `migrations`/defaults repair anything merely missing.
 */
import { isResolvableDayKey, toMinutes } from '../lib/dates';
import { CATEGORIES, PRIORITIES } from '../types';
import { isValidMinutes } from '../features/tasks/workload';

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const isStr = (v: unknown): v is string => typeof v === 'string';

export function isValidTask(v: unknown): boolean {
  if (!isRecord(v) || !isStr(v.id) || !isStr(v.title) || typeof v.completed !== 'boolean')
    return false;
  if (v.estimatedMinutes !== undefined && !isValidMinutes(v.estimatedMinutes)) return false;
  if (v.actualFocusMinutes !== undefined && !isValidMinutes(v.actualFocusMinutes)) return false;
  if (v.subtasks !== undefined && (!Array.isArray(v.subtasks) || !v.subtasks.every(isValidSubtask)))
    return false;
  return true;
}

function isValidSubtask(v: unknown): boolean {
  return (
    isRecord(v) &&
    isStr(v.id) &&
    isStr(v.title) &&
    (v.completed === undefined || typeof v.completed === 'boolean')
  );
}

export function isValidDeadline(v: unknown): boolean {
  return (
    isRecord(v) &&
    isStr(v.id) &&
    isStr(v.title) &&
    isResolvableDayKey(v.dueDate) &&
    (v.priority === undefined || PRIORITIES.includes(v.priority as never))
  );
}

export function isValidTimetableEntry(v: unknown): boolean {
  if (!isRecord(v) || !isStr(v.id) || !isStr(v.subject)) return false;
  if (typeof v.day !== 'number' || v.day < 0 || v.day > 6) return false;
  if (!isStr(v.startTime) || toMinutes(v.startTime) == null) return false;
  if (!isStr(v.endTime) || toMinutes(v.endTime) == null) return false;
  return true;
}

export function isValidExamTimetableEntry(v: unknown): boolean {
  if (!isRecord(v) || !isStr(v.id) || !isStr(v.subject)) return false;
  if (v.courseCode !== undefined && !isStr(v.courseCode)) return false;
  if (v.semester !== undefined && !isStr(v.semester)) return false;
  if (v.completed !== undefined && typeof v.completed !== 'boolean') return false;
  if (!isResolvableDayKey(v.date)) return false;
  if (!isStr(v.startTime) || toMinutes(v.startTime) == null) return false;
  if (!isStr(v.endTime) || toMinutes(v.endTime) == null) return false;
  if (!isResolvableDayKey(v.validFrom) || !isResolvableDayKey(v.validUntil)) return false;
  if (v.validUntil < v.validFrom) return false;
  return true;
}

export function isValidNote(v: unknown): boolean {
  return isRecord(v) && isStr(v.id) && isStr(v.title);
}

export function isValidMaterialSubject(v: unknown): boolean {
  return isRecord(v) && isStr(v.id) && isStr(v.name) && isStr(v.createdAt) && isStr(v.updatedAt);
}

export function isValidMaterialFolder(v: unknown): boolean {
  return (
    isRecord(v) &&
    isStr(v.id) &&
    isStr(v.subjectId) &&
    isStr(v.name) &&
    (v.parentFolderId === null || isStr(v.parentFolderId)) &&
    isStr(v.createdAt) &&
    isStr(v.updatedAt)
  );
}

export function isValidMaterialFile(v: unknown): boolean {
  return (
    isRecord(v) &&
    isStr(v.id) &&
    isStr(v.subjectId) &&
    (v.folderId === null || isStr(v.folderId)) &&
    isStr(v.blobId) &&
    isStr(v.name) &&
    (v.kind === 'pdf' || v.kind === 'txt' || v.kind === 'md' || v.kind === 'docx') &&
    isStr(v.mimeType) &&
    typeof v.sizeBytes === 'number' &&
    Number.isFinite(v.sizeBytes) &&
    v.sizeBytes >= 0 &&
    typeof v.lastModified === 'number' &&
    Number.isFinite(v.lastModified) &&
    v.lastModified >= 0 &&
    isStr(v.createdAt) &&
    isStr(v.updatedAt)
  );
}

export function isValidPlannerEntry(v: unknown): boolean {
  return (
    isRecord(v) &&
    isStr(v.id) &&
    isStr(v.title) &&
    isResolvableDayKey(v.date) &&
    (v.category === undefined || CATEGORIES.includes(v.category as never))
  );
}

export function isValidCalendarEvent(v: unknown): boolean {
  if (
    !isRecord(v) ||
    !isStr(v.id) ||
    !isStr(v.title) ||
    !isStr(v.description) ||
    !isStr(v.location) ||
    !isResolvableDayKey(v.startDate) ||
    !isResolvableDayKey(v.endDate) ||
    typeof v.allDay !== 'boolean' ||
    !isStr(v.createdAt) ||
    !isStr(v.updatedAt)
  )
    return false;
  if (v.endDate < v.startDate || (v.uid !== undefined && !isStr(v.uid))) return false;
  if (v.allDay) return v.startTime === undefined && v.endTime === undefined;
  return (
    isStr(v.startTime) &&
    toMinutes(v.startTime) != null &&
    (v.endTime === undefined || (isStr(v.endTime) && toMinutes(v.endTime) != null))
  );
}

export function isValidSemesterTemplate(v: unknown): boolean {
  return (
    isRecord(v) &&
    isStr(v.id) &&
    isStr(v.name) &&
    v.name.trim().length > 0 &&
    Array.isArray(v.timetable) &&
    v.timetable.every(
      (entry) =>
        isRecord(entry) &&
        typeof entry.day === 'number' &&
        entry.day >= 0 &&
        entry.day <= 6 &&
        isStr(entry.startTime) &&
        toMinutes(entry.startTime) != null &&
        isStr(entry.endTime) &&
        toMinutes(entry.endTime) != null &&
        isStr(entry.subject) &&
        isStr(entry.room) &&
        isStr(entry.note),
    ) &&
    isStr(v.createdAt) &&
    isStr(v.updatedAt)
  );
}

export function isValidRevisionPlan(v: unknown): boolean {
  if (
    !isRecord(v) ||
    !isStr(v.id) ||
    !isStr(v.title) ||
    !isValidLocalDateTime(v.examAt) ||
    !Array.isArray(v.subjectIds) ||
    !v.subjectIds.every(isStr) ||
    !Array.isArray(v.materialIds) ||
    !v.materialIds.every(isStr) ||
    !Number.isInteger(v.targetSessionMinutes) ||
    (v.targetSessionMinutes as number) < 5 ||
    (v.targetSessionMinutes as number) > 480 ||
    !Array.isArray(v.sessions) ||
    !v.sessions.every(isValidRevisionSession) ||
    !['active', 'completed', 'archived'].includes(String(v.status)) ||
    !isStr(v.createdAt) ||
    !isStr(v.updatedAt)
  )
    return false;
  return true;
}

function isValidLocalDateTime(value: unknown): value is string {
  if (!isStr(value)) return false;
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})$/.exec(value);
  return Boolean(match && isResolvableDayKey(match[1]!) && toMinutes(match[2]!) != null);
}

function isValidRevisionSession(v: unknown): boolean {
  return (
    isRecord(v) &&
    isStr(v.id) &&
    isStr(v.subjectId) &&
    Array.isArray(v.materialIds) &&
    v.materialIds.every(isStr) &&
    isResolvableDayKey(v.scheduledDate) &&
    isStr(v.scheduledTime) &&
    toMinutes(v.scheduledTime) != null &&
    Number.isInteger(v.durationMinutes) &&
    (v.durationMinutes as number) >= 5 &&
    (v.durationMinutes as number) <= 480 &&
    typeof v.completed === 'boolean' &&
    (v.completedAt === undefined || isStr(v.completedAt)) &&
    isStr(v.createdAt) &&
    isStr(v.updatedAt)
  );
}
