import { beforeEach, describe, expect, it, vi } from 'vitest';
import { migrateLegacyKeys, purgeLegacyKeys } from '../src/store/legacyMigration';
import { readStorage } from '../src/store/usePersistentState';
import { isValidTask, isValidDeadline } from '../src/store/validators';

const TASK = {
  id: 't1',
  title: 'Revise Ch.4',
  completed: false,
  createdAt: '2026-09-01T00:00:00Z',
};
const DEADLINE = {
  id: 'd1',
  title: 'Essay',
  subject: 'ME-301',
  description: '',
  dueDate: '2026-09-25',
  dueTime: '17:00',
  priority: 'high',
  completed: false,
  createdAt: '2026-09-01T00:00:00Z',
};

beforeEach(() => {
  localStorage.clear();
});

describe('migrateLegacyKeys', () => {
  it('copies flat legacy arrays into versioned namespaced keys', () => {
    localStorage.setItem('studydesk_tasks', JSON.stringify([TASK]));
    localStorage.setItem('studydesk_deadlines', JSON.stringify([DEADLINE]));

    const report = migrateLegacyKeys();
    expect(report.ran).toBe(true);
    expect(report.copied).toHaveLength(2);
    expect(report.failed).toHaveLength(0);

    // The new store can read them straight away.
    expect(readStorage('studydesk.tasks', [], { validateItem: isValidTask }).value).toEqual([TASK]);
    expect(readStorage('studydesk.deadlines', [], { validateItem: isValidDeadline }).value).toEqual(
      [DEADLINE],
    );
  });

  it('leaves the legacy keys in place as a rollback safety net', () => {
    localStorage.setItem('studydesk_tasks', JSON.stringify([TASK]));
    migrateLegacyKeys();
    expect(localStorage.getItem('studydesk_tasks')).not.toBeNull();
  });

  it('is idempotent — a second run copies nothing', () => {
    localStorage.setItem('studydesk_tasks', JSON.stringify([TASK]));
    migrateLegacyKeys();
    const second = migrateLegacyKeys();
    expect(second.ran).toBe(false);
    expect(second.copied).toHaveLength(0);
  });

  it('never overwrites data already present under the new key', () => {
    const existing = { ...TASK, id: 'keep', title: 'Already here' };
    localStorage.setItem('studydesk.tasks', JSON.stringify({ v: 1, data: [existing] }));
    localStorage.setItem('studydesk_tasks', JSON.stringify([TASK]));

    const report = migrateLegacyKeys();
    expect(report.skipped).toContain('studydesk_tasks');
    expect(readStorage('studydesk.tasks', [], { validateItem: isValidTask }).value).toEqual([
      existing,
    ]);
  });

  it('does nothing when there is no legacy data', () => {
    const report = migrateLegacyKeys();
    expect(report.ran).toBe(false);
    expect(report.copied).toHaveLength(0);
  });

  it('ignores empty or corrupt legacy values', () => {
    localStorage.setItem('studydesk_tasks', '[]');
    localStorage.setItem('studydesk_notes', 'not json at all');
    const report = migrateLegacyKeys();
    expect(report.copied).toHaveLength(0);
    expect(report.failed).toHaveLength(0);
  });

  it('retries later if a write fails, instead of flagging success', () => {
    localStorage.setItem('studydesk_tasks', JSON.stringify([TASK]));
    const spy = vi.spyOn(Storage.prototype, 'setItem');
    const real = spy.getMockImplementation();
    spy.mockImplementation(function (this: Storage, key: string, value: string) {
      if (key === 'studydesk.tasks') throw new DOMException('quota', 'QuotaExceededError');
      return real ? real.call(this, key, value) : undefined;
    } as unknown as typeof Storage.prototype.setItem);

    const report = migrateLegacyKeys();
    expect(report.failed).toContain('studydesk_tasks');
    // Flag not set, so a retry is possible once space frees up.
    expect(localStorage.getItem('studydesk.migratedFromFlatKeys')).toBeNull();
    spy.mockRestore();
  });

  it('purges every legacy key present, including empty ones', () => {
    localStorage.setItem('studydesk_tasks', JSON.stringify([TASK]));
    localStorage.setItem('studydesk_notes', JSON.stringify([]));
    migrateLegacyKeys();
    // Both keys exist, so both are removed — purge is a cleanup, not a migration.
    expect(purgeLegacyKeys()).toBe(2);
    expect(localStorage.getItem('studydesk_tasks')).toBeNull();
    expect(localStorage.getItem('studydesk_notes')).toBeNull();
    // The migrated copy survives.
    expect(localStorage.getItem('studydesk.tasks')).not.toBeNull();
    expect(readStorage('studydesk.tasks', [], { validateItem: isValidTask }).value).toEqual([TASK]);
  });

  it('purge is a no-op when nothing legacy remains', () => {
    expect(purgeLegacyKeys()).toBe(0);
  });
});
