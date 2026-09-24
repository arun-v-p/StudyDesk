import { Menu, Moon, Search, Sun, Monitor } from 'lucide-react';
import { format } from 'date-fns';
import { IconButton } from '../ui/IconButton';
import { useNow } from '../../hooks/useNow';
import { useStore } from '../../store/AppStore';
import { titleFor } from './nav';
import { nextThemeLabel, nextThemePreference } from '../../hooks/useTheme';
import type { Settings } from '../../types';

const MODE_WORD: Record<Settings['theme'], string> = {
  dark: 'Dark theme',
  light: 'Light theme',
  system: 'System theme',
};

function ThemeIcon({ theme }: { theme: Settings['theme'] }) {
  if (theme === 'dark') return <Moon className="h-[17px] w-[17px]" aria-hidden="true" />;
  if (theme === 'light') return <Sun className="h-[17px] w-[17px]" aria-hidden="true" />;
  return <Monitor className="h-[17px] w-[17px]" aria-hidden="true" />;
}

export function Topbar({
  pathname,
  onOpenNav,
  onOpenSearch,
}: {
  pathname: string;
  onOpenNav: () => void;
  onOpenSearch: () => void;
}) {
  const now = useNow(60_000);
  const { settings, updateSettings } = useStore();
  // Derived rather than a static map, so the toggle never offers a step that
  // would leave the appearance unchanged.
  const themeTarget = nextThemePreference(settings.theme);
  const themeLabel = `${MODE_WORD[settings.theme]} active. Switch to ${nextThemeLabel(settings.theme)} theme.`;

  return (
    <header className="border-border bg-bg/80 sticky top-0 z-30 flex items-center gap-3.5 border-b px-4 py-3 backdrop-blur-md sm:px-7">
      <IconButton
        aria-label="Open navigation"
        aria-expanded={false}
        aria-controls="app-sidebar"
        onClick={onOpenNav}
        className="lg:hidden"
      >
        <Menu className="h-5 w-5" aria-hidden="true" />
      </IconButton>

      <div className="min-w-0">
        <h1 className="text-fg truncate text-[17px] font-semibold tracking-tight">
          {titleFor(pathname)}
        </h1>
        <p className="text-subtle mt-px truncate text-xs">{format(now, 'EEEE, d MMMM yyyy')}</p>
      </div>

      <div className="ml-auto flex items-center gap-2">
        <button
          type="button"
          onClick={onOpenSearch}
          className="search-trigger"
          aria-label="Search StudyDesk"
        >
          <Search className="h-3.5 w-3.5" aria-hidden="true" />
          <span className="hidden sm:inline">Search…</span>
          <kbd className="hidden sm:inline">⌘K</kbd>
        </button>

        <IconButton
          aria-label={themeLabel}
          title={themeLabel}
          onClick={() => updateSettings({ theme: themeTarget })}
        >
          <ThemeIcon theme={settings.theme} />
        </IconButton>

        <Initials name={settings.displayName} />
      </div>
    </header>
  );
}

/** Avatar with initials. Falls back to a neutral mark when no name is set —
 *  the original hardcoded "Arun" into the greeting for every visitor. */
function Initials({ name }: { name: string }) {
  const trimmed = name.trim();
  const text = trimmed
    ? trimmed
        .split(/\s+/)
        .slice(0, 2)
        .map((w) => w[0]?.toUpperCase() ?? '')
        .join('')
    : '·';
  return (
    <span
      className="from-accent to-info grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gradient-to-br text-xs font-bold text-white"
      role="img"
      aria-label={trimmed ? `Signed in as ${trimmed}` : 'No display name set'}
      title={trimmed || 'Set your name in Settings'}
    >
      {text}
    </span>
  );
}
