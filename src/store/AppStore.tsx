/**
 * Single app-wide store.
 *
 * The original App.tsx destructured five hooks and threaded 20+ props down
 * through every page. A context removes that drilling and gives every page the
 * same API, which is also what makes the command palette possible later.
 */
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useCollection, usePersistentState } from './usePersistentState';
import {
  isValidDeadline,
  isValidNote,
  isValidPlannerEntry,
  isValidTask,
  isValidTimetableEntry,
} from './validators';
import { createId } from '../lib/id';
import {
  DEFAULT_SETTINGS,
  type Deadline,
  type Note,
  type PlannerEntry,
  type Settings,
  type Task,
  type TimetableEntry,
} from '../types';
import { ToastHost, useToastController, type ToastInput } from '../components/ui/Toast';

export const KEYS = {
  tasks: 'studydesk.tasks',
  deadlines: 'studydesk.deadlines',
  timetable: 'studydesk.timetable',
  notes: 'studydesk.notes',
  planner: 'studydesk.planner',
  settings: 'studydesk.settings',
} as const;

export interface Collection<Item extends { id: string }> {
  items: Item[];
  add: (item: Item) => void;
  update: (id: string, patch: Partial<Item>) => void;
  /** Returns the removed row so callers can offer Undo. */
  remove: (id: string) => { item: Item; index: number } | null;
  restore: (item: Item, index?: number) => void;
  setItems: React.Dispatch<React.SetStateAction<Item[]>>;
}

interface StoreValue {
  tasks: Collection<Task>;
  deadlines: Collection<Deadline>;
  timetable: Collection<TimetableEntry>;
  notes: Collection<Note>;
  planner: Collection<PlannerEntry>;
  settings: Settings;
  updateSettings: (patch: Partial<Settings>) => void;
  /** Factory helpers so pages never hand-build an id or timestamp. */
  newTask: (title: string, dueDate?: string) => Task;
  newDeadline: (d: Omit<Deadline, 'id' | 'createdAt' | 'completed'>) => Deadline;
  newTimetableEntry: (e: Omit<TimetableEntry, 'id'>) => TimetableEntry;
  newNote: (n: Pick<Note, 'title' | 'content'> & Partial<Pick<Note, 'tags' | 'pinned'>>) => Note;
  newPlannerEntry: (p: Omit<PlannerEntry, 'id'>) => PlannerEntry;
  toast: (input: ToastInput) => void;
  storageError: string | null;
  dismissStorageError: () => void;
}

const StoreContext = createContext<StoreValue | null>(null);

export function AppStoreProvider({ children }: { children: ReactNode }) {
  const toastCtl = useToastController();

  const [storageError, setStorageError] = useState<string | null>(null);
  const warnedRef = useRef(false);
  const onStorageError = useCallback((err: unknown) => {
    if (warnedRef.current) return;
    warnedRef.current = true;
    const quota =
      err instanceof DOMException &&
      (err.name === 'QuotaExceededError' || err.name === 'NS_ERROR_DOM_QUOTA_REACHED');
    setStorageError(
      quota
        ? 'Browser storage is full. Recent changes may not survive a reload — export a backup from Settings.'
        : 'A change could not be saved to this browser. Export a backup from Settings to be safe.',
    );
  }, []);

  const tasks = useCollection<Task>({
    key: KEYS.tasks,
    fallback: [],
    validateItem: isValidTask,
    onError: onStorageError,
  });
  const deadlines = useCollection<Deadline>({
    key: KEYS.deadlines,
    fallback: [],
    validateItem: isValidDeadline,
    onError: onStorageError,
  });
  const timetable = useCollection<TimetableEntry>({
    key: KEYS.timetable,
    fallback: [],
    validateItem: isValidTimetableEntry,
    onError: onStorageError,
  });
  const notes = useCollection<Note>({
    key: KEYS.notes,
    fallback: [],
    validateItem: isValidNote,
    onError: onStorageError,
  });
  const planner = useCollection<PlannerEntry>({
    key: KEYS.planner,
    fallback: [],
    validateItem: isValidPlannerEntry,
    onError: onStorageError,
  });
  const [settings, setSettings] = usePersistentState<Settings>({
    key: KEYS.settings,
    fallback: DEFAULT_SETTINGS,
    onError: onStorageError,
  });

  const updateSettings = useCallback(
    (patch: Partial<Settings>) => setSettings((prev) => ({ ...prev, ...patch })),
    [setSettings],
  );

  const newTask = useCallback<StoreValue['newTask']>(
    (title, dueDate) => ({
      id: createId(),
      title,
      completed: false,
      ...(dueDate ? { dueDate } : {}),
      createdAt: new Date().toISOString(),
    }),
    [],
  );

  const newDeadline = useCallback<StoreValue['newDeadline']>(
    (d) => ({ ...d, id: createId(), completed: false, createdAt: new Date().toISOString() }),
    [],
  );

  const newTimetableEntry = useCallback<StoreValue['newTimetableEntry']>(
    (e) => ({ ...e, id: createId() }),
    [],
  );

  const newNote = useCallback<StoreValue['newNote']>((n) => {
    const now = new Date().toISOString();
    return {
      id: createId(),
      title: n.title,
      content: n.content,
      tags: n.tags ?? [],
      pinned: n.pinned ?? false,
      createdAt: now,
      updatedAt: now,
    };
  }, []);

  const newPlannerEntry = useCallback<StoreValue['newPlannerEntry']>(
    (p) => ({ ...p, id: createId() }),
    [],
  );

  const value = useMemo<StoreValue>(
    () => ({
      tasks,
      deadlines,
      timetable,
      notes,
      planner,
      settings,
      updateSettings,
      newTask,
      newDeadline,
      newTimetableEntry,
      newNote,
      newPlannerEntry,
      toast: toastCtl.push,
      storageError,
      dismissStorageError: () => setStorageError(null),
    }),
    [
      tasks,
      deadlines,
      timetable,
      notes,
      planner,
      settings,
      updateSettings,
      newTask,
      newDeadline,
      newTimetableEntry,
      newNote,
      newPlannerEntry,
      toastCtl.push,
      storageError,
    ],
  );

  return (
    <StoreContext.Provider value={value}>
      {children}
      <ToastHost controller={toastCtl} />
    </StoreContext.Provider>
  );
}

export function useStore(): StoreValue {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore must be used inside <AppStoreProvider>');
  return ctx;
}
