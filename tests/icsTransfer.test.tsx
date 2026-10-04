import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { IcsTransfer } from '../src/features/ics/IcsTransfer';
import { AppStoreProvider, KEYS, useStore } from '../src/store/AppStore';

const weeklyFixture = [
  'BEGIN:VCALENDAR',
  'VERSION:2.0',
  'BEGIN:VEVENT',
  'UID:weekly@example.test',
  'DTSTART;TZID=Asia/Kolkata:20261005T090000',
  'DTEND;TZID=Asia/Kolkata:20261005T100000',
  'RRULE:FREQ=WEEKLY;BYDAY=MO',
  'SUMMARY:Physics',
  'END:VEVENT',
  'END:VCALENDAR',
].join('\r\n');

function StateSummary() {
  const { timetable, calendarEvents } = useStore();
  return (
    <>
      <IcsTransfer />
      <output>
        {calendarEvents.items.length} imported events; {timetable.items.length} weekly classes
      </output>
    </>
  );
}

describe('ICS transfer preview', () => {
  it('previews then imports new events without modifying existing local records', async () => {
    const existing = {
      id: 'existing',
      uid: 'old@example.test',
      title: 'Keep this event',
      description: '',
      location: '',
      startDate: '2026-10-05',
      endDate: '2026-10-06',
      allDay: true,
      createdAt: '2026-10-01T00:00:00.000Z',
      updatedAt: '2026-10-01T00:00:00.000Z',
    };
    localStorage.setItem(KEYS.calendarEvents, JSON.stringify([existing]));
    const user = userEvent.setup();
    render(
      <AppStoreProvider>
        <StateSummary />
      </AppStoreProvider>,
    );

    await user.click(screen.getByRole('button', { name: 'Import ICS' }));
    const file = new File([weeklyFixture], 'classes.ics', { type: 'text/calendar' });
    Object.defineProperty(file, 'text', { value: async () => weeklyFixture });
    fireEvent.change(screen.getByLabelText('Choose an iCalendar file'), {
      target: { files: [file] },
    });

    const dialog = await screen.findByRole('dialog', { name: 'Import iCalendar file' });
    expect(within(dialog).getByText(/Physics/)).toBeInTheDocument();
    expect(screen.getByText('1 imported events; 0 weekly classes')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Import 1 event' }));

    expect(await screen.findByText('1 imported events; 1 weekly classes')).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem(KEYS.calendarEvents)!)).toEqual({
      v: 2,
      data: [existing],
    });
  });
});
