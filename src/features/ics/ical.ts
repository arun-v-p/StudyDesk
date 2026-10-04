import { dayKey, isResolvableDayKey, toMinutes } from '../../lib/dates';
import type {
  CalendarEvent,
  Deadline,
  ExamTimetableEntry,
  PlannerEntry,
  TimetableEntry,
} from '../../types';

export interface IcsEvent {
  uid?: string;
  title: string;
  description: string;
  location: string;
  startDate: string;
  endDate: string;
  allDay: boolean;
  startTime?: string;
  endTime?: string;
  weeklyDay?: number;
}

export interface IcsParseResult {
  events: IcsEvent[];
  skipped: string[];
  warnings: string[];
}

export interface IcsExportEvent extends IcsEvent {
  id: string;
  source: 'class' | 'calendar' | 'deadline' | 'planner' | 'exam';
}

export interface IcsExportInput {
  timetable: TimetableEntry[];
  calendarEvents: CalendarEvent[];
  deadlines: Deadline[];
  planner: PlannerEntry[];
  exams: ExamTimetableEntry[];
}

const MAX_FILE_LENGTH = 5 * 1024 * 1024;
const MAX_EVENTS = 1000;
const DAY_CODES = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'] as const;
const DAY_INDEX: Record<(typeof DAY_CODES)[number], number> = {
  SU: 0,
  MO: 1,
  TU: 2,
  WE: 3,
  TH: 4,
  FR: 5,
  SA: 6,
};

interface Property {
  name: string;
  params: Record<string, string>;
  value: string;
}

function splitProperty(line: string): Property | null {
  const colon = line.indexOf(':');
  if (colon < 1) return null;
  const [name = '', ...parameterText] = line.slice(0, colon).split(';');
  const params: Record<string, string> = {};
  for (const part of parameterText) {
    const separator = part.indexOf('=');
    if (separator < 1) continue;
    params[part.slice(0, separator).toUpperCase()] = part
      .slice(separator + 1)
      .replace(/^"|"$/g, '');
  }
  return { name: name.toUpperCase(), params, value: line.slice(colon + 1) };
}

function unescapeText(value: string): string {
  return value.replace(/\\[nN]/g, '\n').replace(/\\([\\,;])/g, '$1');
}

function localParts(date: Date): { date: string; time: string } {
  return {
    date: dayKey(date),
    time: `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`,
  };
}

function parseDateTime(property: Property): { date: string; time?: string } {
  const value = property.value;
  const dateMatch = /^(\d{4})(\d{2})(\d{2})$/.exec(value);
  if (property.params.VALUE?.toUpperCase() === 'DATE' || dateMatch) {
    if (!dateMatch) throw new Error('Invalid all-day date.');
    const date = `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}`;
    if (!isResolvableDayKey(date)) throw new Error('Invalid all-day date.');
    return { date };
  }

  const match = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?(Z|[+-]\d{4})?$/.exec(value);
  if (!match) throw new Error('Invalid date-time value.');
  const [, year, month, day, hour, minute, second = '00', suffix = ''] = match;
  const input = `${year}-${month}-${day}`;
  const hhmm = `${hour}:${minute}`;
  if (!isResolvableDayKey(input) || toMinutes(hhmm) == null || Number(second) > 59)
    throw new Error('Invalid date-time value.');

  const zone = property.params.TZID;
  if (!suffix && !zone) return { date: input, time: hhmm };

  const naiveUtc = Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second),
  );
  if (suffix === 'Z') return localParts(new Date(naiveUtc));
  if (suffix) {
    const sign = suffix[0] === '+' ? 1 : -1;
    const offsetHours = Number(suffix.slice(1, 3));
    const offsetMinutes = Number(suffix.slice(3, 5));
    if (offsetHours > 23 || offsetMinutes > 59) throw new Error('Invalid UTC offset.');
    const offset = sign * (offsetHours * 60 + offsetMinutes);
    return localParts(new Date(naiveUtc - offset * 60_000));
  }

  try {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: zone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    });
    let candidate = naiveUtc;
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const values = Object.fromEntries(
        formatter.formatToParts(new Date(candidate)).map(({ type, value: part }) => [type, part]),
      );
      const rendered = Date.UTC(
        Number(values.year),
        Number(values.month) - 1,
        Number(values.day),
        Number(values.hour),
        Number(values.minute),
        Number(values.second),
      );
      const difference = naiveUtc - rendered;
      if (difference === 0) return localParts(new Date(candidate));
      candidate += difference;
    }
  } catch {
    throw new Error(`Unsupported or invalid timezone "${zone}".`);
  }
  throw new Error(`Unresolvable local time in timezone "${zone}".`);
}

