import { useEffect, useRef, useState } from 'react';
import { Cloud, Download, LogOut, Mail, Upload } from 'lucide-react';
import { Card, CardHeader, Chip } from '../../components/ui/Card';
import { TextField } from '../../components/ui/Field';
import { ConfirmDialog } from '../../components/ui/Modal';
import { isSupabaseConfigured, supabase } from '../../lib/supabase';
import { importGuestProfileIntoActive, guestProfileRecordCount } from '../../store/backup';
import { useAccountProfile } from './AccountProfile';
import { CloudSync, type InitializationStatus } from './cloudSync';

interface Counts {
  remote: number;
  local: number;
  initializationStatus: InitializationStatus;
}

/** Authentication and deliberately explicit first-device sync flow. */
export function SyncCard() {
  const { session, profileId } = useAccountProfile();
  const [email, setEmail] = useState('');
  const [counts, setCounts] = useState<Counts | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmGuestImport, setConfirmGuestImport] = useState(false);
  const syncRef = useRef<CloudSync | null>(null);
  const sessionRevision = useRef(0);
  const mounted = useRef(false);
  const sessionRef = useRef(session);
  sessionRef.current = session;

  if (!syncRef.current) syncRef.current = new CloudSync(setMessage);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    const revision = ++sessionRevision.current;
    const currentSession = sessionRef.current;
    const sync = syncRef.current;
    if (!sync) return;
    sync.stop();
    setCounts(null);
    setMessage(null);
    setBusy(false);
    if (!currentSession || !supabase) return;
    void sync
      .start(currentSession.user)
      .then((result) => {
        if (active && revision === sessionRevision.current && result) {
          setCounts({
            remote: result.remoteCount,
            local: result.localCount,
            initializationStatus: result.initializationStatus,
          });
          if (result.recoveryMessage) setMessage(result.recoveryMessage);
        }
      })
      .catch((error: unknown) => {
        if (active && revision === sessionRevision.current)
          setMessage(error instanceof Error ? error.message : 'Could not start cloud sync.');
      });
    return () => {
      active = false;
      sync.stop();
    };
  }, [profileId]);

  const isCurrentRevision = (revision: number) =>
    mounted.current && revision === sessionRevision.current;

  if (!isSupabaseConfigured) {
    return (
      <Card>
        <CardHeader title="Cloud sync" badge={<Chip tone="warning">Not configured</Chip>} />
        <p className="text-muted text-sm">
          Cloud sync is unavailable until this deployment has Supabase environment variables.
        </p>
      </Card>
    );
  }

  const sendMagicLink = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!supabase) return;
    const revision = sessionRevision.current;
    setBusy(true);
    setMessage(null);
    const redirectTo = `${window.location.origin}${import.meta.env.BASE_URL}`;
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: { emailRedirectTo: redirectTo },
      });
      if (!isCurrentRevision(revision)) return;
      setMessage(error ? error.message : 'Check your email for a secure sign-in link.');
    } catch (error) {
      if (isCurrentRevision(revision))
        setMessage(error instanceof Error ? error.message : 'Could not send a sign-in link.');
    } finally {
      if (isCurrentRevision(revision)) setBusy(false);
    }
  };

  const upload = async () => {
    const revision = sessionRevision.current;
    setBusy(true);
    setMessage(null);
    try {
      await syncRef.current!.uploadInitial();
      if (!isCurrentRevision(revision)) return;
      setMessage('This device is now synced. Future changes upload automatically.');
      setCounts((current) =>
        current ? { ...current, remote: Math.max(current.remote, current.local) } : current,
      );
    } catch (error) {
      if (isCurrentRevision(revision))
        setMessage(error instanceof Error ? error.message : 'Could not upload this device.');
    } finally {
      if (isCurrentRevision(revision)) {
        setBusy(false);
        setCounts((current) =>
          current
            ? {
                ...current,
                initializationStatus: syncRef.current!.getInitializationStatus(),
              }
            : current,
        );
      }
    }
  };

  const download = async () => {
    const revision = sessionRevision.current;
    setBusy(true);
    setMessage(null);
    try {
      await syncRef.current!.downloadInitial();
      if (!isCurrentRevision(revision)) return;
      window.location.reload();
    } catch (error) {
      if (isCurrentRevision(revision)) {
        setMessage(error instanceof Error ? error.message : 'Could not restore cloud data.');
        setBusy(false);
        setCounts((current) =>
          current
            ? {
                ...current,
                initializationStatus: syncRef.current!.getInitializationStatus(),
              }
            : current,
        );
      }
    }
  };

  const signOut = async () => {
    if (!supabase) return;
    const revision = sessionRevision.current;
    setBusy(true);
    try {
      const { error } = await supabase.auth.signOut();
      if (!isCurrentRevision(revision)) return;
      if (error) setMessage(error.message);
    } catch (error) {
      if (isCurrentRevision(revision))
        setMessage(error instanceof Error ? error.message : 'Could not sign out.');
    } finally {
      if (isCurrentRevision(revision)) setBusy(false);
    }
  };

  const importGuestData = async () => {
    setConfirmGuestImport(false);
    setBusy(true);
    setMessage(null);
    const revision = sessionRevision.current;
    try {
      const imported = await importGuestProfileIntoActive();
      if (!isCurrentRevision(revision)) return;
      setMessage(
        `Merged ${imported.records} guest record(s) and copied ${imported.attachments} attachment(s). Guest data remains unchanged.`,
      );
      setCounts((current) =>
        current ? { ...current, local: current.local + imported.records } : current,
      );
    } catch (error) {
      if (isCurrentRevision(revision))
        setMessage(error instanceof Error ? error.message : 'Could not import guest data.');
    } finally {
      if (isCurrentRevision(revision)) setBusy(false);
    }
  };

  const initialised = syncRef.current.hasInitialised();
  const initializationStatus = syncRef.current.getInitializationStatus();
  const guestRecords = profileId === null ? 0 : guestProfileRecordCount();
  return (
    <Card>
      <CardHeader
        title="Cloud sync"
        badge={
          <Chip tone={session ? 'success' : 'neutral'}>{session ? 'Connected' : 'Local only'}</Chip>
        }
      />
      {!session ? (
        <form onSubmit={sendMagicLink} className="space-y-3">
          <p className="text-muted text-sm">
            Sign in on each device to sync your planner securely. Your data stays available offline.
          </p>
          <TextField
            label="Email address"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@example.com"
          />
          <button type="submit" className="btn btn--primary" disabled={busy}>
            <Mail className="h-4 w-4" aria-hidden="true" /> Send sign-in link
          </button>
        </form>
      ) : (
        <div className="space-y-3">
          <p className="text-muted text-sm">
            Signed in as <span className="text-fg font-medium">{session.user.email}</span>.{' '}
            {initialised
              ? 'New changes sync automatically.'
              : initializationStatus === 'uploading'
                ? 'A first upload was interrupted. Resume it below; partial cloud data is not treated as a backup.'
                : initializationStatus === 'downloading'
                  ? 'A restore was interrupted. Resume it below; local-only records will be preserved.'
                  : 'Choose how to initialise this device below.'}
          </p>
          {counts &&
            !initialised &&
            (initializationStatus === 'uploading' ||
              (initializationStatus === 'pending' && counts.remote === 0)) && (
              <button
                type="button"
                className="btn btn--primary"
                disabled={busy}
                onClick={() => void upload()}
              >
                <Upload className="h-4 w-4" aria-hidden="true" />{' '}
                {initializationStatus === 'uploading' ? 'Resume upload' : 'Upload this device'} (
                {counts.local} records)
              </button>
            )}
          {counts &&
            !initialised &&
            (initializationStatus === 'downloading' ||
              (initializationStatus === 'pending' && counts.remote > 0)) && (
              <>
                <p className="border-border bg-sunken text-muted rounded-md border p-3 text-xs leading-relaxed">
                  Your cloud account has {counts.remote} record(s), including deletion history.
                  Restore merges the cloud copy with this device; local-only records are preserved.
                </p>
                <button
                  type="button"
                  className="btn btn--primary"
                  disabled={busy}
                  onClick={() => void download()}
                >
                  <Download className="h-4 w-4" aria-hidden="true" />{' '}
                  {initializationStatus === 'downloading' ? 'Resume restore' : 'Restore and merge'}
                </button>
              </>
            )}
          <button
            type="button"
            className="btn btn--ghost"
            disabled={busy}
            onClick={() => void signOut()}
          >
            <LogOut className="h-4 w-4" aria-hidden="true" /> Sign out of cloud sync
          </button>
          {guestRecords > 0 && (
            <div className="border-border bg-sunken rounded-md border p-3">
              <p className="text-muted text-sm">
                This browser has {guestRecords} guest record(s) in a separate local profile. Nothing
                from it is uploaded automatically.
              </p>
              <button
                type="button"
                className="btn btn--ghost mt-2"
                disabled={busy}
                onClick={() => setConfirmGuestImport(true)}
              >
                Import guest data into this account
              </button>
            </div>
          )}
        </div>
      )}
      {message && (
        <p role="status" className="text-muted mt-3 text-sm">
          {message}
        </p>
      )}
      <p className="border-border bg-sunken text-muted mt-4 rounded-md border p-3 text-xs leading-relaxed">
        <Cloud className="mr-1 inline h-3.5 w-3.5" aria-hidden="true" /> Sync sends planner records,
        settings, and Study Materials metadata. Material file contents remain local until secure
        file transfer is enabled in a later migration; your existing backups remain the reliable way
        to transfer attachments.
      </p>
      <ConfirmDialog
        open={confirmGuestImport}
        title="Import guest data into this account?"
        description="Guest records and attachments will be merged into this account's private local profile. Existing account records win when IDs conflict. Guest data will remain unchanged; imported records sync to the cloud only if you initialize or already use sync for this account."
        undoHint={false}
        confirmLabel="Merge guest data"
        onCancel={() => setConfirmGuestImport(false)}
        onConfirm={() => void importGuestData()}
      />
    </Card>
  );
}
