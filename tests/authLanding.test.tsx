import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../src/App';

const mocks = vi.hoisted(() => ({
  authCallback: null as
    ((event: string, session: { user: { id: string; email: string } } | null) => void) | null,
  session: null as { user: { id: string; email: string } } | null,
  signInWithOAuth: vi.fn(),
  signInWithOtp: vi.fn(),
}));

vi.mock('../src/lib/supabase', () => ({
  isSupabaseConfigured: true,
  supabase: {
    auth: {
      getSession: vi.fn(async () => ({ data: { session: mocks.session }, error: null })),
      onAuthStateChange: vi.fn((callback: typeof mocks.authCallback) => {
        mocks.authCallback = callback;
        callback?.('INITIAL_SESSION', mocks.session);
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      }),
      signInWithOAuth: mocks.signInWithOAuth,
      signInWithOtp: mocks.signInWithOtp,
    },
  },
}));

const authenticatedSession = {
  user: { id: 'auth-test-user', email: 'student@example.test' },
};

beforeEach(() => {
  mocks.authCallback = null;
  mocks.session = null;
  mocks.signInWithOtp.mockReset().mockResolvedValue({
    data: { user: null, session: null },
    error: null,
  });
  mocks.signInWithOAuth.mockReset().mockResolvedValue({
    data: { provider: 'google', url: 'https://accounts.google.com/' },
    error: null,
  });
  window.history.replaceState({}, '', '/');
});

describe('authentication landing and route protection', () => {
  it('shows the landing page first and retains a protected destination through email sign-in', async () => {
    window.history.replaceState({}, '', '/notes?filter=course');
    const user = userEvent.setup();
    render(<App />);

    expect(
      await screen.findByRole('heading', { level: 1, name: /welcome to studydesk/i }),
    ).toBeVisible();
    expect(screen.queryByRole('heading', { level: 1, name: /^today$/i })).not.toBeInTheDocument();

    await user.type(screen.getByRole('textbox', { name: /email address/i }), 'reader@example.test');
    await user.click(screen.getByRole('button', { name: /send sign-in link/i }));
    await waitFor(() => expect(mocks.signInWithOtp).toHaveBeenCalledOnce());
    const emailRequest = mocks.signInWithOtp.mock.calls[0];
    if (!emailRequest) throw new Error('Expected Supabase email sign-in to be called.');
    const redirect = new URL(emailRequest[0].options.emailRedirectTo);
    expect(redirect.searchParams.get('next')).toBe('/notes?filter=course');
    expect(await screen.findByRole('status')).toHaveTextContent(/check your inbox/i);

    act(() => {
      mocks.authCallback?.('SIGNED_IN', authenticatedSession);
    });
    expect(await screen.findByRole('heading', { level: 1, name: /^notes$/i })).toBeVisible();
    expect(window.location.pathname).toBe('/notes');
    expect(window.location.search).toBe('?filter=course');
  });

  it('does not expose private routes after sign-in fails', async () => {
    mocks.signInWithOtp.mockResolvedValueOnce({
      data: { user: null, session: null },
      error: new Error('Email provider is unavailable'),
    });
    const user = userEvent.setup();
    render(<App />);

    await user.type(screen.getByRole('textbox', { name: /email address/i }), 'reader@example.test');
    await user.click(screen.getByRole('button', { name: /send sign-in link/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Email provider is unavailable');
    expect(screen.queryByRole('heading', { level: 1, name: /^today$/i })).not.toBeInTheDocument();
  });

  it('uses the existing Google OAuth provider and returns to the intended route', async () => {
    window.history.replaceState({}, '', '/calendar');
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole('button', { name: /continue with google/i }));
    await waitFor(() => expect(mocks.signInWithOAuth).toHaveBeenCalledOnce());
    const googleRequest = mocks.signInWithOAuth.mock.calls[0];
    if (!googleRequest) throw new Error('Expected Supabase Google sign-in to be called.');
    const redirect = new URL(googleRequest[0].options.redirectTo);
    expect(googleRequest[0].provider).toBe('google');
    expect(redirect.searchParams.get('next')).toBe('/calendar');
  });

  it('returns to the landing page when the active Supabase session signs out', async () => {
    mocks.session = authenticatedSession;
    render(<App />);
    expect(await screen.findByRole('heading', { level: 1, name: /^today$/i })).toBeVisible();

    act(() => mocks.authCallback?.('SIGNED_OUT', null));

    expect(
      await screen.findByRole('heading', { level: 1, name: /welcome to studydesk/i }),
    ).toBeVisible();
    expect(screen.queryByRole('heading', { level: 1, name: /^today$/i })).not.toBeInTheDocument();
  });
});
