import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { AppStoreProvider } from '../src/store/AppStore';
import { ExamTimetablePage } from '../src/pages/ExamTimetablePage';

describe('Exam Timetable page', () => {
  it('rejects an empty exam date before adding, then accepts a valid date', async () => {
    // The type=button footer bypassed native required validation and saved an exam that vanished on reload.
    const user = userEvent.setup();
    render(
      <AppStoreProvider>
        <ExamTimetablePage />
      </AppStoreProvider>,
    );

    await user.click(screen.getAllByRole('button', { name: 'Add exam' })[0]!);
    const dialog = screen.getByRole('dialog', { name: 'Add exam' });
    await user.type(within(dialog).getByRole('textbox', { name: /^Subject/ }), 'Linear Algebra');
    const date = within(dialog).getByLabelText(/^Exam date/);
    fireEvent.change(date, { target: { value: '' } });
    await user.click(within(dialog).getByRole('button', { name: 'Add exam' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Pick a valid exam date.');
    expect(screen.queryByRole('cell', { name: 'Linear Algebra' })).not.toBeInTheDocument();

    fireEvent.change(date, { target: { value: '2030-01-02' } });
    await user.click(within(dialog).getByRole('button', { name: 'Add exam' }));
    expect(await screen.findByRole('cell', { name: 'Linear Algebra' })).toBeInTheDocument();
  });

  it('restores a deleted exam from the Undo toast', async () => {
    // Exam deletion had no undo path despite other collection pages preserving the removed row.
    const user = userEvent.setup();
    render(
      <AppStoreProvider>
        <ExamTimetablePage />
      </AppStoreProvider>,
    );

    await user.click(screen.getAllByRole('button', { name: 'Add exam' })[0]!);
    const dialog = screen.getByRole('dialog', { name: 'Add exam' });
    await user.type(within(dialog).getByRole('textbox', { name: /^Subject/ }), 'Linear Algebra');
    await user.click(within(dialog).getByRole('button', { name: 'Add exam' }));
    await screen.findByRole('cell', { name: 'Linear Algebra' });

    await user.click(screen.getByRole('button', { name: 'Delete Linear Algebra' }));
    await user.click(
      within(screen.getByRole('dialog', { name: 'Delete this exam?' })).getByRole('button', {
        name: 'Delete',
      }),
    );
    expect(screen.queryByRole('cell', { name: 'Linear Algebra' })).not.toBeInTheDocument();
    await user.click(await screen.findByRole('button', { name: 'Undo' }));
    expect(await screen.findByRole('cell', { name: 'Linear Algebra' })).toBeInTheDocument();
  });

  it('renders accessible timetable columns and allows status changes and editing', async () => {
    const user = userEvent.setup();
    render(
      <AppStoreProvider>
        <ExamTimetablePage />
      </AppStoreProvider>,
    );

    await user.click(screen.getAllByRole('button', { name: 'Add exam' })[0]!);
    const dialog = screen.getByRole('dialog', { name: 'Add exam' });
    await user.type(within(dialog).getByRole('textbox', { name: /^Subject/ }), 'Physics II');
    await user.type(within(dialog).getByRole('textbox', { name: /^Course code/ }), 'PHY202');
    await user.type(within(dialog).getByRole('textbox', { name: /^Semester/ }), 'IV');
    await user.click(within(dialog).getByRole('button', { name: 'Add exam' }));

    const table = screen.getByRole('table', { name: 'Exam timetable' });
    for (const heading of [
      'Sl. No.',
      'Date',
      'Day',
      'Time',
      'Course Code',
      'Subject / Exam Name',
      'Semester',
      'Venue / Room',
      'Status',
    ]) {
      expect(
        within(table).getByRole('columnheader', { name: new RegExp(heading) }),
      ).toBeInTheDocument();
    }
    expect(within(table).getByRole('cell', { name: 'PHY202' })).toBeInTheDocument();
    expect(within(table).getByRole('cell', { name: 'IV' })).toBeInTheDocument();

    await user.click(within(table).getByRole('button', { name: 'Mark Physics II completed' }));
    expect(within(table).getByText('Completed')).toBeInTheDocument();
    await user.click(within(table).getByRole('button', { name: 'Edit Physics II' }));
    const editDialog = screen.getByRole('dialog', { name: 'Edit exam' });
    const courseCode = within(editDialog).getByRole('textbox', { name: /^Course code/ });
    await user.clear(courseCode);
    await user.type(courseCode, 'PHY203');
    await user.click(within(editDialog).getByRole('button', { name: 'Save changes' }));
    expect(within(table).getByRole('cell', { name: 'PHY203' })).toBeInTheDocument();
    expect(within(table).getByText('Completed')).toBeInTheDocument();
  });

  it('sorts the exam table by date in either direction', async () => {
    const user = userEvent.setup();
    render(
      <AppStoreProvider>
        <ExamTimetablePage />
      </AppStoreProvider>,
    );

    const addExam = async (subject: string, dateValue: string) => {
      await user.click(screen.getAllByRole('button', { name: 'Add exam' })[0]!);
      const dialog = screen.getByRole('dialog', { name: 'Add exam' });
      await user.type(within(dialog).getByRole('textbox', { name: /^Subject/ }), subject);
      fireEvent.change(within(dialog).getByLabelText(/^Exam date/), {
        target: { value: dateValue },
      });
      await user.click(within(dialog).getByRole('button', { name: 'Add exam' }));
    };

    await addExam('Later exam', '2030-10-20');
    await addExam('Earlier exam', '2030-10-10');
    const table = screen.getByRole('table', { name: 'Exam timetable' });
    const subjectCells = () =>
      within(table)
        .getAllByRole('row')
        .slice(1)
        .map((row) => within(row).getAllByRole('cell')[5]?.textContent);
    expect(subjectCells()).toEqual(['Earlier exam', 'Later exam']);
    await user.click(within(table).getByRole('button', { name: /Date/ }));
    expect(subjectCells()).toEqual(['Later exam', 'Earlier exam']);
  });
});
