import {
  CalendarDays,
  CalendarRange,
  Clock,
  LayoutDashboard,
  ListTodo,
  Settings as SettingsIcon,
  StickyNote,
  type LucideIcon,
} from 'lucide-react';

/** Route table — one source of truth for paths, labels and icons. */
export interface NavItem {
  path: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  { path: '/', label: 'Today', icon: LayoutDashboard, end: true },
  { path: '/deadlines', label: 'Deadlines', icon: ListTodo },
  { path: '/timetable', label: 'Timetable', icon: CalendarDays },
  { path: '/calendar', label: 'Calendar', icon: CalendarRange },
  { path: '/timer', label: 'Focus Timer', icon: Clock },
  { path: '/notes', label: 'Notes', icon: StickyNote },
];

export const SETTINGS_ITEM: NavItem = {
  path: '/settings',
  label: 'Settings',
  icon: SettingsIcon,
};

export function titleFor(pathname: string): string {
  const match = NAV_ITEMS.find((i) => (i.end ? pathname === i.path : pathname.startsWith(i.path)));
  if (match) return match.label;
  if (pathname.startsWith('/settings')) return 'Settings';
  return 'StudyDesk';
}
