import { useMemo, useState } from 'react';
import {
  Archive,
  BookOpenCheck,
  Check,
  Clock3,
  Edit3,
  Plus,
  RotateCcw,
  Trash2,
  X,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { Card, Chip } from '../components/ui/Card';
import { EmptyState } from '../components/ui/EmptyState';
import { IconButton } from '../components/ui/IconButton';
import { ConfirmDialog, Modal } from '../components/ui/Modal';
import { TextField } from '../components/ui/Field';
import { dayKey, dayKeyOffset, format, fromDayKey } from '../lib/dates';
import { createId } from '../lib/id';
import {
  completeRevisionSession,
  editRevisionSession,
  removeRevisionSession,
} from '../features/revision/plan';
import { generateReviewSchedule } from '../features/revision/schedule';
import { useMaterials } from '../store/materials';
import { useStore } from '../store/AppStore';
import type { RevisionPlan, RevisionSession } from '../types';

type PlanDraft = {
  title: string;
  examAt: string;
  subjectIds: string[];
  materialIds: string[];
  targetSessionMinutes: string;
};

const emptyDraft = (): PlanDraft => ({
  title: '',
  examAt: `${dayKeyOffset(14)}T09:00`,
  subjectIds: [],
  materialIds: [],
  targetSessionMinutes: '45',
});

function schedulingMessage(reason: string, availableDays: number): string {
  if (reason === 'invalid-exam') return 'Choose a valid local exam date and time.';
  if (reason === 'past-exam')
    return 'The exam date has passed. Move it to a future date before generating sessions.';
  if (reason === 'exam-today')
    return 'There are no study days before an exam today. Choose a later exam date.';
  if (reason === 'no-subjects') return 'Choose at least one subject to create review sessions.';
  return `There ${availableDays === 1 ? 'is only 1 study day' : `are only ${availableDays} study days`} before the exam, but ${availableDays === 1 ? 'each subject needs its own day' : 'each subject needs its own day'}. Choose fewer subjects or move the exam date later.`;
}

function sessionTimeLabel(session: RevisionSession): string {
  return `${session.scheduledTime} · ${session.durationMinutes} min`;
}

export function RevisionPage() {
  const { revisionPlans, toast } = useStore();
  const { metadata } = useMaterials();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<RevisionPlan | null>(null);
  const [draft, setDraft] = useState<PlanDraft>(emptyDraft);
  const [formError, setFormError] = useState<string | null>(null);
  const [editingSession, setEditingSession] = useState<{
    planId: string;
    sessionId: string;
  } | null>(null);
  const [sessionDraft, setSessionDraft] = useState({ date: '', time: '09:00', duration: '45' });
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<RevisionPlan | null>(null);
  const [filter, setFilter] = useState<'active' | 'archived'>('active');
  const today = dayKey(new Date());

  const subjects = metadata.subjects;
  const eligibleMaterials = metadata.files.filter((file) =>
    draft.subjectIds.includes(file.subjectId),
  );
  const plans = useMemo(
    () =>
      revisionPlans.items
        .filter((plan) =>
          filter === 'archived' ? plan.status === 'archived' : plan.status !== 'archived',
        )
        .sort((a, b) => a.examAt.localeCompare(b.examAt)),
    [revisionPlans.items, filter],
  );

  const openCreate = () => {
    setEditingPlan(null);
    setDraft(emptyDraft());
    setFormError(null);
    setDialogOpen(true);
  };

  const openEdit = (plan: RevisionPlan) => {
    setEditingPlan(plan);
    setDraft({
      title: plan.title,
      examAt: plan.examAt,
      subjectIds: [...plan.subjectIds],
      materialIds: [...plan.materialIds],
      targetSessionMinutes: String(plan.targetSessionMinutes),
    });
    setFormError(null);
    setDialogOpen(true);
  };

  const toggleDraftValue = (key: 'subjectIds' | 'materialIds', value: string) => {
    setDraft((current) => ({
      ...current,
      [key]: current[key].includes(value)
        ? current[key].filter((id) => id !== value)
        : [...current[key], value],
    }));
  };

  const submitPlan = () => {
    const minutes = Number(draft.targetSessionMinutes);
    if (!draft.title.trim()) return setFormError('Add a title for this revision plan.');
    if (!Number.isInteger(minutes) || minutes < 5 || minutes > 480)
      return setFormError('Session duration must be a whole number between 5 and 480 minutes.');
    const generated = generateReviewSchedule(draft.subjectIds, draft.examAt, new Date(), minutes);
    if (!generated.ok)
      return setFormError(schedulingMessage(generated.reason, generated.availableDays));

    const now = new Date().toISOString();
    const sessions = generated.sessions.map((slot) => {
      const linkedMaterials = draft.materialIds.filter(
        (id) => metadata.files.find((file) => file.id === id)?.subjectId === slot.subjectId,
      );
      const previous = editingPlan?.sessions.find(
        (session) => session.subjectId === slot.subjectId,
      );
      return {
        id: previous?.id ?? createId(),
        subjectId: slot.subjectId,
        materialIds: linkedMaterials,
        scheduledDate: slot.scheduledDate,
        scheduledTime: slot.scheduledTime,
        durationMinutes: previous?.durationMinutes ?? minutes,
        completed: previous?.completed ?? false,
        ...(previous?.completedAt ? { completedAt: previous.completedAt } : {}),
        createdAt: previous?.createdAt ?? now,
        updatedAt: now,
      } satisfies RevisionSession;
    });

    if (editingPlan) {
      const allComplete = sessions.length > 0 && sessions.every((session) => session.completed);
      revisionPlans.update(editingPlan.id, {
        title: draft.title.trim(),
        examAt: draft.examAt,
        subjectIds: [...draft.subjectIds],
        materialIds: [...draft.materialIds],
        targetSessionMinutes: minutes,
        sessions,
        status:
          editingPlan.status === 'archived' ? 'archived' : allComplete ? 'completed' : 'active',
        updatedAt: now,
      });
      toast({ message: 'Revision plan updated', tone: 'success' });
    } else {
      const plan: RevisionPlan = {
        id: createId(),
        title: draft.title.trim(),
        examAt: draft.examAt,
        subjectIds: [...draft.subjectIds],
        materialIds: [...draft.materialIds],
        targetSessionMinutes: minutes,
        sessions,
        status: 'active',
        createdAt: now,
        updatedAt: now,
      };
      revisionPlans.add(plan);
      toast({ message: 'Revision plan created', tone: 'success' });
    }
    setDialogOpen(false);
  };

  const saveSession = (plan: RevisionPlan, sessionId: string) => {
    const minutes = Number(sessionDraft.duration);
    if (!Number.isInteger(minutes) || minutes < 5 || minutes > 480) {
      setSessionError('Duration must be a whole number from 5 to 480 minutes.');
      return;
    }
    const result = editRevisionSession(
      plan,
      sessionId,
      {
        scheduledDate: sessionDraft.date,
        scheduledTime: sessionDraft.time,
        durationMinutes: minutes,
      },
      today,
      new Date().toISOString(),
      format(new Date(), 'HH:mm'),
    );
    if (!result.ok) {
      const messages = {
        'missing-session': 'This session no longer exists.',
        'invalid-date': 'Choose a valid date.',
        'past-date': 'A session cannot be rescheduled before today.',
        'after-exam': 'Sessions must be scheduled before the exam day.',
        'invalid-time': 'Choose a valid start time.',
        'invalid-duration': 'Duration must be a whole number from 5 to 480 minutes.',
        'past-time': 'A session cannot be rescheduled to an earlier time today.',
        'too-late': 'A session must finish by 22:00.',
      };
      setSessionError(messages[result.reason]);
      return;
    }
    revisionPlans.update(plan.id, result.plan);
    setEditingSession(null);
    setSessionError(null);
  };

  const mutatePlan = (plan: RevisionPlan, updated: RevisionPlan) =>
    revisionPlans.update(plan.id, updated);

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-center gap-3">
        <div>
          <h2 className="text-fg text-xl font-bold">Revision Plans</h2>
          <p className="text-muted mt-0.5 text-sm">Build a local review sequence for each exam.</p>
        </div>
        <button type="button" className="btn btn--primary ml-auto" onClick={openCreate}>
          <Plus className="h-4 w-4" aria-hidden="true" /> New plan
        </button>
      </header>

      <div
        className="border-line flex gap-1 border-b"
        role="tablist"
        aria-label="Revision plan status"
      >
        {(['active', 'archived'] as const).map((value) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={filter === value}
            className={`border-b-2 px-3 py-2 text-sm font-semibold capitalize ${filter === value ? 'border-accent text-fg' : 'text-muted hover:text-fg border-transparent'}`}
            onClick={() => setFilter(value)}
          >
            {value === 'active' ? 'Current plans' : 'Archived'}
          </button>
        ))}
      </div>

      {plans.length === 0 ? (
        <Card>
          <EmptyState
            icon={<BookOpenCheck className="h-7 w-7" aria-hidden="true" />}
            title={filter === 'active' ? 'No revision plans yet' : 'No archived plans'}
            description={
              filter === 'active'
                ? 'Create a plan to organize reviews before an exam.'
                : 'Archived plans will appear here.'
            }
            actions={
              filter === 'active' ? (
                <button className="btn btn--primary" onClick={openCreate} type="button">
                  <Plus className="h-4 w-4" aria-hidden="true" /> Create a plan
                </button>
              ) : undefined
            }
          />
        </Card>
      ) : (
        <div className="space-y-3">
          {plans.map((plan) => {
            const completedCount = plan.sessions.filter((session) => session.completed).length;
            const remainingCount = plan.sessions.length - completedCount;
            const overdue =
              plan.status !== 'archived' && plan.examAt.slice(0, 10) <= today && remainingCount > 0;
            const upcoming = [...plan.sessions].sort((a, b) =>
              `${a.scheduledDate}T${a.scheduledTime}`.localeCompare(
                `${b.scheduledDate}T${b.scheduledTime}`,
              ),
            );
            const subjectNames = plan.subjectIds.map(
              (id) => subjects.find((subject) => subject.id === id)?.name ?? 'Removed subject',
            );
            const linkedMaterials = plan.materialIds.map(
              (id) => metadata.files.find((file) => file.id === id)?.name ?? 'Removed material',
            );
            return (
              <Card key={plan.id} className="space-y-4">
                <div className="flex flex-wrap items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-fg text-lg font-bold">{plan.title}</h3>
                      <Chip
                        tone={
                          plan.status === 'completed'
                            ? 'success'
                            : plan.status === 'archived'
                              ? 'neutral'
                              : 'accent'
                        }
                      >
                        {plan.status}
                      </Chip>
                    </div>
                    <p className="text-muted mt-1 text-sm">
                      Exam {format(new Date(`${plan.examAt}:00`), 'EEE, d MMM yyyy · HH:mm')}
                      {' · '}
                      {plan.targetSessionMinutes} min target
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <IconButton aria-label={`Edit ${plan.title}`} onClick={() => openEdit(plan)}>
                      <Edit3 className="h-4 w-4" aria-hidden="true" />
                    </IconButton>
                    <IconButton
                      aria-label={
                        plan.status === 'archived'
                          ? `Restore ${plan.title}`
                          : `Archive ${plan.title}`
                      }
                      onClick={() => {
                        const now = new Date().toISOString();
                        const status =
                          plan.status === 'archived'
                            ? plan.sessions.length > 0 &&
                              plan.sessions.every((session) => session.completed)
                              ? 'completed'
                              : 'active'
                            : 'archived';
                        mutatePlan(plan, { ...plan, status, updatedAt: now });
                      }}
                    >
                      {plan.status === 'archived' ? (
                        <RotateCcw className="h-4 w-4" aria-hidden="true" />
                      ) : (
                        <Archive className="h-4 w-4" aria-hidden="true" />
                      )}
                    </IconButton>
                    <IconButton
                      aria-label={`Delete ${plan.title}`}
                      tone="danger"
                      onClick={() => setPendingDelete(plan)}
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </IconButton>
                  </div>
                </div>

                {overdue && (
                  <p
                    role="status"
                    className="border-danger/30 bg-danger-soft text-danger rounded-md border px-3 py-2 text-sm"
                  >
                    Exam date has passed with {remainingCount} review{' '}
                    {remainingCount === 1 ? 'session' : 'sessions'} remaining.
                  </p>
                )}

                <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
                  <p>
                    <span className="text-subtle">Subjects: </span>
                    <span className="text-fg">{subjectNames.join(', ') || 'None'}</span>
                  </p>
                  <p>
                    <span className="text-subtle">Materials: </span>
                    <span className="text-fg">{linkedMaterials.join(', ') || 'None linked'}</span>
                  </p>
                </div>

                <div className="border-line flex items-center gap-4 border-y py-2 text-sm">
                  <span className="text-success font-semibold">{completedCount} completed</span>
                  <span className="text-muted">{remainingCount} remaining</span>
                  <span className="text-subtle ml-auto">{plan.sessions.length} total</span>
                </div>

                {upcoming.length === 0 ? (
                  <p className="text-muted text-sm">No sessions remain in this plan.</p>
                ) : (
                  <ul className="divide-line divide-y">
                    {upcoming.map((session) => {
                      const sessionSubject =
                        subjects.find((subject) => subject.id === session.subjectId)?.name ??
                        'Removed subject';
                      const sessionMaterials = session.materialIds
                        .map((id) => metadata.files.find((file) => file.id === id)?.name)
                        .filter(Boolean);
                      const isEditing =
                        editingSession?.planId === plan.id &&
                        editingSession.sessionId === session.id;
                      return (
                        <li key={session.id} className="py-3 first:pt-0 last:pb-0">
                          <div className="flex flex-wrap items-center gap-3">
                            <button
                              type="button"
                              className={`flex h-6 w-6 shrink-0 items-center justify-center rounded border ${session.completed ? 'border-success bg-success text-white' : 'border-line hover:border-accent text-transparent'}`}
                              aria-label={
                                session.completed
                                  ? `Mark ${sessionSubject} incomplete`
                                  : `Mark ${sessionSubject} complete`
                              }
                              aria-pressed={session.completed}
                              onClick={() =>
                                mutatePlan(
                                  plan,
                                  completeRevisionSession(plan, session.id, !session.completed),
                                )
                              }
                            >
                              {session.completed && (
                                <Check className="h-4 w-4" aria-hidden="true" />
                              )}
                            </button>
                            <div className="min-w-0 flex-1">
                              <p
                                className={`text-fg font-semibold ${session.completed ? 'line-through opacity-65' : ''}`}
                              >
                                {sessionSubject}
                              </p>
                              <p className="text-muted text-sm">
                                {format(fromDayKey(session.scheduledDate), 'EEE, d MMM')} ·{' '}
                                {sessionTimeLabel(session)}
                                {sessionMaterials.length > 0
                                  ? ` · ${sessionMaterials.join(', ')}`
                                  : ''}
                              </p>
                            </div>
                            <IconButton
                              aria-label={`Edit ${sessionSubject} session`}
                              onClick={() => {
                                setEditingSession({ planId: plan.id, sessionId: session.id });
                                setSessionDraft({
                                  date: session.scheduledDate,
                                  time: session.scheduledTime,
                                  duration: String(session.durationMinutes),
                                });
                                setSessionError(null);
                              }}
                            >
                              <Edit3 className="h-4 w-4" aria-hidden="true" />
                            </IconButton>
                            <IconButton
                              aria-label={`Remove ${sessionSubject} session`}
                              tone="danger"
                              onClick={() =>
                                mutatePlan(plan, removeRevisionSession(plan, session.id))
                              }
                            >
                              <X className="h-4 w-4" aria-hidden="true" />
                            </IconButton>
                          </div>
                          {isEditing && (
                            <div className="border-line bg-bg-subtle mt-3 rounded-md border p-3">
                              {sessionError && (
                                <p role="alert" className="text-danger mb-3 text-sm">
                                  {sessionError}
                                </p>
                              )}
                              <div className="grid gap-3 sm:grid-cols-3">
                                <TextField
                                  label="Session date"
                                  type="date"
                                  min={today}
                                  max={plan.examAt.slice(0, 10)}
                                  value={sessionDraft.date}
                                  onChange={(event) =>
                                    setSessionDraft((value) => ({
                                      ...value,
                                      date: event.target.value,
                                    }))
                                  }
                                />
                                <TextField
                                  label="Start time"
                                  type="time"
                                  value={sessionDraft.time}
                                  onChange={(event) =>
                                    setSessionDraft((value) => ({
                                      ...value,
                                      time: event.target.value,
                                    }))
                                  }
                                />
                                <TextField
                                  label="Duration (minutes)"
                                  type="number"
                                  min={5}
                                  max={480}
                                  step={5}
                                  value={sessionDraft.duration}
                                  onChange={(event) =>
                                    setSessionDraft((value) => ({
                                      ...value,
                                      duration: event.target.value,
                                    }))
                                  }
                                />
                              </div>
                              <div className="mt-3 flex justify-end gap-2">
                                <button
                                  type="button"
                                  className="btn btn--ghost"
                                  onClick={() => setEditingSession(null)}
                                >
                                  Cancel
                                </button>
                                <button
                                  type="button"
                                  className="btn btn--primary"
                                  onClick={() => saveSession(plan, session.id)}
                                >
                                  Save session
                                </button>
                              </div>
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </Card>
            );
          })}
        </div>
      )}

      <Modal
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        title={editingPlan ? 'Edit revision plan' : 'Create revision plan'}
        footer={
          <>
            <button type="button" className="btn btn--ghost" onClick={() => setDialogOpen(false)}>
              <X className="h-4 w-4" aria-hidden="true" /> Cancel
            </button>
            <button type="button" className="btn btn--primary" onClick={submitPlan}>
              {editingPlan ? 'Save plan' : 'Generate plan'}
            </button>
          </>
        }
      >
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            submitPlan();
          }}
        >
          {formError && (
            <p
              role="alert"
              className="border-danger/30 bg-danger-soft text-danger rounded-md border px-3 py-2 text-sm"
            >
              {formError}
            </p>
          )}
          <TextField
            label="Plan title"
            required
            maxLength={100}
            value={draft.title}
            placeholder="e.g. Biology midterm"
            onChange={(event) => setDraft((value) => ({ ...value, title: event.target.value }))}
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <TextField
              label="Exam date and time"
              type="datetime-local"
              required
              value={draft.examAt}
              onChange={(event) => setDraft((value) => ({ ...value, examAt: event.target.value }))}
            />
            <TextField
              label="Target session duration (minutes)"
              type="number"
              min={5}
              max={480}
              step={5}
              required
              value={draft.targetSessionMinutes}
              onChange={(event) =>
                setDraft((value) => ({ ...value, targetSessionMinutes: event.target.value }))
              }
            />
          </div>

          <fieldset>
            <legend className="field-label">Subjects</legend>
            {subjects.length === 0 ? (
              <p className="text-muted text-sm">
                Add subjects in{' '}
                <Link className="text-accent underline" to="/materials">
                  Study Materials
                </Link>{' '}
                first.
              </p>
            ) : (
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {subjects.map((subject) => (
                  <label
                    key={subject.id}
                    className="border-line hover:border-accent flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm"
                  >
                    <input
                      type="checkbox"
                      checked={draft.subjectIds.includes(subject.id)}
                      onChange={() =>
                        setDraft((value) => ({
                          ...value,
                          subjectIds: value.subjectIds.includes(subject.id)
                            ? value.subjectIds.filter((id) => id !== subject.id)
                            : [...value.subjectIds, subject.id],
                          materialIds: value.subjectIds.includes(subject.id)
                            ? value.materialIds.filter(
                                (id) =>
                                  metadata.files.find((file) => file.id === id)?.subjectId !==
                                  subject.id,
                              )
                            : value.materialIds,
                        }))
                      }
                    />
                    <span className="text-fg">{subject.name}</span>
                  </label>
                ))}
              </div>
            )}
          </fieldset>

          {draft.subjectIds.length > 0 && (
            <fieldset>
              <legend className="field-label">
                Study materials <span className="text-subtle font-normal">(optional)</span>
              </legend>
              {eligibleMaterials.length === 0 ? (
                <p className="text-muted mt-1 text-sm">
                  No materials are linked to the selected subjects yet.
                </p>
              ) : (
                <div className="mt-2 max-h-36 space-y-1 overflow-y-auto">
                  {eligibleMaterials.map((file) => (
                    <label
                      key={file.id}
                      className="hover:bg-bg-subtle flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm"
                    >
                      <input
                        type="checkbox"
                        checked={draft.materialIds.includes(file.id)}
                        onChange={() => toggleDraftValue('materialIds', file.id)}
                      />
                      <span className="text-fg min-w-0 flex-1 truncate">{file.name}</span>
                      <span className="text-subtle">
                        {subjects.find((subject) => subject.id === file.subjectId)?.name}
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </fieldset>
          )}

          <p className="text-muted border-line flex gap-2 border-t pt-3 text-xs">
            <Clock3 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            One session per subject, evenly spaced through the day before the exam. Sessions start
            at 09:00, except a session today uses the next half-hour slot when its full duration
            fits before 22:00. Exam day is reserved for the exam.
          </p>
        </form>
      </Modal>

      <ConfirmDialog
        open={pendingDelete != null}
        title="Delete this revision plan?"
        description="Its sessions and completion history will be removed from this browser."
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => {
          if (pendingDelete) revisionPlans.remove(pendingDelete.id);
          setPendingDelete(null);
        }}
      />
    </div>
  );
}
