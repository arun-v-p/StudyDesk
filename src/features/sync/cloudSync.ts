import type { RealtimeChannel, User } from '@supabase/supabase-js';
import { LOCAL_STORAGE_CHANGE, announceLocalStorageChange } from '../../lib/localChanges';
import { supabase } from '../../lib/supabase';
import { getActiveStorageProfile, storage } from '../../lib/safeStorage';
import { KEYS } from '../../store/AppStore';
import { EXAM_TIMETABLE_KEY } from '../../store/examTimetable';
import { MATERIALS_KEY } from '../../store/materials';
import { getInMemoryPersistentValue } from '../../store/usePersistentState';
import { TIMER_STORAGE_KEY } from '../timer/usePomodoro';

type Scope =
  | 'tasks'
  | 'deadlines'
  | 'timetable'
  | 'notes'
  | 'planner'
  | 'revision_plans'
  | 'calendar_events'
  | 'semester_templates'
  | 'study_resources'
  | 'settings'
  | 'exam_timetable'
  | 'materials_metadata'
  | 'timer';

interface Descriptor {
  key: string;
  scope: Scope;
  array: boolean;
}

const DESCRIPTORS: Descriptor[] = [
  { key: KEYS.tasks, scope: 'tasks', array: true },
  { key: KEYS.deadlines, scope: 'deadlines', array: true },
  { key: KEYS.timetable, scope: 'timetable', array: true },
  { key: KEYS.notes, scope: 'notes', array: true },
  { key: KEYS.planner, scope: 'planner', array: true },
  { key: KEYS.revisionPlans, scope: 'revision_plans', array: true },
  { key: KEYS.calendarEvents, scope: 'calendar_events', array: true },
  { key: KEYS.semesterTemplates, scope: 'semester_templates', array: true },
  { key: KEYS.studyResources, scope: 'study_resources', array: true },
  { key: KEYS.settings, scope: 'settings', array: false },
  { key: EXAM_TIMETABLE_KEY, scope: 'exam_timetable', array: true },
  { key: MATERIALS_KEY, scope: 'materials_metadata', array: false },
  { key: TIMER_STORAGE_KEY, scope: 'timer', array: false },
];

const SHADOW_PREFIX = 'studydesk.sync.shadow.';
const OUTBOX_PREFIX = 'studydesk.sync.outbox.';
const INITIALIZATION_PREFIX = 'studydesk.sync.initialization.';

interface CloudRecord {
  scope: Scope;
  item_id: string;
  payload: unknown | null;
  updated_at: string;
  deleted_at: string | null;
}

interface ShadowEntry {
  fingerprint: string;
  updatedAt: string;
}

interface PendingWrite {
  scope: Scope;
  itemId: string;
  payload: unknown;
  updatedAt: string;
  deletedAt: string | null;
}

interface OutboxLoadResult {
  records: Map<string, PendingWrite>;
  corruptRaw: string | null;
  recoveryMessage: string | null;
}

export type InitializationStatus = 'pending' | 'uploading' | 'downloading' | 'complete';
export type CloudSyncState = 'idle' | 'syncing' | 'synced' | 'error';

interface InitialRecord {
  scope: Scope;
  itemId: string;
  updatedAt: string;
  fingerprint: string;
}

interface InitializationProgress {
  version: 1;
  status: InitializationStatus;
  mode: 'upload' | 'download' | null;
  completed: string[];
  records?: InitialRecord[];
}

type Shadow = Record<string, ShadowEntry>;

const descriptorForKey = (key: string) => DESCRIPTORS.find((item) => item.key === key);
const idFor = (scope: Scope, id: string) => `${scope}:${id}`;
const fingerprint = (value: unknown) => JSON.stringify(value);
const now = () => new Date().toISOString();
const initializationId = (record: Pick<InitialRecord, 'scope' | 'itemId'>) =>
  idFor(record.scope, record.itemId);

function parseDocument(raw: string | null, array: boolean): unknown {
  if (!raw) return array ? [] : null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed === 'object' && parsed !== null && 'data' in parsed) {
      return (parsed as { data: unknown }).data;
    }
    return parsed;
  } catch {
    return array ? [] : null;
  }
}

function serialiseDocument(value: unknown, key: string): string {
  // Persistent collections use a version envelope. Materials and timer predate
  // that hook and retain their established envelopes/shape.
  if (key === MATERIALS_KEY) return JSON.stringify({ v: 1, data: value });
  if (key === TIMER_STORAGE_KEY) return JSON.stringify(value);
  return JSON.stringify({ v: 2, data: value });
}

