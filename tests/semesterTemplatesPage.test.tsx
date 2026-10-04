import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { SemesterTemplatesPanel } from '../src/features/semester/SemesterTemplatesPanel';
import { AppStoreProvider, KEYS, useStore } from '../src/store/AppStore';

const semesterClass = {
  id: 'class-1',
  day: 1,
  startTime: '09:00',
  endTime: '10:00',
  subject: 'Physics',
  room: 'B-204',
  note: '',
};

function StoreSummary() {
  const { timetable, semesterTemplates } = useStore();
  return (
    <>
      <SemesterTemplatesPanel />
      <output data-testid="summary">
        {JSON.stringify({ timetable: timetable.items, templates: semesterTemplates.items })}
      </output>
      <button
        type="button"
        onClick={() => timetable.update(timetable.items[0]!.id, { subject: 'Edited in semester' })}
      >
        Edit semester class
      </button>
    </>
  );
}

describe('semester template UI', () => {
  it('saves a named snapshot, selectively starts a semester, and leaves the template unchanged', async () => {
    localStorage.setItem(KEYS.timetable, JSON.stringify([semesterClass]));
    const user = userEvent.setup();
    render(
      <AppStoreProvider>
        <StoreSummary />
      </AppStoreProvider>,
    );

    await user.click(screen.getByRole('button', { name: 'Save current' }));
    const saveDialog = screen.getByRole('dialog', { name: 'Save semester template' });
    await user.type(within(saveDialog).getByRole('textbox', { name: /Template name/ }), 'Autumn');
    await user.click(within(saveDialog).getByRole('button', { name: 'Save template' }));
    expect(await screen.findByRole('heading', { name: 'Autumn' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Preview' }));
    const preview = screen.getByRole('dialog', { name: 'Preview Autumn' });
    await user.click(within(preview).getByRole('checkbox', { name: 'Include Physics, 09:00' }));
    expect(within(preview).getByRole('button', { name: 'Start new semester' })).toBeDisabled();
    await user.click(within(preview).getByRole('checkbox', { name: 'Include Physics, 09:00' }));
    await user.click(within(preview).getByRole('button', { name: 'Start new semester' }));
    await user.click(screen.getByRole('button', { name: 'Replace timetable' }));
    expect(await screen.findByRole('heading', { name: 'Autumn' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Edit semester class' }));
    await user.click(screen.getByRole('button', { name: 'Preview' }));
    const unchanged = screen.getByRole('dialog', { name: 'Preview Autumn' });
    expect(within(unchanged).getByText(/Physics · Mon 09:00/)).toBeInTheDocument();

    const summary = JSON.parse(screen.getByTestId('summary').textContent ?? '{}') as {
      timetable: { subject: string }[];
      templates: { name: string; timetable: { subject: string }[] }[];
    };
    expect(summary.timetable[0]?.subject).toBe('Edited in semester');
    expect(summary.templates[0]?.timetable[0]?.subject).toBe('Physics');
  });

  it('rejects duplicate template names before saving', async () => {
    localStorage.setItem(KEYS.timetable, JSON.stringify([semesterClass]));
    localStorage.setItem(
      KEYS.semesterTemplates,
      JSON.stringify([
        {
          id: 'template-1',
          name: 'Autumn',
          timetable: [(({ id: _id, ...entry }) => entry)(semesterClass)],
          createdAt: '2026-10-01T00:00:00.000Z',
          updatedAt: '2026-10-01T00:00:00.000Z',
        },
      ]),
    );
    const user = userEvent.setup();
    render(
      <AppStoreProvider>
        <SemesterTemplatesPanel />
      </AppStoreProvider>,
    );
    await user.click(screen.getByRole('button', { name: 'Save current' }));
    const dialog = screen.getByRole('dialog', { name: 'Save semester template' });
    await user.type(within(dialog).getByRole('textbox', { name: /Template name/ }), ' autumn ');
    await user.click(within(dialog).getByRole('button', { name: 'Save template' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(/already exists/i);
  });
});
