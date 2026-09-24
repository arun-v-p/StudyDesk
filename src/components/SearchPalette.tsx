import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CalendarRange,
  CornerDownLeft,
  FileText,
  ListTodo,
  Search,
  StickyNote,
} from 'lucide-react';
import { Modal } from './ui/Modal';
import { useStore } from '../store/AppStore';

interface Hit {
  id: string;
  label: string;
  detail: string;
  path: string;
  kind: 'deadline' | 'note' | 'task' | 'planner' | 'class' | 'page';
}

/**
 * ⌘K palette across every entity. Routing makes this possible — the original
 * had no URLs at all, so there was nothing to navigate to.
 */
export function SearchPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const navigate = useNavigate();
  const { deadlines, notes, tasks, planner, timetable } = useStore();

  useEffect(() => {
    if (open) {
      setQuery('');
      setActive(0);
    }
  }, [open]);

  const pages: Hit[] = useMemo(
    () => [
      { id: 'p-today', label: 'Today', detail: 'Dashboard', path: '/', kind: 'page' },
      {
        id: 'p-deadlines',
        label: 'Deadlines',
        detail: 'All deadlines',
        path: '/deadlines',
        kind: 'page',
      },
      {
        id: 'p-timetable',
        label: 'Timetable',
        detail: 'Weekly classes',
        path: '/timetable',
        kind: 'class',
      },
      {
        id: 'p-calendar',
        label: 'Calendar',
        detail: 'Month and planner',
        path: '/calendar',
        kind: 'page',
      },
      { id: 'p-timer', label: 'Focus Timer', detail: 'Pomodoro', path: '/timer', kind: 'page' },
      { id: 'p-notes', label: 'Notes', detail: 'All notes', path: '/notes', kind: 'page' },
      {
        id: 'p-settings',
        label: 'Settings',
        detail: 'Theme, name, data',
        path: '/settings',
        kind: 'page',
      },
    ],
    [],
  );

  const hits = useMemo<Hit[]>(() => {
    const q = query.trim().toLowerCase();
    const all: Hit[] = [
      ...pages,
      ...deadlines.items.map<Hit>((d) => ({
        id: d.id,
        label: d.title,
        detail: [d.subject, d.dueDate].filter(Boolean).join(' · '),
        path: '/deadlines',
        kind: 'deadline',
      })),
      ...notes.items.map<Hit>((n) => ({
        id: n.id,
        label: n.title,
        detail: n.content.slice(0, 60),
        path: '/notes',
        kind: 'note',
      })),
      ...tasks.items.map<Hit>((t) => ({
        id: t.id,
        label: t.title,
        detail: t.completed ? 'Completed task' : 'Open task',
        path: '/',
        kind: 'task',
      })),
      ...planner.items.map<Hit>((p) => ({
        id: p.id,
        label: p.title,
        detail: `${p.date} · ${p.category}`,
        path: '/calendar',
        kind: 'planner',
      })),
      ...timetable.items.map<Hit>((t) => ({
        id: t.id,
        label: t.subject,
        detail: `${t.startTime}–${t.endTime}${t.room ? ` · ${t.room}` : ''}`,
        path: '/timetable',
        kind: 'class',
      })),
    ];
    if (!q) return pages;
    return all
      .filter((h) => h.label.toLowerCase().includes(q) || h.detail.toLowerCase().includes(q))
      .slice(0, 12);
  }, [query, pages, deadlines.items, notes.items, tasks.items, planner.items, timetable.items]);

  useEffect(() => setActive(0), [query]);

  const choose = (hit: Hit | undefined) => {
    if (!hit) return;
    onClose();
    navigate(hit.path);
  };

  return (
    <Modal open={open} onClose={onClose} title="Search StudyDesk" width="max-w-xl">
      <div className="relative">
        <Search
          className="text-subtle pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2"
          aria-hidden="true"
        />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setActive((i) => Math.min(i + 1, hits.length - 1));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setActive((i) => Math.max(i - 1, 0));
            } else if (e.key === 'Enter') {
              e.preventDefault();
              choose(hits[active]);
            }
          }}
          placeholder="Search tasks, deadlines, notes, classes…"
          aria-label="Search"
          className="field-input pl-9"
          autoComplete="off"
        />
      </div>

      <ul className="mt-3 max-h-72 overflow-y-auto" role="listbox" aria-label="Search results">
        {hits.length === 0 && (
          <li className="text-subtle px-3 py-6 text-center text-sm">No matches for “{query}”.</li>
        )}
        {hits.map((h, i) => (
          <li key={`${h.kind}-${h.id}`} role="option" aria-selected={i === active}>
            <button
              type="button"
              onClick={() => choose(h)}
              onMouseEnter={() => setActive(i)}
              className={`flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left transition-colors ${
                i === active ? 'bg-accent-soft' : 'hover:bg-raised'
              }`}
            >
              <KindIcon kind={h.kind} />
              <span className="min-w-0 flex-1">
                <span className="text-fg block truncate text-sm font-medium">{h.label}</span>
                {h.detail && <span className="text-subtle block truncate text-xs">{h.detail}</span>}
              </span>
              {i === active && (
                <CornerDownLeft className="text-subtle h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              )}
            </button>
          </li>
        ))}
      </ul>
    </Modal>
  );
}

function KindIcon({ kind }: { kind: Hit['kind'] }) {
  const cls = 'h-4 w-4 shrink-0 text-subtle';
  switch (kind) {
    case 'deadline':
      return <ListTodo className={cls} aria-hidden="true" />;
    case 'note':
      return <StickyNote className={cls} aria-hidden="true" />;
    case 'class':
      return <CalendarRange className={cls} aria-hidden="true" />;
    case 'planner':
      return <CalendarRange className={cls} aria-hidden="true" />;
    default:
      return <FileText className={cls} aria-hidden="true" />;
  }
}