function nextDate(day: number, from: Date): string {
  const offset = (day - from.getDay() + 7) % 7;
  return dayKey(new Date(from.getFullYear(), from.getMonth(), from.getDate() + offset));
}

function addLocalDays(date: string, amount: number): string {
  const [year, month, day] = date.split('-').map(Number);
  return dayKey(new Date(year!, month! - 1, day! + amount));
}

function parseRule(value: string, fallbackDay: number): number[] {
  const rule: Record<string, string> = {};
  for (const item of value.split(';')) {
    const separator = item.indexOf('=');
    if (separator < 1) continue;
    rule[item.slice(0, separator).toUpperCase()] = item.slice(separator + 1).toUpperCase();
  }
  if (Object.keys(rule).some((key) => !['FREQ', 'INTERVAL', 'BYDAY', 'WKST'].includes(key)))
    throw new Error('Unsupported weekly recurrence rule fields.');
  if (rule.FREQ !== 'WEEKLY' || (rule.INTERVAL !== undefined && rule.INTERVAL !== '1'))
    throw new Error('Only weekly recurrence without an interval is supported.');
  if (rule.COUNT || rule.UNTIL || rule.BYMONTH || rule.BYMONTHDAY || rule.BYWEEKNO)
    throw new Error('Bounded or complex weekly recurrence cannot be represented by a timetable.');
  const days = rule.BYDAY
    ? rule.BYDAY.split(',').map((code: string) => DAY_INDEX[code as keyof typeof DAY_INDEX])
    : [fallbackDay];
  if (days.length === 0 || days.some((day) => day === undefined))
    throw new Error('Unsupported weekly recurrence day.');
  return [...new Set(days)];
}

function parseEvent(properties: Property[], index: number, warnings: string[]): IcsEvent[] {
  const first = (name: string) => properties.find((property) => property.name === name);
  const start = first('DTSTART');
  if (!start) throw new Error('Missing DTSTART.');
  const startValue = parseDateTime(start);
  const title = unescapeText(first('SUMMARY')?.value ?? '').trim();
  if (!title) throw new Error('Missing SUMMARY.');
  const endProperty = first('DTEND');
  const endValue = endProperty ? parseDateTime(endProperty) : undefined;
  const allDay = startValue.time === undefined;
  if (endValue && (endValue.time === undefined) !== allDay)
    throw new Error('DTSTART and DTEND must both be all-day or timed.');
  const endDate = endValue?.date ?? (allDay ? addLocalDays(startValue.date, 1) : startValue.date);
  const endTime = endValue?.time;
  if (endDate < startValue.date || (allDay && endDate === startValue.date))
    throw new Error('DTEND is before or equal to DTSTART.');
  if (
    !allDay &&
    endDate === startValue.date &&
    endTime &&
    toMinutes(endTime) != null &&
    toMinutes(endTime)! <= toMinutes(startValue.time!)!
  )
    throw new Error('DTEND must be after DTSTART.');

  const uid = first('UID')?.value.trim() || undefined;
  const description = unescapeText(first('DESCRIPTION')?.value ?? '');
  const location = unescapeText(first('LOCATION')?.value ?? '');
  const base: IcsEvent = {
    ...(uid ? { uid } : {}),
    title,
    description,
    location,
    startDate: startValue.date,
    endDate,
    allDay,
    ...(startValue.time ? { startTime: startValue.time } : {}),
    ...(endTime ? { endTime } : {}),
  };

  const ignored = properties
    .filter(
      (property) =>
        ![
          'BEGIN',
          'END',
          'UID',
          'DTSTAMP',
          'DTSTART',
          'DTEND',
          'SUMMARY',
          'DESCRIPTION',
          'LOCATION',
          'RRULE',
          'STATUS',
          'TRANSP',
          'CLASS',
          'SEQUENCE',
          'CREATED',
          'LAST-MODIFIED',
          'ORGANIZER',
          'ATTENDEE',
          'CATEGORIES',
          'URL',
        ].includes(property.name),
    )
    .map((property) => property.name);
  if (ignored.length)
    warnings.push(
      `Event ${index}: ignored unsupported properties ${[...new Set(ignored)].join(', ')}.`,
    );

  const recurrence = first('RRULE');
  if (!recurrence) return [base];
  if (properties.some((property) => property.name === 'RDATE' || property.name === 'EXDATE'))
    throw new Error('Recurrence exception/addition dates are unsupported.');
  if (allDay || !startValue.time || !endTime)
    throw new Error('Weekly timetable recurrence must have timed DTSTART and DTEND.');
  if (endDate !== startValue.date)
    throw new Error('Multi-day recurrence cannot be represented by a weekly timetable.');
  const dayCodes = properties.filter((property) => property.name === 'RRULE');
  if (dayCodes.length !== 1) throw new Error('Multiple recurrence rules are unsupported.');
  const days = parseRule(recurrence.value, new Date(`${startValue.date}T12:00`).getDay());
  return days.map((weeklyDay) => ({ ...base, weeklyDay }));
}

