import { act, render, renderHook, screen } from '@testing-library/react';
import type { Session } from '@supabase/supabase-js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AccountProfileProvider, useAccountProfile } from '../src/features/sync/AccountProfile';
import {
  getActiveStorageProfile,
  setActiveStorageProfile,
  storageForProfile,
} from '../src/lib/safeStorage';
import { MATERIALS_KEY, materialBlobs, useMaterials } from '../src/store/materials';
import { usePersistentState } from '../src/store/usePersistentState';

const mocks = vi.hoisted(() => ({
  authCallback: null as ((event: string, session: Session | null) => void) | null,
  resolveGetSession: null as
    ((result: { data: { session: Session | null }; error: null }) => void) | null,
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
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      }),
    },
  },
}));

afterEach(() => {
  setActiveStorageProfile(null);
  mocks.authCallback = null;
  mocks.resolveGetSession = null;
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const session = (id: string) => ({ user: { id, email: `${id}@example.test` } }) as Session;

function ProfileProbe() {
  const { profileId } = useAccountProfile();
  const storage = storageForProfile(profileId);
  return (
    <output data-testid="profile-data">
      {profileId ?? 'guest'}:{storage.getItem('studydesk.tasks') ?? 'empty'}
    </output>
  );
}

describe('account-local profiles', () => {
  // Prevent a shared browser from rendering account data before auth resolves or leaking it across sign-out and account switches.
  it('keeps guest and account records isolated through sign-out and account switching', async () => {
    storageForProfile(null).setItem('studydesk.tasks', 'guest-data');
    storageForProfile('account-a').setItem('studydesk.tasks', 'account-a-data');
    storageForProfile('account-b').setItem('studydesk.tasks', 'account-b-data');

    render(
      <AccountProfileProvider>
        <ProfileProbe />
      </AccountProfileProvider>,
    );
    expect(screen.getByRole('status')).toHaveTextContent(
      'Preparing your private StudyDesk profile',
    );
    expect(screen.queryByTestId('profile-data')).not.toBeInTheDocument();

    await act(async () => {
      mocks.resolveGetSession?.({ data: { session: session('account-a') }, error: null });
      await Promise.resolve();
    });
    expect(await screen.findByText('account-a:account-a-data')).toBeInTheDocument();

    act(() => mocks.authCallback?.('SIGNED_OUT', null));
    expect(await screen.findByText('guest:guest-data')).toBeInTheDocument();

    act(() => mocks.authCallback?.('SIGNED_IN', session('account-b')));
    expect(await screen.findByText('account-b:account-b-data')).toBeInTheDocument();

    act(() => mocks.authCallback?.('SIGNED_IN', session('account-a')));
    expect(await screen.findByText('account-a:account-a-data')).toBeInTheDocument();
    expect(getActiveStorageProfile()).toBe('account-a');
  });

  // Prevent a debounced edit started under one account from being written into the next active account.
  it('persists pending edits to the profile that created them', () => {
    vi.useFakeTimers();
    setActiveStorageProfile('account-a');
    const { result } = renderHook(() =>
      usePersistentState({
        key: 'studydesk.tasks',
        fallback: [] as Array<{ id: string }>,
        debounceMs: 300,
      }),
    );

    act(() => result.current[1]([{ id: 'a-only' }]));
    setActiveStorageProfile('account-b');
    act(() => vi.advanceTimersByTime(300));

    expect(storageForProfile('account-a').getItem('studydesk.tasks')).toContain('a-only');
    expect(storageForProfile('account-b').getItem('studydesk.tasks')).toBeNull();
  });

  // Prevent an attachment upload that finishes after an account switch from writing its metadata or blob into the new account.
  it('keeps in-flight material writes within their starting profile', async () => {
    setActiveStorageProfile('account-a');
    for (const profileId of ['account-a', 'account-b']) {
      storageForProfile(profileId).setItem(
        MATERIALS_KEY,
        JSON.stringify({ v: 1, data: { subjects: [], folders: [], files: [] } }),
      );
    }

    let finishPut!: () => void;
    const accountABlob = {
      put: vi.fn(
        (id: string) =>
          new Promise<IDBValidKey>((resolve) => {
            finishPut = () => resolve(id);
          }),
      ),
      get: vi.fn(async () => undefined),
      delete: vi.fn(async () => undefined),
      listIds: vi.fn(async () => []),
      replaceAll: vi.fn(async () => undefined),
    };
    const accountBBlob = {
      put: vi.fn(async (id: string) => id),
      get: vi.fn(async () => undefined),
      delete: vi.fn(async () => undefined),
      listIds: vi.fn(async () => []),
      replaceAll: vi.fn(async () => undefined),
    };
    const profileBlobs = vi
      .spyOn(materialBlobs, 'forProfile')
      .mockImplementation((profileId) => (profileId === 'account-a' ? accountABlob : accountBBlob));

    const { result } = renderHook(() => useMaterials());
    let addPromise!: ReturnType<typeof result.current.addFile>;
    await act(async () => {
      addPromise = result.current.addFile(
        new File(['attachment'], 'notes.txt', { type: 'text/plain' }),
        'subject-a',
        null,
      );
      await Promise.resolve();
    });
    expect(accountABlob.put).toHaveBeenCalledOnce();

    setActiveStorageProfile('account-b');
    await act(async () => {
      finishPut();
      await addPromise;
    });

    const accountAMetadata = JSON.parse(storageForProfile('account-a').getItem(MATERIALS_KEY)!);
    expect(accountAMetadata.data.files).toHaveLength(1);
    expect(storageForProfile('account-b').getItem(MATERIALS_KEY)).toContain('"files":[]');
    expect(accountBBlob.put).not.toHaveBeenCalled();
    expect(profileBlobs).toHaveBeenCalledWith('account-a');
  });
});
