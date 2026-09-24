import { useMemo, useState } from 'react';
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  format,
  isSameDay,
  isSameMonth,
  isToday,
  startOfMonth,
  subMonths,
} from 'date-fns';
import { CalendarRange, ChevronLeft, ChevronRight, Pencil, Plus, Trash2, X } from 'lucide-react';
import { useStore } from '../store/AppStore';
import { useNow } from '../hooks/useNow';
import { Card, CardHeader, Chip } from '../components/ui/Card';
import { EmptyState } from '../components/ui/EmptyState';
import { IconButton } from '../components/ui/IconButton';
import { Modal, ConfirmDialog } from '../components/ui/Modal';
import { Select, TextArea, TextField } from '../components/ui/Field';
import { dayKey, isResolvableDayKey } from '../lib/dates';
import { deadlineStatus, STATUS_TONE } from '../lib/status';
import { subjectHue } from '../features/timetable/layout';
import { CATEGORIES, type Category, type PlannerEntry } from '../types';

/** Monday-first grid, matching the timetable. Module scope so it is a stable
 *  useMemo dependency rather than a fresh value on every render. */
const WEEK_STARTS_MONDAY = true;

const CATEGORY_TONE: Record<Category, 'info' | 'warning' | 'success' | 'accent'> = {
  academic: 'info',
  work: 'warning',
  health: 'success',
  personal: 'accent',
};

interface FormState {
  date: string;
  title: string;
  description: string;
  category: Category;
}

