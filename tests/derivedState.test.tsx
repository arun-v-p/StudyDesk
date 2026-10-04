import { format } from 'date-fns';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CalendarPage } from '../src/pages/CalendarPage';
import { DeadlinesPage } from '../src/pages/DeadlinesPage';
import { SettingsPage } from '../src/pages/SettingsPage';
import { dayKey } from '../src/lib/dates';
import { AppStoreProvider, KEYS } from '../src/store/AppStore';
import { MATERIALS_KEY } from '../src/store/materials';
import { SCHEMA_VERSION } from '../src/store/usePersistentState';
import { selectActiveDeadlines, selectDataCounts } from '../src/store/selectors';
import type {
  Deadline,
  ExamTimetableEntry,
  Note,
  PlannerEntry,
  StudyMaterialFile,
  Task,
  TimetableEntry,
} from '../src/types';

const deadline = (overrides: Partial<Deadline> = {}): Deadline => ({
  id: 'deadline-1',
  title: 'Lab report',
  subject: 'Physics',
  description: '',
  dueDate: dayKey(new Date()),
  dueTime: '',
  priority: 'high',
  completed: false,
  createdAt: '2026-10-01T00:00:00.000Z',
  ...overrides,
});

function persistCollection(key: string, data: unknown) {
  localStorage.setItem(key, JSON.stringify({ v: SCHEMA_VERSION, data }));
}

describe('derived data selectors', () => {
  it('keeps completed deadlines out of active deadline selection', () => {
    const active = deadline({ id: 'active' });
    const completed = deadline({ id: 'completed', completed: true });
    expect(selectActiveDeadlines([active, completed])).toEqual([active]);
  });

  it('counts active and completed records independently for Settings', () => {
    const counts = selectDataCounts({
      tasks: [
        {
          id: 'task-open',
          title: 'Open',
          completed: false,
          subtasks: [],
          estimatedMinutes: 0,
          createdAt: '',
        },
        {
          id: 'task-done',
          title: 'Done',
          completed: true,
          subtasks: [],
          estimatedMinutes: 0,
          createdAt: '',
        },
      ] satisfies Task[],
      deadlines: [deadline(), deadline({ id: 'done', completed: true })],
      timetable: [
        {
          id: 'class',
          day: 1,
          startTime: '09:00',
          endTime: '10:00',
          subject: 'Physics',
          room: '',
          note: '',
        },
      ] satisfies TimetableEntry[],
      notes: [
        {
          id: 'note',
          title: 'Notes',
          content: '',
          tags: [],
          pinned: false,
          createdAt: '',
          updatedAt: '',
        },
      ] satisfies Note[],
      planner: [
        {
          id: 'planner',
          date: '2026-10-04',
          title: 'Review',
          description: '',
          category: 'academic',
        },
      ] satisfies PlannerEntry[],
      exams: [
        {
          id: 'exam',
          subject: 'Physics',
          date: '2026-10-20',
          startTime: '09:00',
          endTime: '10:00',
          room: '',
          note: '',
          validFrom: '2026-10-01',
          validUntil: '2026-10-31',
        },
      ] satisfies ExamTimetableEntry[],
      materialFiles: [
        {
          id: 'file',
          subjectId: 'subject',
          folderId: null,
          blobId: 'blob',
          name: 'notes.pdf',
          kind: 'pdf',
          mimeType: 'application/pdf',
          sizeBytes: 10,
          lastModified: 0,
          createdAt: '',
          updatedAt: '',
        },
      ] satisfies StudyMaterialFile[],
    });

    expect(counts).toEqual({
      activeTasks: 1,
      completedTasks: 1,
      activeDeadlines: 1,
      completedDeadlines: 1,
      classes: 1,
      notes: 1,
      plannerEntries: 1,
      exams: 1,
      materialFiles: 1,
    });
  });

  it('shows all nine meaningful counts and a first-run empty state', () => {
    render(
      <AppStoreProvider>
        <SettingsPage />
      </AppStoreProvider>,
    );

    for (const label of [
      'Active Tasks',
      'Completed Tasks',
      'Active Deadlines',
      'Completed Deadlines',
      'Classes',
      'Notes',
      'Planner Entries',
      'Exams',
      'Material Files',
    ]) {
      const term = screen.getByText(label);
      expect(term.parentElement?.querySelector('dd')).toHaveTextContent('0');
    }
    expect(screen.getByRole('status')).toHaveTextContent('No local study records yet');
  });

  it('excludes completed deadlines from calendar markers and labels their history', () => {
    const today = dayKey(new Date());
    persistCollection(KEYS.deadlines, [deadline({ completed: true, dueDate: today })]);
    render(
      <AppStoreProvider>
        <CalendarPage />
      </AppStoreProvider>,
    );

    const day = screen.getByRole('gridcell', {
      name: format(new Date(), 'd MMMM yyyy'),
    });
    expect(day.getAttribute('aria-label')).not.toContain(', 1 item');
    expect(day.querySelector('.bg-danger, .bg-warning, .bg-info')).toBeNull();

    fireEvent.click(day);
    expect(screen.getByRole('region', { name: 'Completed deadlines' })).toHaveTextContent(
      'Lab report',
    );
    expect(screen.queryByRole('region', { name: 'Deadlines' })).not.toBeInTheDocument();
  });

  it('persists a deadline completion and keeps the calendar in sync after remount', async () => {
    const today = dayKey(new Date());
    persistCollection(KEYS.deadlines, [deadline({ dueDate: today })]);
    const first = render(
      <AppStoreProvider>
        <DeadlinesPage />
      </AppStoreProvider>,
    );

    fireEvent.click(screen.getByRole('checkbox', { name: 'Mark “Lab report” as done' }));
    await waitFor(() => {
      const saved = JSON.parse(localStorage.getItem(KEYS.deadlines) ?? '{}');
      expect(saved.data[0].completed).toBe(true);
    });

    first.unmount();
    render(
      <AppStoreProvider>
        <CalendarPage />
      </AppStoreProvider>,
    );
    const day = screen.getByRole('gridcell', {
      name: format(new Date(), 'd MMMM yyyy'),
    });
    expect(day.getAttribute('aria-label')).not.toContain(', 1 item');
    fireEvent.click(day);
    expect(screen.getByRole('region', { name: 'Completed deadlines' })).toHaveTextContent(
      'Lab report',
    );
  });
});

