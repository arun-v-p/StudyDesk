import { act, renderHook } from '@testing-library/react';
import type { User } from '@supabase/supabase-js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CloudSync } from '../src/features/sync/cloudSync';
import { KEYS } from '../src/store/AppStore';
import { setActiveStorageProfile, storage, storageForProfile } from '../src/lib/safeStorage';
import { announceLocalStorageChange, LOCAL_STORAGE_CHANGE } from '../src/lib/localChanges';
import { usePersistentState } from '../src/store/usePersistentState';

const mocks = vi.hoisted(() => ({
  records: [] as Array<Record<string, unknown>>,
  queryImplementation: null as
    ((userId: string) => Promise<{ data: unknown[]; error: null }>) | null,
  channelSubscriptions: 0,
  channelRemovals: 0,
  rpc: vi.fn(
    async (
      _functionName: string,
      values: Record<string, unknown>,
    ): Promise<{ data: unknown; error: Error | null }> => {
      const currentIndex = mocks.records.findIndex(
        (record) => record.scope === values.p_scope && record.item_id === values.p_item_id,
      );
      const current = mocks.records[currentIndex];
      if (
        current &&
        Date.parse(String(current.updated_at)) >= Date.parse(String(values.p_updated_at))
      ) {
        return { data: current, error: null };
      }
      const next = {
        scope: values.p_scope,
        item_id: values.p_item_id,
        payload: values.p_payload,
        updated_at: values.p_updated_at,
        deleted_at: values.p_deleted_at,
      };
      if (currentIndex < 0) mocks.records.push(next);
      else mocks.records[currentIndex] = next;
      return { data: next, error: null };
    },
  ),
  realtime: null as ((event: { new: unknown }) => void) | null,
}));

vi.mock('../src/lib/supabase', () => {
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(async (_column: string, value: string) =>
      mocks.queryImplementation
        ? mocks.queryImplementation(value)
        : { data: [...mocks.records], error: null },
    ),
  };
  const channel = {
    on: vi.fn((_type: string, _filter: unknown, callback: (event: { new: unknown }) => void) => {
      mocks.realtime = callback;
      return channel;
    }),
    subscribe: vi.fn(() => {
      mocks.channelSubscriptions++;
      return channel;
    }),
  };
  return {
    supabase: {
      from: vi.fn(() => query),
      rpc: mocks.rpc,
      channel: vi.fn(() => channel),
      removeChannel: vi.fn(async () => {
        mocks.channelRemovals++;
        return 'ok';
      }),
    },
  };
});

const user = { id: 'sync-test-user' } as User;
const task = (id: string, title: string) => ({ id, title, completed: false });
const envelope = (data: unknown) => JSON.stringify({ v: 2, data });
const initialized = (userId = user.id) => {
  localStorage.setItem(
    `studydesk.sync.initialization.${userId}`,
    JSON.stringify({
      version: 1,
      status: 'complete',
      mode: 'upload',
      completed: [],
      records: [],
    }),
  );
};
const shadow = (
  id: string,
  value: unknown,
  updatedAt: string,
  scope = 'tasks',
  userId = user.id,
) => {
  localStorage.setItem(
    `studydesk.sync.shadow.${userId}`,
    JSON.stringify({
      [`${scope}:${id}`]: { fingerprint: JSON.stringify(value), updatedAt },
    }),
  );
};

beforeEach(() => {
  localStorage.clear();
  setActiveStorageProfile(user.id);
  mocks.records.splice(0);
  mocks.queryImplementation = null;
  mocks.channelSubscriptions = 0;
  mocks.channelRemovals = 0;
  mocks.realtime = null;
  mocks.rpc.mockClear();
  mocks.rpc.mockImplementation(async (_functionName, values) => {
    const currentIndex = mocks.records.findIndex(
      (record) => record.scope === values.p_scope && record.item_id === values.p_item_id,
    );
    const current = mocks.records[currentIndex];
    if (
      current &&
      Date.parse(String(current.updated_at)) >= Date.parse(String(values.p_updated_at))
    ) {
      return { data: current, error: null };
    }
    const next = {
      scope: values.p_scope,
      item_id: values.p_item_id,
      payload: values.p_payload,
      updated_at: values.p_updated_at,
      deleted_at: values.p_deleted_at,
    };
    if (currentIndex < 0) mocks.records.push(next);
    else mocks.records[currentIndex] = next;
    return { data: next, error: null };
  });
});

