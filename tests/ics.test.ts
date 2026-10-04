import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { dayKey } from '../src/lib/dates';
import {
  collectIcsExportEvents,
  icsDuplicateKey,
  parseIcs,
  serializeIcs,
  type IcsExportEvent,
} from '../src/features/ics/ical';

const fixture = readFileSync('tests/fixtures/sample.ics', 'utf8');

describe('iCalendar import/export', () => {
  it('parses floating, UTC, TZID, all-day, escaped text and weekly recurrence', () => {
    const expectedLocalStart = new Date('2026-10-12T03:30:00Z');
    const expectedLocalEnd = new Date('2026-10-12T05:30:00Z');
    const timezoneStart = new Date('2026-10-05T03:30:00Z');
    const timezoneEnd = new Date('2026-10-05T04:30:00Z');
    const { events, skipped, warnings } = parseIcs(fixture);
    expect(skipped).toEqual(['Event 4: Only weekly recurrence without an interval is supported.']);
    expect(warnings).toEqual([]);
    expect(events).toHaveLength(3);
    expect(events[0]).toMatchObject({
      uid: 'lecture-1@example.test',
      title: 'Physics, Lecture',
      description: 'Bring notes; read chapter 4',
      location: 'Room 12',
      weeklyDay: 1,
      startDate: dayKey(timezoneStart),
      startTime: `${String(timezoneStart.getHours()).padStart(2, '0')}:${String(timezoneStart.getMinutes()).padStart(2, '0')}`,
      endTime: `${String(timezoneEnd.getHours()).padStart(2, '0')}:${String(timezoneEnd.getMinutes()).padStart(2, '0')}`,
    });
    expect(events[1]).toMatchObject({
      uid: 'exam-1@example.test',
      title: 'Chemistry final',
      startDate: dayKey(expectedLocalStart),
      startTime: `${String(expectedLocalStart.getHours()).padStart(2, '0')}:${String(expectedLocalStart.getMinutes()).padStart(2, '0')}`,
      endDate: dayKey(expectedLocalEnd),
      endTime: `${String(expectedLocalEnd.getHours()).padStart(2, '0')}:${String(expectedLocalEnd.getMinutes()).padStart(2, '0')}`,
    });
    expect(events[2]).toMatchObject({
      uid: 'holiday-1@example.test',
      title: 'Study break',
      startDate: '2026-10-20',
      endDate: '2026-10-22',
      allDay: true,
    });
  });

  it('rejects incomplete calendars and reports malformed or unrepresentable events', () => {
    expect(() => parseIcs('BEGIN:VCALENDAR\nEND:VCALENDAR')).toThrow(/no VEVENT/i);
    expect(() => parseIcs('BEGIN:VEVENT\nEND:VEVENT')).toThrow(/complete iCalendar/i);
    const result = parseIcs(
      [
        'BEGIN:VCALENDAR',
        'BEGIN:VEVENT',
        'DTSTART:bad',
        'SUMMARY:Broken',
        'END:VEVENT',
        'BEGIN:VEVENT',
        'DTSTART:20261012T090000',
        'DTEND:20261012T100000',
        'SUMMARY:Unsupported',
        'RRULE:FREQ=DAILY',
        'END:VEVENT',
        'END:VCALENDAR',
      ].join('\r\n'),
    );
    expect(result.events).toEqual([]);
    expect(result.skipped).toEqual([
      'Event 1: Invalid date-time value.',
      'Event 2: Only weekly recurrence without an interval is supported.',
    ]);
  });

  it('folds UTF-8 content lines within the RFC 5545 75-octet limit and round-trips text', () => {
    const event: IcsExportEvent = {
      id: 'event-1',
      source: 'calendar',
      uid: 'round-trip@example.test',
      title: `Study, review; ${'新'.repeat(35)}`,
      description: 'Line one\nLine two; escaped, safely',
      location: 'Room 1',
      startDate: '2026-10-12',
      endDate: '2026-10-12',
      startTime: '09:00',
      endTime: '10:30',
      allDay: false,
    };
    const ics = serializeIcs([event], new Date('2026-10-01T12:00:00Z'));
    expect(ics).toContain('\r\n ');
    for (const line of ics.split('\r\n')) {
      if (line) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    }
    const parsed = parseIcs(ics);
    expect(parsed.events[0]).toMatchObject({
      uid: event.uid,
      title: event.title,
      description: event.description,
      location: event.location,
      startDate: event.startDate,
      startTime: event.startTime,
      endTime: event.endTime,
    });
  });

  it('exports local entities as timed, all-day, and weekly recurring events', () => {
    const events = collectIcsExportEvents(
      {
        timetable: [
          {
            id: 'class',
            day: 1,
            startTime: '09:00',
            endTime: '10:00',
            subject: 'Physics',
            room: 'Room 12',
            note: 'Lecture',
          },
        ],
        calendarEvents: [],
        deadlines: [
          {
            id: 'deadline',
            title: 'Essay',
            subject: 'History',
            description: 'Submit',
            dueDate: '2026-10-20',
            dueTime: '',
            priority: 'high',
            completed: false,
            createdAt: '2026-10-01T00:00:00.000Z',
          },
        ],
        planner: [],
        exams: [],
      },
      new Date(2026, 9, 4, 12),
    );
    expect(events[0]).toMatchObject({ startDate: '2026-10-05', weeklyDay: 1 });
    expect(events[1]).toMatchObject({ allDay: true, endDate: '2026-10-21' });
    const ics = serializeIcs(events, new Date('2026-10-01T12:00:00Z'));
    expect(ics).toContain('RRULE:FREQ=WEEKLY;BYDAY=MO');
    expect(ics).toContain('DTSTART;VALUE=DATE:20261020');
  });

  it('uses date and time as a duplicate identity when no source UID exists', () => {
    const first = {
      title: 'Review',
      startDate: '2026-10-20',
      endDate: '2026-10-20',
      allDay: true,
      description: '',
      location: '',
    };
    expect(icsDuplicateKey(first)).toBe(icsDuplicateKey({ ...first, title: ' review ' }));
  });
});
