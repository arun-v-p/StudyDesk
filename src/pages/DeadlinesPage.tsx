import { useMemo, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { Check, ListTodo, Pencil, Plus, Trash2, X } from 'lucide-react';
import { useStore } from '../store/AppStore';
import { useNow } from '../hooks/useNow';
import { Card, Chip } from '../components/ui/Card';
import { EmptyState } from '../components/ui/EmptyState';
import { IconButton } from '../components/ui/IconButton';
import { Modal, ConfirmDialog } from '../components/ui/Modal';
import { Select, TextArea, TextField } from '../components/ui/Field';
import { dayKey, dateTimeKey, isResolvableDayKey } from '../lib/dates';
import {
  deadlineStatus,
  relativeDue,
  sortDeadlines,
  STATUS_LABEL,
  STATUS_TONE,
  type DeadlineStatus,
} from '../lib/status';
import { PRIORITIES, type Deadline, type Priority } from '../types';

interface FormState {
  title: string;
  subject: string;
  description: string;
  dueDate: string;
  dueTime: string;
  priority: Priority;
}

const EMPTY_FORM = (): FormState => ({
  title: '',
  subject: '',
  description: '',
  dueDate: dayKey(new Date()),
  dueTime: '17:00',
  priority: 'medium',
});

const GROUPS: DeadlineStatus[] = ['overdue', 'today', 'tomorrow', 'upcoming'];

export function DeadlinesPage() {
  const now = useNow(60_000);
  const { deadlines, newDeadline, toast } = useStore();
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [pendingDelete, setPendingDelete] = useState<Deadline | null>(null);
  const [showCompleted, setShowCompleted] = useState(false);

  const sorted = useMemo(() => sortDeadlines(deadlines.items), [deadlines.items]);

  const grouped = useMemo(() => {
    const out: Record<DeadlineStatus, Deadline[]> = {
      overdue: [],
      today: [],
      tomorrow: [],
      upcoming: [],
      done: [],
    };
    for (const d of sorted) out[deadlineStatus(d, now)].push(d);
    return out;
  }, [sorted, now]);

  const openForm = (existing?: Deadline) => {
    setErrors({});
    if (existing) {
      setEditingId(existing.id);
      setForm({
        title: existing.title,
        subject: existing.subject,
        description: existing.description,
        dueDate: existing.dueDate,
        dueTime: existing.dueTime,
        priority: existing.priority,
      });
    } else {
      setEditingId(null);
      setForm(EMPTY_FORM());
    }
    setFormOpen(true);
  };

  const validate = (f: FormState): Partial<Record<keyof FormState, string>> => {
    const e: Partial<Record<keyof FormState, string>> = {};
    if (!f.title.trim()) e.title = 'A title is required.';
    if (!isResolvableDayKey(f.dueDate)) e.dueDate = 'Pick a valid date.';
    return e;
  };

  const submit = () => {
    const found = validate(form);
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    const payload = {
      title: form.title.trim(),
      subject: form.subject.trim(),
      description: form.description.trim(),
      dueDate: form.dueDate,
      dueTime: form.dueTime,
      priority: form.priority,
    };

    if (editingId) {
      deadlines.update(editingId, payload);
      toast({ message: 'Deadline updated', tone: 'success' });
    } else {
      deadlines.add(newDeadline(payload));
      toast({ message: 'Deadline added', tone: 'success' });
    }
    setFormOpen(false);
  };

  const remove = (d: Deadline) => {
    const removed = deadlines.remove(d.id);
    setPendingDelete(null);
    if (!removed) return;
    toast({
      message: `Deleted “${removed.item.title}”`,
      tone: 'danger',
      undoLabel: 'Undo',
      onUndo: () => deadlines.restore(removed.item, removed.index),
    });
  };

  const toggleComplete = (d: Deadline) => {
    deadlines.update(d.id, { completed: !d.completed });
    toast({ message: d.completed ? 'Marked as not done' : 'Deadline completed', tone: 'success' });
  };

  const total = deadlines.items.length;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h2 className="text-fg text-xl font-bold tracking-tight">Deadlines</h2>
          <p className="text-subtle mt-0.5 text-sm">
            {grouped.overdue.length > 0 ? `${grouped.overdue.length} overdue · ` : ''}
            {sorted.filter((d) => !d.completed).length} open
          </p>
        </div>
        <button type="button" className="btn btn--primary ml-auto" onClick={() => openForm()}>
          <Plus className="h-4 w-4" aria-hidden="true" /> Add deadline
        </button>
      </div>

      {total === 0 ? (
        <Card>
          <EmptyState
            icon={<ListTodo className="h-7 w-7" aria-hidden="true" />}
            title="No deadlines yet"
            description="Add your first deadline and StudyDesk groups it by urgency, pins it to the calendar and counts down to the minute."
            actions={
              <button type="button" className="btn btn--primary" onClick={() => openForm()}>
                <Plus className="h-4 w-4" aria-hidden="true" /> Add deadline
              </button>
            }
          />
        </Card>
      ) : (
        <>
          {GROUPS.map((status) => {
            const items = grouped[status];
            if (items.length === 0) return null;
            return (
              <section key={status} aria-labelledby={`grp-${status}`}>
                <h3 id={`grp-${status}`} className="section-title mb-2 flex items-center gap-2">
                  {STATUS_LABEL[status]}
                  <span className="text-2xs text-subtle font-mono font-normal tracking-normal normal-case">
                    {items.length}
                  </span>
                </h3>
                <ul className="space-y-2">
                  {items.map((d) => (
                    <DeadlineRow
                      key={d.id}
                      deadline={d}
                      now={now}
                      onEdit={() => openForm(d)}
                      onDelete={() => setPendingDelete(d)}
                      onToggle={() => toggleComplete(d)}
                    />
                  ))}
                </ul>
              </section>
            );
          })}

          {grouped.done.length > 0 && (
            <section aria-labelledby="grp-done">
              <button
                type="button"
                onClick={() => setShowCompleted((v) => !v)}
                aria-expanded={showCompleted}
                className="section-title hover:text-muted mb-2 flex items-center gap-2"
              >
                <span aria-hidden="true">{showCompleted ? '▾' : '▸'}</span>
                Completed
                <span className="text-2xs text-subtle font-mono font-normal tracking-normal normal-case">
                  {grouped.done.length}
                </span>
              </button>
              {showCompleted && (
                <ul className="space-y-2">
                  {grouped.done.map((d) => (
                    <DeadlineRow
                      key={d.id}
                      deadline={d}
                      now={now}
                      onEdit={() => openForm(d)}
                      onDelete={() => setPendingDelete(d)}
                      onToggle={() => toggleComplete(d)}
                    />
                  ))}
                </ul>
              )}
            </section>
          )}
        </>
      )}

      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editingId ? 'Edit deadline' : 'Add deadline'}
        footer={
          <>
            <button type="button" className="btn btn--ghost" onClick={() => setFormOpen(false)}>
              <X className="h-4 w-4" aria-hidden="true" /> Cancel
            </button>
            <button type="button" className="btn btn--primary" onClick={submit}>
              {editingId ? 'Save changes' : 'Add deadline'}
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
            label="Title"
            required
            value={form.title}
            error={errors.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            placeholder="e.g. Submit dissertation draft"
            autoComplete="off"
          />
          <div className="grid gap-3.5 sm:grid-cols-2">
            <TextField
              label="Subject or course"
              value={form.subject}
              onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))}
              placeholder="ME-301"
              autoComplete="off"
            />
            <Select
              label="Priority"
              value={form.priority}
              onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value as Priority }))}
              options={PRIORITIES.map((p) => ({
                value: p,
                label: p[0]!.toUpperCase() + p.slice(1),
              }))}
            />
            <TextField
              label="Due date"
              type="date"
              required
              value={form.dueDate}
              error={errors.dueDate}
              onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))}
            />
            <TextField
              label="Due time"
              type="time"
              value={form.dueTime}
              hint="Leave blank for an all-day deadline."
              onChange={(e) => setForm((f) => ({ ...f, dueTime: e.target.value }))}
            />
          </div>
          <TextArea
            label="Description"
            rows={3}
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            placeholder="Optional details, links, submission instructions…"
          />
          {editingId && isResolvableDayKey(form.dueDate) && (
            <p className="text-subtle text-xs">
              Shows as{' '}
              <strong className="text-muted font-semibold">
                {format(parseISO(form.dueDate), 'EEE d MMM yyyy')}
              </strong>
              {form.dueTime ? ` at ${form.dueTime}` : ', all day'}
            </p>
          )}
        </form>
      </Modal>

      <ConfirmDialog
        open={pendingDelete != null}
        title="Delete this deadline?"
        description={pendingDelete ? `“${pendingDelete.title}” will be removed.` : undefined}
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => pendingDelete && remove(pendingDelete)}
      />
    </div>
  );
}

