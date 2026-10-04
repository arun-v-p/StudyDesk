import { useMemo, useRef, useState } from 'react';
import { Download, FileUp } from 'lucide-react';
import { Modal } from '../../components/ui/Modal';
import { useStore } from '../../store/AppStore';
import { useExamTimetable } from '../../store/examTimetable';
import { createId } from '../../lib/id';
import {
  collectIcsExportEvents,
  icsDuplicateKey,
  parseIcs,
  serializeIcs,
  type IcsEvent,
  type IcsExportEvent,
} from './ical';

type PreviewEvent = { event: IcsEvent; included: boolean; duplicate: boolean };
type TransferMode = 'import' | 'export' | null;

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function IcsTransfer() {
  const { timetable, calendarEvents, deadlines, planner, newTimetableEntry, toast } = useStore();
  const exams = useExamTimetable();
  const fileRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<TransferMode>(null);
  const [exportSelection, setExportSelection] = useState<Record<string, boolean>>({});
  const [preview, setPreview] = useState<PreviewEvent[]>([]);
  const [skipped, setSkipped] = useState<string[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [importError, setImportError] = useState<string | null>(null);
  const [duplicateOptIn, setDuplicateOptIn] = useState(false);

  const exportEvents = useMemo(
    () =>
      collectIcsExportEvents({
        timetable: timetable.items,
        calendarEvents: calendarEvents.items,
        deadlines: deadlines.items,
        planner: planner.items,
        exams: exams.items,
      }),
    [timetable.items, calendarEvents.items, deadlines.items, planner.items, exams.items],
  );

  const beginExport = () => {
    setExportSelection(Object.fromEntries(exportEvents.map((event) => [event.id, true])));
    setMode('export');
  };

  const beginImport = () => {
    setPreview([]);
    setSkipped([]);
    setWarnings([]);
    setImportError(null);
    setDuplicateOptIn(false);
    setMode('import');
  };

  const readImport = async (file: File) => {
    setImportError(null);
    try {
      const result = parseIcs(await file.text());
      const existing = collectIcsExportEvents({
        timetable: timetable.items,
        calendarEvents: calendarEvents.items,
        deadlines: deadlines.items,
        planner: planner.items,
        exams: exams.items,
      });
      const identities = new Set(existing.map(icsDuplicateKey));
      const incoming = new Set<string>();
      const events = result.events.map((event) => {
        const identity = icsDuplicateKey(event);
        const duplicate = identities.has(identity) || incoming.has(identity);
        incoming.add(identity);
        return { event, duplicate, included: !duplicate };
      });
      setPreview(events);
      setSkipped(result.skipped);
      setWarnings(result.warnings);
    } catch (error) {
      setImportError(error instanceof Error ? error.message : 'Could not read this ICS file.');
    }
  };

  const importSelected = () => {
    const selected = preview.filter((row) => row.included);
    for (const { event } of selected) {
      if (event.weeklyDay != null) {
        timetable.add(
          newTimetableEntry({
            day: event.weeklyDay,
            startTime: event.startTime!,
            endTime: event.endTime!,
            subject: event.title,
            room: event.location,
            note: event.description,
          }),
        );
      } else {
        const now = new Date().toISOString();
        calendarEvents.add({
          id: createId(),
          ...(event.uid ? { uid: event.uid } : {}),
          title: event.title,
          description: event.description,
          location: event.location,
          startDate: event.startDate,
          endDate: event.endDate,
          allDay: event.allDay,
          ...(event.startTime ? { startTime: event.startTime } : {}),
          ...(event.endTime ? { endTime: event.endTime } : {}),
          createdAt: now,
          updatedAt: now,
        });
      }
    }
    toast({
      message: `Imported ${selected.length} event${selected.length === 1 ? '' : 's'}; existing records were not changed.`,
      tone: 'success',
    });
    setMode(null);
  };

  const downloadSelected = () => {
    const selected = exportEvents.filter((event) => exportSelection[event.id]);
    if (selected.length === 0) return;
    const blob = new Blob([serializeIcs(selected)], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'studydesk-calendar.ics';
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setMode(null);
  };

  const includedCount = preview.filter((row) => row.included).length;
  const duplicateCount = preview.filter((row) => row.duplicate).length;
  const toggleAll = (checked: boolean) => {
    setExportSelection(Object.fromEntries(exportEvents.map((event) => [event.id, checked])));
  };

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="btn btn--ghost" onClick={beginImport}>
          <FileUp className="h-4 w-4" aria-hidden="true" /> Import ICS
        </button>
        <button type="button" className="btn btn--ghost" onClick={beginExport}>
          <Download className="h-4 w-4" aria-hidden="true" /> Export ICS
        </button>
      </div>
      <input
        ref={fileRef}
        className="sr-only"
        type="file"
        accept=".ics,text/calendar"
        aria-label="Choose an iCalendar file"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          if (file) void readImport(file);
          event.currentTarget.value = '';
        }}
      />
      <Modal
        open={mode === 'import'}
        onClose={() => setMode(null)}
        title="Import iCalendar file"
        footer={
          <>
            <button type="button" className="btn btn--ghost" onClick={() => setMode(null)}>
              Cancel
            </button>
            <button
              type="button"
              className="btn btn--primary"
              disabled={includedCount === 0}
              onClick={importSelected}
            >
              Import {includedCount} event{includedCount === 1 ? '' : 's'}
            </button>
          </>
        }
      >
        <div className="space-y-3">
          <button type="button" className="btn btn--ghost" onClick={() => fileRef.current?.click()}>
            <FileUp className="h-4 w-4" aria-hidden="true" /> Choose .ics file
          </button>
          <p className="text-subtle text-xs">
            Preview the events before importing. New events are added locally; existing records are
            never replaced.
          </p>
          {importError && (
            <p role="alert" className="text-danger text-sm">
              {importError}
            </p>
          )}
          {preview.length > 0 && (
            <div className="space-y-2">
              {duplicateCount > 0 && (
                <label className="border-border flex gap-2 rounded-md border p-2.5 text-xs">
                  <input
                    type="checkbox"
                    aria-label="Include possible duplicate events"
                    checked={duplicateOptIn}
                    onChange={(event) => {
                      const checked = event.currentTarget.checked;
                      setDuplicateOptIn(checked);
                      setPreview((rows) =>
                        rows.map((row) => (row.duplicate ? { ...row, included: checked } : row)),
                      );
                    }}
                  />
                  <span>
                    Include {duplicateCount} possible duplicate{duplicateCount === 1 ? '' : 's'} as
                    new records (does not replace existing data)
                  </span>
                </label>
              )}
              <ul className="max-h-64 space-y-1 overflow-auto">
                {preview.map((row, index) => (
                  <li key={`${row.event.uid ?? row.event.title}-${index}`}>
                    <label className="border-border flex gap-2 rounded-md border p-2.5 text-sm">
                      <input
                        type="checkbox"
                        aria-label={`Import ${row.event.title}`}
                        checked={row.included}
                        disabled={row.duplicate && !duplicateOptIn}
                        onChange={(event) => {
                          const checked = event.currentTarget.checked;
                          setPreview((rows) =>
                            rows.map((item, itemIndex) =>
                              itemIndex === index ? { ...item, included: checked } : item,
                            ),
                          );
                        }}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="text-fg block truncate font-medium">
                          {row.event.title}
                        </span>
                        <span className="text-subtle block text-xs">
                          {row.event.weeklyDay != null
                            ? `Weekly · ${WEEKDAYS[row.event.weeklyDay]} · ${row.event.startTime}–${row.event.endTime}`
                            : `${row.event.startDate}${row.event.startTime ? ` · ${row.event.startTime}${row.event.endTime ? `–${row.event.endTime}` : ''}` : ' · All day'}`}
                          {row.duplicate ? ' · possible duplicate' : ''}
                        </span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {(skipped.length > 0 || warnings.length > 0) && (
            <div className="border-warning/40 bg-warning-soft rounded-md border p-3 text-xs">
              {skipped.length > 0 && (
                <>
                  <p className="text-warning font-semibold">Skipped events</p>
                  <ul className="mt-1 list-inside list-disc">
                    {skipped.map((message, index) => (
                      <li key={`skip-${index}`}>{message}</li>
                    ))}
                  </ul>
                </>
              )}
              {warnings.length > 0 && (
                <>
                  <p className="text-warning mt-2 font-semibold">Import notes</p>
                  <ul className="mt-1 list-inside list-disc">
                    {warnings.map((message, index) => (
                      <li key={`warning-${index}`}>{message}</li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          )}
        </div>
      </Modal>
      <Modal
        open={mode === 'export'}
        onClose={() => setMode(null)}
        title="Export calendar events"
        footer={
          <>
            <button type="button" className="btn btn--ghost" onClick={() => setMode(null)}>
              Cancel
            </button>
            <button type="button" className="btn btn--primary" onClick={downloadSelected}>
              <Download className="h-4 w-4" aria-hidden="true" /> Download ICS
            </button>
          </>
        }
      >
        {exportEvents.length === 0 ? (
          <p className="text-subtle text-sm">
            There are no timetable or calendar events to export.
          </p>
        ) : (
          <>
            <div className="mb-2 flex gap-2">
              <button
                type="button"
                className="btn btn--ghost !text-xs"
                onClick={() => toggleAll(true)}
              >
                Select all
              </button>
              <button
                type="button"
                className="btn btn--ghost !text-xs"
                onClick={() => toggleAll(false)}
              >
                Clear selection
              </button>
            </div>
            <ul className="max-h-72 space-y-1 overflow-auto">
              {exportEvents.map((event: IcsExportEvent) => (
                <li key={event.id}>
                  <label className="border-border flex gap-2 rounded-md border p-2.5 text-sm">
                    <input
                      type="checkbox"
                      aria-label={`Export ${event.title}`}
                      checked={exportSelection[event.id] ?? false}
                      onChange={(change) => {
                        const checked = change.currentTarget.checked;
                        setExportSelection((selection) => ({
                          ...selection,
                          [event.id]: checked,
                        }));
                      }}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="text-fg block truncate font-medium">{event.title}</span>
                      <span className="text-subtle block text-xs">
                        {event.source === 'class'
                          ? `Weekly · ${WEEKDAYS[event.weeklyDay!]} · ${event.startTime}–${event.endTime}`
                          : `${event.startDate}${event.startTime ? ` · ${event.startTime}${event.endTime ? `–${event.endTime}` : ''}` : ' · All day'}`}
                      </span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </>
        )}
      </Modal>
    </>
  );
}
