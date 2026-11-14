import { lazy, Suspense } from 'react';
import {
  BrowserRouter,
  MemoryRouter,
  Navigate,
  Outlet,
  Route,
  Routes,
  useLocation,
} from 'react-router-dom';
import { AppShell } from './components/layout/AppShell';
import { AppStoreProvider } from './store/AppStore';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ShellBoot } from './components/ShellBoot';
import { useTheme } from './hooks/useTheme';
import { useStore } from './store/AppStore';
import { TodayPage } from './pages/TodayPage';
import { AccountProfileProvider, useAccountProfile } from './features/sync/AccountProfile';
import { AuthLandingPage } from './pages/AuthLandingPage';

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
const MaterialsPage = lazy(() =>
  import('./pages/MaterialsPage').then((m) => ({ default: m.MaterialsPage })),
);
const ExamTimetablePage = lazy(() =>
  import('./pages/ExamTimetablePage').then((m) => ({ default: m.ExamTimetablePage })),
);
const RevisionPage = lazy(() =>
  import('./pages/RevisionPage').then((m) => ({ default: m.RevisionPage })),
);
const PrivacyPolicyPage = lazy(() =>
  import('./pages/PolicyPages').then((m) => ({ default: m.PrivacyPolicyPage })),
);
const TermsOfServicePage = lazy(() =>
  import('./pages/PolicyPages').then((m) => ({ default: m.TermsOfServicePage })),
);
const NotFoundPage = lazy(() =>
  import('./pages/NotFoundPage').then((m) => ({ default: m.NotFoundPage })),
);

function restoreGithubPagesPath(): void {
  const requestedPath = new URLSearchParams(window.location.search).get('studydesk-path');
  if (!requestedPath?.startsWith('/') || requestedPath.startsWith('//')) return;

  const baseUrl = new URL(import.meta.env.BASE_URL, window.location.origin);
  const restoredUrl = new URL(requestedPath.slice(1), baseUrl);
  if (
    restoredUrl.origin !== window.location.origin ||
    !restoredUrl.pathname.startsWith(baseUrl.pathname)
  )
    return;

  window.history.replaceState(
    null,
    '',
    `${restoredUrl.pathname}${restoredUrl.search}${restoredUrl.hash}`,
  );
}

restoreGithubPagesPath();

/**
 * The production build emits static entry documents for the legal routes so
 * GitHub Pages can serve clean policy URLs on direct navigation and refresh.
 * The application workspace is session-protected; legal documents remain public.
 *
 * When there is no parseable document URL — an `about:srcdoc` sandboxed iframe
 * or a detached document — fall back to MemoryRouter so the single-file
 * preview build renders anywhere.
 */
function hasUsableLocation(): boolean {
  try {
    const href = window.location.href;
    new URL(href);
    return href !== 'about:srcdoc' && href !== 'about:blank';
  } catch {
    return false;
  }
}

const Router = hasUsableLocation() ? BrowserRouter : MemoryRouter;

export default function App({ basename = import.meta.env.BASE_URL }: { basename?: string } = {}) {
  return (
    <AccountProfileProvider>
      <ProfiledApp basename={basename} />
    </AccountProfileProvider>
  );
}

function ProfiledApp({ basename }: { basename: string }) {
  const { profileId } = useAccountProfile();
  return (
    <AppStoreProvider key={profileId ?? 'guest'}>
      <ThemedApp basename={basename} />
    </AppStoreProvider>
  );
}

function ThemedApp({ basename }: { basename: string }) {
  const { settings, updateSettings } = useStore();
  const { resolved } = useTheme(settings.theme, (t) => updateSettings({ theme: t }));

  return (
    <Router basename={hasUsableLocation() ? basename : undefined}>
      <Suspense fallback={<ShellBoot />}>
        <Routes>
          <Route path="privacy" element={<PrivacyPolicyPage />} />
          <Route path="terms" element={<TermsOfServicePage />} />
          <Route path="login" element={<AuthLandingPage />} />
          <Route path="/" element={<AuthLandingPage />} />
          <Route element={<RequireAuthentication />}>
            <Route element={<AppShell />}>
              <Route
                path="today"
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
                path="materials"
                element={
                  <ErrorBoundary label="Materials">
                    <MaterialsPage />
                  </ErrorBoundary>
                }
              />
              <Route
                path="exams"
                element={
                  <ErrorBoundary label="Exams">
                    <ExamTimetablePage />
                  </ErrorBoundary>
                }
              />
              <Route
                path="revision"
                element={
                  <ErrorBoundary label="Revision plans">
                    <RevisionPage />
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
          </Route>
        </Routes>
      </Suspense>
    </Router>
  );
}

function RequireAuthentication() {
  const { session } = useAccountProfile();
  const location = useLocation();

  if (!session) {
    return (
      <Navigate
        to="/"
        replace
        state={{ from: `${location.pathname}${location.search}${location.hash}` }}
      />
    );
  }
  return <Outlet />;
}
