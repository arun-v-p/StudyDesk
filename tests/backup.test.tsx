import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { SettingsPage } from '../src/pages/SettingsPage';
import { AppStoreProvider, KEYS } from '../src/store/AppStore';
import {
  clearAllData,
  exportBackup,
  importBackup,
  restoreSnapshot,
  type Backup,
} from '../src/store/backup';
import { EXAM_TIMETABLE_KEY } from '../src/store/examTimetable';
import { MATERIALS_KEY } from '../src/store/materials';
import { TIMER_STORAGE_KEY } from '../src/features/timer/usePomodoro';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function backupFile(data: Record<string, unknown>): File {
  const file = new File(['backup'], 'backup.json', { type: 'application/json' });
  const backup: Backup = {
    app: 'studydesk',
    schemaVersion: 1,
    exportedAt: '2026-09-26T00:00:00.000Z',
    data,
  };
  Object.defineProperty(file, 'text', { value: async () => JSON.stringify(backup) });
  return file;
}

describe('backup data integrity', () => {
  it('round-trips all backup keys and clears all namespaced data', async () => {
    // Exams, material metadata and timer stats were omitted; clear-all also left feature flags behind.
    const expected: Record<string, unknown> = {
      [KEYS.tasks]: [{ id: 'task-1', title: 'Review' }],
      [KEYS.deadlines]: [{ id: 'deadline-1', title: 'Essay' }],
      [KEYS.timetable]: [{ id: 'class-1', subject: 'Physics' }],
      [KEYS.notes]: [{ id: 'note-1', title: 'Notes' }],
      [KEYS.planner]: [{ id: 'planner-1', title: 'Study' }],
      [KEYS.settings]: { theme: 'dark' },
      [EXAM_TIMETABLE_KEY]: [{ id: 'exam-1', subject: 'Calculus' }],
      [MATERIALS_KEY]: { v: 1, data: { subjects: [], folders: [], files: [] } },
      [TIMER_STORAGE_KEY]: { day: '2026-09-26', completed: 2, focusSeconds: 3000 },
    };
    for (const [key, value] of Object.entries(expected))
      localStorage.setItem(key, JSON.stringify(value));
    localStorage.setItem('studydesk.migratedFromFlatKeys', 'true');
    localStorage.setItem('studydesk.featureFlag', 'true');
    localStorage.setItem('studydesk_tasks', 'legacy rollback copy');

    const backup = exportBackup();
    expect(backup.data).toEqual(expected);
    clearAllData();
    expect(Object.keys(localStorage).filter((key) => key.startsWith('studydesk.'))).toEqual([]);
    expect(localStorage.getItem('studydesk_tasks')).toBe('legacy rollback copy');

    const result = await importBackup(backupFile(backup.data));
    expect(result.ok).toBe(true);
    for (const [key, value] of Object.entries(expected)) {
      expect(JSON.parse(localStorage.getItem(key)!)).toEqual(value);
    }
  });

  it('still imports a legacy six-key backup', async () => {
    // Adding feature-specific backup keys must not invalidate backups made before those features existed.
    const legacyData = Object.fromEntries(
      Object.values(KEYS).map((key) => [key, key === KEYS.settings ? { theme: 'light' } : []]),
    );
    const result = await importBackup(backupFile(legacyData));
    expect(result).toMatchObject({ ok: true, keys: 6 });
    for (const [key, value] of Object.entries(legacyData))
      expect(JSON.parse(localStorage.getItem(key)!)).toEqual(value);
  });

  it('clears StudyDesk feature flags outside the backup whitelist', () => {
    // Flag keys are intentionally excluded from export but still belong to Clear all data.
    localStorage.setItem('studydesk.migratedFromFlatKeys', 'true');
    localStorage.setItem('studydesk.sampleTermLoaded', 'true');
    clearAllData();
    expect(localStorage.getItem('studydesk.migratedFromFlatKeys')).toBeNull();
    expect(localStorage.getItem('studydesk.sampleTermLoaded')).toBeNull();
  });

  it('restores the pre-import value when Undo import is clicked', async () => {
    // Import previously overwrote user data without a rollback path.
    const oldMetadata = JSON.stringify({
      v: 1,
      data: { subjects: [{ id: 'old' }], folders: [], files: [] },
    });
    const newMetadata = { v: 1, data: { subjects: [{ id: 'new' }], folders: [], files: [] } };
    localStorage.setItem(MATERIALS_KEY, oldMetadata);
    const reload = vi.fn();
    const testLocation = new Proxy(
      {},
      {
        get(_target, key) {
          return key === 'reload' ? reload : Reflect.get(window.location, key, window.location);
        },
      },
    );
    const testWindow = new Proxy(window, {
      get(target, property) {
        if (property === 'location') return testLocation;
        return Reflect.get(target, property, target);
      },
    });
    vi.stubGlobal('window', testWindow);
    let fileInput: HTMLInputElement | undefined;
    vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => {
      fileInput = document.querySelector('input[type="file"]') ?? undefined;
    });

    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <AppStoreProvider>
          <SettingsPage />
        </AppStoreProvider>
      </MemoryRouter>,
    );
    await user.click(screen.getByRole('button', { name: /Import backup/i }));
    if (!fileInput) throw new Error('Backup file picker was not opened.');
    const file = backupFile({ [MATERIALS_KEY]: newMetadata });
    fireEvent.change(fileInput, { target: { files: [file] } });

    await user.click(await screen.findByRole('button', { name: 'Undo import' }));
    expect(localStorage.getItem(MATERIALS_KEY)).toBe(oldMetadata);
    expect(reload).toHaveBeenCalledOnce();
  });

  it('restores missing keys as missing when restoring an import snapshot', async () => {
    // Undo must remove newly introduced values instead of leaving imported data behind.
    const result = await importBackup(backupFile({ [KEYS.notes]: [{ id: 'imported' }] }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    restoreSnapshot(result.snapshot);
    expect(localStorage.getItem(KEYS.notes)).toBeNull();
  });
});
