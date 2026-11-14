import { useState, type FormEvent } from 'react';
import { ArrowRight, BookOpen, CheckCircle2, LoaderCircle, Mail } from 'lucide-react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAccountProfile } from '../features/sync/AccountProfile';
import { isSupabaseConfigured, supabase } from '../lib/supabase';

type Feedback = { kind: 'loading' | 'success' | 'error'; message: string } | null;

function containsControlCharacters(value: string): boolean {
  return Array.from(value).some((character) => {
    const code = character.charCodeAt(0);
    return code < 0x20 || code === 0x7f;
  });
}

function safeDestination(value: unknown): string | null {
  if (
    typeof value !== 'string' ||
    !value.startsWith('/') ||
    value.startsWith('//') ||
    value.includes('\\') ||
    containsControlCharacters(value)
  ) {
    return null;
  }
  return value;
}

function destinationFromState(state: unknown): string | null {
  if (!state || typeof state !== 'object' || !('from' in state)) return null;
  return safeDestination(state.from);
}

export function AuthLandingPage() {
  const { session } = useAccountProfile();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);

  const queryDestination = safeDestination(new URLSearchParams(location.search).get('next'));
  const destination = destinationFromState(location.state) ?? queryDestination ?? '/today';

  if (session) return <Navigate to={destination} replace />;

  const callbackUrl = () => {
    const url = new URL(import.meta.env.BASE_URL, window.location.origin);
    url.searchParams.set('next', destination);
    return url.toString();
  };

  const signInWithEmail = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!supabase) {
      setFeedback({
        kind: 'error',
        message: 'Sign-in is unavailable because this StudyDesk deployment is not configured.',
      });
      return;
    }

    setBusy(true);
    setFeedback({ kind: 'loading', message: 'Sending your secure sign-in link…' });
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: { emailRedirectTo: callbackUrl() },
      });
      if (error) throw error;
      setFeedback({
        kind: 'success',
        message: 'Check your inbox for a sign-in link, then open it in this browser to continue.',
      });
    } catch (error) {
      setFeedback({
        kind: 'error',
        message: error instanceof Error ? error.message : 'Could not send your sign-in link.',
      });
    } finally {
      setBusy(false);
    }
  };

  const signInWithGoogle = async () => {
    if (!supabase) {
      setFeedback({
        kind: 'error',
        message: 'Sign-in is unavailable because this StudyDesk deployment is not configured.',
      });
      return;
    }
    setBusy(true);
    setFeedback({ kind: 'loading', message: 'Connecting to Google…' });
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: callbackUrl() },
      });
      if (error) throw error;
    } catch (error) {
      setFeedback({
        kind: 'error',
        message: error instanceof Error ? error.message : 'Could not start Google sign-in.',
      });
      setBusy(false);
    }
  };

  return (
    <main className="auth-page">
      <div className="auth-orb auth-orb--one" aria-hidden="true" />
      <div className="auth-orb auth-orb--two" aria-hidden="true" />
      <div className="auth-grid" aria-hidden="true" />

      <div className="auth-layout">
        <section className="auth-welcome" aria-labelledby="auth-welcome-title">
          <a className="auth-brand" href={import.meta.env.BASE_URL} aria-label="StudyDesk home">
            <span className="auth-brand__icon" aria-hidden="true">
              <BookOpen />
            </span>
            <span>StudyDesk</span>
          </a>

          <div className="auth-welcome__copy">
            <span className="auth-eyebrow">
              <span className="auth-eyebrow__dot" aria-hidden="true" />
              YOUR SPACE TO DO GREAT THINGS
            </span>
            <h1 id="auth-welcome-title">
              Welcome to
              <br />
              StudyDesk<span>.</span>
            </h1>
            <p className="auth-welcome__lead">
              Your personal space to plan, learn, focus and achieve more.
            </p>
            <p className="auth-welcome__detail">
              Bring your deadlines, timetable, notes and focus sessions together—so you can spend
              less time organizing and more time learning.
            </p>
          </div>

          <div className="auth-feature" aria-hidden="true">
            <span className="auth-feature__icon">
              <CheckCircle2 />
            </span>
            <span>One calm place for everything on your study list.</span>
          </div>
          <p className="auth-welcome__footer">Make room for your next big idea.</p>
        </section>

        <section className="auth-panel" aria-labelledby="auth-form-title">
          <div className="auth-card">
            <div className="auth-card__brand">
              <span className="auth-brand__icon" aria-hidden="true">
                <BookOpen />
              </span>
            </div>
            <p className="auth-card__eyebrow">YOUR STUDY SPACE AWAITS</p>
            <h2 id="auth-form-title">Welcome back</h2>
            <p className="auth-card__subtitle">Sign in to continue your learning journey.</p>

            <button
              type="button"
              className="auth-google"
              disabled={busy || !isSupabaseConfigured}
              onClick={() => void signInWithGoogle()}
            >
              <span className="auth-google__mark" aria-hidden="true">
                G
              </span>
              Continue with Google
            </button>

            <div className="auth-divider" aria-hidden="true">
              <span />
              <span>or continue with email</span>
              <span />
            </div>

            <form className="auth-form" onSubmit={(event) => void signInWithEmail(event)}>
              <label className="auth-label" htmlFor="auth-email">
                Email address
              </label>
              <div className="auth-input-wrap">
                <Mail className="auth-input-icon" aria-hidden="true" />
                <input
                  id="auth-email"
                  className="auth-input"
                  type="email"
                  name="email"
                  autoComplete="email"
                  inputMode="email"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@example.com"
                  disabled={busy || !isSupabaseConfigured}
                  aria-describedby="auth-email-help"
                />
              </div>
              <p id="auth-email-help" className="auth-help">
                We’ll email you a secure, password-free sign-in link.
              </p>

              <button
                type="submit"
                className="auth-submit"
                disabled={busy || !isSupabaseConfigured}
              >
                {busy ? (
                  <>
                    <LoaderCircle className="auth-spinner" aria-hidden="true" />
                    Sending link…
                  </>
                ) : (
                  <>
                    Send sign-in link <ArrowRight aria-hidden="true" />
                  </>
                )}
              </button>
            </form>

            {!isSupabaseConfigured && (
              <p className="auth-feedback auth-feedback--error" role="status">
                Sign-in is unavailable until this deployment is configured for Supabase.
              </p>
            )}
            {feedback && (
              <p
                className={`auth-feedback auth-feedback--${feedback.kind}`}
                role={feedback.kind === 'error' ? 'alert' : 'status'}
                aria-live="polite"
              >
                {feedback.message}
              </p>
            )}

            <p className="auth-signup">
              New to StudyDesk? <span>Use your email above to get started.</span>
            </p>
          </div>
          <p className="auth-privacy">
            By continuing, you agree to our <a href={`${import.meta.env.BASE_URL}terms`}>Terms</a>{' '}
            and <a href={`${import.meta.env.BASE_URL}privacy`}>Privacy Policy</a>.
          </p>
        </section>
      </div>
    </main>
  );
}
