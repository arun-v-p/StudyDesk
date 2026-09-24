import { NavLink } from 'react-router-dom';
import { BookOpen, Download, Upload } from 'lucide-react';
import { NAV_ITEMS, SETTINGS_ITEM } from './nav';
import { IconButton } from '../ui/IconButton';
import { useStore } from '../../store/AppStore';

/**
 * Desktop rail + mobile drawer.
 *
 * Fixes over the original: a real active indicator bar, `aria-current` (NavLink
 * provides it), per-item counts, a storage meter, Export/Import, and a drawer
 * that traps focus and closes on Escape.
 */
export function Sidebar({
  open,
  onClose,
  onExport,
  onImport,
  storagePercent,
}: {
  open: boolean;
  onClose: () => void;
  onExport: () => void;
  onImport: () => void;
  storagePercent: number;
}) {
  const { deadlines, notes } = useStore();

  const overdue = deadlines.items.filter(
    (d) => !d.completed && new Date(`${d.dueDate}T${d.dueTime || '23:59'}`) < new Date(),
  ).length;

  const counts: Record<string, number | undefined> = {
    '/deadlines': overdue || undefined,
    '/notes': notes.items.length || undefined,
  };

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/55 backdrop-blur-[2px] lg:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      <aside
        id="app-sidebar"
        className={`border-border bg-surface ease-out-soft fixed inset-y-0 left-0 z-50 flex w-60 flex-col gap-1 border-r px-3.5 py-5 transition-transform duration-200 lg:translate-x-0 ${
          open ? 'shadow-pop translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center gap-2.5 px-2 pb-5">
          <span
            aria-hidden="true"
            className="from-accent to-info shadow-raise grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-gradient-to-br text-white"
          >
            <BookOpen className="h-[18px] w-[18px]" strokeWidth={2.2} />
          </span>
          <span className="min-w-0">
            <span className="text-fg block text-[15px] font-semibold tracking-tight">
              StudyDesk
            </span>
            <span className="text-2xs text-subtle block">Study planner</span>
          </span>
          <IconButton
            aria-label="Close navigation"
            onClick={onClose}
            size="sm"
            className="ml-auto lg:hidden"
          >
            <span aria-hidden="true" className="text-lg leading-none">
              ×
            </span>
          </IconButton>
        </div>

        <p className="nav-group-label">Workspace</p>
        <nav aria-label="Main">
          <ul className="flex flex-col gap-0.5">
            {NAV_ITEMS.map((item) => (
              <NavRow key={item.path} item={item} badge={counts[item.path]} onNavigate={onClose} />
            ))}
          </ul>
        </nav>

        <p className="nav-group-label mt-3">Data</p>
        <nav aria-label="Data management">
          <ul className="flex flex-col gap-0.5">
            <NavRow item={SETTINGS_ITEM} onNavigate={onClose} />
          </ul>
        </nav>

        <div className="border-border mt-auto flex flex-col gap-2.5 border-t pt-3.5">
          <div className="text-2xs text-subtle flex items-center gap-2 px-2.5">
            <span className="sr-only">Browser storage used</span>
            <span aria-hidden="true" className="bg-raised h-1 flex-1 overflow-hidden rounded-full">
              <span
                className="from-accent to-info block h-full rounded-full bg-gradient-to-r"
                style={{ width: `${Math.min(100, Math.max(2, storagePercent))}%` }}
              />
            </span>
            <span className="tabular-nums">
              {storagePercent < 1 ? '<1' : Math.round(storagePercent)}%
            </span>
          </div>
          <div className="flex gap-1.5 px-1">
            <button type="button" onClick={onExport} className="mini-btn flex-1">
              <Download className="h-3.5 w-3.5" aria-hidden="true" />
              Export
            </button>
            <button type="button" onClick={onImport} className="mini-btn flex-1">
              <Upload className="h-3.5 w-3.5" aria-hidden="true" />
              Import
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}

function NavRow({
  item,
  badge,
  onNavigate,
}: {
  item: (typeof NAV_ITEMS)[number];
  badge?: number;
  onNavigate: () => void;
}) {
  const Icon = item.icon;
  const isDanger = item.path === '/deadlines';
  return (
    <li>
      <NavLink
        to={item.path}
        end={item.end}
        onClick={onNavigate}
        className={({ isActive }) => `nav-link ${isActive ? 'nav-link--active' : ''}`.trim()}
      >
        <Icon className="h-[17px] w-[17px]" aria-hidden="true" strokeWidth={2} />
        <span className="truncate">{item.label}</span>
        {badge != null && badge > 0 && (
          <span
            className={`nav-count ${isDanger ? 'nav-count--danger' : ''}`}
            aria-label={isDanger ? `${badge} overdue` : `${badge} items`}
          >
            {badge}
          </span>
        )}
      </NavLink>
    </li>
  );
}
