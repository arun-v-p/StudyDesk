/**
 * One-time migration from the original flat storage keys to the namespaced ones.
 *
 *   studydesk_tasks      -> studydesk.tasks
 *   studydesk_deadlines  -> studydesk.deadlines
 *   studydesk_timetable  -> studydesk.timetable
 *   studydesk_notes      -> studydesk.notes
 *   studydesk_planner    -> studydesk.planner
 *
 * WHY THIS EXISTS
 * localStorage is keyed per origin, so anyone who already used the deployed app
 * has real data under the old names. Renaming keys without a migration would
 * silently strand it — the app would boot empty and the user would conclude
 * their data was deleted. That is precisely the failure mode this rewrite is
 * meant to eliminate.
 *
 * The migration is idempotent and non-destructive:
 *   - it only runs when the new key is absent AND the old key holds data
 *   - it copies, never deletes, so the old keys stay as a rollback safety net
 *   - it records completion so it does not re-run on every boot
 *
 * Called once from main.tsx before React mounts, so the first render already
 * sees the migrated data.
 */

import { storage } from '../lib/safeStorage';

const LEGACY_MAP: Record<string, string> = {
  studydesk_tasks: 'studydesk.tasks',
  studydesk_deadlines: 'studydesk.deadlines',
  studydesk_timetable: 'studydesk.timetable',
  studydesk_notes: 'studydesk.notes',
  studydesk_planner: 'studydesk.planner',
};

const FLAG_KEY = 'studydesk.migratedFromFlatKeys';

export interface MigrationReport {
  ran: boolean;
  copied: string[];
  skipped: string[];
  failed: string[];
}

/** True when a legacy key holds a non-empty JSON array. */
function hasLegacyData(key: string): boolean {
  try {
    const raw = storage.getItem(key);
    if (!raw) return false;
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length > 0;
  } catch {
    return false;
  }
}

export function migrateLegacyKeys(): MigrationReport {
  const report: MigrationReport = { ran: false, copied: [], skipped: [], failed: [] };

  try {
    if (storage.getItem(FLAG_KEY)) return report;

    // Nothing to migrate if no legacy key holds data — set the flag and stop.
    const candidates = Object.entries(LEGACY_MAP).filter(([legacy]) => hasLegacyData(legacy));
    if (candidates.length === 0) {
      storage.setItem(FLAG_KEY, new Date().toISOString());
      return report;
    }

    report.ran = true;
    for (const [legacy, next] of candidates) {
      try {
        // Never overwrite data already present under the new key.
        if (storage.getItem(next) != null) {
          report.skipped.push(legacy);
          continue;
        }
        const raw = storage.getItem(legacy);
        if (raw == null) continue;

        // Re-wrap in the versioned envelope the new store expects. `migrate()`
        // in usePersistentState accepts both shapes, but writing the envelope
        // keeps storage consistent going forward.
        const parsed: unknown = JSON.parse(raw);
        if (!storage.setItem(next, JSON.stringify({ v: 1, data: parsed }))) {
          report.failed.push(legacy);
          continue;
        }
        report.copied.push(`${legacy} -> ${next}`);
      } catch (err) {
        console.error(`[studydesk] could not migrate "${legacy}"`, err);
        report.failed.push(legacy);
      }
    }

    // Only set the flag when nothing failed, so a partial migration retries.
    if (report.failed.length === 0) {
      storage.setItem(FLAG_KEY, new Date().toISOString());
    }
    if (report.copied.length > 0) {
      console.info(`[studydesk] migrated ${report.copied.length} collection(s) from legacy keys`);
    }
  } catch (err) {
    // localStorage can be unavailable entirely (private mode, blocked cookies).
    // The app must still boot — it will simply start empty.
    console.warn('[studydesk] legacy key migration skipped', err);
  }

  return report;
}

/**
 * Removes the legacy flat keys after a successful migration. Kept separate so
 * the copy is left in place until the user has confirmed the new build works —
 * call this from Settings, never automatically.
 */
export function purgeLegacyKeys(): number {
  let removed = 0;
  for (const legacy of Object.keys(LEGACY_MAP)) {
    try {
      if (storage.getItem(legacy) != null) {
        storage.removeItem(legacy);
        removed += 1;
      }
    } catch (err) {
      console.error(`[studydesk] could not remove "${legacy}"`, err);
    }
  }
  return removed;
}
