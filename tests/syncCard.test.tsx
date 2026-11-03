import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Session } from '@supabase/supabase-js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SyncCard } from '../src/features/sync/SyncCard';
import { AccountProfileProvider } from '../src/features/sync/AccountProfile';
import { setActiveStorageProfile, storageForProfile } from '../src/lib/safeStorage';
import { KEYS } from '../src/store/AppStore';

const mocks = vi.hoisted(() => ({
  authCallback: null as ((event: string, session: Session | null) => void) | null,
  sessionOnSubscribe: null as Session | null,
  resolveGetSession: null as
    ((result: { data: { session: Session | null }; error: null }) => void) | null,
  startedUsers: [] as string[],
}));

vi.mock('../src/lib/supabase', () => ({
  isSupabaseConfigured: true,
  supabase: {
    auth: {
      getSession: vi.fn(
        () =>
          new Promise<{ data: { session: Session | null }; error: null }>((resolve) => {
            mocks.resolveGetSession = resolve;
          }),
      ),
      onAuthStateChange: vi.fn((callback: (event: string, session: Session | null) => void) => {
        mocks.authCallback = callback;
        if (mocks.sessionOnSubscribe) callback('INITIAL_SESSION', mocks.sessionOnSubscribe);
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      }),
    },
  },
}));

vi.mock('../src/features/sync/cloudSync', () => ({
  CloudSync: class {
    constructor(_onStatus: (status: string | null) => void) {}

    start = vi.fn(async (user: { id: string }) => {
      mocks.startedUsers.push(user.id);
      return {
        remoteCount: 0,
        localCount: 0,
        initializationStatus: 'complete' as const,
        recoveryMessage: null,
      };
    });

    stop = vi.fn();
    hasInitialised = () => true;
    getInitializationStatus = () => 'complete' as const;
    uploadInitial = vi.fn();
    downloadInitial = vi.fn();
  },
}));

const session = (id: string, email: string) => ({ user: { id, email } }) as Session;

describe('SyncCard authentication startup', () => {
  beforeEach(() => {
    mocks.authCallback = null;
    mocks.sessionOnSubscribe = null;
    mocks.resolveGetSession = null;
    mocks.startedUsers.splice(0);
    setActiveStorageProfile(null);
  });

  // Prevent a late initial getSession response from switching the UI and sync session back to a previous account.
  it('ignores a stale getSession response after a newer auth event', async () => {
    const staleSession = session('previous-account', 'previous@example.com');
    const activeSession = session('active-account', 'active@example.com');
    render(
      <AccountProfileProvider>
        <SyncCard />
      </AccountProfileProvider>,
    );

    await act(async () => {
      mocks.authCallback?.('SIGNED_IN', activeSession);
    });
    expect(await screen.findByText('active@example.com')).toBeInTheDocument();

    await act(async () => {
      mocks.resolveGetSession?.({ data: { session: staleSession }, error: null });
      await Promise.resolve();
    });

    expect(screen.getByText('active@example.com')).toBeInTheDocument();
    expect(screen.queryByText('previous@example.com')).not.toBeInTheDocument();
    expect(mocks.startedUsers).toEqual(['active-account']);
  });

  // Prevent a synchronous INITIAL_SESSION callback during subscription setup from being overwritten by a stale getSession result.
  it('keeps the auth session delivered immediately by the subscription', async () => {
    const activeSession = session('active-account', 'active@example.com');
    const staleSession = session('previous-account', 'previous@example.com');
    mocks.sessionOnSubscribe = activeSession;
    render(
      <AccountProfileProvider>
        <SyncCard />
      </AccountProfileProvider>,
    );

    expect(await screen.findByText('active@example.com')).toBeInTheDocument();
    await act(async () => {
      mocks.resolveGetSession?.({ data: { session: staleSession }, error: null });
      await Promise.resolve();
    });

    expect(screen.getByText('active@example.com')).toBeInTheDocument();
    expect(screen.queryByText('previous@example.com')).not.toBeInTheDocument();
    expect(mocks.startedUsers).toEqual(['active-account']);
  });

  // Prevent signing in from automatically importing guest data or merging it without the user's confirmation.
  it('imports guest data only after the account holder confirms the merge', async () => {
    const user = userEvent.setup();
    const guestStorage = storageForProfile(null);
    guestStorage.setItem(KEYS.tasks, JSON.stringify({ v: 2, data: [{ id: 'guest-task' }] }));
    render(
      <AccountProfileProvider>
        <SyncCard />
      </AccountProfileProvider>,
    );

    await act(async () => {
      mocks.authCallback?.('SIGNED_IN', session('account-a', 'account-a@example.com'));
    });
    await screen.findByText('account-a@example.com');
    await user.click(
      await screen.findByRole('button', { name: 'Import guest data into this account' }),
    );
    expect(await screen.findByRole('dialog')).toHaveTextContent('Guest data will remain unchanged');
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(storageForProfile('account-a').getItem(KEYS.tasks)).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Import guest data into this account' }));
    await user.click(screen.getByRole('button', { name: 'Merge guest data' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Merged 1 guest record');
    expect(storageForProfile('account-a').getItem(KEYS.tasks)).toContain('guest-task');
    expect(guestStorage.getItem(KEYS.tasks)).toContain('guest-task');
  });
});
