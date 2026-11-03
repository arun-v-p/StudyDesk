/**
 * Export / import.
 *
 * The original had no way to get data out. localStorage is per-origin and
 * per-browser: clearing site data, switching browser, or moving the site to a
 * custom domain loses everything permanently and silently.
 */
import { KEYS } from './AppStore';
import { SCHEMA_VERSION } from './usePersistentState';
import {
  getActiveStorageProfile,
  storageForProfile,
  type StorageProfileId,
} from '../lib/safeStorage';
import { EXAM_TIMETABLE_KEY } from './examTimetable';
import { deleteMaterialDatabase, MATERIALS_KEY, materialBlobs } from './materials';
import { TIMER_STORAGE_KEY } from '../features/timer/usePomodoro';
import { createArchive, parseArchive, type ArchiveProgress, type BlobEntry } from './archive';
import { createId } from '../lib/id';
import { announceLocalStorageChange } from '../lib/localChanges';

export interface Backup {
  app: 'studydesk';
  schemaVersion: number;
  exportedAt: string;
  data: Record<string, unknown>;
}

export type RestoreSnapshot = {
  storage: Record<string, string | null>;
  blobs?: BlobEntry[];
  profileId?: StorageProfileId;
};
export type ImportResult =
  | { ok: true; keys: number; attachments: number; legacy: boolean; snapshot: RestoreSnapshot }
  | { ok: false; error: string };

// These are all localStorage records. Material bytes are added separately to complete ZIP archives.
const BACKUP_KEYS = [...Object.values(KEYS), EXAM_TIMETABLE_KEY, MATERIALS_KEY, TIMER_STORAGE_KEY];

