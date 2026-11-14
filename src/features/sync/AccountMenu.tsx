import { useEffect, useRef, useState } from 'react';
import { LogOut, UserRound } from 'lucide-react';
import type { User } from '@supabase/supabase-js';
import { supabase } from '../../lib/supabase';
import { useAccountProfile } from './AccountProfile';

type Feedback = { kind: 'error'; message: string } | null;

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
  const [menuOpen, setMenuOpen] = useState(false);
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

  const logout = async () => {
    if (!supabase) {
      setFeedback({
        kind: 'error',
        message: 'Sign-out is unavailable because Supabase is not configured.',
      });
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.auth.signOut({ scope: 'local' });
      if (error) throw error;
      setMenuOpen(false);
      setFeedback(null);
    } catch (error) {
      setFeedback({
        kind: 'error',
        message: error instanceof Error ? error.message : 'Could not sign out.',
      });
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (!session) setMenuOpen(false);
  }, [session]);

  if (!session) return null;

  return (
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
            <p role="alert" className="text-muted mt-2 text-xs">
              {feedback.message}
            </p>
          )}
        </section>
      )}
    </div>
  );
}
