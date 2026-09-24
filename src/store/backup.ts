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

export interface Backup {
  app: 'studydesk';
  schemaVersion: number;
  exportedAt: string;
  data: Record<string, unknown>;
}

export type ImportResult = { ok: true; keys: number } | { ok: false; error: string };

const ALL_KEYS = Object.values(KEYS) as string[];

export function exportBackup(): Backup {
  const data: Record<string, unknown> = {};
  for (const key of ALL_KEYS) {
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
      const entries = Object.entries(backup.data).filter(([k]) => ALL_KEYS.includes(k));
      if (entries.length === 0)
        return { ok: false, error: 'That backup contains no StudyDesk data.' };
      for (const [, value] of entries) {
        if (value !== null && typeof value !== 'object') {
          return { ok: false, error: 'Backup contains an unexpected value type.' };
        }
      }
      for (const [k, value] of entries) storage.setItem(k, JSON.stringify(value));
      return { ok: true, keys: entries.length };
    })
    .catch((err: unknown): ImportResult => ({
      ok: false,
      error: err instanceof Error ? err.message : 'Could not read that file.',
    }));
}

export function clearAllData(): void {
  for (const key of ALL_KEYS) {
    try {
      storage.removeItem(key);
    } catch (err) {
      console.error(`[studydesk] could not clear "${key}"`, err);
    }
  }
}