export function exportBackup(profileId: StorageProfileId = getActiveStorageProfile()): Backup {
  const data: Record<string, unknown> = {};
  const profileStorage = storageForProfile(profileId);
  for (const key of BACKUP_KEYS) {
    const raw = profileStorage.getItem(key);
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
  const profileId = getActiveStorageProfile();
  const blob = await createArchive(
    exportBackup(profileId).data,
    import.meta.env.VITE_APP_VERSION,
    onProgress,
    profileId,
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

function snapshotStorage(profileId: StorageProfileId): Record<string, string | null> {
  const profileStorage = storageForProfile(profileId);
  const keys = new Set(BACKUP_KEYS);
  for (let index = 0; index < profileStorage.length; index += 1) {
    const key = profileStorage.key(index);
    if (key?.startsWith('studydesk.')) keys.add(key);
  }
  return Object.fromEntries([...keys].map((key) => [key, profileStorage.getItem(key)]));
}

async function snapshotBlobs(profileId: StorageProfileId): Promise<BlobEntry[]> {
  const profileBlobs = materialBlobs.forProfile(profileId);
  const ids = await profileBlobs.listIds();
  const results = await Promise.all(
    ids.map(async (id) => ({ id, blob: await profileBlobs.get(id) })),
  );
  return results.filter((entry): entry is BlobEntry => entry.blob instanceof Blob);
}

async function commitRestore(
  data: Record<string, unknown>,
  blobs: BlobEntry[],
  legacy: boolean,
  profileId: StorageProfileId,
  onProgress?: (progress: ArchiveProgress) => void,
): Promise<ImportResult> {
  const profileStorage = storageForProfile(profileId);
  const profileBlobs = materialBlobs.forProfile(profileId);
  // Legacy JSON never contained files. Keep the existing blob store untouched so it
  // cannot silently delete a user's local attachments.
  const snapshot: RestoreSnapshot = legacy
    ? { storage: snapshotStorage(profileId), profileId }
    : { storage: snapshotStorage(profileId), blobs: await snapshotBlobs(profileId), profileId };
  try {
    onProgress?.({
      phase: 'writing',
      completed: 0,
      total: blobs.length,
      message: 'Replacing local data…',
    });
    for (const key of Object.keys(snapshot.storage)) profileStorage.removeItem(key);
    for (const [key, value] of Object.entries(data)) {
      if (!profileStorage.setItem(key, JSON.stringify(value))) {
        throw new Error(profileStorage.reason ?? `Could not persist "${key}".`);
      }
    }
    if (!legacy) await profileBlobs.replaceAll(blobs);
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
    await restoreSnapshotForProfile(snapshot, profileId).catch(() => undefined);
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
  const profileId = getActiveStorageProfile();
  if (file.name.toLowerCase().endsWith('.zip') || file.type === 'application/zip') {
    try {
      const parsed = await parseArchive(file, validateData, onProgress);
      return commitRestore(parsed.data, parsed.blobs, false, profileId, onProgress);
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
    return commitRestore(validateData(backup.data), [], true, profileId, onProgress);
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Could not read that file.',
    };
  }
}

function decodedValue(raw: string | null): unknown {
  if (raw === null) return undefined;
  const parsed: unknown = JSON.parse(raw);
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed) && 'data' in parsed
    ? (parsed as { data: unknown }).data
    : parsed;
}

function encodedValue(raw: string | null, value: unknown): string {
  if (raw !== null) {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && 'data' in parsed) {
      return JSON.stringify({ ...(parsed as Record<string, unknown>), data: value });
    }
  }
  return JSON.stringify(value);
}

function recordId(value: unknown): string | null {
  return typeof value === 'object' &&
    value !== null &&
    typeof (value as { id?: unknown }).id === 'string'
    ? (value as { id: string }).id
    : null;
}

function mergeRecords(target: unknown, guest: unknown): unknown[] {
  const current = Array.isArray(target) ? target : [];
  const incoming = Array.isArray(guest) ? guest : [];
  const seen = new Set(current.map(recordId).filter((id): id is string => id !== null));
  return [
    ...current,
    ...incoming.filter((record) => {
      const id = recordId(record);
      if (id === null) return true;
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    }),
  ];
}

function mergeObject(target: unknown, guest: unknown): unknown {
  if (target == null) return guest;
  if (
    typeof target !== 'object' ||
    Array.isArray(target) ||
    typeof guest !== 'object' ||
    guest === null ||
    Array.isArray(guest)
  ) {
    return target;
  }
  return { ...(guest as Record<string, unknown>), ...(target as Record<string, unknown>) };
}

export function guestProfileRecordCount(): number {
  const guest = storageForProfile(null);
  return BACKUP_KEYS.reduce((count, key) => {
    try {
      const value = decodedValue(guest.getItem(key));
      if (Array.isArray(value)) return count + value.length;
      if (key === MATERIALS_KEY && value && typeof value === 'object') {
        const materialData = value as {
          subjects?: unknown[];
          folders?: unknown[];
          files?: unknown[];
        };
        return (
          count +
          (materialData.subjects?.length ?? 0) +
          (materialData.folders?.length ?? 0) +
          (materialData.files?.length ?? 0)
        );
      }
      return count + (value == null ? 0 : 1);
    } catch {
      return count;
    }
  }, 0);
}

/** Explicitly merge guest data into the authenticated profile without replacing its records. */
export async function importGuestProfileIntoActive(): Promise<{
  records: number;
  attachments: number;
}> {
  const profileId = getActiveStorageProfile();
  if (profileId === null) throw new Error('Sign in before importing guest data.');
  const guestStorage = storageForProfile(null);
  const profileStorage = storageForProfile(profileId);
  const guestMaterials = decodedValue(guestStorage.getItem(MATERIALS_KEY)) as
    | { subjects?: unknown[]; folders?: unknown[]; files?: Array<Record<string, unknown>> }
    | undefined;
  const profileMaterials = decodedValue(profileStorage.getItem(MATERIALS_KEY)) as
    | { subjects?: unknown[]; folders?: unknown[]; files?: Array<Record<string, unknown>> }
    | undefined;
  const profileFileIds = new Set((profileMaterials?.files ?? []).map(recordId));
  const guestFiles = (guestMaterials?.files ?? []).filter((file) => {
    const id = recordId(file);
    return id !== null && !profileFileIds.has(id);
  });
  const guestBlobs = materialBlobs.forProfile(null);
  const profileBlobs = materialBlobs.forProfile(profileId);
  const blobWrites: Array<{ id: string; blob: Blob }> = [];
  const remappedFiles: unknown[] = [];

  for (const file of guestFiles) {
    const blobId = file.blobId;
    if (typeof blobId !== 'string' || blobId.length === 0) {
      throw new Error('Guest material metadata contains an invalid attachment reference.');
    }
    const blob = await guestBlobs.get(blobId);
    if (!blob) {
      throw new Error(
        `Guest attachment "${String(file.name ?? file.id)}" is missing; no data was imported.`,
      );
    }
    const nextBlobId = createId();
    blobWrites.push({ id: nextBlobId, blob });
    remappedFiles.push({ ...file, blobId: nextBlobId });
  }

  const changes = new Map<string, string>();
  let importedRecords = 0;
  for (const key of BACKUP_KEYS) {
    const guestRaw = guestStorage.getItem(key);
    if (guestRaw === null) continue;
    const targetRaw = profileStorage.getItem(key);
    const guestValue = decodedValue(guestRaw);
    const targetValue = decodedValue(targetRaw);
    let merged: unknown;

    if (key === MATERIALS_KEY) {
      const guestData = (guestValue ?? {}) as {
        subjects?: unknown[];
        folders?: unknown[];
        files?: unknown[];
      };
      const targetData = (targetValue ?? {}) as {
        subjects?: unknown[];
        folders?: unknown[];
        files?: unknown[];
      };
      const mergedSubjects = mergeRecords(targetData.subjects, guestData.subjects);
      const mergedFolders = mergeRecords(targetData.folders, guestData.folders);
      const mergedFiles = mergeRecords(targetData.files, remappedFiles);
      importedRecords +=
        mergedSubjects.length -
        (targetData.subjects?.length ?? 0) +
        mergedFolders.length -
        (targetData.folders?.length ?? 0) +
        mergedFiles.length -
        (targetData.files?.length ?? 0);
      merged = {
        ...guestData,
        ...targetData,
        subjects: mergedSubjects,
        folders: mergedFolders,
        files: mergedFiles,
      };
    } else if (Array.isArray(guestValue)) {
      const mergedRecords = mergeRecords(targetValue, guestValue);
      importedRecords +=
        mergedRecords.length - (Array.isArray(targetValue) ? targetValue.length : 0);
      merged = mergedRecords;
    } else if (key === KEYS.settings) {
      merged = mergeObject(targetValue, guestValue);
      importedRecords += targetValue == null ? 1 : 0;
    } else {
      merged = targetValue == null ? guestValue : targetValue;
      importedRecords += targetValue == null ? 1 : 0;
    }
    changes.set(key, encodedValue(targetRaw ?? guestRaw, merged));
  }

  const previous = new Map([...changes.keys()].map((key) => [key, profileStorage.getItem(key)]));
  let copiedBlobIds: string[] = [];
  try {
    for (const entry of blobWrites) {
      await profileBlobs.put(entry.id, entry.blob);
      copiedBlobIds.push(entry.id);
    }
    for (const [key, value] of changes) {
      if (!profileStorage.setItem(key, value)) {
        throw new Error(profileStorage.reason ?? `Could not persist "${key}".`);
      }
    }
    for (const [key, value] of changes) announceLocalStorageChange({ key, value, profileId });
  } catch (error) {
    for (const [key, value] of previous) {
      if (value === null) profileStorage.removeItem(key);
      else profileStorage.setItem(key, value);
    }
    await Promise.all(copiedBlobIds.map((id) => profileBlobs.delete(id)));
    throw new Error(
      `Guest data import failed; the guest profile is unchanged. ${
        error instanceof Error ? error.message : ''
      }`.trim(),
    );
  }

  return { records: importedRecords, attachments: copiedBlobIds.length };
}

export function clearAllData(): void {
  const profileId = getActiveStorageProfile();
  const profileStorage = storageForProfile(profileId);
  for (const key of BACKUP_KEYS) {
    try {
      profileStorage.removeItem(key);
    } catch (err) {
      console.error(`[studydesk] could not clear "${key}"`, err);
    }
  }
  const remainingKeys = Array.from({ length: profileStorage.length }, (_, index) =>
    profileStorage.key(index),
  ).filter((key): key is string => key != null && key.startsWith('studydesk.'));
  for (const key of remainingKeys) {
    try {
      profileStorage.removeItem(key);
    } catch (err) {
      console.error(`[studydesk] could not clear "${key}"`, err);
    }
  }
  if (profileId !== null) {
    const guestStorage = storageForProfile(null);
    for (const key of [
      `studydesk.sync.shadow.${profileId}`,
      `studydesk.sync.outbox.${profileId}`,
      `studydesk.sync.outbox.${profileId}.recovery`,
      `studydesk.sync.initialization.${profileId}`,
    ]) {
      guestStorage.removeItem(key);
    }
  }
  deleteMaterialDatabase(profileId);
}

function isRestoreSnapshot(
  snapshot: RestoreSnapshot | Record<string, string | null>,
): snapshot is RestoreSnapshot {
  return typeof (snapshot as RestoreSnapshot).storage === 'object';
}

export async function restoreSnapshot(
  snapshot: RestoreSnapshot | Record<string, string | null>,
): Promise<void> {
  const profileId = isRestoreSnapshot(snapshot) ? snapshot.profileId : getActiveStorageProfile();
  if (profileId !== undefined && profileId !== getActiveStorageProfile()) {
    throw new Error('The active profile changed before this backup could be restored.');
  }
  await restoreSnapshotForProfile(snapshot, profileId ?? getActiveStorageProfile());
}

async function restoreSnapshotForProfile(
  snapshot: RestoreSnapshot | Record<string, string | null>,
  profileId: StorageProfileId,
): Promise<void> {
  const profileStorage = storageForProfile(profileId);
  const storageSnapshot = isRestoreSnapshot(snapshot) ? snapshot.storage : snapshot;
  for (const [key, value] of Object.entries(storageSnapshot)) {
    if (value == null) profileStorage.removeItem(key);
    else if (!profileStorage.setItem(key, value))
      throw new Error(profileStorage.reason ?? `Could not restore "${key}".`);
  }
  if (isRestoreSnapshot(snapshot) && snapshot.blobs)
    await materialBlobs.forProfile(profileId).replaceAll(snapshot.blobs);
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
