import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { setActiveStorageProfile, type StorageProfileId } from '../../lib/safeStorage';
import { supabase } from '../../lib/supabase';

interface AccountProfileValue {
  session: Session | null;
  profileId: StorageProfileId;
}

const AccountProfileContext = createContext<AccountProfileValue | null>(null);

type ProfileState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; session: Session | null };

interface ProfileTransition {
  revision: number;
  session: Session | null;
}

export function AccountProfileProvider({ children }: { children: ReactNode }) {
  const [profileState, setProfileState] = useState<ProfileState>({ status: 'loading' });
  const [transition, setTransition] = useState<ProfileTransition | null>(null);
  const revision = useRef(0);
  const selectedProfile = useRef<StorageProfileId | undefined>(undefined);

  useEffect(() => {
    let active = true;
    let authEventReceived = false;
    if (!supabase) {
      setTransition({ revision: ++revision.current, session: null });
      return () => {
        active = false;
      };
    }

    const queueProfileChange = (session: Session | null) => {
      const nextProfile = session?.user.id ?? null;
      if (selectedProfile.current !== undefined && selectedProfile.current === nextProfile) {
        setProfileState({ status: 'ready', session });
        return;
      }
      const nextRevision = ++revision.current;
      setProfileState({ status: 'loading' });
      setTransition({ revision: nextRevision, session });
    };
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      authEventReceived = true;
      queueProfileChange(session);
    });
    void supabase.auth
      .getSession()
      .then(({ data: sessionData, error }) => {
        if (!active || authEventReceived) return;
        if (error) throw error;
        queueProfileChange(sessionData.session);
      })
      .catch((error: unknown) => {
        if (!active || authEventReceived) return;
        setProfileState({
          status: 'error',
          message:
            error instanceof Error
              ? error.message
              : 'Could not verify the current account session.',
        });
      });

    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!transition || transition.revision !== revision.current) return;
    const profileId = transition.session?.user.id ?? null;
    try {
      setActiveStorageProfile(profileId);
      selectedProfile.current = profileId;
      setProfileState({ status: 'ready', session: transition.session });
    } catch (error) {
      setProfileState({
        status: 'error',
        message:
          error instanceof Error ? error.message : 'Could not safely select the local profile.',
      });
    }
  }, [transition]);

  if (profileState.status === 'loading') {
    return (
      <main className="text-muted grid min-h-screen place-items-center p-6 text-sm" role="status">
        Preparing your private StudyDesk profile…
      </main>
    );
  }
  if (profileState.status === 'error') {
    return (
      <main className="text-muted mx-auto grid min-h-screen max-w-lg place-content-center gap-3 p-6 text-sm">
        <h1 className="text-fg text-lg font-semibold">
          Your data is locked until sign-in is checked
        </h1>
        <p>{profileState.message}</p>
        <button type="button" className="btn btn--primary" onClick={() => window.location.reload()}>
          Retry
        </button>
      </main>
    );
  }

  return (
    <AccountProfileContext.Provider
      value={{
        session: profileState.session,
        profileId: profileState.session?.user.id ?? null,
      }}
    >
      {children}
    </AccountProfileContext.Provider>
  );
}

export function useAccountProfile(): AccountProfileValue {
  const profile = useContext(AccountProfileContext);
  if (!profile) throw new Error('useAccountProfile must be used within AccountProfileProvider.');
  return profile;
}