describe('Settings count source data', () => {
  it('counts the same records read from local backup-compatible collection envelopes', () => {
    persistCollection(KEYS.tasks, [{ id: 't1', title: 'Active', completed: false }]);
    persistCollection(KEYS.deadlines, [deadline(), deadline({ id: 'd2', completed: true })]);
    persistCollection(KEYS.timetable, [
      {
        id: 'c1',
        day: 1,
        startTime: '09:00',
        endTime: '10:00',
        subject: 'Physics',
        room: '',
        note: '',
      },
    ]);
    persistCollection(KEYS.notes, [
      { id: 'n1', title: 'Notes', content: '', tags: [], pinned: false },
    ]);
    persistCollection(KEYS.planner, [{ id: 'p1', date: dayKey(new Date()), title: 'Review' }]);
    persistCollection('studydesk.examTimetable', [
      {
        id: 'e1',
        subject: 'Physics',
        date: '2026-10-20',
        startTime: '09:00',
        endTime: '10:00',
        room: '',
        note: '',
        validFrom: '2026-10-01',
        validUntil: '2026-10-31',
      },
    ]);
    localStorage.setItem(
      MATERIALS_KEY,
      JSON.stringify({
        v: 1,
        data: {
          subjects: [],
          folders: [],
          files: [
            {
              id: 'f1',
              subjectId: 's1',
              folderId: null,
              blobId: 'b1',
              name: 'notes.pdf',
              kind: 'pdf',
              mimeType: 'application/pdf',
              sizeBytes: 10,
              lastModified: 0,
              createdAt: '2026-10-01T00:00:00.000Z',
              updatedAt: '2026-10-01T00:00:00.000Z',
            },
          ],
        },
      }),
    );

    render(
      <AppStoreProvider>
        <SettingsPage />
      </AppStoreProvider>,
    );

    const expected = {
      'Active Tasks': '1',
      'Completed Tasks': '0',
      'Active Deadlines': '1',
      'Completed Deadlines': '1',
      Classes: '1',
      Notes: '1',
      'Planner Entries': '1',
      Exams: '1',
      'Material Files': '1',
    };
    for (const [label, count] of Object.entries(expected)) {
      expect(screen.getByText(label).parentElement?.querySelector('dd')).toHaveTextContent(count);
    }
  });
});