describe('CloudSync initialization recovery', () => {
  // Prevent a delayed write notification from Account A from being uploaded by Account B's active sync session.
  it('ignores local-change events belonging to another profile', async () => {
    initialized('account-b');
    storageForProfile('account-a').setItem(
      KEYS.tasks,
      envelope([task('private-a', 'Account A task')]),
    );
    setActiveStorageProfile('account-b');
    const sync = new CloudSync(vi.fn());
    await sync.start({ ...user, id: 'account-b' });
    mocks.rpc.mockClear();

    announceLocalStorageChange({
      key: KEYS.tasks,
      value: envelope([task('private-a', 'Account A task')]),
      profileId: 'account-a',
    });
    await Promise.resolve();

    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(storageForProfile('account-b').getItem(KEYS.tasks)).toBeNull();
    sync.stop();
  });

  // Prevent Account B's first upload from reading or publishing Account A's local records on a shared browser.
  it('uploads only the authenticated account profile', async () => {
    const accountA = storageForProfile('account-a');
    accountA.setItem(KEYS.tasks, envelope([task('private-a', 'Account A private task')]));
    setActiveStorageProfile('account-b');

    const accountB = { ...user, id: 'account-b' };
    const sync = new CloudSync(vi.fn());
    await sync.start(accountB);
    await sync.uploadInitial();

    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.records).toEqual([]);
    expect(accountA.getItem(KEYS.tasks)).toContain('private-a');
    sync.stop();
  });

  // Prevent a restore for Account B from changing Account A's records stored in a different local profile.
  it('restores cloud records into only the currently authenticated profile', async () => {
    const accountA = storageForProfile('account-a');
    accountA.setItem(KEYS.tasks, envelope([task('same-id', 'Account A local value')]));
    const accountB = storageForProfile('account-b');
    setActiveStorageProfile('account-b');
    mocks.records.push({
      scope: 'tasks',
      item_id: 'same-id',
      payload: task('same-id', 'Account B cloud value'),
      updated_at: '2026-11-03T00:00:00.000Z',
      deleted_at: null,
    });

    const sync = new CloudSync(vi.fn());
    await sync.start({ ...user, id: 'account-b' });
    await sync.downloadInitial();

    expect(JSON.parse(accountB.getItem(KEYS.tasks)!).data).toEqual([
      task('same-id', 'Account B cloud value'),
    ]);
    expect(JSON.parse(accountA.getItem(KEYS.tasks)!).data).toEqual([
      task('same-id', 'Account A local value'),
    ]);
    sync.stop();
  });

  // Prevent an absent singleton document from being uploaded as a null payload rejected by the database.
  it('skips missing singleton documents during first upload', async () => {
    const sync = new CloudSync(vi.fn());
    await sync.start(user);
    await sync.uploadInitial();

    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(sync.hasInitialised()).toBe(true);
    sync.stop();
  });

  // Prevent a failed first upload from making its partial cloud snapshot look complete after restart.
  it('resumes an interrupted upload from durable per-user progress', async () => {
    storage.setItem(KEYS.tasks, envelope([task('one', 'One'), task('two', 'Two')]));
    let attempts = 0;
    mocks.rpc.mockImplementation(async (_functionName, values) => {
      attempts++;
      if (attempts === 2) return { data: null, error: new Error('simulated interruption') };
      const currentIndex = mocks.records.findIndex(
        (record) => record.scope === values.p_scope && record.item_id === values.p_item_id,
      );
      const next = {
        scope: values.p_scope,
        item_id: values.p_item_id,
        payload: values.p_payload,
        updated_at: values.p_updated_at,
        deleted_at: values.p_deleted_at,
      };
      if (currentIndex < 0) mocks.records.push(next);
      else mocks.records[currentIndex] = next;
      return { data: next, error: null };
    });

    const first = new CloudSync(vi.fn());
    await first.start(user);
    await expect(first.uploadInitial()).rejects.toThrow('simulated interruption');
    expect(first.hasInitialised()).toBe(false);
    expect(first.getInitializationStatus()).toBe('uploading');
    first.stop();

    const resumed = new CloudSync(vi.fn());
    const result = await resumed.start(user);
    if (!result) throw new Error('The active sync session unexpectedly became stale.');
    expect(result.remoteCount).toBe(1);
    expect(result.initializationStatus).toBe('uploading');
    await resumed.uploadInitial();

    expect(resumed.hasInitialised()).toBe(true);
    expect(mocks.records.filter((record) => record.scope === 'tasks')).toHaveLength(2);
    resumed.stop();
  });

  // Prevent retrying a partially applied restore from losing records that exist only on this device.
  it('resumes an interrupted restore and merges rather than replacing local collections', async () => {
    storage.setItem(
      KEYS.tasks,
      envelope([task('shared', 'Older local copy'), task('local-only', 'Keep me')]),
    );
    mocks.records.push({
      scope: 'tasks',
      item_id: 'shared',
      payload: task('shared', 'Cloud copy'),
      updated_at: '2026-11-03T00:00:00.000Z',
      deleted_at: null,
    });
    const originalSetItem = storage.setItem.bind(storage);
    let failOnce = true;
    const setItem = vi.spyOn(storage, 'setItem').mockImplementation((key, value) => {
      if (key === KEYS.tasks && failOnce) {
        failOnce = false;
        return false;
      }
      return originalSetItem(key, value);
    });

    const first = new CloudSync(vi.fn());
    await first.start(user);
    await expect(first.downloadInitial()).rejects.toThrow();
    expect(first.getInitializationStatus()).toBe('downloading');
    first.stop();
    setItem.mockRestore();

    const resumed = new CloudSync(vi.fn());
    await resumed.start(user);
    await resumed.downloadInitial();
    const saved = JSON.parse(storage.getItem(KEYS.tasks)!).data as Array<{
      id: string;
      title: string;
    }>;
    expect(saved).toEqual([task('local-only', 'Keep me'), task('shared', 'Cloud copy')]);
    expect(mocks.records).toContainEqual(
      expect.objectContaining({ scope: 'tasks', item_id: 'local-only' }),
    );
    expect(resumed.hasInitialised()).toBe(true);
    resumed.stop();
  });
});

