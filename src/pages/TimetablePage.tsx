import { useMemo, useState } from 'react';
import { AlertTriangle, CalendarDays, Pencil, Plus, Trash2, X } from 'lucide-react';
import { useStore } from '../store/AppStore';
import { useNow } from '../hooks/useNow';
import { Card } from '../components/ui/Card';
import { EmptyState } from '../components/ui/EmptyState';
import { IconButton } from '../components/ui/IconButton';
import { Modal, ConfirmDialog } from '../components/ui/Modal';
import { Select, TextField } from '../components/ui/Field';
import { fromMinutes, toMinutes } from '../lib/dates';
import {
  HOUR_PX,
  blockStyle,
  layoutWeek,
  nowLinePx,
  subjectColors,
  type LaidOutEntry,
} from '../features/timetable/layout';
import type { TimetableEntry } from '../types';
import type { ResolvedTheme } from '../hooks/useTheme';

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

interface FormState {
  day: number;
  startTime: string;
  endTime: string;
  subject: string;
  room: string;
  note: string;
}

const EMPTY_FORM = (day: number): FormState => ({
  day,
  startTime: '09:00',
  endTime: '10:00',
  subject: '',
  room: '',
  note: '',
});

/** Monday-first display order, matching the calendar. */
const DISPLAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