export function CalendarPage() {
  const now = useNow(60_000);
  const { planner, deadlines, timetable, newPlannerEntry, toast } = useStore();
  const [month, setMonth] = useState(() => new Date(now.getFullYear(), now.getMonth(), 1));
  const [selected, setSelected] = useState<Date>(
    () => new Date(now.getFullYear(), now.getMonth(), now.getDate()),
  );
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(() => ({
    date: dayKey(new Date()),
    title: '',
    description: '',
    category: 'academic',
  }));
  const [errors, setErrors] = useState<Partial<Record<'title' | 'date', string>>>({});
  const [pendingDelete, setPendingDelete] = useState<PlannerEntry | null>(null);

  const days = useMemo(() => {
    const start = startOfMonth(month);
    const end = endOfMonth(month);
    const monthDays = eachDayOfInterval({ start, end });
    // Leading cells from the previous month so the grid is never blank-padded.
    const lead = WEEK_STARTS_MONDAY ? (start.getDay() + 6) % 7 : start.getDay();
    const leading: Date[] = [];
    for (let i = lead; i > 0; i--) {
      leading.push(new Date(start.getFullYear(), start.getMonth(), start.getDate() - i));
    }
    const cells = [...leading, ...monthDays];
    while (cells.length % 7 !== 0) {
      const last = cells[cells.length - 1]!;
      cells.push(new Date(last.getFullYear(), last.getMonth(), last.getDate() + 1));
    }
    return cells;
  }, [month]);

  const plannerByDate = useMemo(() => {
    const map = new Map<string, PlannerEntry[]>();
    for (const p of planner.items) {
      if (!isResolvableDayKey(p.date)) continue;
      const list = map.get(p.date);
      if (list) list.push(p);
      else map.set(p.date, [p]);
    }
    return map;
  }, [planner.items]);

  const selectedKey = dayKey(selected);
  const selectedPlanner = plannerByDate.get(selectedKey) ?? [];
  const selectedDeadlines = deadlines.items.filter(
    (d) => d.dueDate === selectedKey && isResolvableDayKey(d.dueDate),
  );
  const selectedClasses = timetable.items.filter((t) => t.day === selected.getDay());

  const openForm = (existing?: PlannerEntry) => {
    setErrors({});
    if (existing) {
      setEditingId(existing.id);
      setForm({
        date: existing.date,
        title: existing.title,
        description: existing.description,
        category: existing.category,
      });
    } else {
      setEditingId(null);
      setForm({ date: selectedKey, title: '', description: '', category: 'academic' });
    }
    setFormOpen(true);
  };

  const submit = () => {
    const e: Partial<Record<'title' | 'date', string>> = {};
    if (!form.title.trim()) e.title = 'A title is required.';
    if (!isResolvableDayKey(form.date)) e.date = 'Pick a valid date.';
    setErrors(e);
    if (Object.keys(e).length > 0) return;

    const payload = {
      date: form.date,
      title: form.title.trim(),
      description: form.description.trim(),
      category: form.category,
    };
    if (editingId) {
      planner.update(editingId, payload);
      toast({ message: 'Planner entry updated', tone: 'success' });
    } else {
      planner.add(newPlannerEntry(payload));
      toast({ message: 'Added to planner', tone: 'success' });
    }
    setFormOpen(false);
  };

  const remove = (entry: PlannerEntry) => {
    const removed = planner.remove(entry.id);
    setPendingDelete(null);
    if (!removed) return;
    toast({
      message: `Deleted “${removed.item.title}”`,
      tone: 'danger',
      undoLabel: 'Undo',
      onUndo: () => planner.restore(removed.item, removed.index),
    });
  };

  const monthCounts = useMemo(() => {
    let dl = 0;
    let pl = 0;
    for (const d of deadlines.items) {
      if (isResolvableDayKey(d.dueDate) && d.dueDate.slice(0, 7) === format(month, 'yyyy-MM')) dl++;
    }
    for (const p of planner.items) {
      if (isResolvableDayKey(p.date) && p.date.slice(0, 7) === format(month, 'yyyy-MM')) pl++;
    }
    return { dl, pl };
  }, [deadlines.items, planner.items, month]);

  const dowLabels = WEEK_STARTS_MONDAY
    ? ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
    : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h2 className="text-fg text-xl font-bold tracking-tight">Calendar &amp; planner</h2>
          <p className="text-subtle mt-0.5 text-sm">
            {format(month, 'MMMM yyyy')} · {monthCounts.dl} deadline
            {monthCounts.dl === 1 ? '' : 's'} · {monthCounts.pl} planned
          </p>
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <IconButton
            aria-label="Go to today"
            onClick={() => {
              setMonth(new Date(now.getFullYear(), now.getMonth(), 1));
              setSelected(new Date(now.getFullYear(), now.getMonth(), now.getDate()));
            }}
          >
            <CalendarRange className="h-4 w-4" aria-hidden="true" />
          </IconButton>
          <IconButton aria-label="Previous month" onClick={() => setMonth((m) => subMonths(m, 1))}>
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          </IconButton>
          <IconButton aria-label="Next month" onClick={() => setMonth((m) => addMonths(m, 1))}>
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </IconButton>
          <button type="button" className="btn btn--primary ml-1" onClick={() => openForm()}>
            <Plus className="h-4 w-4" aria-hidden="true" /> Plan entry
          </button>
        </div>
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-[1.5fr_1fr]">
        <Card className="!p-4">
          <div
            className="grid grid-cols-7 gap-1"
            role="grid"
            aria-label={format(month, 'MMMM yyyy')}
          >
            {dowLabels.map((d) => (
              <div
                key={d}
                role="columnheader"
                className="text-subtle py-1.5 text-center text-[10.5px] font-bold tracking-wider uppercase"
              >
                {d}
              </div>
            ))}
            {days.map((day) => {
              const key = dayKey(day);
              const dayPlanner = plannerByDate.get(key) ?? [];
              const dayDeadlines = deadlines.items.filter((x) => x.dueDate === key);
              const hasClass = timetable.items.some((t) => t.day === day.getDay());
              const isSelected = isSameDay(day, selected);
              const inMonth = isSameMonth(day, month);
              return (
                <button
                  key={key}
                  type="button"
                  role="gridcell"
                  aria-selected={isSelected}
                  aria-current={isToday(day) ? 'date' : undefined}
                  aria-label={`${format(day, 'd MMMM yyyy')}${
                    dayDeadlines.length + dayPlanner.length > 0
                      ? `, ${dayDeadlines.length + dayPlanner.length} item${
                          dayDeadlines.length + dayPlanner.length === 1 ? '' : 's'
                        }`
                      : ''
                  }`}
                  onClick={() => setSelected(day)}
                  onDoubleClick={() => openForm()}
                  className={`calendar-day ${isSelected ? 'calendar-day--selected' : ''} ${
                    isToday(day) && !isSelected ? 'calendar-day--today' : ''
                  } ${inMonth ? '' : 'calendar-day--out'}`}
                >
                  <span className="calendar-day__number">{format(day, 'd')}</span>
                  <span className="flex h-1 gap-[3px]" aria-hidden="true">
                    {dayDeadlines.slice(0, 2).map((d) => {
                      const st = deadlineStatus(d, now);
                      return (
                        <span
                          key={d.id}
                          className={`h-1 w-1 rounded-full ${
                            st === 'overdue' || d.priority === 'high'
                              ? 'bg-danger'
                              : d.priority === 'medium'
                                ? 'bg-warning'
                                : 'bg-info'
                          }`}
                        />
                      );
                    })}
                    {dayPlanner.slice(0, 2).map((p) => (
                      <span key={p.id} className="bg-success h-1 w-1 rounded-full" />
                    ))}
                    {!dayPlanner.length && !dayDeadlines.length && hasClass && (
                      <span className="bg-accent h-1 w-1 rounded-full" />
                    )}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="border-border mt-3.5 flex flex-wrap gap-x-4 gap-y-1.5 border-t pt-3.5">
            <LegendItem className="bg-danger" label="High priority" />
            <LegendItem className="bg-warning" label="Medium" />
            <LegendItem className="bg-info" label="Low" />
            <LegendItem className="bg-success" label="Planner" />
            <LegendItem className="bg-accent" label="Class" />
          </div>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader
              title={format(selected, 'EEE d MMMM')}
              action={
                <button
                  type="button"
                  className="btn btn--ghost !min-h-8 !py-1 !text-xs"
                  onClick={() => openForm()}
                >
                  <Plus className="h-3.5 w-3.5" aria-hidden="true" /> Add
                </button>
              }
            />

            {selectedPlanner.length === 0 &&
            selectedDeadlines.length === 0 &&
            selectedClasses.length === 0 ? (
              <p className="text-subtle py-1 text-sm">Nothing on this date.</p>
            ) : (
              <div className="space-y-4">
                {selectedPlanner.length > 0 && (
                  <section aria-label="Planner entries">
                    <h3 className="text-2xs text-success mb-2 font-bold tracking-wider uppercase">
                      Planner
                    </h3>
                    <ul className="space-y-2">
                      {selectedPlanner.map((p) => (
                        <li key={p.id} className="group flex items-start gap-2.5">
                          <Chip tone={CATEGORY_TONE[p.category]}>{p.category}</Chip>
                          <div className="min-w-0 flex-1">
                            <p className="text-fg text-sm">{p.title}</p>
                            {p.description && (
                              <p className="text-subtle mt-0.5 text-xs">{p.description}</p>
                            )}
                          </div>
                          <span className="row-actions flex gap-0.5">
                            <IconButton
                              aria-label={`Edit “${p.title}”`}
                              size="sm"
                              onClick={() => openForm(p)}
                            >
                              <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                            </IconButton>
                            <IconButton
                              aria-label={`Delete “${p.title}”`}
                              tone="danger"
                              size="sm"
                              onClick={() => setPendingDelete(p)}
                            >
                              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                            </IconButton>
                          </span>
                        </li>
                      ))}
                    </ul>
                  </section>
                )}

                {selectedDeadlines.length > 0 && (
                  <section aria-label="Deadlines">
                    <h3 className="text-2xs text-warning mb-2 font-bold tracking-wider uppercase">
                      Deadlines
                    </h3>
                    <ul className="space-y-2">
                      {selectedDeadlines.map((d) => {
                        const st = deadlineStatus(d, now);
                        return (
                          <li key={d.id} className="flex items-center gap-2.5">
                            <Chip tone={STATUS_TONE[st]}>{d.priority}</Chip>
                            <span
                              className={`min-w-0 flex-1 truncate text-sm ${d.completed ? 'text-subtle line-through' : 'text-fg'}`}
                            >
                              {d.title}
                            </span>
                            {d.dueTime && (
                              <span className="text-2xs text-subtle shrink-0 font-mono">
                                {d.dueTime}
                              </span>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </section>
                )}

                {selectedClasses.length > 0 && (
                  <section aria-label="Classes">
                    <h3 className="text-2xs text-accent mb-2 font-bold tracking-wider uppercase">
                      Classes
                    </h3>
                    <ul className="space-y-1.5">
                      {selectedClasses.map((c) => (
                        <li key={c.id} className="flex items-center gap-2.5">
                          <span
                            aria-hidden="true"
                            className="h-2 w-2 shrink-0 rounded-full"
                            style={{ background: `hsl(${subjectHue(c.subject)} 65% 55%)` }}
                          />
                          <span className="text-fg min-w-0 flex-1 truncate text-sm">
                            {c.subject}
                          </span>
                          <span className="text-2xs text-subtle shrink-0 font-mono">
                            {c.startTime}–{c.endTime}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </section>
                )}
              </div>
            )}
          </Card>

          {planner.items.length === 0 && deadlines.items.length === 0 && (
            <Card>
              <EmptyState
                compact
                icon={<CalendarRange className="h-5 w-5" aria-hidden="true" />}
                title="Nothing planned yet"
                description="Pick a day and add an entry, or create a deadline — both appear here as colour-coded dots."
              />
            </Card>
          )}
        </div>
      </div>

      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editingId ? 'Edit planner entry' : 'Add to planner'}
        footer={
          <>
            <button type="button" className="btn btn--ghost" onClick={() => setFormOpen(false)}>
              <X className="h-4 w-4" aria-hidden="true" /> Cancel
            </button>
            <button type="button" className="btn btn--primary" onClick={submit}>
              {editingId ? 'Save changes' : 'Add entry'}
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
          <div className="grid gap-3.5 sm:grid-cols-2">
            <TextField
              label="Date"
              type="date"
              required
              value={form.date}
              error={errors.date}
              onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
            />
            <Select
              label="Category"
              value={form.category}
              onChange={(e) => setForm((f) => ({ ...f, category: e.target.value as Category }))}
              options={CATEGORIES.map((c) => ({
                value: c,
                label: c[0]!.toUpperCase() + c.slice(1),
              }))}
            />
          </div>
          <TextField
            label="Title"
            required
            value={form.title}
            error={errors.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            placeholder="e.g. Study group — Numerical Methods"
            autoComplete="off"
          />
          <TextArea
            label="Description"
            rows={3}
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            placeholder="Optional"
          />
        </form>
      </Modal>

      <ConfirmDialog
        open={pendingDelete != null}
        title="Delete this entry?"
        description={pendingDelete ? `“${pendingDelete.title}” will be removed.` : undefined}
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => pendingDelete && remove(pendingDelete)}
      />
    </div>
  );
}

function LegendItem({ className, label }: { className: string; label: string }) {
  return (
    <span className="text-2xs text-subtle flex items-center gap-1.5">
      <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${className}`} />
      {label}
    </span>
  );
}
