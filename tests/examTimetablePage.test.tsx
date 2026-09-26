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

    await user.click(screen.getByRole('button', { name: 'Add exam' }));
    const dialog = screen.getByRole('dialog', { name: 'Add exam' });
    await user.type(within(dialog).getByRole('textbox', { name: /^Subject/ }), 'Linear Algebra');
    const date = within(dialog).getByLabelText(/^Exam date/);
    fireEvent.change(date, { target: { value: '' } });
    await user.click(within(dialog).getByRole('button', { name: 'Add exam' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Pick a valid exam date.');
    expect(screen.queryByRole('heading', { name: 'Linear Algebra' })).not.toBeInTheDocument();

    fireEvent.change(date, { target: { value: '2030-01-02' } });
    await user.click(within(dialog).getByRole('button', { name: 'Add exam' }));
    expect(await screen.findByRole('heading', { name: 'Linear Algebra' })).toBeInTheDocument();
  });

  it('restores a deleted exam from the Undo toast', async () => {
    // Exam deletion had no undo path despite other collection pages preserving the removed row.
    const user = userEvent.setup();
    render(
      <AppStoreProvider>
        <ExamTimetablePage />
      </AppStoreProvider>,
    );

    await user.click(screen.getByRole('button', { name: 'Add exam' }));
    const dialog = screen.getByRole('dialog', { name: 'Add exam' });
    await user.type(within(dialog).getByRole('textbox', { name: /^Subject/ }), 'Linear Algebra');
    await user.click(within(dialog).getByRole('button', { name: 'Add exam' }));
    await screen.findByRole('heading', { name: 'Linear Algebra' });

    await user.click(screen.getByRole('button', { name: 'Delete Linear Algebra' }));
    await user.click(
      within(screen.getByRole('dialog', { name: 'Delete this exam?' })).getByRole('button', {
        name: 'Delete',
      }),
    );
    expect(screen.queryByRole('heading', { name: 'Linear Algebra' })).not.toBeInTheDocument();
    await user.click(await screen.findByRole('button', { name: 'Undo' }));
    expect(await screen.findByRole('heading', { name: 'Linear Algebra' })).toBeInTheDocument();
  });
});
