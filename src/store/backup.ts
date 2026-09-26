/**
 * Export / import.
 *
 * The original had no way to get data out. localStorage is per-origin and
 * per-browser: clearing site data, switching browser, or moving the site to a
 * custom domain loses everything permanently and silently.
 */
import { KEYS } from './AppStore';
import { SCHEMA_VERSION } from './usePersistentState';
import { storage } from '../lib/safeStorage';
import { EXAM_TIMETABLE_KEY } from './examTimetable';
import { MATERIALS_KEY } from './materials';
import { TIMER_STORAGE_KEY } from '../features/timer/usePomodoro';

export interface Backup {
  app: 'studydesk';
  schemaVersion: number;
  exportedAt: string;
  data: Record<string, unknown>;
}

export type ImportResult =
  | { ok: true; keys: number; snapshot: Record<string, string | null> }
  | { ok: false; error: string };

// Materials metadata is backed up; IndexedDB file blobs are not, so restored records can reference absent blobs.
const BACKUP_KEYS = [...Object.values(KEYS), EXAM_TIMETABLE_KEY, MATERIALS_KEY, TIMER_STORAGE_KEY];

export function exportBackup(): Backup {
  const data: Record<string, unknown> = {};
  for (const key of BACKUP_KEYS) {
    const raw = storage.getItem(key);
    if (raw == null) continue;
    try {
      data[key] = JSON.parse(raw);
    } catch {
      data[key] = { corrupt: true, raw };
    }
  }
  return {
    app: 'studydesk',
    schemaVersion: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    data,
  };
}

export function downloadBackup(): void {
  const blob = new Blob([JSON.stringify(exportBackup(), null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `studydesk-backup-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/**
 * Validates the whole file BEFORE writing anything, so a bad import cannot
 * brick the app the way an unvalidated read does.
 */
export function importBackup(file: File): Promise<ImportResult> {
  return file
    .text()
    .then((text): ImportResult => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        return { ok: false, error: 'That file is not valid JSON.' };
      }
      const backup = parsed as Partial<Backup>;
      if (backup?.app !== 'studydesk' || !backup.data || typeof backup.data !== 'object') {
        return { ok: false, error: 'That file is not a StudyDesk backup.' };
      }
      const entries = Object.entries(backup.data).filter(([k]) => BACKUP_KEYS.includes(k));
      if (entries.length === 0)
        return { ok: false, error: 'That backup contains no StudyDesk data.' };
      for (const [, value] of entries) {
        if (value !== null && typeof value !== 'object') {
          return { ok: false, error: 'Backup contains an unexpected value type.' };
        }
      }
      const snapshot = Object.fromEntries(entries.map(([key]) => [key, storage.getItem(key)]));
      for (const [k, value] of entries) storage.setItem(k, JSON.stringify(value));
      return { ok: true, keys: entries.length, snapshot };
    })
    .catch((err: unknown): ImportResult => ({
      ok: false,
      error: err instanceof Error ? err.message : 'Could not read that file.',
    }));
}

export function clearAllData(): void {
  for (const key of BACKUP_KEYS) {
    try {
      storage.removeItem(key);
    } catch (err) {
      console.error(`[studydesk] could not clear "${key}"`, err);
    }
  }
  const remainingKeys = Array.from({ length: storage.length }, (_, index) =>
    storage.key(index),
  ).filter((key): key is string => key != null && key.startsWith('studydesk.'));
  for (const key of remainingKeys) {
    try {
      storage.removeItem(key);
    } catch (err) {
      console.error(`[studydesk] could not clear "${key}"`, err);
    }
  }
  try {
    globalThis.indexedDB?.deleteDatabase('studydesk-materials');
  } catch {
    // Clearing browser data is best effort when IndexedDB is unavailable.
  }
}

export function restoreSnapshot(snapshot: Record<string, string | null>): void {
  for (const [key, value] of Object.entries(snapshot)) {
    if (value == null) storage.removeItem(key);
    else storage.setItem(key, value);
  }
}

export function pickBackupFile(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.className = 'sr-only';
    input.setAttribute('aria-hidden', 'true');
    const finish = (file: File | null) => {
      input.remove();
      resolve(file);
    };
    input.addEventListener('change', () => finish(input.files?.[0] ?? null), { once: true });
    input.addEventListener('cancel', () => finish(null), { once: true });
    document.body.appendChild(input);
    input.click();
  });
}
