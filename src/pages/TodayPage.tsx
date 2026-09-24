import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import { Check, Clock, MapPin, Plus, Trash2 } from 'lucide-react';
import { useStore } from '../store/AppStore';
import { useNow } from '../hooks/useNow';
import { Card, CardHeader, Chip, ActionLink } from '../components/ui/Card';
import { EmptyState } from '../components/ui/EmptyState';
import { IconButton } from '../components/ui/IconButton';
import { TextField } from '../components/ui/Field';
import { dayKey, isValidDayKey } from '../lib/dates';
import { deadlineStatus, relativeDue, sortDeadlines, STATUS_TONE } from '../lib/status';
import { entriesForDay, subjectColors, subjectHue } from '../features/timetable/layout';
import type { ResolvedTheme } from '../hooks/useTheme';

function greeting(hour: number): string {
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

export function TodayPage({ theme }: { theme: ResolvedTheme }) {
  const now = useNow(60_000);
  const { tasks, deadlines, timetable, notes, planner, settings, newTask, toast } = useStore();
  const [draft, setDraft] = useState('');

  const todayKey = dayKey(now);

  const openTasks = useMemo(
    () =>
      tasks.items
        .filter((t) => !t.completed)
        .sort((a, b) => {
          // Tasks with a due date first, then oldest created.
          const ad = isValidDayKey(a.dueDate) ? 0 : 1;
          const bd = isValidDayKey(b.dueDate) ? 0 : 1;
          if (ad !== bd) return ad - bd;
          return a.createdAt.localeCompare(b.createdAt);
        }),
    [tasks.items],
  );

  const completedToday = useMemo(
    () =>
      tasks.items.filter(
        (t) => t.completed && t.completedAt != null && dayKey(new Date(t.completedAt)) === todayKey,
      ).length,
    [tasks.items, todayKey],
  );

  const urgent = useMemo(
    () =>
      sortDeadlines(deadlines.items)
        .filter((d) => !d.completed)
        .map((d) => ({ d, status: deadlineStatus(d, now) }))
        .filter(({ status }) => status === 'overdue' || status === 'today' || status === 'tomorrow')
        .slice(0, 5),
    [deadlines.items, now],
  );

  const todayClasses = useMemo(
    () => entriesForDay(timetable.items, now.getDay()),
    [timetable.items, now],
  );

  const nowMinutesOfDay = now.getHours() * 60 + now.getMinutes();
  const currentClass = todayClasses.find((c) => {
    const [sh, sm] = c.startTime.split(':').map(Number);
    const [eh, em] = c.endTime.split(':').map(Number);
    const s = (sh ?? 0) * 60 + (sm ?? 0);
    const e = (eh ?? 0) * 60 + (em ?? 0);
    return nowMinutesOfDay >= s && nowMinutesOfDay < e;
  });

  const pinnedNotes = useMemo(() => notes.items.filter((n) => n.pinned).slice(0, 3), [notes.items]);
  const todayPlanner = useMemo(
    () => planner.items.filter((p) => p.date === todayKey),
    [planner.items, todayKey],
  );

  const total = openTasks.length + completedToday;
  const pct = total === 0 ? 0 : Math.round((completedToday / total) * 100);
  const name = settings.displayName.trim();

  const addTask = () => {
    const title = draft.trim();
    if (!title) return;
    tasks.add(newTask(title, todayKey));
    setDraft('');
  };

  const removeTask = (id: string) => {
    const removed = tasks.remove(id);
    if (!removed) return;
    toast({
      message: `Deleted “${removed.item.title}”`,
      tone: 'danger',
      undoLabel: 'Undo',
      onUndo: () => tasks.restore(removed.item, removed.index),
    });
  };

  const isEmpty =
    openTasks.length === 0 &&
    urgent.length === 0 &&
    todayClasses.length === 0 &&
    pinnedNotes.length === 0;

  return (
    <div className="space-y-5">
      {/* Hero */}
      <div className="flex flex-wrap items-center gap-5">
        <div className="min-w-[240px] flex-1">
          <p className="text-muted flex items-center gap-2 text-sm">
            {greeting(now.getHours())}
            {name && (
              <>
                ,<span className="text-fg font-semibold">{name}</span>
              </>
            )}
          </p>
          <h2 className="text-fg mt-1 text-3xl font-bold tracking-tight sm:text-4xl">
            {format(now, 'EEEE, d MMMM')}
          </h2>
          <p className="text-subtle mt-1.5 text-sm">
            Week {format(now, 'II')} ·{' '}
            {total === 0
              ? 'nothing scheduled yet'
              : `${completedToday} of ${total} task${total === 1 ? '' : 's'} done`}
          </p>
        </div>
        <ProgressRing percent={pct} label={`${pct}% complete`} />
      </div>

      {isEmpty && (
        <Card>
          <EmptyState
            icon={<Plus className="h-7 w-7" aria-hidden="true" />}
            title="Your day is clear"
            description="Add a task below, put your classes on the timetable, or load a sample term from Settings to see how everything fits together."
            actions={
              <>
                <Link to="/deadlines" className="btn btn--primary">
                  <Plus className="h-4 w-4" aria-hidden="true" /> Add a deadline
                </Link>
                <Link to="/settings" className="btn btn--ghost">
                  Load sample term
                </Link>
              </>
            }
          />
        </Card>
      )}

      <div className="grid items-start gap-4 lg:grid-cols-[1.35fr_1fr]">
        <div className="space-y-4">
          {/* Tasks */}
          <Card>
            <CardHeader
              title="Today's tasks"
              badge={
                openTasks.length > 0 ? (
                  <Chip tone="neutral">
                    {openTasks.length} open
                    {completedToday > 0 ? ` · ${completedToday} done` : ''}
                  </Chip>
                ) : undefined
              }
            />
            {/*
              Not a <form>. A sandboxed iframe without `allow-forms` silently
              blocks submission, which made this button appear dead. The action
              lives on the button's onClick and on the input's Enter keydown, so
              it works in every embedding context.
            */}
            <div className="mb-4 flex gap-2">
              <TextField
                label="New task"
                className="flex-1 [&_.field-label]:sr-only"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addTask();
                  }
                }}
                placeholder="Add a task and press Enter…"
                autoComplete="off"
              />
              <button
                type="button"
                onClick={addTask}
                className="btn btn--primary btn--icon"
                aria-label="Add task"
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            {openTasks.length === 0 ? (
              <p className="text-subtle py-1 text-sm">
                {completedToday > 0
                  ? `All done — ${completedToday} task${completedToday === 1 ? '' : 's'} completed today.`
                  : 'No open tasks.'}
              </p>
            ) : (
              <ul className="space-y-0.5">
                {openTasks.map((task) => {
                  const overdue =
                    isValidDayKey(task.dueDate) && task.dueDate < todayKey && !task.completed;
                  return (
                    <li key={task.id} className="group task-row">
                      <button
                        type="button"
                        role="checkbox"
                        aria-checked={false}
                        aria-label={`Mark “${task.title}” as done`}
                        onClick={() => {
                          tasks.update(task.id, {
                            completed: true,
                            completedAt: new Date().toISOString(),
                          });
                          toast({ message: 'Task completed', tone: 'success' });
                        }}
                        className="checkbox"
                      >
                        <Check className="h-3 w-3" aria-hidden="true" strokeWidth={3.4} />
                      </button>
                      <span className="text-fg min-w-0 flex-1 truncate text-sm">{task.title}</span>
                      {overdue && <Chip tone="danger">Overdue</Chip>}
                      {isValidDayKey(task.dueDate) && task.dueDate === todayKey && (
                        <Chip tone="warning">Today</Chip>
                      )}
                      <span className="row-actions flex gap-0.5">
                        <IconButton
                          aria-label={`Delete “${task.title}”`}
                          tone="danger"
                          size="sm"
                          onClick={() => removeTask(task.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                        </IconButton>
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          {/* Schedule */}
          <Card>
            <CardHeader
              title="Today's schedule"
              action={<ActionLink to="/timetable">Full timetable</ActionLink>}
            />
            {todayClasses.length === 0 ? (
              <p className="text-subtle py-1 text-sm">
                No classes scheduled for {format(now, 'EEEE')}.
              </p>
            ) : (
              <ol className="border-border relative ml-[52px] space-y-2 border-l pl-5">
                {todayClasses.map((c) => {
                  const colors = subjectColors(subjectHue(c.subject), theme);
                  const isNow = currentClass?.id === c.id;
                  const [sh, sm] = c.startTime.split(':').map(Number);
                  const startMin = (sh ?? 0) * 60 + (sm ?? 0);
                  const past = startMin < nowMinutesOfDay && !isNow;
                  return (
                    <li key={c.id} className={`relative ${past ? 'opacity-55' : ''}`}>
                      <span className="text-2xs text-subtle absolute top-1.5 -left-[38px] w-9 text-right font-mono">
                        {c.startTime}
                      </span>
                      <span
                        aria-hidden="true"
                        className={`bg-surface absolute top-2.5 -left-[25px] h-2.5 w-2.5 rounded-full border-2 ${
                          isNow ? 'border-danger' : 'border-border-strong'
                        }`}
                      />
                      <div
                        className="border-border bg-raised rounded-md border py-2 pr-3.5 pl-3"
                        style={{ borderLeftColor: colors.rail, borderLeftWidth: 3 }}
                      >
                        <p className="text-fg text-sm font-semibold">{c.subject}</p>
                        <p className="text-subtle mt-0.5 flex flex-wrap items-center gap-x-2 text-xs">
                          <span className="inline-flex items-center gap-1">
                            <Clock className="h-3 w-3" aria-hidden="true" />
                            {c.startTime}–{c.endTime}
                          </span>
                          {c.room && (
                            <span className="inline-flex items-center gap-1">
                              <MapPin className="h-3 w-3" aria-hidden="true" />
                              {c.room}
                            </span>
                          )}
                          {isNow && <Chip tone="danger">In progress</Chip>}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
          </Card>
        </div>

        <div className="space-y-4">
          {/* Deadlines */}
          <Card>
            <CardHeader
              title="Upcoming deadlines"
              action={<ActionLink to="/deadlines">View all</ActionLink>}
            />
            {urgent.length === 0 ? (
              <p className="text-subtle py-1 text-sm">Nothing due in the next two days.</p>
            ) : (
              <ul className="space-y-2.5">
                {urgent.map(({ d, status }) => (
                  <li key={d.id} className="flex gap-2.5">
                    <span
                      aria-hidden="true"
                      className={`w-1 shrink-0 rounded-full ${
                        status === 'overdue'
                          ? 'bg-danger'
                          : status === 'today'
                            ? 'bg-warning'
                            : 'bg-info'
                      }`}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-fg truncate text-sm font-medium">{d.title}</p>
                      <p className="text-subtle mt-1 flex flex-wrap items-center gap-1.5 text-xs">
                        <Chip tone={STATUS_TONE[status]}>{relativeDue(d, now)}</Chip>
                        {d.subject && <span>{d.subject}</span>}
                        {d.dueTime && <span>· {d.dueTime}</span>}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {/* Planner */}
          <Card>
            <CardHeader
              title="Planned for today"
              action={<ActionLink to="/calendar">Calendar</ActionLink>}
            />
            {todayPlanner.length === 0 ? (
              <p className="text-subtle py-1 text-sm">Nothing planned.</p>
            ) : (
              <ul className="space-y-2">
                {todayPlanner.map((p) => (
                  <li key={p.id} className="flex items-start gap-2.5">
                    <Chip
                      tone={
                        p.category === 'academic'
                          ? 'info'
                          : p.category === 'work'
                            ? 'warning'
                            : p.category === 'health'
                              ? 'success'
                              : 'accent'
                      }
                    >
                      {p.category}
                    </Chip>
                    <span className="text-fg min-w-0 flex-1 text-sm">{p.title}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {/* Pinned notes */}
          {pinnedNotes.length > 0 && (
            <Card>
              <CardHeader
                title="Pinned notes"
                action={<ActionLink to="/notes">All notes</ActionLink>}
              />
              <ul className="space-y-2">
                {pinnedNotes.map((n) => (
                  <li key={n.id} className="bg-sunken rounded-md p-3">
                    <p className="text-fg text-sm font-medium">{n.title}</p>
                    {n.content && (
                      <p className="text-muted mt-1 line-clamp-2 text-xs">{n.content}</p>
                    )}
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function ProgressRing({ percent, label }: { percent: number; label: string }) {
  const r = 34;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - percent / 100);
  return (
    <div className="relative h-[88px] w-[88px] shrink-0" role="img" aria-label={label}>
      <svg viewBox="0 0 80 80" className="h-full w-full -rotate-90" aria-hidden="true">
        <circle cx="40" cy="40" r={r} fill="none" stroke="var(--color-raised)" strokeWidth="7" />
        <circle
          cx="40"
          cy="40"
          r={r}
          fill="none"
          stroke="var(--color-accent)"
          strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 500ms cubic-bezier(.22,1,.36,1)' }}
        />
      </svg>
      <div className="absolute inset-0 grid place-content-center text-center">
        <span className="text-fg text-xl font-bold tracking-tight">{percent}%</span>
        <span className="text-subtle text-[9px] font-semibold tracking-wider uppercase">done</span>
      </div>
    </div>
  );
}
