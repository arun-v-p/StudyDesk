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
import { MATERIALS_KEY, materialBlobs } from './materials';
import { TIMER_STORAGE_KEY } from '../features/timer/usePomodoro';
import { createArchive, parseArchive, type ArchiveProgress, type BlobEntry } from './archive';

export interface Backup {
  app: 'studydesk';
  schemaVersion: number;
  exportedAt: string;
  data: Record<string, unknown>;
}

export type RestoreSnapshot = { storage: Record<string, string | null>; blobs?: BlobEntry[] };
export type ImportResult =
  | { ok: true; keys: number; attachments: number; legacy: boolean; snapshot: RestoreSnapshot }
  | { ok: false; error: string };

// These are all localStorage records. Material bytes are added separately to complete ZIP archives.
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

export async function downloadBackup(
  onProgress?: (progress: ArchiveProgress) => void,
): Promise<void> {
  const blob = await createArchive(
    exportBackup().data,
    import.meta.env.VITE_APP_VERSION,
    onProgress,
  );
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `studydesk-backup-${new Date().toISOString().slice(0, 10)}.zip`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/**
 * Validates the whole file BEFORE writing anything, so a bad import cannot
 * brick the app the way an unvalidated read does.
 */
function validateData(data: unknown): Record<string, unknown> {
  if (!data || typeof data !== 'object' || Array.isArray(data))
    throw new Error('Archive metadata is not an object.');
  const entries = Object.entries(data as Record<string, unknown>).filter(([k]) =>
    BACKUP_KEYS.includes(k),
  );
  if (!entries.length) throw new Error('That backup contains no StudyDesk data.');
  for (const [, value] of entries)
    if (value !== null && typeof value !== 'object')
      throw new Error('Backup contains an unexpected value type.');
  return Object.fromEntries(entries);
}

export const downloadCompleteBackup = downloadBackup;

function snapshotStorage(): Record<string, string | null> {
  const keys = new Set(BACKUP_KEYS);
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (key?.startsWith('studydesk.')) keys.add(key);
  }
  return Object.fromEntries([...keys].map((key) => [key, storage.getItem(key)]));
}

async function snapshotBlobs(): Promise<BlobEntry[]> {
  const ids = await materialBlobs.listIds();
  const results = await Promise.all(
    ids.map(async (id) => ({ id, blob: await materialBlobs.get(id) })),
  );
  return results.filter((entry): entry is BlobEntry => entry.blob instanceof Blob);
}

async function commitRestore(
  data: Record<string, unknown>,
  blobs: BlobEntry[],
  legacy: boolean,
  onProgress?: (progress: ArchiveProgress) => void,
): Promise<ImportResult> {
  // Legacy JSON never contained files. Keep the existing blob store untouched so it
  // cannot silently delete a user's local attachments.
  const snapshot: RestoreSnapshot = legacy
    ? { storage: snapshotStorage() }
    : { storage: snapshotStorage(), blobs: await snapshotBlobs() };
  try {
    onProgress?.({
      phase: 'writing',
      completed: 0,
      total: blobs.length,
      message: 'Replacing local data…',
    });
    for (const key of Object.keys(snapshot.storage)) storage.removeItem(key);
    for (const [key, value] of Object.entries(data)) storage.setItem(key, JSON.stringify(value));
    if (!legacy) await materialBlobs.replaceAll(blobs);
    onProgress?.({
      phase: 'complete',
      completed: blobs.length,
      total: blobs.length,
      message: 'Restore complete.',
    });
    return {
      ok: true,
      keys: Object.keys(data).length,
      attachments: blobs.length,
      legacy,
      snapshot,
    };
  } catch (error) {
    await restoreSnapshot(snapshot).catch(() => undefined);
    return {
      ok: false,
      error:
        `Restore failed; your existing data was kept. ${error instanceof Error ? error.message : ''}`.trim(),
    };
  }
}

export async function importBackup(
  file: File,
  onProgress?: (progress: ArchiveProgress) => void,
): Promise<ImportResult> {
  if (file.name.toLowerCase().endsWith('.zip') || file.type === 'application/zip') {
    try {
      const parsed = await parseArchive(file, validateData, onProgress);
      return commitRestore(parsed.data, parsed.blobs, false, onProgress);
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : 'Could not read that archive.',
      };
    }
  }
  try {
    const text = await file.text();
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      return { ok: false, error: 'That file is not valid JSON.' };
    }
    const backup = parsed as Partial<Backup>;
    if (backup.app !== 'studydesk' || !backup.data || typeof backup.data !== 'object')
      return { ok: false, error: 'That file is not a StudyDesk backup.' };
    return commitRestore(validateData(backup.data), [], true, onProgress);
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Could not read that file.',
    };
  }
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

function isRestoreSnapshot(
  snapshot: RestoreSnapshot | Record<string, string | null>,
): snapshot is RestoreSnapshot {
  return typeof (snapshot as RestoreSnapshot).storage === 'object';
}

export async function restoreSnapshot(
  snapshot: RestoreSnapshot | Record<string, string | null>,
): Promise<void> {
  const storageSnapshot = isRestoreSnapshot(snapshot) ? snapshot.storage : snapshot;
  for (const [key, value] of Object.entries(storageSnapshot)) {
    if (value == null) storage.removeItem(key);
    else storage.setItem(key, value);
  }
  if (isRestoreSnapshot(snapshot) && snapshot.blobs) await materialBlobs.replaceAll(snapshot.blobs);
}

export function pickBackupFile(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/zip,.zip,application/json,.json';
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
