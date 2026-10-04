import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Download, Sparkles, Trash2, Upload } from 'lucide-react';
import { useStore } from '../store/AppStore';
import { Card, CardHeader } from '../components/ui/Card';
import { Modal, ConfirmDialog } from '../components/ui/Modal';
import { Select, TextField } from '../components/ui/Field';
import {
  downloadBackup,
  importBackup,
  clearAllData,
  pickBackupFile,
  restoreSnapshot,
} from '../store/backup';
import { loadSampleTerm, isFirstRun } from '../store/seed';
import { purgeLegacyKeys } from '../store/legacyMigration';
import { storage } from '../lib/safeStorage';
import { useExamTimetable } from '../store/examTimetable';
import { useMaterials } from '../store/materials';
import { selectDataCounts } from '../store/selectors';

const IMPORT_TOAST_DURATION = 8000;

/**
 * Settings: identity, theme, and the data escape hatch that the original
 * completely lacked (no export, no import, no way to clear).
 */
export function SettingsPage() {
  const { settings, updateSettings, toast, tasks, deadlines, timetable, notes, planner } =
    useStore();
  const exams = useExamTimetable();
  const materials = useMaterials();
  const [name, setName] = useState(settings.displayName);
  const [confirmClear, setConfirmClear] = useState(false);
  const [confirmSample, setConfirmSample] = useState(false);
  const [confirmRestore, setConfirmRestore] = useState(false);
  const [backupStatus, setBackupStatus] = useState<string | null>(null);

  useEffect(() => setName(settings.displayName), [settings.displayName]);

  const counts = useMemo(
    () =>
      selectDataCounts({
        tasks: tasks.items,
        deadlines: deadlines.items,
        timetable: timetable.items,
        notes: notes.items,
        planner: planner.items,
        exams: exams.items,
        materialFiles: materials.metadata.files,
      }),
    [
      tasks.items,
      deadlines.items,
      timetable.items,
      notes.items,
      planner.items,
      exams.items,
      materials.metadata.files,
    ],
  );
  const countItems = [
    ['Active Tasks', counts.activeTasks],
    ['Completed Tasks', counts.completedTasks],
    ['Active Deadlines', counts.activeDeadlines],
    ['Completed Deadlines', counts.completedDeadlines],
    ['Classes', counts.classes],
    ['Notes', counts.notes],
    ['Planner Entries', counts.plannerEntries],
    ['Exams', counts.exams],
    ['Material Files', counts.materialFiles],
  ] as const;

  const onExport = () => {
    void downloadBackup((progress) => setBackupStatus(progress.message))
      .then(() => {
        setBackupStatus(null);
        toast({ message: 'Complete backup downloaded', tone: 'success' });
      })
      .catch((err) => {
        setBackupStatus(null);
        console.error(err);
        toast({ message: err instanceof Error ? err.message : 'Export failed', tone: 'danger' });
      });
  };

  const onImport = () => {
    setConfirmRestore(false);
    void pickBackupFile().then((file) => {
      if (!file) return;
      return importBackup(file, (progress) => setBackupStatus(progress.message)).then((res) => {
        setBackupStatus(null);
        if (res.ok) {
          let reloadTimeout: number | undefined;
          toast({
            message: `Restored ${res.keys} collection(s) and ${res.attachments} attachment(s)${res.legacy ? ' (legacy metadata-only backup)' : ''} — reloading`,
            tone: 'success',
            undoLabel: 'Undo import',
            duration: IMPORT_TOAST_DURATION,
            onUndo: () => {
              if (reloadTimeout != null) window.clearTimeout(reloadTimeout);
              void restoreSnapshot(res.snapshot).then(() => window.location.reload());
            },
          });
          reloadTimeout = window.setTimeout(() => window.location.reload(), IMPORT_TOAST_DURATION);
        } else {
          toast({ message: res.error, tone: 'danger', duration: 6000 });
        }
      });
    });
  };

  const onSample = () => {
    const res = loadSampleTerm('replace', true);
    setConfirmSample(false);
    if (res.ok) {
      toast({ message: 'Sample term loaded — reloading', tone: 'success' });
      window.setTimeout(() => window.location.reload(), 700);
    } else {
      toast({ message: 'Could not write sample data', tone: 'danger' });
    }
  };

  const onClear = () => {
    clearAllData();
    setConfirmClear(false);
    toast({ message: 'All local data cleared — reloading', tone: 'info' });
    window.setTimeout(() => window.location.reload(), 700);
  };

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div>
        <h2 className="text-fg text-xl font-bold tracking-tight">Settings</h2>
        <p className="text-subtle mt-0.5 text-sm">Everything is stored in this browser only.</p>
      </div>

      <Card>
        <CardHeader title="Profile" />
        <TextField
          label="Display name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => updateSettings({ displayName: name.trim() })}
          placeholder="Used in the Today greeting"
          hint="Left blank, the greeting simply omits a name — nothing is hardcoded."
          autoComplete="name"
        />
      </Card>

      <Card>
        <CardHeader title="Appearance" />
        <Select
          label="Theme"
          value={settings.theme}
          onChange={(e) => updateSettings({ theme: e.target.value as typeof settings.theme })}
          options={[
            { value: 'system', label: 'System (follow my device)' },
            { value: 'dark', label: 'Dark' },
            { value: 'light', label: 'Light' },
          ]}
        />
      </Card>

      <Card>
        <CardHeader title="Your data" />
        <dl className="mb-4 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
          {countItems.map(([label, count]) => (
            <div key={label}>
              <dt className="text-2xs text-subtle font-semibold tracking-wider uppercase">
                {label}
              </dt>
              <dd className="text-fg mt-0.5 text-lg font-bold tabular-nums">{count}</dd>
            </div>
          ))}
        </dl>
        {Object.values(counts).every((count) => count === 0) && (
          <p className="text-subtle mb-4 text-sm" role="status">
            No local study records yet. Create records or import a backup to see them counted here.
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn btn--primary" onClick={onExport}>
            <Download className="h-4 w-4" aria-hidden="true" /> Export backup
          </button>
          <button type="button" className="btn btn--ghost" onClick={() => setConfirmRestore(true)}>
            <Upload className="h-4 w-4" aria-hidden="true" /> Import backup
          </button>
          <button type="button" className="btn btn--ghost" onClick={() => setConfirmSample(true)}>
            <Sparkles className="h-4 w-4" aria-hidden="true" /> Load sample term
          </button>
        </div>

        <p className="border-border bg-sunken text-muted mt-4 rounded-md border p-3 text-xs leading-relaxed">
          Export creates a complete, offline ZIP archive: your records, Study Materials metadata,
          and attachment files. Import replaces all current StudyDesk data in this browser after
          validating the archive. Older JSON backups can still be imported, but contain metadata
          only and cannot restore attachment files. Data does not sync between browsers or devices.
        </p>
        {backupStatus && (
          <p role="status" className="text-muted mt-3 text-sm">
            {backupStatus}
          </p>
        )}
      </Card>

      <LegacyDataCard
        onPurge={() => toast({ message: 'Legacy copies removed', tone: 'success' })}
      />

      <Card className="border-danger/40">
        <CardHeader title="Danger zone" />
        <p className="text-muted mb-4 text-sm">
          Removes all StudyDesk data from this browser, including exams, study materials and timer
          stats.
        </p>
        <button type="button" className="btn btn--danger" onClick={() => setConfirmClear(true)}>
          <Trash2 className="h-4 w-4" aria-hidden="true" /> Clear all data
        </button>
      </Card>

      <Modal
        open={confirmSample}
        onClose={() => setConfirmSample(false)}
        title="Load a sample term?"
        width="max-w-md"
        footer={
          <>
            <button
              type="button"
              className="btn btn--ghost"
              onClick={() => setConfirmSample(false)}
            >
              Cancel
            </button>
            <button type="button" className="btn btn--primary" onClick={onSample}>
              Load sample data
            </button>
          </>
        }
      >
        <div className="text-muted flex items-start gap-3 text-sm">
          <AlertTriangle className="text-warning mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <p>
            {isFirstRun()
              ? 'This fills every screen with a realistic week of classes, deadlines, notes and planner entries, dated relative to today so it always looks current.'
              : 'You already have data. Loading the sample replaces it — export a backup first if you want to keep it.'}
          </p>
        </div>
      </Modal>

      <ConfirmDialog
        open={confirmClear}
        title="Clear all data?"
        description="Removes all StudyDesk data from this browser, including exams, study materials and timer stats."
        undoHint={false}
        confirmLabel="Delete everything"
        onCancel={() => setConfirmClear(false)}
        onConfirm={onClear}
      />
      <ConfirmDialog
        open={confirmRestore}
        title="Replace all StudyDesk data?"
        description="Restoring replaces your current StudyDesk records and attachments in this browser. Export a backup first if you may need the current data."
        undoHint={false}
        confirmLabel="Choose backup and replace data"
        onCancel={() => setConfirmRestore(false)}
        onConfirm={onImport}
      />
    </div>
  );
}

const LEGACY_KEYS = [
  'studydesk_tasks',
  'studydesk_deadlines',
  'studydesk_timetable',
  'studydesk_notes',
  'studydesk_planner',
];

/**
 * Shown only when data from the previous build is still on this origin. The
 * migration in main.tsx copies it into the new namespaced keys and leaves the
 * originals as a rollback safety net; this card lets the user clear them once
 * they are happy.
 */
function LegacyDataCard({ onPurge }: { onPurge: () => void }) {
  const [present, setPresent] = useState<string[]>([]);

  useEffect(() => {
    setPresent(LEGACY_KEYS.filter((k) => storage.getItem(k) != null));
  }, []);

  if (present.length === 0) return null;

  return (
    <Card>
      <CardHeader title="Data from a previous version" />
      <p className="text-muted mb-4 text-sm leading-relaxed">
        Your planner was already in use on this site, so its records were copied into the current
        storage format. The original copies are still here as a safety net. Remove them once you
        have confirmed everything looks right — or export a backup first.
      </p>
      <button
        type="button"
        className="btn btn--ghost"
        onClick={() => {
          purgeLegacyKeys();
          setPresent([]);
          onPurge();
        }}
      >
        <Trash2 className="h-4 w-4" aria-hidden="true" /> Remove {present.length} legacy{' '}
        {present.length === 1 ? 'copy' : 'copies'}
      </button>
    </Card>
  );
}
