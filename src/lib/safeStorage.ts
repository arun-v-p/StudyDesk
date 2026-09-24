/**
 * Storage access that never throws.
 *
 * `localStorage` is NOT guaranteed to be usable. Accessing it throws a
 * SecurityError when:
 *   - the page is in a sandboxed iframe without `allow-same-origin`
 *   - third-party cookies/site data are blocked
 *   - the document is opened from a `file://` or `null` origin in some browsers
 * and `setItem` throws QuotaExceededError when storage is full or disabled
 * (Safari private mode historically threw on every write).
 *
 * The original build wrapped `getItem`/`setItem` in try/catch, which stopped the
 * throw but silently lost the write. This module keeps the app fully functional
 * by falling back to an in-memory Map, and reports the degraded state so the UI
 * can warn the user that changes will not survive a reload.
 */

export interface SafeStorage {
  /** True when writes reach real localStorage and will survive a reload. */
  readonly persistent: boolean;
  /** Why persistence is unavailable, when it is not. */
  readonly reason: string | null;
  getItem(key: string): string | null;
  setItem(key: string, value: string): boolean;
  removeItem(key: string): void;
  key(index: number): string | null;
  readonly length: number;
  /** Total bytes stored across studydesk keys — used by the storage meter. */
  bytesUsed(prefix?: string): number;
}

class MemoryStorage implements SafeStorage {
  private readonly map = new Map<string, string>();

  constructor(readonly reason: string) {}

  get persistent(): false {
    return false;
  }

  getItem(key: string): string | null {
    return this.map.has(key) ? (this.map.get(key) as string) : null;
  }

  setItem(key: string, value: string): boolean {
    this.map.set(key, value);
    return true;
  }

  removeItem(key: string): void {
    this.map.delete(key);
  }

  key(index: number): string | null {
    return [...this.map.keys()][index] ?? null;
  }

  get length(): number {
    return this.map.size;
  }

  bytesUsed(prefix = ''): number {
    let total = 0;
    for (const [k, v] of this.map) {
      if (!prefix || k.startsWith(prefix)) total += k.length + v.length;
    }
    return total;
  }
}

class DomStorage implements SafeStorage {
  private degraded: string | null = null;
  private fallback: MemoryStorage | null = null;

  get persistent(): boolean {
    return this.degraded == null;
  }

  get reason(): string | null {
    return this.degraded;
  }

  private get store(): Storage | null {
    try {
      // Touching the property itself can throw in a sandboxed frame.
      const s = window.localStorage;
      const probe = '__studydesk_probe__';
      s.setItem(probe, '1');
      s.removeItem(probe);
      return s;
    } catch (err) {
      this.degraded = describe(err);
      return null;
    }
  }

  private memory(): MemoryStorage {
    if (!this.fallback) this.fallback = new MemoryStorage(this.degraded ?? 'unavailable');
    return this.fallback;
  }

  getItem(key: string): string | null {
    const s = this.store;
    if (!s) return this.memory().getItem(key);
    try {
      return s.getItem(key);
    } catch (err) {
      this.degraded = describe(err);
      return this.memory().getItem(key);
    }
  }

  /** Returns false when the write could not be persisted (quota or blocked). */
  setItem(key: string, value: string): boolean {
    const s = this.store;
    if (!s) {
      this.memory().setItem(key, value);
      return false;
    }
    try {
      s.setItem(key, value);
      return true;
    } catch (err) {
      this.degraded = describe(err);
      console.error(`[studydesk] could not persist "${key}"`, err);
      // Keep the app working for this session even though the write was lost.
      this.memory().setItem(key, value);
      return false;
    }
  }

  removeItem(key: string): void {
    this.memory().removeItem(key);
    const s = this.store;
    if (!s) return;
    try {
      s.removeItem(key);
    } catch (err) {
      this.degraded = describe(err);
    }
  }

  key(index: number): string | null {
    const s = this.store;
    return s ? s.key(index) : this.memory().key(index);
  }

  get length(): number {
    const s = this.store;
    return s ? s.length : this.memory().length;
  }

  bytesUsed(prefix = 'studydesk'): number {
    let total = 0;
    try {
      const s = this.store;
      if (s) {
        for (let i = 0; i < s.length; i++) {
          const k = s.key(i);
          if (!k || (prefix && !k.startsWith(prefix))) continue;
          total += k.length + (s.getItem(k) ?? '').length;
        }
        return total;
      }
    } catch {
      /* fall through to memory */
    }
    return this.memory().bytesUsed(prefix);
  }
}

function describe(err: unknown): string {
  if (err instanceof DOMException) {
    if (err.name === 'QuotaExceededError' || err.name === 'NS_ERROR_DOM_QUOTA_REACHED') {
      return 'Browser storage is full.';
    }
    if (err.name === 'SecurityError') {
      return 'Browser storage is blocked in this context.';
    }
  }
  return 'Browser storage is unavailable.';
}

/** Singleton. Probe once, then reuse — probing on every call is wasteful. */
export const storage: SafeStorage = new DomStorage();
