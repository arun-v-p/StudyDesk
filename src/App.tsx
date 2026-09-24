import { lazy, Suspense } from 'react';
import { HashRouter, MemoryRouter, Route, Routes } from 'react-router-dom';
import { AppShell } from './components/layout/AppShell';
import { AppStoreProvider } from './store/AppStore';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ShellBoot } from './components/ShellBoot';
import { useTheme } from './hooks/useTheme';
import { useStore } from './store/AppStore';
import { TodayPage } from './pages/TodayPage';

/**
 * Route-level code splitting. The original shipped one 214 kB chunk; every page
 * except Today is now loaded on demand.
 */
const DeadlinesPage = lazy(() =>
  import('./pages/DeadlinesPage').then((m) => ({ default: m.DeadlinesPage })),
);
const TimetablePage = lazy(() =>
  import('./pages/TimetablePage').then((m) => ({ default: m.TimetablePage })),
);
const CalendarPage = lazy(() =>
  import('./pages/CalendarPage').then((m) => ({ default: m.CalendarPage })),
);
const TimerPage = lazy(() => import('./pages/TimerPage').then((m) => ({ default: m.TimerPage })));
const NotesPage = lazy(() => import('./pages/NotesPage').then((m) => ({ default: m.NotesPage })));
const SettingsPage = lazy(() =>
  import('./pages/SettingsPage').then((m) => ({ default: m.SettingsPage })),
);
const NotFoundPage = lazy(() =>
  import('./pages/NotFoundPage').then((m) => ({ default: m.NotFoundPage })),
);

/**
 * HashRouter, not BrowserRouter: GitHub Pages cannot rewrite unknown paths to
 * index.html, so a BrowserRouter deep link 404s on refresh. Hash routing works
 * on static hosting with no server configuration.
 *
 * Hash routing still needs a parseable document URL. When there is not one —
 * an `about:srcdoc` sandboxed iframe, or a detached document — fall back to
 * MemoryRouter so the single-file preview build renders anywhere. Deep links
 * are meaningless in that context anyway.
 */
function hasUsableLocation(): boolean {
  try {
    const href = window.location.href;
    // eslint-disable-next-line no-new
    new URL(href);
    return href !== 'about:srcdoc' && href !== 'about:blank';
  } catch {
    return false;
  }
}

const Router = hasUsableLocation() ? HashRouter : MemoryRouter;

export default function App() {
  return (
    <AppStoreProvider>
      <ThemedApp />
    </AppStoreProvider>
  );
}

function ThemedApp() {
  const { settings, updateSettings } = useStore();
  const { resolved } = useTheme(settings.theme, (t) => updateSettings({ theme: t }));

  return (
    <Router>
      <Suspense fallback={<ShellBoot />}>
        <Routes>
          <Route element={<AppShell />}>
            <Route
              index
              element={
                <ErrorBoundary label="Today">
                  <TodayPage theme={resolved} />
                </ErrorBoundary>
              }
            />
            <Route
              path="deadlines"
              element={
                <ErrorBoundary label="Deadlines">
                  <DeadlinesPage />
                </ErrorBoundary>
              }
            />
            <Route
              path="timetable"
              element={
                <ErrorBoundary label="Timetable">
                  <TimetablePage theme={resolved} />
                </ErrorBoundary>
              }
            />
            <Route
              path="calendar"
              element={
                <ErrorBoundary label="Calendar">
                  <CalendarPage />
                </ErrorBoundary>
              }
            />
            <Route
              path="timer"
              element={
                <ErrorBoundary label="Focus timer">
                  <TimerPage />
                </ErrorBoundary>
              }
            />
            <Route
              path="notes"
              element={
                <ErrorBoundary label="Notes">
                  <NotesPage />
                </ErrorBoundary>
              }
            />
            <Route
              path="settings"
              element={
                <ErrorBoundary label="Settings">
                  <SettingsPage />
                </ErrorBoundary>
              }
            />
            <Route
              path="*"
              element={
                <ErrorBoundary label="Page">
                  <NotFoundPage />
                </ErrorBoundary>
              }
            />
          </Route>
        </Routes>
      </Suspense>
    </Router>
  );
}
