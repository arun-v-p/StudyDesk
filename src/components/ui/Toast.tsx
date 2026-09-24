/**
 * Toast host with Undo.
 *
 * The original app deleted records permanently with no confirmation and no
 * feedback. An undoable toast is faster and less naggy than a confirm dialog,
 * and it is the pattern users expect from Gmail / Notion / Linear.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, Check, Info, X, XCircle } from 'lucide-react';

export type ToastTone = 'success' | 'danger' | 'info' | 'warning';

export interface ToastInput {
  message: string;
  tone?: ToastTone;
  /** Label for the undo button. Omit for a plain notification. */
  undoLabel?: string;
  onUndo?: () => void;
  /** Auto-dismiss delay; 0 keeps it until closed. Default 4200ms. */
  duration?: number;
}

export interface ToastItem extends Required<Pick<ToastInput, 'message' | 'tone' | 'duration'>> {
  id: number;
  undoLabel?: string;
  onUndo?: () => void;
}

export interface ToastController {
  push: (input: ToastInput) => void;
  dismiss: (id: number) => void;
  toasts: ToastItem[];
}

const TONE_CLASS: Record<ToastTone, string> = {
  success: 'bg-success-soft text-success',
  danger: 'bg-danger-soft text-danger',
  warning: 'bg-warning-soft text-warning',
  info: 'bg-info-soft text-info',
};

function ToneIcon({ tone }: { tone: ToastTone }) {
  const cls = 'h-3.5 w-3.5';
  switch (tone) {
    case 'success':
      return <Check className={cls} aria-hidden="true" strokeWidth={3} />;
    case 'danger':
      return <XCircle className={cls} aria-hidden="true" strokeWidth={2.2} />;
    case 'warning':
      return <AlertTriangle className={cls} aria-hidden="true" strokeWidth={2.2} />;
    case 'info':
      return <Info className={cls} aria-hidden="true" strokeWidth={2.2} />;
  }
}

export function useToastController(): ToastController {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(1);
  const timers = useRef(new Map<number, number>());

  const dismiss = useCallback((id: number) => {
    const handle = timers.current.get(id);
    if (handle != null) {
      window.clearTimeout(handle);
      timers.current.delete(id);
    }
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (input: ToastInput) => {
      const id = nextId.current++;
      const item: ToastItem = {
        id,
        message: input.message,
        tone: input.tone ?? 'success',
        duration: input.duration ?? 4200,
        undoLabel: input.undoLabel,
        onUndo: input.onUndo,
      };
      setToasts((prev) => [...prev.slice(-3), item]);
      if (item.duration > 0) {
        timers.current.set(
          id,
          window.setTimeout(() => dismiss(id), item.duration),
        );
      }
    },
    [dismiss],
  );

  // Clear pending timers on unmount so nothing fires against a dead component.
  useEffect(() => {
    const map = timers.current;
    return () => {
      map.forEach((h) => window.clearTimeout(h));
      map.clear();
    };
  }, []);

  return { push, dismiss, toasts };
}

export function ToastHost({ controller }: { controller: ToastController }) {
  const { toasts, dismiss } = controller;
  if (toasts.length === 0) return null;

  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-0 z-90 flex flex-col items-center gap-2 p-4"
      role="status"
      aria-live="polite"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          className="toast-in border-border-strong bg-overlay text-fg shadow-pop pointer-events-auto flex w-full max-w-sm items-center gap-3 rounded-md border px-3.5 py-3 text-sm"
        >
          <span
            className={`grid h-6 w-6 shrink-0 place-items-center rounded-full ${TONE_CLASS[t.tone]}`}
          >
            <ToneIcon tone={t.tone} />
          </span>
          <span className="min-w-0 flex-1 truncate">{t.message}</span>
          {t.onUndo && t.undoLabel && (
            <button
              type="button"
              onClick={() => {
                t.onUndo?.();
                dismiss(t.id);
              }}
              className="text-accent hover:bg-accent-soft shrink-0 rounded-md px-2 py-1 text-xs font-bold transition-colors"
            >
              {t.undoLabel}
            </button>
          )}
          <button
            type="button"
            onClick={() => dismiss(t.id)}
            aria-label="Dismiss notification"
            className="text-subtle hover:bg-raised hover:text-fg shrink-0 rounded-md p-1.5 transition-colors"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
      ))}
    </div>
  );
}
