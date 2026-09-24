/**
 * StudyDesk — Focus Timer (corrected)
 *
 * THREE DEFECTS IN src/components/Timer.tsx
 * -----------------------------------------
 * 1. Side effects inside a state updater.
 *      setTimeLeft(t => { if (t <= 1) { clearTimer(); setIsRunning(false);
 *                         if (mode === 'focus') setSessions(s => s + 1); return 0 } … })
 *    React requires updater functions to be pure. In StrictMode they are invoked
 *    twice, so `sessions` double-counts; outside StrictMode it happens to work,
 *    which is exactly why adding StrictMode (recommended) would break it.
 *
 * 2. The interval is torn down and recreated every second because `timeLeft`
 *    is in the dependency array. Combined with 1000 ms `setInterval` this drifts:
 *    each cycle loses the milliseconds spent in render, so a "25 minute" session
 *    runs long.
 *
 * 3. `sessions` lives only in component state. It resets on reload and never
 *    resets at midnight, yet the UI says "completed today". Both halves of that
 *    sentence are wrong.
 *
 * THE FIX: drive the timer from an absolute deadline timestamp, not a countdown.
 * The interval only re-reads the clock, so it is drift-free, the effect depends
 * only on `isRunning`, and completion is handled in an effect (pure updater).
 * Sessions persist and are bucketed by local date.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { storage } from '../../lib/safeStorage';

export type TimerMode = 'focus' | 'shortBreak' | 'longBreak';

export const DURATIONS: Record<TimerMode, number> = {
  focus: 25 * 60,
  shortBreak: 5 * 60,
  longBreak: 15 * 60,
};

export const LABELS: Record<TimerMode, string> = {
  focus: 'Focus',
  shortBreak: 'Short break',
  longBreak: 'Long break',
};

/** Sessions after which a long break is offered. */
export const LONG_BREAK_EVERY = 4;

const STORAGE_KEY = 'studydesk.timer';

interface TimerPersist {
  /** Local yyyy-mm-dd the counts belong to. */
  day: string;
  completed: number;
  focusSeconds: number;
}

const localDay = (d = new Date()): string => {
  // Local date, NOT toISOString() — that shifts a day backwards in UTC+ timezones.
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

function loadPersisted(): TimerPersist {
  const empty: TimerPersist = { day: localDay(), completed: 0, focusSeconds: 0 };
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return empty;
    const parsed = JSON.parse(raw) as Partial<TimerPersist>;
    // Auto-reset when the stored day is not today.
    if (parsed.day !== localDay()) return empty;
    return {
      day: parsed.day ?? localDay(),
      completed: Number(parsed.completed) || 0,
      focusSeconds: Number(parsed.focusSeconds) || 0,
    };
  } catch {
    return empty;
  }
}

export interface UsePomodoroOptions {
  /** Fired once when a session ends. Wire this to a toast + sound + Notification. */
  onComplete?: (mode: TimerMode, completedToday: number) => void;
  durations?: Partial<Record<TimerMode, number>>;
}