describe('CloudSync tombstones and pending local edits', () => {
  // Prevent a stale local copy from being uploaded again after the last cloud record was deleted.
  it('restores tombstones as deletion revisions and does not resurrect stale records', async () => {
    storage.setItem(KEYS.tasks, envelope([task('deleted', 'Stale copy')]));
    mocks.records.push({
      scope: 'tasks',
      item_id: 'deleted',
      payload: null,
      updated_at: '2026-11-03T00:00:00.000Z',
      deleted_at: '2026-11-03T00:00:00.000Z',
    });

    const sync = new CloudSync(vi.fn());
    const result = await sync.start(user);
    if (!result) throw new Error('The active sync session unexpectedly became stale.');
    expect(result.remoteCount).toBe(1);
    await sync.downloadInitial();

    expect(JSON.parse(storage.getItem(KEYS.tasks)!).data).toEqual([]);
    expect(mocks.rpc).not.toHaveBeenCalledWith(
      'sync_studydesk_record',
      expect.objectContaining({ p_item_id: 'deleted', p_deleted_at: null }),
    );
    const shadow = JSON.parse(localStorage.getItem('studydesk.sync.shadow.sync-test-user')!);
    expect(shadow['tasks:deleted']).toEqual({
      fingerprint: '',
      updatedAt: '2026-11-03T00:00:00.000Z',
    });
    sync.stop();
  });

  // Prevent a realtime event from replacing a same-record edit before its debounce has persisted.
  it('keeps an unsaved edit when a newer remote version of that record arrives', async () => {
    storage.setItem(KEYS.tasks, envelope([task('same', 'Persisted')]));
    const hook = renderHook(() =>
      usePersistentState({
        key: KEYS.tasks,
        fallback: [] as Array<{ id: string; title: string; completed?: boolean }>,
        debounceMs: 5000,
      }),
    );
    const sync = new CloudSync(vi.fn());
    await sync.start(user);

    act(() => hook.result.current[1]([task('same', 'Unsaved local edit')]));
    act(() =>
      mocks.realtime?.({
        new: {
          scope: 'tasks',
          item_id: 'same',
          payload: task('same', 'Newer cloud edit'),
          updated_at: '2026-11-04T00:00:00.000Z',
          deleted_at: null,
        },
      }),
    );

    expect(hook.result.current[0]).toEqual([task('same', 'Unsaved local edit')]);
    sync.stop();
    hook.unmount();
  });

  // Prevent a remote document write for another record from dropping edits held only in React state.
  it('preserves pending in-memory changes to other records during a realtime update', async () => {
    storage.setItem(KEYS.tasks, envelope([task('same', 'Persisted')]));
    const hook = renderHook(() =>
      usePersistentState({
        key: KEYS.tasks,
        fallback: [] as Array<{ id: string; title: string; completed?: boolean }>,
        debounceMs: 5000,
      }),
    );
    const sync = new CloudSync(vi.fn());
    await sync.start(user);

    act(() => hook.result.current[1]([task('same', 'Unsaved local edit')]));
    act(() =>
      mocks.realtime?.({
        new: {
          scope: 'tasks',
          item_id: 'remote-only',
          payload: task('remote-only', 'Remote addition'),
          updated_at: '2026-11-04T00:00:00.000Z',
          deleted_at: null,
        },
      }),
    );

    expect(hook.result.current[0]).toEqual([
      task('same', 'Unsaved local edit'),
      task('remote-only', 'Remote addition'),
    ]);
    sync.stop();
    hook.unmount();
  });
});

