import { useCallback, useEffect, useState } from 'react';
import { Pause, Play, RotateCcw, SkipForward, Volume2, VolumeX } from 'lucide-react';
import { useStore } from '../store/AppStore';
import { Card } from '../components/ui/Card';
import { IconButton } from '../components/ui/IconButton';
import {
  usePomodoro,
  playChime,
  LABELS,
  LONG_BREAK_EVERY,
  type TimerMode,
  unlockAudio,
} from '../features/timer/usePomodoro';

const MODES: TimerMode[] = ['focus', 'shortBreak', 'longBreak'];

export function TimerPage() {
  const { toast } = useStore();
  const [sound, setSound] = useState(true);
  const [notificationStatus, setNotificationStatus] = useState<
    'granted' | 'default' | 'denied' | 'unsupported'
  >('unsupported');
  const [soundStatus, setSoundStatus] = useState<string | null>(null);

  const readNotificationStatus = useCallback(() => {
    if (typeof window === 'undefined' || !('Notification' in window) || !window.isSecureContext) {
      return 'unsupported' as const;
    }
    return Notification.permission;
  }, []);

  useEffect(() => {
    setNotificationStatus(readNotificationStatus());
  }, [readNotificationStatus]);

  const onComplete = useCallback(
    (mode: TimerMode, completedToday: number) => {
      if (sound) playChime(mode === 'focus' ? 'done' : 'break');
      toast({
        message:
          mode === 'focus'
            ? `Focus session ${completedToday} complete — take a break`
            : 'Break over — back to it',
        tone: mode === 'focus' ? 'success' : 'info',
        duration: 6000,
      });
      // Best-effort desktop notification; ignored if permission is not granted.
      if (notificationStatus === 'granted') {
        try {
          new Notification('StudyDesk', {
            body: mode === 'focus' ? 'Focus session complete.' : 'Break finished.',
          });
        } catch (error) {
          console.warn('[studydesk] desktop notification failed', error);
        }
      }
    },
    [notificationStatus, sound, toast],
  );

  const t = usePomodoro({ onComplete });

  const r = 118;
  const circumference = 2 * Math.PI * r;
  const offset = circumference * (1 - t.progress);

  const requestNotifications = async () => {
    const current = readNotificationStatus();
    setNotificationStatus(current);
    if (current === 'unsupported') {
      toast({ message: 'Notifications are unsupported on this origin or browser', tone: 'info' });
      return;
    }
    if (current === 'denied') {
      toast({
        message: 'Notifications are blocked. Allow them in browser site settings.',
        tone: 'info',
      });
      return;
    }
    if (current === 'granted') {
      toast({ message: 'Desktop notifications are already enabled', tone: 'success' });
      return;
    }
    try {
      const res = await Notification.requestPermission();
      setNotificationStatus(res);
      toast(
        res === 'granted'
          ? { message: 'Desktop notifications enabled', tone: 'success' }
          : res === 'denied'
            ? {
                message: 'Notifications blocked. Allow them in browser site settings.',
                tone: 'info',
              }
            : { message: 'Notification permission was not granted.', tone: 'info' },
      );
    } catch (error) {
      console.warn('[studydesk] notification permission request failed', error);
      setNotificationStatus('unsupported');
      toast({ message: 'Notifications are unavailable in this browser', tone: 'info' });
    }
  };

  const toggleTimer = async () => {
    if (sound && !t.isRunning) {
      const unlocked = await unlockAudio();
      if (!unlocked) setSoundStatus('Sound is unavailable or blocked by browser audio policy.');
      else setSoundStatus(null);
      if (unlocked) playChime('start');
    }
    t.toggle();
  };

  const testSound = async () => {
    const unlocked = await unlockAudio();
    if (!unlocked) {
      setSoundStatus('Sound is unavailable or blocked by browser audio policy.');
      return;
    }
    playChime('done');
    setSoundStatus('Test sound played');
  };

  const mm = String(t.minutes).padStart(2, '0');
  const ss = String(t.seconds).padStart(2, '0');

  return (
    <div className="mx-auto flex max-w-xl flex-col items-center gap-6 py-4">
      <div
        className="border-border bg-sunken flex gap-1 rounded-full border p-1"
        role="tablist"
        aria-label="Timer mode"
      >
        {MODES.map((m) => {
          const active = t.mode === m;
          return (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => t.switchMode(m)}
              className={`rounded-full px-4 py-1.5 text-xs font-semibold transition-colors ${
                active ? 'bg-accent text-accent-fg shadow-raise' : 'text-muted hover:text-fg'
              }`}
            >
              {LABELS[m]}
            </button>
          );
        })}
      </div>

      <div className="relative h-[264px] w-[264px]">
        <svg viewBox="0 0 264 264" className="h-full w-full -rotate-90" aria-hidden="true">
          <defs>
            <linearGradient id="timerGradient" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="var(--color-accent)" />
              <stop offset="100%" stopColor="var(--color-info)" />
            </linearGradient>
          </defs>
          <circle
            cx="132"
            cy="132"
            r={r}
            fill="none"
            stroke="var(--color-raised)"
            strokeWidth="9"
          />
          <circle
            cx="132"
            cy="132"
            r={r}
            fill="none"
            stroke="url(#timerGradient)"
            strokeWidth="9"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            style={{ transition: 'stroke-dashoffset 250ms linear' }}
          />
        </svg>
        <div className="absolute inset-0 grid place-content-center text-center">
          <p
            className="text-fg font-mono text-[52px] leading-none font-light tracking-tight"
            role="timer"
            aria-live="off"
            aria-label={`${t.minutes} minutes ${t.seconds} seconds remaining`}
          >
            {mm}:{ss}
          </p>
          <p className="text-2xs text-subtle mt-2.5 font-semibold tracking-[0.11em] uppercase">
            {LABELS[t.mode]} · session {t.sessionsToday + 1}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2.5">
        <IconButton
          aria-label="Reset timer"
          onClick={t.reset}
          className="border-border bg-surface !h-11 !w-11 border"
        >
          <RotateCcw className="h-[18px] w-[18px]" aria-hidden="true" />
        </IconButton>
        <button
          type="button"
          onClick={() => void toggleTimer()}
          aria-label={t.isRunning ? 'Pause timer' : 'Start timer'}
          className="bg-accent text-accent-fg shadow-float ring-accent-soft duration-fast ease-out-soft hover:bg-accent-hover grid h-[70px] w-[70px] place-items-center rounded-full ring-[6px] transition-transform active:scale-95"
        >
          {t.isRunning ? (
            <Pause className="h-6 w-6" aria-hidden="true" fill="currentColor" />
          ) : (
            <Play className="ml-0.5 h-6 w-6" aria-hidden="true" fill="currentColor" />
          )}
        </button>
        <IconButton
          aria-label="Skip to next session"
          onClick={t.skip}
          className="border-border bg-surface !h-11 !w-11 border"
        >
          <SkipForward className="h-[18px] w-[18px]" aria-hidden="true" />
        </IconButton>
      </div>

      {/* Pomodoro cycle: the original promised a long break every 4 sessions but never tracked it. */}
      <div className="flex items-center gap-2">
        <span className="flex gap-1.5" aria-hidden="true">
          {Array.from({ length: LONG_BREAK_EVERY }).map((_, i) => (
            <span
              key={i}
              className={`h-2 w-2 rounded-full ${
                i < t.sessionsToday % LONG_BREAK_EVERY ? 'bg-accent' : 'bg-border-strong'
              }`}
            />
          ))}
        </span>
        <span className="text-subtle text-xs">{t.untilLongBreak} more until a long break</span>
      </div>

      <Card className="w-full">
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <Stat label="Sessions today" value={String(t.sessionsToday)} />
          <Stat
            label="Focus time"
            value={`${Math.floor(t.focusSecondsToday / 3600)}h ${Math.round(
              (t.focusSecondsToday % 3600) / 60,
            )}m`}
          />
          <Stat label="Next up" value={LABELS[t.nextMode()]} />
        </dl>
        <div className="border-border mt-4 flex flex-wrap items-center gap-2 border-t pt-4">
          <button
            type="button"
            className="btn btn--ghost !min-h-9 !py-1.5 !text-xs"
            onClick={() => setSound((s) => !s)}
            aria-pressed={sound}
          >
            {sound ? (
              <Volume2 className="h-3.5 w-3.5" aria-hidden="true" />
            ) : (
              <VolumeX className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            {sound ? 'Sound on' : 'Sound off'}
          </button>
          <button
            type="button"
            className="btn btn--ghost !min-h-9 !py-1.5 !text-xs"
            onClick={() => void testSound()}
            disabled={!sound}
          >
            Test sound
          </button>
          <button
            type="button"
            className="btn btn--ghost !min-h-9 !py-1.5 !text-xs"
            onClick={requestNotifications}
          >
            {notificationStatus === 'granted'
              ? 'Notifications enabled'
              : notificationStatus === 'denied'
                ? 'Notifications blocked'
                : notificationStatus === 'unsupported'
                  ? 'Notifications unsupported'
                  : 'Enable notifications'}
          </button>
          <span role="status" aria-label="Notification status" className="text-2xs text-subtle">
            Notification status:{' '}
            {notificationStatus === 'default' ? 'Not granted' : notificationStatus}
          </span>
          {soundStatus && (
            <span role="status" className="text-2xs text-subtle">
              {soundStatus}
            </span>
          )}
          <span className="text-2xs text-subtle ml-auto">
            Press <kbd className="border-border bg-raised rounded border px-1 font-mono">Space</kbd>{' '}
            to start or pause
          </span>
        </div>
      </Card>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-2xs text-subtle font-semibold tracking-wider uppercase">{label}</dt>
      <dd className="text-fg mt-1 text-lg font-bold tracking-tight">{value}</dd>
    </div>
  );
}
