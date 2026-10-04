import { useMemo, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { CalendarDays, Check, ChevronDown, ChevronUp, Pencil, Plus, Trash2, X } from 'lucide-react';
import { Card, Chip } from '../components/ui/Card';
import { EmptyState } from '../components/ui/EmptyState';
import { IconButton } from '../components/ui/IconButton';
import { Modal, ConfirmDialog } from '../components/ui/Modal';
import { TextArea, TextField } from '../components/ui/Field';
import { dayKey, isResolvableDayKey, toMinutes } from '../lib/dates';
import { useExamTimetable } from '../store/examTimetable';
import { createId } from '../lib/id';
import type { ExamTimetableEntry } from '../types';
import { useStore } from '../store/AppStore';

const EMPTY = (): Omit<ExamTimetableEntry, 'id'> => ({
  subject: '',
  date: dayKey(new Date()),
  startTime: '09:00',
  endTime: '12:00',
  room: '',
  note: '',
  validFrom: dayKey(new Date()),
  validUntil: dayKey(new Date()),
});

type DisplayStatus = 'today' | 'upcoming' | 'past' | 'completed';
type SortDirection = 'ascending' | 'descending';

const statusTone: Record<DisplayStatus, 'warning' | 'accent' | 'neutral' | 'success'> = {
  today: 'warning',
  upcoming: 'accent',
  past: 'neutral',
  completed: 'success',
};

export function ExamTimetablePage() {
  const exams = useExamTimetable();
  const { toast } = useStore();
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<ExamTimetableEntry | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>('ascending');
  const today = dayKey(new Date());
  const rows = useMemo(
    () =>
      [...exams.items].sort((a, b) => {
        const order = `${a.date}${a.startTime}`.localeCompare(`${b.date}${b.startTime}`);
        return sortDirection === 'ascending' ? order : -order;
      }),
    [exams.items, sortDirection],
  );

  const openForm = (exam?: ExamTimetableEntry) => {
    setEditingId(exam?.id ?? null);
    setForm(exam ? { ...EMPTY(), ...exam } : EMPTY());
    setFormError(null);
    setFormOpen(true);
  };

  const submit = () => {
    if (!isResolvableDayKey(form.date)) {
      setFormError('Pick a valid exam date.');
      return;
    }
    if (
      !form.subject.trim() ||
      toMinutes(form.startTime) == null ||
      toMinutes(form.endTime) == null
    ) {
      setFormError('Enter a subject and valid start and end times.');
      return;
    }
    if (form.validUntil < form.validFrom) {
      setFormError('Valid until must be on or after valid from.');
      return;
    }
    if (form.endTime <= form.startTime) {
      setFormError('End time must be after start time.');
      return;
    }
    const payload = {
      ...form,
      subject: form.subject.trim(),
      courseCode: form.courseCode?.trim() || undefined,
      semester: form.semester?.trim() || undefined,
    };
    if (editingId) {
      exams.update(editingId, payload);
      toast({ message: 'Exam updated', tone: 'success' });
    } else {
      exams.add({ ...payload, id: createId() });
      toast({ message: 'Exam added', tone: 'success' });
    }
    setFormError(null);
    setFormOpen(false);
  };

  const displayStatus = (exam: ExamTimetableEntry): DisplayStatus =>
    exam.completed
      ? 'completed'
      : exam.date < today
        ? 'past'
        : exam.date === today
          ? 'today'
          : 'upcoming';

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h2 className="text-fg text-xl font-bold tracking-tight">Exam Timetable</h2>
          <p className="text-subtle mt-0.5 text-sm">
            Separate from your recurring weekly class timetable.
          </p>
        </div>
        <button type="button" className="btn btn--primary ml-auto" onClick={() => openForm()}>
          <Plus className="h-4 w-4" aria-hidden="true" /> Add exam
        </button>
      </div>
      {rows.length === 0 ? (
        <Card>
          <EmptyState
            icon={<CalendarDays className="h-7 w-7" aria-hidden="true" />}
            title="No exams yet"
            description="Add your exam schedule to see it in a clear, printable timetable."
            actions={
              <button type="button" className="btn btn--primary" onClick={() => openForm()}>
                <Plus className="h-4 w-4" aria-hidden="true" /> Add exam
              </button>
            }
          />
        </Card>
      ) : (
        <Card className="!p-0">
          <div
            className="overflow-x-auto"
            role="region"
            aria-label="Exam timetable, horizontally scrollable"
          >
            <table className="w-full min-w-[1080px] border-collapse text-left text-sm">
              <caption className="sr-only">Exam timetable</caption>
              <thead className="bg-sunken text-subtle border-border border-b text-xs font-bold tracking-wide uppercase">
                <tr>
                  <th scope="col" className="px-3 py-3">
                    Sl. No.
                  </th>
                  <th scope="col" aria-sort={sortDirection} className="px-3 py-3">
                    <button
                      type="button"
                      className="inline-flex items-center gap-1.5 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                      onClick={() =>
                        setSortDirection((direction) =>
                          direction === 'ascending' ? 'descending' : 'ascending',
                        )
                      }
                    >
                      Date
                      {sortDirection === 'ascending' ? (
                        <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" />
                      ) : (
                        <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
                      )}
                      <span className="sr-only">
                        {sortDirection === 'ascending' ? 'Sorted ascending' : 'Sorted descending'}
                      </span>
                    </button>
                  </th>
                  <th scope="col" className="px-3 py-3">
                    Day
                  </th>
                  <th scope="col" className="px-3 py-3">
                    Time
                  </th>
                  <th scope="col" className="px-3 py-3">
                    Course Code
                  </th>
                  <th scope="col" className="px-3 py-3">
                    Subject / Exam Name
                  </th>
                  <th scope="col" className="px-3 py-3">
                    Semester
                  </th>
                  <th scope="col" className="px-3 py-3">
                    Venue / Room
                  </th>
                  <th scope="col" className="px-3 py-3">
                    Status
                  </th>
                  <th scope="col" className="px-3 py-3">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-border divide-y">
                {rows.map((exam, index) => {
                  const state = displayStatus(exam);
                  const day = parseISO(exam.date);
                  const rowTone =
                    state === 'today'
                      ? 'bg-warning-soft/40'
                      : state === 'upcoming'
                        ? 'bg-accent-soft/20'
                        : state === 'completed'
                          ? 'bg-success-soft/20 text-subtle'
                          : 'text-muted';
                  return (
                    <tr key={exam.id} className={rowTone}>
                      <td className="text-muted px-3 py-3 tabular-nums">{index + 1}</td>
                      <td className="text-fg px-3 py-3 font-medium whitespace-nowrap">
                        {format(day, 'd MMM yyyy')}
                      </td>
                      <td className="text-muted px-3 py-3 whitespace-nowrap">
                        {format(day, 'EEEE')}
                      </td>
                      <td className="text-muted px-3 py-3 whitespace-nowrap tabular-nums">
                        {exam.startTime}–{exam.endTime}
                      </td>
                      <td className="text-muted px-3 py-3">{exam.courseCode || '—'}</td>
                      <td
                        className={`px-3 py-3 font-semibold ${state === 'completed' ? 'line-through' : 'text-fg'}`}
                      >
                        {exam.subject}
                      </td>
                      <td className="text-muted px-3 py-3">{exam.semester || '—'}</td>
                      <td className="text-muted px-3 py-3">{exam.room || '—'}</td>
                      <td className="px-3 py-3">
                        <Chip tone={statusTone[state]}>
                          {state[0]!.toUpperCase() + state.slice(1)}
                        </Chip>
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <IconButton
                            aria-label={
                              exam.completed
                                ? `Mark ${exam.subject} not completed`
                                : `Mark ${exam.subject} completed`
                            }
                            title={exam.completed ? 'Mark not completed' : 'Mark completed'}
                            onClick={() => exams.update(exam.id, { completed: !exam.completed })}
                          >
                            <Check className="h-4 w-4" aria-hidden="true" />
                          </IconButton>
                          <IconButton
                            aria-label={`Edit ${exam.subject}`}
                            onClick={() => openForm(exam)}
                          >
                            <Pencil className="h-4 w-4" aria-hidden="true" />
                          </IconButton>
                          <IconButton
                            aria-label={`Delete ${exam.subject}`}
                            tone="danger"
                            onClick={() => setPendingDelete(exam)}
                          >
                            <Trash2 className="h-4 w-4" aria-hidden="true" />
                          </IconButton>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="text-subtle px-4 py-3 text-xs">
            Today’s, upcoming, past, and completed exams are retained in this schedule.
          </p>
        </Card>
      )}
      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editingId ? 'Edit exam' : 'Add exam'}
        footer={
          <>
            <button type="button" className="btn btn--ghost" onClick={() => setFormOpen(false)}>
              <X className="h-4 w-4" aria-hidden="true" /> Cancel
            </button>
            <button type="button" className="btn btn--primary" onClick={submit}>
              {editingId ? 'Save changes' : 'Add exam'}
            </button>
          </>
        }
      >
        <form
          className="space-y-3.5"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          {formError && (
            <p role="alert" className="text-danger text-sm">
              {formError}
            </p>
          )}
          <TextField
            label="Subject"
            required
            value={form.subject}
            onChange={(event) =>
              setForm((current) => ({ ...current, subject: event.target.value }))
            }
          />
          <div className="grid gap-3.5 sm:grid-cols-2">
            <TextField
              label="Course code"
              value={form.courseCode ?? ''}
              onChange={(event) =>
                setForm((current) => ({ ...current, courseCode: event.target.value }))
              }
            />
            <TextField
              label="Semester"
              value={form.semester ?? ''}
              onChange={(event) =>
                setForm((current) => ({ ...current, semester: event.target.value }))
              }
            />
            <TextField
              label="Exam date"
              type="date"
              required
              value={form.date}
              onChange={(event) => setForm((current) => ({ ...current, date: event.target.value }))}
            />
            <TextField
              label="Room"
              value={form.room}
              onChange={(event) => setForm((current) => ({ ...current, room: event.target.value }))}
            />
            <TextField
              label="Starts"
              type="time"
              required
              value={form.startTime}
              onChange={(event) =>
                setForm((current) => ({ ...current, startTime: event.target.value }))
              }
            />
            <TextField
              label="Ends"
              type="time"
              required
              value={form.endTime}
              onChange={(event) =>
                setForm((current) => ({ ...current, endTime: event.target.value }))
              }
            />
            <TextField
              label="Valid from"
              type="date"
              required
              value={form.validFrom}
              onChange={(event) =>
                setForm((current) => ({ ...current, validFrom: event.target.value }))
              }
            />
            <TextField
              label="Valid until"
              type="date"
              required
              value={form.validUntil}
              onChange={(event) =>
                setForm((current) => ({ ...current, validUntil: event.target.value }))
              }
            />
          </div>
          <TextArea
            label="Note"
            value={form.note}
            onChange={(event) => setForm((current) => ({ ...current, note: event.target.value }))}
          />
        </form>
      </Modal>
      <ConfirmDialog
        open={pendingDelete != null}
        title="Delete this exam?"
        description="Expired exams are never deleted automatically."
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => {
          const removed = pendingDelete ? exams.remove(pendingDelete.id) : null;
          setPendingDelete(null);
          if (removed) {
            toast({
              message: `Deleted “${removed.item.subject}”`,
              tone: 'danger',
              undoLabel: 'Undo',
              onUndo: () => exams.restore(removed.item, removed.index),
            });
          }
        }}
      />
    </div>
  );
}
