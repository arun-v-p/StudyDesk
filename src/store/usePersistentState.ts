/**
 * Validated, versioned, cross-tab-synced localStorage state.
 *
 * Fixes four defects in the original `loadFromStorage`:
 *  1. It returned whatever `JSON.parse` produced with no type check. Boot-testing
 *     the deployed bundle showed 9 of 12 malformed payloads white-screen the app
 *     (`TypeError: u.filter is not a function`).
 *  2. No schema version, so any field rename silently corrupts stored data.
 *  3. No `storage` listener, so two open tabs stomp each other.
 *  4. Quota errors were logged to console only — the edit looked saved, then vanished.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  getActiveStorageProfile,
  getProfileStorageKey,
  storageForProfile,
} from '../lib/safeStorage';
import { announceLocalStorageChange, LOCAL_STORAGE_CHANGE } from '../lib/localChanges';

export const SCHEMA_VERSION = 2;

export type Migration = (data: unknown) => unknown;

interface InMemoryPersistentValue {
  value: string;
  pending: boolean;
  owner: symbol;
}

const inMemoryPersistentValues = new Map<string, InMemoryPersistentValue>();

export function getInMemoryPersistentValue(key: string): InMemoryPersistentValue | null {
  return inMemoryPersistentValues.get(getProfileStorageKey(key)) ?? null;
}

interface Envelope<T> {
  v: number;
  data: T;
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const isEnvelope = (v: unknown): v is Envelope<unknown> =>
  isRecord(v) && typeof v.v === 'number' && 'data' in v;

function migrate(raw: unknown, migrations: Migration[]): unknown {
  if (!isEnvelope(raw)) return migrations.reduce((acc, m) => m(acc), raw);
  let v = raw.v;
  let data: unknown = raw.data;
  while (v < SCHEMA_VERSION) {
    const step = migrations[v];
    if (!step) break;
    data = step(data);
    v += 1;
  }
  return data;
}

/** Read + validate once. Returns the fallback, and reports what it discarded. */
export function readStorage<T>(
  key: string,
  fallback: T,
  opts: { validateItem?: (v: unknown) => boolean; migrations?: Migration[] } = {},
  profileStorage = storageForProfile(getActiveStorageProfile()),
): { value: T; dropped: number } {
  const { validateItem, migrations = [] } = opts;
  try {
    const raw = profileStorage.getItem(key);
    if (raw == null) return { value: fallback, dropped: 0 };

    const parsed: unknown = migrate(JSON.parse(raw), migrations);

    if (Array.isArray(fallback)) {
      if (!Array.isArray(parsed)) {
        // Wrong top-level type — the exact case that crashed the shipped build.
        console.warn(`[studydesk] "${key}" was not an array; reset to empty`);
        return { value: fallback, dropped: -1 };
      }
      if (!validateItem) return { value: parsed as T, dropped: 0 };
      const clean = parsed.filter(validateItem);
      return { value: clean as T, dropped: parsed.length - clean.length };
    }

    if (isRecord(parsed) && isRecord(fallback)) {
      // Merge over defaults so a newly added field is present, not undefined.
      return { value: { ...fallback, ...parsed } as T, dropped: 0 };
    }
    return { value: parsed as T, dropped: 0 };
  } catch (err) {
    console.error(`[studydesk] could not read "${key}"; using defaults`, err);
    return { value: fallback, dropped: -1 };
  }
}

export interface PersistentOptions<T> {
  key: string;
  fallback: T;
  validateItem?: (value: unknown) => boolean;
  migrations?: Migration[];
  debounceMs?: number;
  onError?: (error: unknown) => void;
}

