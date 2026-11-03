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
  signInWithOAuth: vi.fn(),
  signInWithOtp: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock('../src/lib/supabase', () => ({
  isSupabaseConfigured: true,
  supabase: {
    auth: {
      getSession: vi.fn(async () => ({ data: { session: mocks.initialSession }, error: null })),
      onAuthStateChange: vi.fn((callback: (event: string, session: Session | null) => void) => {
        mocks.authCallback = callback;
        callback('INITIAL_SESSION', mocks.initialSession);
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      }),
      signInWithOAuth: mocks.signInWithOAuth,
      signInWithOtp: mocks.signInWithOtp,
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
    mocks.signInWithOAuth.mockReset().mockResolvedValue({
      data: { provider: 'google', url: 'https://accounts.google.com/' },
      error: null,
    });
    mocks.signInWithOtp
      .mockReset()
      .mockResolvedValue({ data: { user: null, session: null }, error: null });
    mocks.signOut.mockReset().mockResolvedValue({ error: null });
    localStorage.clear();
    setActiveStorageProfile(null);
  });

  it('starts Google OAuth with a callback to the app base URL', async () => {
    const user = userEvent.setup();
    renderAccountMenu();
    await user.click(await screen.findByRole('button', { name: 'Sign in' }));

    await user.click(screen.getByRole('button', { name: 'Continue with Google' }));
    await waitFor(() =>
      expect(mocks.signInWithOAuth).toHaveBeenCalledWith({
        provider: 'google',
        options: { redirectTo: `${window.location.origin}${import.meta.env.BASE_URL}` },
      }),
    );
    expect(await screen.findByRole('status')).toHaveTextContent('Redirecting to Google');
  });

  it('sends passwordless email links to the app base URL', async () => {
    const user = userEvent.setup();
    let resolveEmailLink:
      ((result: { data: { user: null; session: null }; error: null }) => void) | undefined;
    mocks.signInWithOtp.mockReturnValueOnce(
      new Promise<{ data: { user: null; session: null }; error: null }>((resolve) => {
        resolveEmailLink = resolve;
      }),
    );
    renderAccountMenu();
    await user.click(await screen.findByRole('button', { name: 'Sign in' }));
    await user.type(
      screen.getByRole('textbox', { name: 'Continue with Email' }),
      'student@example.com',
    );
    await user.click(screen.getByRole('button', { name: 'Send sign-in link' }));
    await waitFor(() =>
      expect(mocks.signInWithOtp).toHaveBeenCalledWith({
        email: 'student@example.com',
        options: { emailRedirectTo: `${window.location.origin}${import.meta.env.BASE_URL}` },
      }),
    );
    expect(await screen.findByRole('status')).toHaveTextContent('Sending a sign-in link');
    expect(screen.getByRole('button', { name: 'Send sign-in link' })).toBeDisabled();
    await act(async () => {
      resolveEmailLink?.({ data: { user: null, session: null }, error: null });
    });
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Check your email for a sign-in link',
    );
  });

  it('shows authentication failures and allows continuing as a guest without changing guest data', async () => {
    const user = userEvent.setup();
    const guestStorage = storageForProfile(null);
    guestStorage.setItem('studydesk.tasks', 'guest-record');
    mocks.signInWithOtp.mockResolvedValueOnce({
      data: { user: null, session: null },
      error: new Error('Email provider is unavailable'),
    });

    renderAccountMenu();
    await user.click(await screen.findByRole('button', { name: 'Sign in' }));
    await user.type(
      screen.getByRole('textbox', { name: 'Continue with Email' }),
      'guest@example.com',
    );
    await user.click(screen.getByRole('button', { name: 'Send sign-in link' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Email provider is unavailable');

    await user.click(screen.getByRole('button', { name: 'Continue as Guest' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument();
    expect(guestStorage.getItem('studydesk.tasks')).toBe('guest-record');
  });

  it('updates the account menu when Supabase delivers an auth callback session', async () => {
    renderAccountMenu();
    await screen.findByRole('button', { name: 'Sign in' });

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

  it('shows available profile information and logs out locally without deleting data', async () => {
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
    expect(await screen.findByRole('button', { name: 'Sign in' })).toBeInTheDocument();
    expect(accountStorage.getItem('studydesk.tasks')).toBe('account-record');
  });
});
