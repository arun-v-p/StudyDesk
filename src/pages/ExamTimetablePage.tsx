import { useMemo, useState } from 'react';
import { CalendarDays, Plus, Trash2, X } from 'lucide-react';
import { Card, Chip } from '../components/ui/Card';
import { EmptyState } from '../components/ui/EmptyState';
import { IconButton } from '../components/ui/IconButton';
import { Modal, ConfirmDialog } from '../components/ui/Modal';
import { TextArea, TextField } from '../components/ui/Field';
import { dayKey, toMinutes } from '../lib/dates';
import { examStatus, useExamTimetable, type ExamStatus } from '../store/examTimetable';
import { createId } from '../lib/id';
import type { ExamTimetableEntry } from '../types';

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

const statusTone: Record<ExamStatus, 'accent' | 'success' | 'neutral'> = {
  upcoming: 'accent',
  active: 'success',
  expired: 'neutral',
};

export function ExamTimetablePage() {
  const exams = useExamTimetable();
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [pendingDelete, setPendingDelete] = useState<ExamTimetableEntry | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const today = dayKey(new Date());
  const rows = useMemo(
    () =>
      [...exams.items].sort((a, b) =>
        `${a.date}${a.startTime}`.localeCompare(`${b.date}${b.startTime}`),
      ),
    [exams.items],
  );

  const submit = () => {
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
    exams.add({ ...form, id: createId(), subject: form.subject.trim() });
    setFormError(null);
    setFormOpen(false);
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h2 className="text-fg text-xl font-bold tracking-tight">Exam Timetable</h2>
          <p className="text-subtle mt-0.5 text-sm">
            Separate from your recurring weekly class timetable.
          </p>
        </div>
        <button
          type="button"
          className="btn btn--primary ml-auto"
          onClick={() => {
            setForm(EMPTY());
            setFormError(null);
            setFormOpen(true);
          }}
        >
          <Plus className="h-4 w-4" aria-hidden="true" /> Add exam
        </button>
      </div>
      {rows.length === 0 ? (
        <Card>
          <EmptyState
            icon={<CalendarDays className="h-7 w-7" aria-hidden="true" />}
            title="No exams yet"
            description="Add exams with validity dates; expired exams remain available for reference."
          />
        </Card>
      ) : (
        <ul className="space-y-2">
          {rows.map((exam) => {
            const state = examStatus(exam, today);
            return (
              <Card as="li" key={exam.id} className="flex flex-wrap items-center gap-3">
                <div className="min-w-0 flex-1">
                  <h3 className="text-fg font-semibold">{exam.subject}</h3>
                  <p className="text-muted text-sm">
                    {exam.date} · {exam.startTime}–{exam.endTime}
                    {exam.room ? ` · ${exam.room}` : ''}
                  </p>
                  <p className="text-subtle text-xs">
                    Valid {exam.validFrom} through {exam.validUntil}
                  </p>
                </div>
                <Chip tone={statusTone[state]}>{state[0]!.toUpperCase() + state.slice(1)}</Chip>
                <IconButton
                  aria-label={`Delete ${exam.subject}`}
                  tone="danger"
                  onClick={() => setPendingDelete(exam)}
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </IconButton>
              </Card>
            );
          })}
        </ul>
      )}
      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title="Add exam"
        footer={
          <>
            <button type="button" className="btn btn--ghost" onClick={() => setFormOpen(false)}>
              <X className="h-4 w-4" aria-hidden="true" /> Cancel
            </button>
            <button type="button" className="btn btn--primary" onClick={submit}>
              Add exam
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
          if (pendingDelete) exams.remove(pendingDelete.id);
          setPendingDelete(null);
        }}
      />
    </div>
  );
}