function DeadlineRow({
  deadline: d,
  now,
  onEdit,
  onDelete,
  onToggle,
}: {
  deadline: Deadline;
  now: Date;
  onEdit: () => void;
  onDelete: () => void;
  onToggle: () => void;
}) {
  const status = deadlineStatus(d, now);
  const rail =
    status === 'overdue'
      ? 'bg-danger'
      : status === 'today'
        ? 'bg-warning'
        : status === 'done'
          ? 'bg-success'
          : 'bg-info';

  return (
    <li>
      <Card as="li" interactive className="group !p-3.5">
        <div className="flex items-start gap-3">
          <span
            aria-hidden="true"
            className={`mt-1 w-1 shrink-0 self-stretch rounded-full ${rail}`}
          />
          <button
            type="button"
            role="checkbox"
            aria-checked={d.completed}
            aria-label={d.completed ? `Mark “${d.title}” as not done` : `Mark “${d.title}” as done`}
            onClick={onToggle}
            className={`checkbox mt-0.5 ${d.completed ? 'checkbox--on' : ''}`}
          >
            <Check className="h-3 w-3" aria-hidden="true" strokeWidth={3.4} />
          </button>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <p
                className={`text-sm font-semibold ${d.completed ? 'text-subtle line-through' : 'text-fg'}`}
              >
                {d.title}
              </p>
              {!d.completed && <Chip tone={STATUS_TONE[status]}>{relativeDue(d, now)}</Chip>}
              {d.priority === 'high' && !d.completed && <Chip tone="danger">High</Chip>}
              {d.priority === 'medium' && !d.completed && <Chip tone="warning">Medium</Chip>}
              {d.priority === 'low' && !d.completed && <Chip tone="info">Low</Chip>}
            </div>
            <p className="text-subtle mt-1 flex flex-wrap items-center gap-x-2 text-xs">
              {d.subject && <span className="text-muted font-medium">{d.subject}</span>}
              {isResolvableDayKey(d.dueDate) && (
                <span>{format(parseISO(d.dueDate), 'EEE d MMM')}</span>
              )}
              {d.dueTime && <span>· {d.dueTime}</span>}
              {d.completed && <span>· completed</span>}
            </p>
            {d.description && (
              <p className="text-muted mt-1.5 text-xs leading-relaxed">{d.description}</p>
            )}
          </div>

          <span className="row-actions flex shrink-0 gap-0.5">
            <IconButton aria-label={`Edit “${d.title}”`} size="sm" onClick={onEdit}>
              <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
            </IconButton>
            <IconButton
              aria-label={`Delete “${d.title}”`}
              tone="danger"
              size="sm"
              onClick={onDelete}
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
            </IconButton>
          </span>
        </div>
      </Card>
    </li>
  );
}

export { dateTimeKey };