export function usePersistentState<T>(opts: PersistentOptions<T>) {
  const { key, fallback, validateItem, migrations = [], debounceMs = 150 } = opts;
  const profileId = getActiveStorageProfile();
  const profileStorage = storageForProfile(profileId);
  const profileStorageKey = getProfileStorageKey(key, profileId);

  const pendingRef = useRef(false);
  const registryOwner = useRef(Symbol());
  const onErrorRef = useRef(opts.onError);
  onErrorRef.current = opts.onError;
  const migrationsRef = useRef(migrations);
  migrationsRef.current = migrations;
  const validateRef = useRef(validateItem);
  validateRef.current = validateItem;

  const [state, setStateInternal] = useState<T>(() => {
    const { value, dropped } = readStorage(
      key,
      fallback,
      { validateItem, migrations },
      profileStorage,
    );
    if (dropped > 0) console.warn(`[studydesk] dropped ${dropped} invalid record(s) from "${key}"`);
    return value;
  });
  const stateRef = useRef(state);
  stateRef.current = state;
  const persistentValue = JSON.stringify({ v: SCHEMA_VERSION, data: state });
  inMemoryPersistentValues.set(profileStorageKey, {
    value: persistentValue,
    pending: pendingRef.current,
    owner: registryOwner.current,
  });
  const setPersistentState = useCallback<React.Dispatch<React.SetStateAction<T>>>(
    (action) => {
      const next =
        typeof action === 'function' ? (action as (previous: T) => T)(stateRef.current) : action;
      stateRef.current = next;
      pendingRef.current = true;
      inMemoryPersistentValues.set(profileStorageKey, {
        value: JSON.stringify({ v: SCHEMA_VERSION, data: next }),
        pending: true,
        owner: registryOwner.current,
      });
      setStateInternal(next);
    },
    [profileStorageKey],
  );

  // Debounced write; surfaces quota failures instead of swallowing them.
  useEffect(() => {
    const id = window.setTimeout(() => {
      const envelope: Envelope<T> = { v: SCHEMA_VERSION, data: state };
      const value = JSON.stringify(envelope);
      // `storage.setItem` never throws; it reports failure so a quota or blocked
      // context surfaces to the user instead of silently losing the write.
      if (!profileStorage.setItem(key, value)) {
        onErrorRef.current?.(new Error(profileStorage.reason ?? 'storage unavailable'));
      } else {
        pendingRef.current = false;
        inMemoryPersistentValues.set(profileStorageKey, {
          value,
          pending: false,
          owner: registryOwner.current,
        });
      }
      announceLocalStorageChange({ key, value, profileId });
    }, debounceMs);
    return () => window.clearTimeout(id);
  }, [key, profileId, profileStorage, profileStorageKey, state, debounceMs]);

  // Cross-tab sync.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== profileStorageKey || e.newValue == null) return;
      try {
        const next = migrate(JSON.parse(e.newValue), migrationsRef.current) as T;
        stateRef.current = next;
        setStateInternal(next);
      } catch {
        /* ignore a malformed write from another tab */
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [key, profileStorageKey]);

  // Same-document notifications are needed because the native `storage` event
  // fires only in *other* tabs. Cloud sync writes use this path too.
  useEffect(() => {
    const onLocalChange = (event: Event) => {
      const detail = (
        event as CustomEvent<{
          key: string;
          value: string | null;
          profileId?: ReturnType<typeof getActiveStorageProfile>;
        }>
      ).detail;
      if (!detail || detail.key !== key || detail.profileId !== profileId || detail.value == null)
        return;
      try {
        const next = migrate(JSON.parse(detail.value), migrationsRef.current) as T;
        stateRef.current = next;
        setStateInternal(next);
      } catch {
        /* Ignore malformed local writes just as we do cross-tab writes. */
      }
    };
    window.addEventListener(LOCAL_STORAGE_CHANGE, onLocalChange);
    return () => window.removeEventListener(LOCAL_STORAGE_CHANGE, onLocalChange);
  }, [key, profileId]);

  useEffect(
    () => () => {
      if (inMemoryPersistentValues.get(profileStorageKey)?.owner === registryOwner.current) {
        inMemoryPersistentValues.delete(profileStorageKey);
      }
    },
    [profileStorageKey],
  );

  return [state, setPersistentState] as const;
}

export function useCollection<Item extends { id: string }>(
  opts: Omit<PersistentOptions<Item[]>, 'fallback'> & { fallback?: Item[] },
) {
  const [items, setItems] = usePersistentState<Item[]>({ ...opts, fallback: opts.fallback ?? [] });

  /**
   * Mirror of the latest items, assigned during render so it is always current
   * by the time an event handler runs. `remove` needs the row it deleted in
   * order to offer Undo — and it must NOT capture that inside the setState
   * updater, because updaters are deferred (and double-invoked under
   * StrictMode). That is the same impure-updater defect the audit found in the
   * original Timer.
   */
  const itemsRef = useRef(items);
  itemsRef.current = items;

  const add = useCallback((item: Item) => setItems((prev) => [...prev, item]), [setItems]);

  const update = useCallback(
    (id: string, patch: Partial<Item>) =>
      setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it))),
    [setItems],
  );

  /**
   * Returns the removed item and its index so the caller can offer Undo.
   *
   * Reads from `itemsRef` rather than capturing inside the updater: a setState
   * updater is deferred, so a value assigned in it is still unset when the
   * function returns — and StrictMode double-invokes updaters, which would make
   * the captured value nondeterministic. The updater below stays pure.
   */
  const remove = useCallback(
    (id: string): { item: Item; index: number } | null => {
      const index = itemsRef.current.findIndex((it) => it.id === id);
      if (index < 0) return null;
      const item = itemsRef.current[index]!;
      setItems((prev) => prev.filter((it) => it.id !== id));
      return { item, index };
    },
    [setItems],
  );

  const restore = useCallback(
    (item: Item, index?: number) =>
      setItems((prev) => {
        if (prev.some((it) => it.id === item.id)) return prev;
        const next = [...prev];
        next.splice(index ?? next.length, 0, item);
        return next;
      }),
    [setItems],
  );

  return useMemo(
    () => ({ items, setItems, add, update, remove, restore }),
    [items, setItems, add, update, remove, restore],
  );
}