describe('CloudSync outbox and session safety', () => {
  // Prevent a slow older flush from deleting or replacing a newer edit queued for the same record.
  it('serializes flushes and preserves a newer pending write after an older write completes', async () => {
    const oldUpdatedAt = '2026-11-01T00:00:00.000Z';
    const original = task('same', 'Original');
    storage.setItem(KEYS.tasks, envelope([original]));
    localStorage.setItem(`${'studydesk.sync.outbox.'}${user.id}`, '[]');
    initialized();
    shadow('same', original, oldUpdatedAt);
    mocks.records.push({
      scope: 'tasks',
      item_id: 'same',
      payload: original,
      updated_at: oldUpdatedAt,
      deleted_at: null,
    });

    let resolveOlder!: (result: { data: unknown; error: null }) => void;
    const olderResponse = new Promise<{ data: unknown; error: null }>((resolve) => {
      resolveOlder = resolve;
    });
    let callCount = 0;
    mocks.rpc.mockImplementation(async (_name, values) => {
      callCount++;
      const next = {
        scope: values.p_scope,
        item_id: values.p_item_id,
        payload: values.p_payload,
        updated_at: values.p_updated_at,
        deleted_at: values.p_deleted_at,
      };
      if (callCount === 1) return olderResponse;
      const index = mocks.records.findIndex(
        (record) => record.scope === values.p_scope && record.item_id === values.p_item_id,
      );
      if (index < 0) mocks.records.push(next);
      else mocks.records[index] = next;
      return { data: next, error: null };
    });

    const sync = new CloudSync(vi.fn());
    await sync.start(user);
    const olderValue = task('same', 'Older in-flight edit');
    const olderRaw = envelope([olderValue]);
    storage.setItem(KEYS.tasks, olderRaw);
    announceLocalStorageChange({ key: KEYS.tasks, value: olderRaw });
    await vi.waitFor(() => expect(mocks.rpc).toHaveBeenCalledTimes(1));

    const newerValue = task('same', 'Newer queued edit');
    const newerRaw = envelope([newerValue]);
    storage.setItem(KEYS.tasks, newerRaw);
    announceLocalStorageChange({ key: KEYS.tasks, value: newerRaw });
    await Promise.resolve();
    expect(mocks.rpc).toHaveBeenCalledTimes(1);

    const firstArgs = mocks.rpc.mock.calls[0]?.[1] as Record<string, unknown>;
    resolveOlder({
      data: {
        scope: 'tasks',
        item_id: 'same',
        payload: firstArgs.p_payload,
        updated_at: firstArgs.p_updated_at,
        deleted_at: null,
      },
      error: null,
    });
    await vi.waitFor(() => expect(mocks.rpc).toHaveBeenCalledTimes(2));
    await vi.waitFor(() => {
      expect(JSON.parse(localStorage.getItem(`studydesk.sync.outbox.${user.id}`) ?? '[]')).toEqual(
        [],
      );
    });
    expect(mocks.records.find((record) => record.item_id === 'same')?.payload).toEqual(newerValue);
    sync.stop();
  });

  // Prevent equal-timestamp concurrent device edits from being silently dropped when the RPC returns the other device's winner.
  it('reconciles an equal-timestamp concurrent device edit to the server winner before clearing its queue entry', async () => {
    const sameTimestamp = '2026-11-03T08:00:00.000Z';
    const deviceA = task('same', 'Device A');
    const deviceB = task('same', 'Device B winner');
    storage.setItem(KEYS.tasks, envelope([deviceA]));
    initialized();
    shadow('same', deviceA, sameTimestamp);
    localStorage.setItem(
      `studydesk.sync.outbox.${user.id}`,
      JSON.stringify([
        {
          scope: 'tasks',
          itemId: 'same',
          payload: deviceA,
          updatedAt: sameTimestamp,
          deletedAt: null,
        },
      ]),
    );
    mocks.records.push({
      scope: 'tasks',
      item_id: 'same',
      payload: deviceB,
      updated_at: '2026-11-03T08:00:00+00:00',
      deleted_at: null,
    });
    mocks.rpc.mockImplementation(async () => ({
      data: mocks.records[0],
      error: null,
    }));

    const sync = new CloudSync(vi.fn());
    await sync.start(user);
    await vi.waitFor(() => {
      expect(JSON.parse(storage.getItem(KEYS.tasks)!).data).toEqual([deviceB]);
      expect(JSON.parse(localStorage.getItem(`studydesk.sync.outbox.${user.id}`) ?? '[]')).toEqual(
        [],
      );
    });
    sync.stop();
  });

  // Prevent a same-millisecond edit from another device being ignored by the realtime timestamp guard.
  it('applies the authoritative realtime value when competing edits have equal timestamps', async () => {
    const sameTimestamp = '2026-11-03T08:00:00.000Z';
    const deviceA = task('same', 'Device A');
    const deviceB = task('same', 'Device B winner');
    storage.setItem(KEYS.tasks, envelope([deviceA]));
    shadow('same', deviceA, sameTimestamp);

    const sync = new CloudSync(vi.fn());
    await sync.start(user);
    act(() =>
      mocks.realtime?.({
        new: {
          scope: 'tasks',
          item_id: 'same',
          payload: deviceB,
          updated_at: '2026-11-03T08:00:00+00:00',
          deleted_at: null,
        },
      }),
    );

    expect(JSON.parse(storage.getItem(KEYS.tasks)!).data).toEqual([deviceB]);
    sync.stop();
  });

  // Prevent a transport-success response without a confirmed server row from discarding a pending local write.
  it('retains the outbox entry and reports recovery when the RPC does not confirm a revision', async () => {
    const updatedAt = '2026-11-03T08:00:00.000Z';
    const value = task('same', 'Must remain queued');
    storage.setItem(KEYS.tasks, envelope([value]));
    initialized();
    shadow('same', value, updatedAt);
    localStorage.setItem(
      `studydesk.sync.outbox.${user.id}`,
      JSON.stringify([
        {
          scope: 'tasks',
          itemId: 'same',
          payload: value,
          updatedAt,
          deletedAt: null,
        },
      ]),
    );
    const onStatus = vi.fn();
    mocks.rpc.mockResolvedValue({ data: null, error: null });

    const sync = new CloudSync(onStatus);
    await sync.start(user);
    await vi.waitFor(() =>
      expect(onStatus).toHaveBeenCalledWith(expect.stringContaining('server did not confirm')),
    );
    expect(
      JSON.parse(localStorage.getItem(`studydesk.sync.outbox.${user.id}`) ?? '[]'),
    ).toHaveLength(1);
    sync.stop();
  });

  // Prevent corrupt serialized outbox rows from being mistaken for an empty queue and losing their recoverable local edits.
  it('preserves a damaged outbox and reconstructs unsent edits from local data and shadow revisions', async () => {
    const updatedAt = '2026-11-04T08:00:00.000Z';
    const localValue = task('same', 'Recover this local edit');
    storage.setItem(KEYS.tasks, envelope([localValue]));
    initialized();
    shadow('same', localValue, updatedAt);
    const damaged = '{bad outbox';
    localStorage.setItem(`studydesk.sync.outbox.${user.id}`, damaged);
    mocks.records.push({
      scope: 'tasks',
      item_id: 'same',
      payload: task('same', 'Older cloud value'),
      updated_at: '2026-11-01T08:00:00.000Z',
      deleted_at: null,
    });
    const sync = new CloudSync(vi.fn());
    const result = await sync.start(user);

    expect(result?.recoveryMessage).toContain('queue is unreadable');
    await vi.waitFor(() =>
      expect(mocks.records.find((record) => record.item_id === 'same')?.payload).toEqual(
        localValue,
      ),
    );
    expect(localStorage.getItem(`studydesk.sync.outbox.${user.id}.recovery`)).toBe(damaged);
    sync.stop();
  });

  // Prevent a missing outbox file from stranding edits whose shadow revision is newer than the cloud record.
  it('reconstructs local writes when the outbox key is missing', async () => {
    const updatedAt = '2026-11-04T08:00:00.000Z';
    const localValue = task('same', 'Recover without queue file');
    storage.setItem(KEYS.tasks, envelope([localValue]));
    initialized();
    shadow('same', localValue, updatedAt);
    mocks.records.push({
      scope: 'tasks',
      item_id: 'same',
      payload: task('same', 'Older cloud value'),
      updated_at: '2026-11-01T08:00:00.000Z',
      deleted_at: null,
    });
    const sync = new CloudSync(vi.fn());
    const result = await sync.start(user);

    expect(result?.recoveryMessage).toContain('Recovered local changes');
    await vi.waitFor(() =>
      expect(mocks.records.find((record) => record.item_id === 'same')?.payload).toEqual(
        localValue,
      ),
    );
    sync.stop();
  });

  // Prevent a persisted local edit from being overwritten after an outbox quota/write failure and browser restart.
  it('recovers a local edit that was saved while its outbox write failed', async () => {
    const updatedAt = '2026-11-01T08:00:00.000Z';
    const oldValue = task('same', 'Previously synced');
    const changedValue = task('same', 'Keep this unsent edit');
    storage.setItem(KEYS.tasks, envelope([oldValue]));
    initialized();
    shadow('same', oldValue, updatedAt);
    mocks.records.push({
      scope: 'tasks',
      item_id: 'same',
      payload: oldValue,
      updated_at: updatedAt,
      deleted_at: null,
    });

    const onStatus = vi.fn();
    const first = new CloudSync(onStatus);
    await first.start(user);
    const originalSetItem = storage.setItem.bind(storage);
    const setItemSpy = vi
      .spyOn(storage, 'setItem')
      .mockImplementation((key, value) =>
        key === `studydesk.sync.outbox.${user.id}` ? false : originalSetItem(key, value),
      );
    const changedDocument = envelope([changedValue]);
    storage.setItem(KEYS.tasks, changedDocument);
    announceLocalStorageChange({ key: KEYS.tasks, value: changedDocument });

    await vi.waitFor(() =>
      expect(onStatus).toHaveBeenCalledWith(
        expect.stringContaining('Could not persist pending cloud sync changes'),
      ),
    );
    setItemSpy.mockRestore();
    first.stop();

    const resumed = new CloudSync(vi.fn());
    await resumed.start(user);
    await vi.waitFor(() =>
      expect(mocks.records.find((record) => record.item_id === 'same')?.payload).toEqual(
        changedValue,
      ),
    );
    resumed.stop();
  });

  // Prevent an account A response arriving late from applying A's private records or subscribing after account B is active.
  it('invalidates an earlier account start when a later account session becomes active', async () => {
    const userA = { id: 'account-a' } as User;
    const userB = { id: 'account-b' } as User;
    const recordA = {
      scope: 'tasks',
      item_id: 'private-a',
      payload: task('private-a', 'Account A data'),
      updated_at: '2026-11-03T08:00:00.000Z',
      deleted_at: null,
    };
    const recordB = {
      scope: 'tasks',
      item_id: 'private-b',
      payload: task('private-b', 'Account B data'),
      updated_at: '2026-11-03T08:00:00.000Z',
      deleted_at: null,
    };
    const queryA: { resolve: ((result: { data: unknown[]; error: null }) => void) | null } = {
      resolve: null,
    };
    mocks.queryImplementation = async (id) => {
      if (id === userA.id) {
        return new Promise((resolve) => {
          queryA.resolve = resolve;
        });
      }
      return { data: [recordB], error: null };
    };
    initialized(userB.id);

    const sync = new CloudSync(vi.fn());
    setActiveStorageProfile(userA.id);
    const oldStart = sync.start(userA);
    setActiveStorageProfile(userB.id);
    const activeStart = await sync.start(userB);
    expect(activeStart?.initializationStatus).toBe('complete');
    queryA.resolve?.({ data: [recordA], error: null });
    expect(await oldStart).toBeNull();
    expect(JSON.parse(storage.getItem(KEYS.tasks)!).data).toEqual([recordB.payload]);
    expect(mocks.channelSubscriptions).toBe(1);
    sync.stop();
    expect(mocks.channelRemovals).toBe(1);
  });

  // Prevent a previous user's Realtime subscription from surviving a switch to another authenticated account.
  it('removes the previous account channel and listeners before starting the next account', async () => {
    const removeListener = vi.spyOn(window, 'removeEventListener');
    const sync = new CloudSync(vi.fn());
    setActiveStorageProfile('account-a');
    await sync.start({ id: 'account-a' } as User);
    setActiveStorageProfile('account-b');
    await sync.start({ id: 'account-b' } as User);

    expect(mocks.channelSubscriptions).toBe(2);
    expect(mocks.channelRemovals).toBe(1);
    expect(removeListener).toHaveBeenCalledWith(LOCAL_STORAGE_CHANGE, expect.any(Function));
    expect(removeListener).toHaveBeenCalledWith('online', expect.any(Function));
    sync.stop();
    expect(mocks.channelRemovals).toBe(2);
    removeListener.mockRestore();
  });
});
