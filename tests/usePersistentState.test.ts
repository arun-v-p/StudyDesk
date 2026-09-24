import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import {
  readStorage,
  SCHEMA_VERSION,
  useCollection,
  usePersistentState,
} from '../src/store/usePersistentState';
import { isValidTask } from '../src/store/validators';

beforeEach(() => localStorage.clear());

/**
 * Regression tests for audited §2.2: the deployed bundle white-screened on 9 of
 * 12 malformed payloads because loadFromStorage returned whatever JSON.parse
 * produced with no type check.
 */
describe('readStorage', () => {
  it.each([
    ['an object', '{}'],
    ['null', 'null'],
    ['a string', '"hello"'],
    ['a number', '123'],
  ])('returns the fallback when the array key holds %s', (_label, raw) => {
    localStorage.setItem('studydesk.tasks', raw);
    const { value, dropped } = readStorage('studydesk.tasks', [] as unknown[], {
      validateItem: isValidTask,
    });
    expect(value).toEqual([]);
    expect(dropped).toBe(-1);
  });

  it('returns the fallback on corrupt JSON instead of throwing', () => {
    localStorage.setItem('studydesk.tasks', '[{"id":"t1","title":"x","completed":fal');
    expect(() => readStorage('studydesk.tasks', [], { validateItem: isValidTask })).not.toThrow();
    expect(readStorage('studydesk.tasks', [], { validateItem: isValidTask }).value).toEqual([]);
  });

  it('drops invalid elements but keeps valid ones', () => {
    localStorage.setItem(
      'studydesk.tasks',
      JSON.stringify([
        { id: 'ok', title: 'Good', completed: false, createdAt: '2026-09-01T00:00:00Z' },
        null,
        { id: 'bad', title: 42 },
      ]),
    );
    const { value, dropped } = readStorage('studydesk.tasks', [], { validateItem: isValidTask });
    expect(value).toHaveLength(1);
    expect(dropped).toBe(2);
  });

  it('reads both the plain-array and the versioned envelope', () => {
    const task = { id: 'a', title: 'T', completed: false, createdAt: '2026-09-01T00:00:00Z' };
    localStorage.setItem('k1', JSON.stringify([task]));
    localStorage.setItem('k2', JSON.stringify({ v: SCHEMA_VERSION, data: [task] }));
    expect(readStorage('k1', [], { validateItem: isValidTask }).value).toEqual([task]);
    expect(readStorage('k2', [], { validateItem: isValidTask }).value).toEqual([task]);
  });

  it('merges object settings over defaults so new fields are never undefined', () => {
    localStorage.setItem('studydesk.settings', JSON.stringify({ displayName: 'Ada' }));
    const { value } = readStorage('studydesk.settings', {
      displayName: '',
      theme: 'system' as const,
      weekStartsOn: 1 as const,
    });
    expect(value).toEqual({ displayName: 'Ada', theme: 'system', weekStartsOn: 1 });
  });
});

describe('useCollection', () => {
  it('adds, updates, removes and restores', () => {
    const { result } = renderHook(() =>
      useCollection<{ id: string; title: string }>({
        key: 'studydesk.test',
        validateItem: (v) => typeof v === 'object' && v !== null,
      }),
    );

    act(() => result.current.add({ id: '1', title: 'First' }));
    expect(result.current.items).toHaveLength(1);

    act(() => result.current.update('1', { title: 'Renamed' }));
    expect(result.current.items[0]?.title).toBe('Renamed');

    // Captured through an object because TypeScript narrows a `let` that is only
    // assigned inside a closure back to its initial `null` at the assertion site.
    const capture: {
      current: { item: { id: string; title: string }; index: number } | null;
    } = { current: null };
    act(() => {
      capture.current = result.current.remove('1');
    });
    expect(capture.current?.item.title).toBe('Renamed');
    expect(result.current.items).toHaveLength(0);

    // Undo path used by the toast layer.
    act(() => {
      const removed = capture.current;
      if (removed) result.current.restore(removed.item, removed.index);
    });
    expect(result.current.items).toHaveLength(1);
    expect(result.current.items[0]?.title).toBe('Renamed');
  });

  it('writes through to localStorage as a versioned envelope', async () => {
    const { result } = renderHook(() =>
      useCollection<{ id: string }>({ key: 'studydesk.persist', debounceMs: 0 }),
    );
    act(() => result.current.add({ id: 'p1' }));
    await vi.waitFor(() => {
      const raw = localStorage.getItem('studydesk.persist');
      expect(raw).toBeTruthy();
      expect(JSON.parse(raw!)).toEqual({ v: SCHEMA_VERSION, data: [{ id: 'p1' }] });
    });
  });

  it('surfaces a quota failure through onError instead of swallowing it', async () => {
    const onError = vi.fn();
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      const err = new DOMException('quota', 'QuotaExceededError');
      throw err;
    });
    const { result } = renderHook(() =>
      usePersistentState<string[]>({
        key: 'studydesk.quota',
        fallback: [],
        debounceMs: 0,
        onError,
      }),
    );
    act(() => result.current[1](['boom']));
    await vi.waitFor(() => expect(onError).toHaveBeenCalled());
    spy.mockRestore();
  });
});
