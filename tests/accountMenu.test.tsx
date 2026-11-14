import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Session } from '@supabase/supabase-js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AccountMenu } from '../src/features/sync/AccountMenu';
import { AccountProfileProvider } from '../src/features/sync/AccountProfile';
import { setActiveStorageProfile, storageForProfile } from '../src/lib/safeStorage';

const mocks = vi.hoisted(() => ({
  authCallback: null as ((event: string, session: Session | null) => void) | null,
  initialSession: null as Session | null,
  signOut: vi.fn(),
}));

vi.mock('../src/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(async () => ({ data: { session: mocks.initialSession }, error: null })),
      onAuthStateChange: vi.fn((callback: (event: string, session: Session | null) => void) => {
        mocks.authCallback = callback;
        callback('INITIAL_SESSION', mocks.initialSession);
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      }),
      signOut: mocks.signOut,
    },
  },
}));

const session = (id: string, email: string, user_metadata: Record<string, unknown> = {}) =>
  ({ user: { id, email, user_metadata } }) as Session;

function renderAccountMenu() {
  return render(
    <AccountProfileProvider>
      <AccountMenu />
    </AccountProfileProvider>,
  );
}

describe('AccountMenu', () => {
  beforeEach(() => {
    mocks.authCallback = null;
    mocks.initialSession = null;
    mocks.signOut.mockReset().mockResolvedValue({ error: null });
    localStorage.clear();
    setActiveStorageProfile(null);
  });

  it('does not expose account actions without an authenticated session', async () => {
    renderAccountMenu();

    await waitFor(() => expect(mocks.authCallback).toBeTypeOf('function'));
    expect(screen.queryByRole('button', { name: /sign in/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /log out/i })).not.toBeInTheDocument();
  });

  it('updates the account menu when Supabase delivers an auth callback session', async () => {
    renderAccountMenu();

    await act(async () => {
      mocks.authCallback?.(
        'SIGNED_IN',
        session('callback-account', 'callback@example.com', { name: 'Callback User' }),
      );
    });

    expect(
      await screen.findByRole('button', { name: 'Account: callback@example.com' }),
    ).toHaveTextContent('Callback User');
  });

  it('logs out locally without deleting account data', async () => {
    const user = userEvent.setup();
    const authenticatedSession = session('account-a', 'account-a@example.com', {
      full_name: 'Study User',
    });
    mocks.initialSession = authenticatedSession;
    const accountStorage = storageForProfile('account-a');
    accountStorage.setItem('studydesk.tasks', 'account-record');
    mocks.signOut.mockImplementation(async () => {
      mocks.authCallback?.('SIGNED_OUT', null);
      return { data: { user: null }, error: null };
    });

    renderAccountMenu();
    const accountButton = await screen.findByRole('button', {
      name: 'Account: account-a@example.com',
    });
    expect(accountButton).toHaveTextContent('Study User');
    await user.click(accountButton);
    expect(screen.getByRole('region', { name: 'Account menu' })).toHaveTextContent(
      'account-a@example.com',
    );
    await user.click(screen.getByRole('button', { name: 'Log out' }));

    await waitFor(() => expect(mocks.signOut).toHaveBeenCalledWith({ scope: 'local' }));
    await waitFor(() => expect(screen.queryByRole('button', { name: /account:/i })).toBeNull());
    expect(accountStorage.getItem('studydesk.tasks')).toBe('account-record');
  });
});