export function parseIcs(input: string): IcsParseResult {
  if (input.length > MAX_FILE_LENGTH) throw new Error('ICS file exceeds the 5 MB import limit.');
  const unfolded = input.replace(/\r?\n[ \t]/g, '').split(/\r?\n/);
  if (
    !unfolded.some((line) => line.trim().toUpperCase() === 'BEGIN:VCALENDAR') ||
    !unfolded.some((line) => line.trim().toUpperCase() === 'END:VCALENDAR')
  )
    throw new Error('This file is not a complete iCalendar file (VCALENDAR).');

  const events: IcsEvent[] = [];
  const skipped: string[] = [];
  const warnings: string[] = [];
  let current: string[] | null = null;
  let sourceCount = 0;
  let malformedLine = false;

  for (const rawLine of unfolded) {
    const line = rawLine.trimEnd();
    if (!line) continue;
    const upper = line.toUpperCase();
    if (upper === 'BEGIN:VEVENT') {
      if (current) skipped.push(`Event ${sourceCount}: nested VEVENT was malformed.`);
      current = [];
      sourceCount += 1;
      if (sourceCount > MAX_EVENTS) throw new Error('ICS file contains more than 1,000 events.');
      malformedLine = false;
      continue;
    }
    if (upper === 'END:VEVENT') {
      if (!current) continue;
      if (malformedLine) {
        skipped.push(`Event ${sourceCount}: malformed property line.`);
      } else {
        try {
          events.push(
            ...parseEvent(
              current.map((entry) => splitProperty(entry)!),
              sourceCount,
              warnings,
            ),
          );
        } catch (error) {
          skipped.push(
            `Event ${sourceCount}: ${error instanceof Error ? error.message : 'unsupported event.'}`,
          );
        }
      }
      current = null;
      if (events.length > MAX_EVENTS) throw new Error('ICS file contains more than 1,000 events.');
      continue;
    }
    if (current) {
      if (!splitProperty(line)) malformedLine = true;
      else if (upper === 'BEGIN:VALARM') current.push('X-STUDYDESK-UNSUPPORTED-VALARM:ATTACHED');
      else if (!upper.startsWith('END:VALARM')) current.push(line);
    }
  }
  if (current) skipped.push(`Event ${sourceCount}: missing END:VEVENT.`);
  if (sourceCount === 0) throw new Error('This iCalendar file contains no VEVENT records.');
  return { events, skipped, warnings };
}

function escapeText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;');
}

function foldLine(line: string): string {
  const pieces: string[] = [];
  let current = '';
  let bytes = 0;
  for (const character of line) {
    const size = new TextEncoder().encode(character).length;
    if (bytes + size > 75) {
      pieces.push(current);
      current = ` ${character}`;
      bytes = size + 1;
    } else {
      current += character;
      bytes += size;
    }
  }
  pieces.push(current);
  return pieces.join('\r\n');
}

function toIcsDate(date: string): string {
  return date.replace(/-/g, '');
}

function toIcsDateTime(date: string, time: string): string {
  return `${toIcsDate(date)}T${time.replace(':', '')}00`;
}

function stamp(date: Date): string {
  return date
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '');
}

