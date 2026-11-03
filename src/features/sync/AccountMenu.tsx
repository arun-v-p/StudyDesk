import { useEffect, useRef, useState, type FormEvent } from 'react';
import { LogOut, Mail, UserRound } from 'lucide-react';
import type { User } from '@supabase/supabase-js';
import { Modal } from '../../components/ui/Modal';
import { supabase, isSupabaseConfigured } from '../../lib/supabase';
import { useAccountProfile } from './AccountProfile';

type Feedback = { kind: 'loading' | 'success' | 'error'; message: string } | null;

function profileName(user: User): string | null {
  const metadata = user.user_metadata;
  for (const key of ['full_name', 'name', 'display_name']) {
    const value: unknown = metadata?.[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

function initials(name: string | null, email: string | undefined): string {
  if (name) {
    return name
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? '')
      .join('');
  }
  return email?.[0]?.toUpperCase() ?? '?';
}

export function AccountMenu() {
  const { session } = useAccountProfile();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const name = session ? profileName(session.user) : null;

  useEffect(() => {
    if (!menuOpen) return;
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (event.target instanceof Node && !menuRef.current?.contains(event.target)) {
        setMenuOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('pointerdown', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsideClick);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [menuOpen]);

  useEffect(() => {
    if (session) {
      setDialogOpen(false);
      setMenuOpen(false);
      setFeedback(null);
    }
  }, [session]);

  const redirectTo = `${window.location.origin}${import.meta.env.BASE_URL}`;

  const continueWithGoogle = async () => {
    if (!supabase) {
      setFeedback({
        kind: 'error',
        message: 'Sign-in is unavailable because Supabase is not configured.',
      });
      return;
    }
    setBusy(true);
    setFeedback({ kind: 'loading', message: 'Redirecting to Google…' });
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo },
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

  const continueWithEmail = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!supabase) {
      setFeedback({
        kind: 'error',
        message: 'Sign-in is unavailable because Supabase is not configured.',
      });
      return;
    }
    setBusy(true);
    setFeedback({ kind: 'loading', message: 'Sending a sign-in link…' });
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: { emailRedirectTo: redirectTo },
      });
      if (error) throw error;
      setFeedback({
        kind: 'success',
        message: 'Check your email for a sign-in link. Open it in this browser to continue.',
      });
    } catch (error) {
      setFeedback({
        kind: 'error',
        message: error instanceof Error ? error.message : 'Could not send a sign-in link.',
      });
    } finally {
      setBusy(false);
    }
  };

  const logout = async () => {
    if (!supabase) return;
    setBusy(true);
    setFeedback({ kind: 'loading', message: 'Signing out…' });
    try {
      const { error } = await supabase.auth.signOut({ scope: 'local' });
      if (error) throw error;
      setMenuOpen(false);
      setDialogOpen(true);
      setFeedback({
        kind: 'success',
        message: 'You are signed out. Your local and cloud study data have not been deleted.',
      });
    } catch (error) {
      setFeedback({
        kind: 'error',
        message: error instanceof Error ? error.message : 'Could not sign out.',
      });
    } finally {
      setBusy(false);
    }
  };

  const openSignIn = () => {
    setFeedback(null);
    setMenuOpen(false);
    setDialogOpen(true);
  };

  return (
    <>
      {session ? (
        <div ref={menuRef} className="relative">
          <button
            type="button"
            className="border-border bg-surface hover:bg-raised flex min-h-9 max-w-48 items-center gap-2 rounded-full border px-2.5 text-left text-xs font-medium"
            aria-expanded={menuOpen}
            aria-controls="account-menu"
            aria-label={`Account: ${session.user.email ?? name ?? 'signed in'}`}
            onClick={() => setMenuOpen((open) => !open)}
          >
            <span className="bg-accent text-accent-fg grid h-6 w-6 shrink-0 place-items-center rounded-full text-[10px] font-bold">
              {initials(name, session.user.email)}
            </span>
            <span className="min-w-0 truncate">{name ?? session.user.email ?? 'Account'}</span>
          </button>
          {menuOpen && (
            <section
              id="account-menu"
              aria-label="Account menu"
              className="border-border bg-surface shadow-pop absolute right-0 z-50 mt-2 w-72 rounded-xl border p-3"
            >
              <div className="flex items-start gap-2.5 px-1 pb-3">
                <UserRound className="text-muted mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <div className="min-w-0">
                  {name && <p className="text-fg truncate text-sm font-semibold">{name}</p>}
                  <p className="text-muted truncate text-xs">
                    {session.user.email ?? 'Signed-in account'}
                  </p>
                </div>
              </div>
              <p className="text-subtle border-border border-t px-1 py-2 text-xs">
                Signing out does not delete your local or cloud data.
              </p>
              <button
                type="button"
                className="btn btn--ghost w-full justify-start"
                disabled={busy}
                onClick={() => void logout()}
              >
                <LogOut className="h-4 w-4" aria-hidden="true" /> Log out
              </button>
              {feedback && (
                <p
                  role={feedback.kind === 'error' ? 'alert' : 'status'}
                  className="text-muted mt-2 text-xs"
                >
                  {feedback.message}
                </p>
              )}
            </section>
          )}
        </div>
      ) : (
        <button
          type="button"
          className="btn btn--primary !min-h-9 !px-3 !py-1.5 !text-xs"
          onClick={openSignIn}
        >
          <UserRound className="h-4 w-4" aria-hidden="true" /> Sign in
        </button>
      )}

      <Modal
        open={dialogOpen}
        onClose={() => {
          setDialogOpen(false);
          setFeedback(null);
        }}
        title="Sign in to StudyDesk"
        description="Sign in to sync supported planner data across devices, or continue with a separate guest profile on this browser."
        width="max-w-md"
      >
        <div className="space-y-4">
          <button
            type="button"
            className="btn btn--ghost w-full justify-center"
            disabled={busy || !isSupabaseConfigured}
            onClick={() => void continueWithGoogle()}
          >
            Continue with Google
          </button>
          <div className="border-border border-t pt-4">
            <form onSubmit={(event) => void continueWithEmail(event)} className="space-y-3">
              <label className="field-label" htmlFor="account-email">
                Continue with Email
              </label>
              <input
                id="account-email"
                className="field-input"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@example.com"
                disabled={busy || !isSupabaseConfigured}
              />
              <button
                type="submit"
                className="btn btn--primary w-full justify-center"
                disabled={busy || !isSupabaseConfigured}
              >
                <Mail className="h-4 w-4" aria-hidden="true" /> Send sign-in link
              </button>
            </form>
          </div>
          {!isSupabaseConfigured && (
            <p className="text-warning text-sm" role="status">
              Sign-in is unavailable until this deployment is configured for Supabase.
            </p>
          )}
          {feedback && (
            <p
              role={feedback.kind === 'error' ? 'alert' : 'status'}
              className={feedback.kind === 'error' ? 'text-danger text-sm' : 'text-muted text-sm'}
            >
              {feedback.message}
            </p>
          )}
          <button
            type="button"
            className="btn btn--ghost w-full justify-center"
            disabled={busy}
            onClick={() => {
              setDialogOpen(false);
              setFeedback(null);
            }}
          >
            Continue as Guest
          </button>
        </div>
      </Modal>
    </>
  );
}