export class CloudSync {
  private shadow: Shadow = {};
  private user: User | null = null;
  private sessionGeneration = 0;
  private progress: InitializationProgress = {
    version: 1,
    status: 'pending',
    mode: null,
    completed: [],
  };
  private channel: RealtimeChannel | null = null;
  private running = false;
  private suppress = new Set<string>();
  private pending = new Map<string, PendingWrite>();
  private flushFlight: { generation: number; promise: Promise<void> } | null = null;
  private recoveryMessage: string | null = null;
  private onStatus: (status: string | null) => void;
  private onSyncState: (state: CloudSyncState) => void;

  constructor(
    onStatus: (status: string | null) => void,
    onSyncState: (state: CloudSyncState) => void = () => undefined,
  ) {
    this.onStatus = onStatus;
    this.onSyncState = onSyncState;
  }

  async start(user: User): Promise<{
    remoteCount: number;
    localCount: number;
    initializationStatus: InitializationStatus;
    recoveryMessage: string | null;
  } | null> {
    if (!supabase) throw new Error('Supabase is not configured.');
    if (getActiveStorageProfile() !== user.id) {
      throw new Error('The active local profile does not match the signed-in sync account.');
    }
    this.stop();
    const generation = this.sessionGeneration;
    this.user = user;
    this.onSyncState('syncing');
    this.shadow = this.loadShadow(user.id);
    const outbox = this.loadOutbox(user.id);
    this.pending = outbox.records;
    this.recoveryMessage = outbox.recoveryMessage;
    if (outbox.corruptRaw !== null) {
      if (!storage.setItem(`${OUTBOX_PREFIX}${user.id}.recovery`, outbox.corruptRaw)) {
        throw new Error(
          storage.reason ?? 'Could not preserve the damaged sync queue for recovery.',
        );
      }
    }
    const savedProgress = this.loadProgress(user.id);
    if (savedProgress) {
      this.progress = savedProgress;
    } else {
      this.progress = { version: 1, status: 'pending', mode: null, completed: [] };
      this.saveProgress();
    }
    const { data, error } = await supabase
      .from('study_records')
      .select('scope,item_id,payload,updated_at,deleted_at')
      .eq('user_id', user.id);
    if (!this.isCurrentSession(generation, user.id)) return null;
    if (error) throw error;
    if (this.hasInitialised()) this.reconcileLocalState(data ?? []);
    this.running = true;
    this.channel = supabase
      .channel(`studydesk:${user.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'study_records', filter: `user_id=eq.${user.id}` },
        (event) => {
          if (this.isCurrentSession(generation, user.id)) {
            this.applyRemote(event.new as CloudRecord);
          }
        },
      )
      .subscribe();
    window.addEventListener(LOCAL_STORAGE_CHANGE, this.onLocalChange as EventListener);
    window.addEventListener('online', this.onOnline);
    if (this.hasInitialised()) {
      void this.flush()
        .then(() => {
          if (this.isCurrentSession(generation, user.id)) this.onSyncState('synced');
        })
        .catch((error: unknown) => {
          if (this.isCurrentSession(generation, user.id)) {
            this.onSyncState('error');
            this.onStatus(
              error instanceof Error ? error.message : 'Waiting for a connection to sync changes.',
            );
          }
        });
    } else {
      this.onSyncState('idle');
    }
    return {
      remoteCount: data?.length ?? 0,
      localCount: this.localCount(),
      initializationStatus: this.progress.status,
      recoveryMessage: this.recoveryMessage,
    };
  }

  hasInitialised(): boolean {
    return this.progress.status === 'complete';
  }

  getInitializationStatus(): InitializationStatus {
    return this.progress.status;
  }

  getRecoveryMessage(): string | null {
    return this.recoveryMessage;
  }

  stop(): void {
    this.sessionGeneration += 1;
    this.running = false;
    window.removeEventListener(LOCAL_STORAGE_CHANGE, this.onLocalChange as EventListener);
    window.removeEventListener('online', this.onOnline);
    if (supabase && this.channel) void supabase.removeChannel(this.channel);
    this.channel = null;
    this.user = null;
    this.suppress.clear();
    this.recoveryMessage = null;
  }

  async uploadInitial(): Promise<void> {
    if (!supabase) throw new Error('Supabase is not configured.');
    if (!this.user) throw new Error('Sign in before uploading this device.');
    if (this.hasInitialised())
      throw new Error('This device is already initialized for cloud sync.');
    const userId = this.user.id;
    const generation = this.sessionGeneration;

    if (this.progress.status !== 'uploading') {
      const { data, error } = await supabase
        .from('study_records')
        .select('scope,item_id,payload,updated_at,deleted_at')
        .eq('user_id', userId);
      if (!this.isCurrentSession(generation, userId)) return;
      if (error) throw error;
      if (data?.length) {
        throw new Error('Cloud sync already has records. Restore and merge them before uploading.');
      }
      this.progress = {
        version: 1,
        status: 'uploading',
        mode: 'upload',
        records: this.buildInitialManifest(),
        completed: [],
      };
      this.saveProgress();
    }

    const records = this.progress.records ?? [];
    const completed = new Set(this.progress.completed);
    for (const record of records) {
      if (!this.isCurrentSession(generation, userId)) return;
      const key = initializationId(record);
      if (completed.has(key)) continue;

      const value = this.localRecordValue(record.scope, record.itemId);
      const currentFingerprint = value === undefined ? '' : fingerprint(value);
      if (currentFingerprint !== record.fingerprint) {
        record.fingerprint = currentFingerprint;
        record.updatedAt = now();
        this.saveProgress();
      }
      const deletedAt = value === undefined ? record.updatedAt : null;
      const confirmed = await this.push(
        record.scope,
        record.itemId,
        deletedAt ? null : value,
        record.updatedAt,
        deletedAt,
        generation,
        userId,
      );
      if (!this.isCurrentSession(generation, userId)) return;
      if (Date.parse(confirmed.updated_at) < Date.parse(record.updatedAt)) {
        throw new Error(
          'The server returned an older revision; the initial upload remains incomplete.',
        );
      }
      if (
        !recordMatchesWrite(confirmed, {
          scope: record.scope,
          itemId: record.itemId,
          payload: deletedAt ? null : value,
          updatedAt: record.updatedAt,
          deletedAt,
        })
      ) {
        this.applyRemote(confirmed, true);
      } else {
        this.shadow[idFor(record.scope, record.itemId)] = {
          fingerprint: deletedAt ? '' : fingerprint(value),
          updatedAt: confirmed.updated_at,
        };
        this.saveShadow();
      }
      completed.add(key);
      this.progress.completed = [...completed];
      this.saveProgress();
    }

    for (const descriptor of DESCRIPTORS) {
      if (!this.isCurrentSession(generation, userId)) return;
      await this.syncDocument(descriptor, storage.getItem(descriptor.key));
    }
    if (!this.isCurrentSession(generation, userId)) return;
    this.progress = { ...this.progress, status: 'complete' };
    this.saveProgress();
  }

  async downloadInitial(): Promise<void> {
    if (!supabase || !this.user) throw new Error('Sign in before restoring cloud data.');
    if (this.hasInitialised())
      throw new Error('This device is already initialized for cloud sync.');
    if (this.progress.status === 'uploading') {
      throw new Error('Resume the interrupted upload before choosing a restore.');
    }
    const userId = this.user.id;
    const generation = this.sessionGeneration;
    const { data, error } = await supabase
      .from('study_records')
      .select('scope,item_id,payload,updated_at,deleted_at')
      .eq('user_id', userId);
    if (!this.isCurrentSession(generation, userId)) return;
    if (error) throw error;
    const records = (data ?? []) as CloudRecord[];
    this.progress = {
      version: 1,
      status: 'downloading',
      mode: 'download',
      completed:
        this.progress.status === 'downloading' && this.progress.mode === 'download'
          ? this.progress.completed
          : [],
    };
    this.saveProgress();
    const completed = new Set(this.progress.completed);
    for (const record of records) {
      if (!this.isCurrentSession(generation, userId)) return;
      if (completed.has(idFor(record.scope, record.item_id))) continue;
      this.applyRemote(record);
      completed.add(idFor(record.scope, record.item_id));
      this.progress.completed = [...completed];
      this.saveProgress();
    }

    for (const descriptor of DESCRIPTORS) {
      if (!this.isCurrentSession(generation, userId)) return;
      await this.syncDocument(descriptor, storage.getItem(descriptor.key));
    }
    if (!this.isCurrentSession(generation, userId)) return;
    this.progress = { ...this.progress, status: 'complete' };
    this.saveProgress();
  }

  private onLocalChange = (event: Event): void => {
    const detail = (
      event as CustomEvent<{ key: string; value: string | null; profileId?: string | null }>
    ).detail;
    const descriptor = detail && descriptorForKey(detail.key);
    if (
      !descriptor ||
      !this.running ||
      !this.user ||
      detail.profileId !== this.user.id ||
      !this.hasInitialised()
    )
      return;
    if (this.suppress.delete(descriptor.key)) return;
    const userId = this.user.id;
    const generation = this.sessionGeneration;
    void this.syncDocument(descriptor, detail.value).catch((error: unknown) => {
      if (!this.isCurrentSession(generation, userId)) return;
      console.error('[studydesk] cloud sync failed', error);
      this.onSyncState('error');
      this.onStatus(
        error instanceof Error ? error.message : 'Sync failed; changes remain on this device.',
      );
    });
  };

  private onOnline = (): void => {
    if (!this.hasInitialised()) return;
    const userId = this.user?.id;
    const generation = this.sessionGeneration;
    if (!userId) return;
    this.onSyncState('syncing');
    void this.flush()
      .then(() => {
        if (this.isCurrentSession(generation, userId)) this.onSyncState('synced');
      })
      .catch((error: unknown) => {
        if (!this.isCurrentSession(generation, userId)) return;
        this.onSyncState('error');
        this.onStatus(
          error instanceof Error ? error.message : 'Waiting for a connection to sync changes.',
        );
      });
  };

  private async syncDocument(descriptor: Descriptor, raw: string | null): Promise<void> {
    const userId = this.user?.id;
    const generation = this.sessionGeneration;
    const document = parseDocument(raw, descriptor.array);
    const current = new Map<string, unknown>();
    if (descriptor.array && Array.isArray(document)) {
      for (const value of document) {
        const id = itemId(value);
        if (id) current.set(id, value);
      }
    } else if (document !== null) {
      current.set('singleton', document);
    }
    const stamp = now();
    for (const [id, value] of current) {
      const key = idFor(descriptor.scope, id);
      const nextFingerprint = fingerprint(value);
      if (this.shadow[key]?.fingerprint === nextFingerprint) continue;
      this.enqueue(descriptor.scope, id, value, stamp, null);
      this.shadow[key] = { fingerprint: nextFingerprint, updatedAt: stamp };
    }
    if (descriptor.array) {
      for (const [key, entry] of Object.entries(this.shadow)) {
        if (!key.startsWith(`${descriptor.scope}:`)) continue;
        const id = key.slice(descriptor.scope.length + 1);
        if (current.has(id)) continue;
        if (entry.fingerprint === '') continue;
        this.enqueue(descriptor.scope, id, null, stamp, stamp);
        this.shadow[key] = { ...entry, fingerprint: '', updatedAt: stamp };
      }
    }
    this.saveShadow();
    this.onSyncState('syncing');
    await this.flush();
    if (!userId || !this.isCurrentSession(generation, userId)) return;
    this.onStatus(null);
    this.onSyncState('synced');
  }

  private enqueue(
    scope: Scope,
    itemId: string,
    payload: unknown,
    updatedAt: string,
    deletedAt: string | null,
  ): void {
    this.pending.set(idFor(scope, itemId), { scope, itemId, payload, updatedAt, deletedAt });
    this.saveOutbox();
  }

  private reconcileLocalState(records: unknown[]): void {
    const remoteByKey = new Map<string, CloudRecord>();
    for (const candidate of records) {
      if (isCloudRecord(candidate)) {
        remoteByKey.set(idFor(candidate.scope, candidate.item_id), candidate);
      }
    }

    let recoveredLocalChanges = false;
    for (const descriptor of DESCRIPTORS) {
      const memory = getInMemoryPersistentValue(descriptor.key);
      const localDocument = parseDocument(
        memory?.value ?? storage.getItem(descriptor.key),
        descriptor.array,
      );
      const localRecords = new Map<string, unknown>();
      if (descriptor.array && Array.isArray(localDocument)) {
        for (const value of localDocument) {
          const id = itemId(value);
          if (id) localRecords.set(id, value);
        }
      } else if (!descriptor.array && localDocument !== null) {
        localRecords.set('singleton', localDocument);
      }

      const keys = new Set<string>([
        ...localRecords.keys(),
        ...Object.keys(this.shadow)
          .filter((key) => key.startsWith(`${descriptor.scope}:`))
          .map((key) => key.slice(descriptor.scope.length + 1)),
        ...Array.from(remoteByKey.values())
          .filter((record) => record.scope === descriptor.scope)
          .map((record) => record.item_id),
      ]);

      for (const itemIdValue of keys) {
        const key = idFor(descriptor.scope, itemIdValue);
        if (this.pending.has(key)) continue;
        const localValue = localRecords.get(itemIdValue);
        const localFingerprint = localValue === undefined ? '' : fingerprint(localValue);
        const localRevision = this.shadow[key];
        const remote = remoteByKey.get(key);
        const remoteRevision = remote ? Date.parse(remote.updated_at) : -1;
        const localRevisionTime = localRevision ? Date.parse(localRevision.updatedAt) : -1;
        const localIsNewer =
          localRevision !== undefined &&
          localRevision.fingerprint === localFingerprint &&
          localRevisionTime > remoteRevision;

        if (localIsNewer) {
          const updatedAt = localRevision.updatedAt;
          this.enqueue(
            descriptor.scope,
            itemIdValue,
            localValue ?? null,
            updatedAt,
            localValue === undefined ? updatedAt : null,
          );
          recoveredLocalChanges = true;
          continue;
        }

        const localChangedSinceShadow =
          localRevision !== undefined && localRevision.fingerprint !== localFingerprint;
        if (localChangedSinceShadow && (!remote || remoteRevision <= localRevisionTime)) {
          const updatedAt = now();
          this.enqueue(
            descriptor.scope,
            itemIdValue,
            localValue ?? null,
            updatedAt,
            localValue === undefined ? updatedAt : null,
          );
          recoveredLocalChanges = true;
          continue;
        }

        if (remote) {
          if (
            !localRevision ||
            remoteRevision > localRevisionTime ||
            (remoteRevision === localRevisionTime &&
              !sameValue(localFingerprint, remote.deleted_at ? '' : fingerprint(remote.payload)))
          ) {
            this.applyRemote(remote, true);
          }
        } else if (localValue !== undefined && !localRevision) {
          const updatedAt = now();
          this.enqueue(descriptor.scope, itemIdValue, localValue, updatedAt, null);
          this.shadow[key] = { fingerprint: localFingerprint, updatedAt };
          this.saveShadow();
          recoveredLocalChanges = true;
        }
      }
    }

    if (recoveredLocalChanges && !this.recoveryMessage) {
      this.recoveryMessage =
        'Recovered local changes missing from the sync queue; syncing them before continuing.';
    }
    if (this.recoveryMessage) this.onStatus(this.recoveryMessage);
  }

  private async flush(): Promise<void> {
    if (!this.user) return;
    const generation = this.sessionGeneration;
    const userId = this.user.id;
    if (this.flushFlight?.generation === generation) return this.flushFlight.promise;

    const promise = this.runFlush(generation, userId, this.pending).finally(() => {
      if (this.flushFlight?.generation === generation) this.flushFlight = null;
    });
    this.flushFlight = { generation, promise };
    return promise;
  }

  private async push(
    scope: Scope,
    itemId: string,
    payload: unknown,
    updatedAt: string,
    deletedAt: string | null,
    generation = this.sessionGeneration,
    userId = this.user?.id,
  ): Promise<CloudRecord> {
    if (!supabase || !userId) throw new Error('Cloud sync session ended before the write.');
    const { data, error } = await supabase.rpc('sync_studydesk_record', {
      p_scope: scope,
      p_item_id: itemId,
      p_payload: deletedAt ? null : payload,
      p_updated_at: updatedAt,
      p_deleted_at: deletedAt,
    });
    if (error) throw error;
    if (!this.isCurrentSession(generation, userId)) {
      throw new Error('Cloud sync session changed before the write could be reconciled.');
    }
    const record = parseCloudRecord(data);
    if (!record) {
      throw new Error(
        'The server did not confirm the saved cloud revision; the change remains queued.',
      );
    }
    return record;
  }

  private async runFlush(
    generation: number,
    userId: string,
    pending: Map<string, PendingWrite>,
  ): Promise<void> {
    while (this.isCurrentSession(generation, userId)) {
      const next = pending.entries().next().value as [string, PendingWrite] | undefined;
      if (!next) break;
      const [key, write] = next;
      const record = await this.push(
        write.scope,
        write.itemId,
        write.payload,
        write.updatedAt,
        write.deletedAt,
        generation,
        userId,
      );
      if (!this.isCurrentSession(generation, userId)) return;
      if (Date.parse(record.updated_at) < Date.parse(write.updatedAt)) {
        throw new Error('The server returned an older revision; the change remains queued.');
      }

      const current = pending.get(key);
      if (current !== write) continue;

      if (!recordMatchesWrite(record, write)) this.applyRemote(record, true);
      else {
        this.shadow[key] = {
          fingerprint: write.deletedAt ? '' : fingerprint(write.payload),
          updatedAt: record.updated_at,
        };
        this.saveShadow();
      }
      if (pending.get(key) === write) {
        pending.delete(key);
        this.saveOutbox();
      }
    }
    if (this.isCurrentSession(generation, userId) && this.recoveryMessage && pending.size === 0) {
      this.recoveryMessage = null;
      this.onStatus(null);
    }
  }

  private applyRemote(record: CloudRecord, force = false): void {
    if (!isCloudRecord(record)) return;
    if (!record?.scope || !record.item_id) return;
    const descriptor = DESCRIPTORS.find((item) => item.scope === record.scope);
    if (!descriptor) return;
    const key = idFor(record.scope, record.item_id);
    const local = this.shadow[key];
    const remoteFingerprint = record.deleted_at ? '' : fingerprint(record.payload);
    const localRevision = local ? Date.parse(local.updatedAt) : -1;
    const remoteRevision = Date.parse(record.updated_at);
    if (!force && this.pending.has(key)) return;
    if (
      !force &&
      local &&
      (localRevision > remoteRevision ||
        (localRevision === remoteRevision && local.fingerprint === remoteFingerprint))
    ) {
      return;
    }
    const storedRaw = storage.getItem(descriptor.key);
    const memory = getInMemoryPersistentValue(descriptor.key);
    const document = parseDocument(memory?.value ?? storedRaw, descriptor.array);
    const storedDocument = parseDocument(storedRaw, descriptor.array);
    const currentItem = descriptor.array
      ? Array.isArray(document)
        ? document.find((value) => itemId(value) === record.item_id)
        : undefined
      : document;
    const storedItem = descriptor.array
      ? Array.isArray(storedDocument)
        ? storedDocument.find((value) => itemId(value) === record.item_id)
        : undefined
      : storedDocument;
    const hasPendingLocalEdit = memory?.pending === true && !sameValue(currentItem, storedItem);
    let next: unknown;
    if (descriptor.array && Array.isArray(document)) {
      const rest = document.filter((value) => itemId(value) !== record.item_id);
      next = hasPendingLocalEdit ? document : record.deleted_at ? rest : [...rest, record.payload];
    } else if (record.deleted_at) {
      next = hasPendingLocalEdit ? document : null;
    } else if (hasPendingLocalEdit) {
      next = document;
    } else if (this.progress.status === 'downloading') {
      next = mergeSingleton(document, record.payload);
    } else {
      next = record.payload;
    }
    this.shadow[key] = {
      fingerprint: remoteFingerprint,
      updatedAt: record.updated_at,
    };
    this.writeRemoteDocument(descriptor, next);
    this.saveShadow();
  }

  private writeRemoteDocument(descriptor: Descriptor, value: unknown): void {
    this.suppress.add(descriptor.key);
    const raw = serialiseDocument(value, descriptor.key);
    if (!storage.setItem(descriptor.key, raw)) {
      this.suppress.delete(descriptor.key);
      throw new Error(storage.reason ?? 'Could not persist cloud data to this device.');
    }
    announceLocalStorageChange({
      key: descriptor.key,
      value: raw,
      profileId: this.user?.id ?? null,
    });
  }

  private buildInitialManifest(): InitialRecord[] {
    const records: InitialRecord[] = [];
    for (const descriptor of DESCRIPTORS) {
      const document = parseDocument(storage.getItem(descriptor.key), descriptor.array);
      const values = descriptor.array && Array.isArray(document) ? document : [document];
      for (const value of values) {
        const itemIdValue = descriptor.array ? itemId(value) : value == null ? null : 'singleton';
        if (!itemIdValue) continue;
        records.push({
          scope: descriptor.scope,
          itemId: itemIdValue,
          updatedAt: now(),
          fingerprint: fingerprint(value),
        });
      }
    }
    return records;
  }

  private localRecordValue(scope: Scope, itemIdValue: string): unknown | undefined {
    const descriptor = DESCRIPTORS.find((item) => item.scope === scope);
    if (!descriptor) return undefined;
    const document = parseDocument(storage.getItem(descriptor.key), descriptor.array);
    if (descriptor.array) {
      return Array.isArray(document)
        ? document.find((value) => itemId(value) === itemIdValue)
        : undefined;
    }
    return itemIdValue === 'singleton' && document !== null ? document : undefined;
  }

  private localCount(): number {
    return DESCRIPTORS.reduce((total, descriptor) => {
      const value = parseDocument(storage.getItem(descriptor.key), descriptor.array);
      return (
        total + (descriptor.array && Array.isArray(value) ? value.length : value == null ? 0 : 1)
      );
    }, 0);
  }

  private loadShadow(userId: string): Shadow {
    try {
      const parsed: unknown = JSON.parse(storage.getItem(`${SHADOW_PREFIX}${userId}`) ?? '{}');
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {};
      return Object.fromEntries(
        Object.entries(parsed).filter(
          (entry): entry is [string, ShadowEntry] =>
            typeof entry[1] === 'object' &&
            entry[1] !== null &&
            typeof (entry[1] as ShadowEntry).fingerprint === 'string' &&
            typeof (entry[1] as ShadowEntry).updatedAt === 'string',
        ),
      );
    } catch {
      return {};
    }
  }

  private saveShadow(): void {
    if (
      this.user &&
      !storage.setItem(`${SHADOW_PREFIX}${this.user.id}`, JSON.stringify(this.shadow))
    ) {
      throw new Error(storage.reason ?? 'Could not persist cloud sync recovery data.');
    }
  }

  private loadProgress(userId: string): InitializationProgress | null {
    try {
      const parsed: unknown = JSON.parse(
        storage.getItem(`${INITIALIZATION_PREFIX}${userId}`) ?? 'null',
      );
      if (typeof parsed !== 'object' || parsed === null || !('status' in parsed)) return null;
      const progress = parsed as InitializationProgress;
      if (progress.version !== 1) return null;
      if (!['pending', 'uploading', 'downloading', 'complete'].includes(progress.status))
        return null;
      if (
        !['upload', 'download', null].includes(progress.mode) ||
        !Array.isArray(progress.completed) ||
        !progress.completed.every((entry) => typeof entry === 'string')
      ) {
        return null;
      }
      if (
        (progress.status === 'pending' && progress.mode !== null) ||
        (progress.status === 'uploading' && progress.mode !== 'upload') ||
        (progress.status === 'downloading' && progress.mode !== 'download') ||
        (progress.status === 'complete' && progress.mode === null)
      ) {
        return null;
      }
      if (
        progress.mode === 'upload' &&
        (!Array.isArray(progress.records) ||
          !progress.records.every(
            (record) =>
              typeof record.scope === 'string' &&
              DESCRIPTORS.some((descriptor) => descriptor.scope === record.scope) &&
              typeof record.itemId === 'string' &&
              typeof record.updatedAt === 'string' &&
              typeof record.fingerprint === 'string',
          ))
      ) {
        return null;
      }
      if (
        progress.status === 'complete' &&
        progress.mode === 'upload' &&
        progress.records?.some((record) => !progress.completed.includes(initializationId(record)))
      ) {
        return null;
      }
      return progress;
    } catch {
      return null;
    }
  }

  private saveProgress(): void {
    if (
      this.user &&
      !storage.setItem(`${INITIALIZATION_PREFIX}${this.user.id}`, JSON.stringify(this.progress))
    ) {
      throw new Error(storage.reason ?? 'Could not persist cloud sync recovery progress.');
    }
  }

  private loadOutbox(userId: string): OutboxLoadResult {
    const raw = storage.getItem(`${OUTBOX_PREFIX}${userId}`);
    if (raw === null) return { records: new Map(), corruptRaw: null, recoveryMessage: null };
    try {
      const parsed: unknown = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        return {
          records: new Map(),
          corruptRaw: raw,
          recoveryMessage:
            'The saved sync queue is damaged. Recovering local changes against cloud data.',
        };
      }

      const records = new Map<string, PendingWrite>();
      let invalidCount = 0;
      for (const candidate of parsed) {
        if (!isPendingWrite(candidate)) {
          invalidCount++;
          continue;
        }
        const key = idFor(candidate.scope, candidate.itemId);
        const previous = records.get(key);
        if (previous) {
          invalidCount++;
          if (Date.parse(previous.updatedAt) > Date.parse(candidate.updatedAt)) continue;
        }
        records.set(key, candidate);
      }
      return {
        records,
        corruptRaw: invalidCount > 0 ? raw : null,
        recoveryMessage:
          invalidCount > 0
            ? 'Some saved sync queue entries were invalid. Recovering local changes against cloud data.'
            : null,
      };
    } catch {
      return {
        records: new Map(),
        corruptRaw: raw,
        recoveryMessage:
          'The saved sync queue is unreadable. Recovering local changes against cloud data.',
      };
    }
  }

  private saveOutbox(): void {
    if (this.user) {
      if (
        !storage.setItem(
          `${OUTBOX_PREFIX}${this.user.id}`,
          JSON.stringify([...this.pending.values()]),
        )
      ) {
        throw new Error(storage.reason ?? 'Could not persist pending cloud sync changes.');
      }
    }
  }

  private isCurrentSession(generation: number, userId: string): boolean {
    return this.sessionGeneration === generation && this.user?.id === userId;
  }
}

function sameValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function mergeSingleton(local: unknown, remote: unknown): unknown {
  if (local == null) return remote;
  if (
    typeof local !== 'object' ||
    Array.isArray(local) ||
    typeof remote !== 'object' ||
    remote === null ||
    Array.isArray(remote)
  ) {
    return local;
  }

  const merged: Record<string, unknown> = {
    ...(remote as Record<string, unknown>),
    ...(local as Record<string, unknown>),
  };
  for (const [key, remoteValue] of Object.entries(remote)) {
    const localValue = (local as Record<string, unknown>)[key];
    if (
      Array.isArray(remoteValue) &&
      Array.isArray(localValue) &&
      remoteValue.every((value) => itemId(value) !== null) &&
      localValue.every((value) => itemId(value) !== null)
    ) {
      const byId = new Map<string, unknown>();
      for (const value of remoteValue) {
        const id = itemId(value);
        if (id) byId.set(id, value);
      }
      for (const value of localValue) {
        const id = itemId(value);
        if (id) byId.set(id, value);
      }
      merged[key] = [...byId.values()];
    }
  }
  return merged;
}

function itemId(value: unknown): string | null {
  return typeof value === 'object' &&
    value !== null &&
    typeof (value as { id?: unknown }).id === 'string'
    ? (value as { id: string }).id
    : null;
}

function isScope(value: unknown): value is Scope {
  return DESCRIPTORS.some((descriptor) => descriptor.scope === value);
}

function isPendingWrite(value: unknown): value is PendingWrite {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const record = value as Partial<PendingWrite>;
  if (
    !isScope(record.scope) ||
    typeof record.itemId !== 'string' ||
    record.itemId.length < 1 ||
    record.itemId.length > 200 ||
    typeof record.updatedAt !== 'string' ||
    !Number.isFinite(Date.parse(record.updatedAt)) ||
    (record.deletedAt !== null &&
      (typeof record.deletedAt !== 'string' || !Number.isFinite(Date.parse(record.deletedAt))))
  ) {
    return false;
  }
  if (record.deletedAt !== null) return record.payload === null;
  return record.payload !== null && record.payload !== undefined;
}

function isCloudRecord(value: unknown): value is CloudRecord {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const record = value as Partial<CloudRecord>;
  return (
    isScope(record.scope) &&
    typeof record.item_id === 'string' &&
    record.item_id.length >= 1 &&
    record.item_id.length <= 200 &&
    typeof record.updated_at === 'string' &&
    Number.isFinite(Date.parse(record.updated_at)) &&
    (record.deleted_at === null ||
      (typeof record.deleted_at === 'string' && Number.isFinite(Date.parse(record.deleted_at)))) &&
    (record.deleted_at === null
      ? record.payload !== null && record.payload !== undefined
      : record.payload === null)
  );
}

function parseCloudRecord(value: unknown): CloudRecord | null {
  let candidate = value;
  if (Array.isArray(candidate)) candidate = candidate[0];
  if (typeof candidate === 'string') {
    try {
      candidate = JSON.parse(candidate);
    } catch {
      return null;
    }
  }
  return isCloudRecord(candidate) ? candidate : null;
}

function recordMatchesWrite(record: CloudRecord, write: PendingWrite): boolean {
  return (
    record.scope === write.scope &&
    record.item_id === write.itemId &&
    Date.parse(record.updated_at) === Date.parse(write.updatedAt) &&
    (write.deletedAt
      ? record.deleted_at !== null &&
        Date.parse(record.deleted_at) === Date.parse(write.deletedAt) &&
        record.payload === null
      : record.deleted_at === null && sameValue(record.payload, write.payload))
  );
}