export function serializeIcs(events: IcsExportEvent[], generatedAt = new Date()): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//StudyDesk//Local Study Planner//EN',
    'CALSCALE:GREGORIAN',
  ];
  for (const event of events) {
    lines.push('BEGIN:VEVENT');
    lines.push(`UID:${escapeText(event.uid ?? `${event.id}@studydesk.local`)}`);
    lines.push(`DTSTAMP:${stamp(generatedAt)}`);
    if (event.allDay) {
      lines.push(`DTSTART;VALUE=DATE:${toIcsDate(event.startDate)}`);
      lines.push(`DTEND;VALUE=DATE:${toIcsDate(event.endDate)}`);
    } else {
      if (!event.startTime) throw new Error(`Timed event "${event.title}" has no start time.`);
      lines.push(`DTSTART:${toIcsDateTime(event.startDate, event.startTime)}`);
      if (event.endTime) lines.push(`DTEND:${toIcsDateTime(event.endDate, event.endTime)}`);
    }
    lines.push(`SUMMARY:${escapeText(event.title)}`);
    if (event.description) lines.push(`DESCRIPTION:${escapeText(event.description)}`);
    if (event.location) lines.push(`LOCATION:${escapeText(event.location)}`);
    if (event.source === 'class') {
      const day = event.weeklyDay;
      if (day == null) throw new Error(`Recurring class "${event.title}" has no weekday.`);
      lines.push(`RRULE:FREQ=WEEKLY;BYDAY=${DAY_CODES[day]}`);
    }
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return `${lines.map(foldLine).join('\r\n')}\r\n`;
}

export function collectIcsExportEvents(input: IcsExportInput, from = new Date()): IcsExportEvent[] {
  const result: IcsExportEvent[] = [];
  for (const entry of input.timetable) {
    result.push({
      id: `class:${entry.id}`,
      source: 'class',
      uid: `class-${entry.id}@studydesk.local`,
      title: entry.subject,
      description: entry.note,
      location: entry.room,
      startDate: nextDate(entry.day, from),
      endDate: nextDate(entry.day, from),
      startTime: entry.startTime,
      endTime: entry.endTime,
      allDay: false,
      weeklyDay: entry.day,
    });
  }
  for (const event of input.calendarEvents) {
    result.push({
      id: `calendar:${event.id}`,
      source: 'calendar',
      uid: event.uid,
      title: event.title,
      description: event.description,
      location: event.location,
      startDate: event.startDate,
      endDate: event.endDate,
      allDay: event.allDay,
      ...(event.startTime ? { startTime: event.startTime } : {}),
      ...(event.endTime ? { endTime: event.endTime } : {}),
    });
  }
  for (const deadline of input.deadlines) {
    result.push({
      id: `deadline:${deadline.id}`,
      source: 'deadline',
      title: deadline.title,
      description: [deadline.subject, deadline.description].filter(Boolean).join('\n'),
      location: '',
      startDate: deadline.dueDate,
      endDate: deadline.dueTime ? deadline.dueDate : addLocalDays(deadline.dueDate, 1),
      allDay: !deadline.dueTime,
      ...(deadline.dueTime ? { startTime: deadline.dueTime } : {}),
    });
  }
  for (const entry of input.planner) {
    result.push({
      id: `planner:${entry.id}`,
      source: 'planner',
      title: entry.title,
      description: entry.description,
      location: '',
      startDate: entry.date,
      endDate: addLocalDays(entry.date, 1),
      allDay: true,
    });
  }
  for (const exam of input.exams) {
    result.push({
      id: `exam:${exam.id}`,
      source: 'exam',
      title: exam.subject,
      description: exam.note,
      location: exam.room,
      startDate: exam.date,
      endDate: exam.date,
      startTime: exam.startTime,
      endTime: exam.endTime,
      allDay: false,
    });
  }
  return result;
}

export function icsDuplicateKey(event: IcsEvent): string {
  if (event.weeklyDay != null) {
    return [
      'weekly',
      event.title.trim().toLocaleLowerCase(),
      event.weeklyDay,
      event.startTime ?? '',
      event.endTime ?? '',
    ].join('|');
  }
  if (event.uid) return `uid|${event.uid}|${event.weeklyDay ?? ''}`;
  return [
    event.weeklyDay == null ? 'event' : `weekly-${event.weeklyDay}`,
    event.title.trim().toLocaleLowerCase(),
    event.startDate,
    event.startTime ?? 'all-day',
    event.endDate,
    event.endTime ?? '',
  ].join('|');
}
