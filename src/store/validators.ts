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

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const isStr = (v: unknown): v is string => typeof v === 'string';

export function isValidTask(v: unknown): boolean {
  return isRecord(v) && isStr(v.id) && isStr(v.title) && typeof v.completed === 'boolean';
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