export function usePomodoro({ onComplete, durations }: UsePomodoroOptions = {}) {
  const secs = useMemo(() => ({ ...DURATIONS, ...durations }), [durations]);

  const [mode, setMode] = useState<TimerMode>('focus');
  const [isRunning, setIsRunning] = useState(false);
  const [remaining, setRemaining] = useState(secs.focus);
  const [stats, setStats] = useState<TimerPersist>(loadPersisted);

  /** Absolute end timestamp. `null` when paused/idle. */
  const endsAtRef = useRef<number | null>(null);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  /* --- persist stats --- */
  useEffect(() => {
    if (!storage.setItem(STORAGE_KEY, JSON.stringify(stats))) {
      console.warn('[studydesk] timer stats not persisted:', storage.reason);
    }
  }, [stats]);

  /* --- single interval, only while running --- */
  useEffect(() => {
    if (!isRunning || endsAtRef.current == null) return;

    const tick = () => {
      const left = Math.max(0, Math.round((endsAtRef.current! - Date.now()) / 1000));
      setRemaining(left);
      if (left > 0) return;

      // Completion is handled here (an effect), never inside a setState updater.
      endsAtRef.current = null;
      setIsRunning(false);

      if (mode === 'focus') {
        setStats((s) =>
          s.day === localDay()
            ? { ...s, completed: s.completed + 1, focusSeconds: s.focusSeconds + secs.focus }
            : { day: localDay(), completed: 1, focusSeconds: secs.focus },
        );
      }
    };

    tick(); // paint immediately instead of waiting a full second
    const id = window.setInterval(tick, 250); // sub-second granularity, no drift
    return () => window.clearInterval(id);
    // Deliberately NOT dependent on `remaining`: that is the drift bug.
  }, [isRunning, mode, secs.focus]);

  /* --- notify on completion --- */
  useEffect(() => {
    if (isRunning || remaining !== 0) return;
    onCompleteRef.current?.(mode, stats.completed);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRunning, remaining]);

  const start = useCallback(() => {
    if (remaining <= 0) return;
    endsAtRef.current = Date.now() + remaining * 1000;
    setIsRunning(true);
  }, [remaining]);

  const pause = useCallback(() => {
    endsAtRef.current = null;
    setIsRunning(false);
  }, []);

  const toggle = useCallback(() => (isRunning ? pause() : start()), [isRunning, pause, start]);

  const reset = useCallback(() => {
    endsAtRef.current = null;
    setIsRunning(false);
    setRemaining(secs[mode]);
  }, [mode, secs]);

  const switchMode = useCallback(
    (next: TimerMode, { autostart = false }: { autostart?: boolean } = {}) => {
      endsAtRef.current = null;
      setIsRunning(false);
      setMode(next);
      setRemaining(secs[next]);
      if (autostart) {
        endsAtRef.current = Date.now() + secs[next] * 1000;
        setIsRunning(true);
      }
    },
    [secs],
  );

  /** Pomodoro cycle: auto-suggest a long break every N focus sessions. */
  const nextMode = useCallback((): TimerMode => {
    if (mode !== 'focus') return 'shortBreak';
    return (stats.completed + 1) % LONG_BREAK_EVERY === 0 ? 'longBreak' : 'shortBreak';
  }, [mode, stats.completed]);

  const skip = useCallback(() => switchMode(nextMode()), [nextMode, switchMode]);

  /* --- tab title, so the countdown is visible from another tab --- */
  useEffect(() => {
    const base = document.title.replace(/\s*[·-]\s*StudyDesk.*$/, '');
    if (!isRunning) {
      document.title = base;
      return;
    }
    const m = String(Math.floor(remaining / 60)).padStart(2, '0');
    const s = String(remaining % 60).padStart(2, '0');
    document.title = `${m}:${s} · ${LABELS[mode]} — StudyDesk`;
    return () => {
      document.title = base;
    };
  }, [isRunning, remaining, mode]);

  /* --- global Space to start/pause when not typing --- */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return;
      const el = e.target as HTMLElement | null;
      if (el && /^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(el.tagName)) return;
      e.preventDefault();
      toggle();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toggle]);

  const total = secs[mode];
  return {
    mode,
    remaining,
    isRunning,
    progress: total > 0 ? 1 - remaining / total : 0,
    minutes: Math.floor(remaining / 60),
    seconds: remaining % 60,
    sessionsToday: stats.completed,
    focusSecondsToday: stats.focusSeconds,
    untilLongBreak: LONG_BREAK_EVERY - (stats.completed % LONG_BREAK_EVERY),
    nextMode,
    toggle,
    start,
    pause,
    reset,
    skip,
    switchMode,
  };
}

/**
 * Optional completion chime via WebAudio — no asset to ship, and it respects
 * the autoplay policy because it only runs after a user gesture started the timer.
 */
export function playChime(kind: 'done' | 'break' | 'start' = 'done'): void {
  try {
    const ctx = getAudioContext();
    if (!ctx || ctx.state === 'suspended') return;
    const notes = kind === 'done' ? [660, 880] : kind === 'break' ? [520, 392] : [440];
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const t0 = ctx.currentTime + i * 0.18;
      gain.gain.setValueAtTime(0, t0);
      gain.gain.linearRampToValueAtTime(0.18, t0 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.42);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t0);
      osc.stop(t0 + 0.45);
    });
  } catch {
    // Audio is optional and can be unavailable or blocked by browser policy.
  }
}

let audioContext: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  const Ctx =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return null;
  audioContext ??= new Ctx();
  return audioContext;
}

/** Call from a user gesture so completion sounds are allowed by autoplay policy. */
export async function unlockAudio(): Promise<boolean> {
  try {
    const ctx = getAudioContext();
    if (!ctx) return false;
    if (ctx.state === 'suspended') await ctx.resume();
    return ctx.state === 'running';
  } catch {
    return false;
  }
}