export function TimetablePage({ theme }: { theme: ResolvedTheme }) {
  const now = useNow(30_000);
  const { timetable, newTimetableEntry, toast } = useStore();
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(() => EMPTY_FORM(new Date().getDay()));
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [pendingDelete, setPendingDelete] = useState<TimetableEntry | null>(null);

  const layout = useMemo(() => layoutWeek(timetable.items), [timetable.items]);

  const hours = useMemo(() => {
    const out: number[] = [];
    for (let h = layout.startHour; h < layout.endHour; h++) out.push(h);
    return out;
  }, [layout.startHour, layout.endHour]);

  const byDay = useMemo(() => {
    const map = new Map<number, LaidOutEntry[]>();
    for (const e of layout.entries) {
      const list = map.get(e.day);
      if (list) list.push(e);
      else map.set(e.day, [e]);
    }
    return map;
  }, [layout.entries]);

  const todayIndex = now.getDay();
  const nowPx = nowLinePx(
    layout.startHour,
    layout.endHour,
    HOUR_PX,
    now.getHours() * 60 + now.getMinutes(),
  );

  const openForm = (existing?: TimetableEntry, day?: number) => {
    setErrors({});
    if (existing) {
      setEditingId(existing.id);
      setForm({
        day: existing.day,
        startTime: existing.startTime,
        endTime: existing.endTime,
        subject: existing.subject,
        room: existing.room,
        note: existing.note,
      });
    } else {
      setEditingId(null);
      setForm(EMPTY_FORM(day ?? new Date().getDay()));
    }
    setFormOpen(true);
  };

  const validate = (f: FormState) => {
    const e: Partial<Record<keyof FormState, string>> = {};
    if (!f.subject.trim()) e.subject = 'A subject name is required.';
    const s = toMinutes(f.startTime);
    const en = toMinutes(f.endTime);
    if (s == null) e.startTime = 'Enter a valid start time.';
    if (en == null) e.endTime = 'Enter a valid end time.';
    if (s != null && en != null && en <= s) e.endTime = 'End time must be after the start time.';
    return e;
  };

  const submit = () => {
    const found = validate(form);
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    const payload = {
      day: form.day,
      startTime: form.startTime,
      endTime: form.endTime,
      subject: form.subject.trim(),
      room: form.room.trim(),
      note: form.note.trim(),
    };
    if (editingId) {
      timetable.update(editingId, payload);
      toast({ message: 'Class updated', tone: 'success' });
    } else {
      timetable.add(newTimetableEntry(payload));
      toast({ message: 'Class added', tone: 'success' });
    }
    setFormOpen(false);
  };

  const remove = (entry: TimetableEntry) => {
    const removed = timetable.remove(entry.id);
    setPendingDelete(null);
    if (!removed) return;
    toast({
      message: `Deleted “${removed.item.subject}”`,
      tone: 'danger',
      undoLabel: 'Undo',
      onUndo: () => timetable.restore(removed.item, removed.index),
    });
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h2 className="text-fg text-xl font-bold tracking-tight">Timetable</h2>
          <p className="text-subtle mt-0.5 text-sm">
            {timetable.items.length} class{timetable.items.length === 1 ? '' : 'es'} ·{' '}
            {Math.round(layout.entries.reduce((sum, e) => sum + e.heightMin, 0) / 60)} h per week
          </p>
        </div>
        <button type="button" className="btn btn--primary ml-auto" onClick={() => openForm()}>
          <Plus className="h-4 w-4" aria-hidden="true" /> Add class
        </button>
      </div>

      {/* Surfaces entries that cannot be drawn instead of hiding them silently. */}
      {layout.invalid.length > 0 && (
        <div
          role="alert"
          className="border-warning/40 bg-warning-soft text-warning flex items-start gap-2.5 rounded-md border px-3.5 py-3 text-sm"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>
            {layout.invalid.length} entr{layout.invalid.length === 1 ? 'y' : 'ies'} could not be
            placed on the grid (invalid time or end before start):{' '}
            {layout.invalid.map((e) => e.subject).join(', ')}. Edit them to fix the times.
          </span>
        </div>
      )}

      {timetable.items.length === 0 ? (
        <Card>
          <EmptyState
            icon={<CalendarDays className="h-7 w-7" aria-hidden="true" />}
            title="No classes yet"
            description="Add your weekly schedule. Blocks are placed on a real time axis, so half-hour starts, multi-hour classes and overlapping sessions all render correctly."
            actions={
              <button type="button" className="btn btn--primary" onClick={() => openForm()}>
                <Plus className="h-4 w-4" aria-hidden="true" /> Add your first class
              </button>
            }
          />
        </Card>
      ) : (
        <div className="timetable-scroll rounded-card border-border bg-surface shadow-raise overflow-auto border">
          <div
            className="grid min-w-[900px]"
            style={{ gridTemplateColumns: `62px repeat(7, minmax(116px, 1fr))` }}
            role="table"
            aria-label="Weekly class timetable"
          >
            {/* Header row */}
            <div className="timetable-head timetable-gutter" role="columnheader">
              Time
            </div>
            {DISPLAY_ORDER.map((dayIndex) => {
              const isToday = dayIndex === todayIndex;
              return (
                <div
                  key={dayIndex}
                  role="columnheader"
                  aria-current={isToday ? 'date' : undefined}
                  className={`timetable-head text-center ${isToday ? 'text-accent' : 'text-subtle'}`}
                >
                  {DAY_SHORT[dayIndex]}
                  <span className="mt-0.5 block text-[10px] font-medium tracking-normal normal-case opacity-70">
                    {isToday ? 'Today' : DAY_NAMES[dayIndex]?.slice(0, 3)}
                  </span>
                </div>
              );
            })}

            {/* Body: one column of hour cells per day, blocks overlaid absolutely */}
            {(() => {
              const cells: React.ReactNode[] = [];
              for (const hour of hours) {
                cells.push(
                  <div key={`g-${hour}`} className="timetable-gutter timetable-hour-label">
                    {fromMinutes(hour * 60)}
                  </div>,
                );
                for (const dayIndex of DISPLAY_ORDER) {
                  const isToday = dayIndex === todayIndex;
                  const isFirstHour = hour === layout.startHour;
                  cells.push(
                    <div
                      key={`c-${hour}-${dayIndex}`}
                      role="cell"
                      className={`timetable-cell ${isToday ? 'timetable-cell--today' : ''}`}
                      style={{ position: isFirstHour ? 'relative' : undefined }}
                    >
                      {isFirstHour &&
                        (byDay.get(dayIndex) ?? []).map((entry) => {
                          const colors = subjectColors(entry.hue, theme);
                          const style = blockStyle(entry, HOUR_PX);
                          return (
                            <div
                              key={entry.id}
                              className="timetable-block group"
                              style={{
                                top: style.top,
                                height: style.height,
                                left: style.left,
                                width: style.width,
                                background: colors.bg,
                                borderColor: colors.border,
                                borderLeftColor: colors.rail,
                                color: colors.fg,
                              }}
                              role="button"
                              tabIndex={0}
                              aria-label={`${entry.subject}${entry.room ? `, ${entry.room}` : ''}, ${entry.startTime} to ${entry.endTime}`}
                              onClick={() => openForm(entry)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                  e.preventDefault();
                                  openForm(entry);
                                }
                              }}
                            >
                              <span className="block truncate text-xs font-semibold">
                                {entry.subject}
                              </span>
                              <span className="mt-px block truncate text-[10.5px] opacity-80">
                                {entry.startTime}–{entry.endTime}
                                {entry.room ? ` · ${entry.room}` : ''}
                              </span>
                              <span className="row-actions absolute top-1 right-1 flex gap-0.5">
                                <IconButton
                                  aria-label={`Edit ${entry.subject}`}
                                  size="sm"
                                  className="bg-bg/60 hover:bg-bg/90 !h-6 !w-6"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    openForm(entry);
                                  }}
                                >
                                  <Pencil className="h-3 w-3" aria-hidden="true" />
                                </IconButton>
                                <IconButton
                                  aria-label={`Delete ${entry.subject}`}
                                  tone="danger"
                                  size="sm"
                                  className="bg-bg/60 hover:bg-bg/90 !h-6 !w-6"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setPendingDelete(entry);
                                  }}
                                >
                                  <Trash2 className="h-3 w-3" aria-hidden="true" />
                                </IconButton>
                              </span>
                            </div>
                          );
                        })}
                      {isFirstHour && isToday && nowPx != null && (
                        <span
                          aria-hidden="true"
                          className="bg-danger pointer-events-none absolute inset-x-0 z-4 h-0.5"
                          style={{ top: `${nowPx}px` }}
                        >
                          <span className="bg-danger absolute -top-[3px] -left-1 h-2 w-2 rounded-full" />
                        </span>
                      )}
                    </div>,
                  );
                }
              }
              return cells;
            })()}
          </div>
        </div>
      )}

      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editingId ? 'Edit class' : 'Add class'}
        footer={
          <>
            <button type="button" className="btn btn--ghost" onClick={() => setFormOpen(false)}>
              <X className="h-4 w-4" aria-hidden="true" /> Cancel
            </button>
            <button type="button" className="btn btn--primary" onClick={submit}>
              {editingId ? 'Save changes' : 'Add class'}
            </button>
          </>
        }
      >
        <form
          className="space-y-3.5"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <TextField
            label="Subject"
            required
            value={form.subject}
            error={errors.subject}
            onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))}
            placeholder="e.g. Thermodynamics"
            autoComplete="off"
            hint="The colour is derived from this name, so a course keeps one colour all week."
          />
          <div className="grid gap-3.5 sm:grid-cols-3">
            <Select
              label="Day"
              value={String(form.day)}
              onChange={(e) => setForm((f) => ({ ...f, day: Number(e.target.value) }))}
              options={DISPLAY_ORDER.map((d) => ({ value: String(d), label: DAY_NAMES[d]! }))}
            />
            <TextField
              label="Starts"
              type="time"
              required
              value={form.startTime}
              error={errors.startTime}
              onChange={(e) => setForm((f) => ({ ...f, startTime: e.target.value }))}
            />
            <TextField
              label="Ends"
              type="time"
              required
              value={form.endTime}
              error={errors.endTime}
              onChange={(e) => setForm((f) => ({ ...f, endTime: e.target.value }))}
            />
          </div>
          <TextField
            label="Room or location"
            value={form.room}
            onChange={(e) => setForm((f) => ({ ...f, room: e.target.value }))}
            placeholder="B-204"
            autoComplete="off"
          />
          <TextField
            label="Note"
            value={form.note}
            onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
            placeholder="Optional"
            autoComplete="off"
          />
        </form>
      </Modal>

      <ConfirmDialog
        open={pendingDelete != null}
        title="Delete this class?"
        description={
          pendingDelete
            ? `${pendingDelete.subject}, ${pendingDelete.startTime}–${pendingDelete.endTime}.`
            : undefined
        }
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => pendingDelete && remove(pendingDelete)}
      />
    </div>
  );
}
