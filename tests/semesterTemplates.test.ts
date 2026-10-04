import { describe, expect, it, vi } from 'vitest';
import {
  applySemesterTemplate,
  createSemesterTemplate,
  refreshSemesterTemplate,
  renameSemesterTemplate,
  validateTemplateName,
} from '../src/features/semester/semesterTemplates';
import type { SemesterTemplate, TimetableEntry } from '../src/types';

const entries: TimetableEntry[] = [
  {
    id: 'class-1',
    day: 1,
    startTime: '09:00',
    endTime: '10:00',
    subject: 'Physics',
    room: 'B-1',
    note: 'Lecture',
  },
  {
    id: 'class-2',
    day: 3,
    startTime: '12:00',
    endTime: '13:00',
    subject: 'Chemistry',
    room: '',
    note: '',
  },
];

describe('semester timetable templates', () => {
  it('creates a detached snapshot and validates names case-insensitively', () => {
    const template = createSemesterTemplate('template-1', '  Autumn 2026  ', entries, 'now');
    expect(template).toMatchObject({ name: 'Autumn 2026', createdAt: 'now', updatedAt: 'now' });
    expect(template.timetable).toEqual(entries.map(({ id: _id, ...entry }) => entry));
    expect(validateTemplateName(' autumn 2026 ', [template])).toMatch(/already exists/i);
    expect(validateTemplateName('   ', [])).toMatch(/enter/i);
    expect(validateTemplateName('x'.repeat(61), [])).toMatch(/60 characters/i);
    expect(validateTemplateName('Spring 2027', [template])).toBeNull();
  });

  it('selectively applies to a new semester without mutating the template or prior term', () => {
    const template = createSemesterTemplate('template-1', 'Autumn', entries, 'created');
    const oldSemester = [entries[0]!];
    const createId = vi.fn(() => 'new-class');
    const result = applySemesterTemplate(template, oldSemester, [1], 'replace', createId);
    expect(result).toMatchObject({ added: 1, skippedDuplicates: 0 });
    expect(result.items).toEqual([{ ...template.timetable[1], id: 'new-class' }]);
    expect(oldSemester).toEqual([entries[0]]);
    expect(template.timetable).toHaveLength(2);
  });

  it('appends selected entries but avoids exact duplicates and can refresh or rename a snapshot', () => {
    const template = createSemesterTemplate('template-1', 'Autumn', entries, 'created');
    const appended = applySemesterTemplate(template, [entries[0]!], [0, 1], 'append', () => 'new');
    expect(appended).toMatchObject({ added: 1, skippedDuplicates: 1 });
    expect(appended.items).toHaveLength(2);

    const changed = renameSemesterTemplate(template, 'Autumn term', 'renamed');
    expect(changed.name).toBe('Autumn term');
    expect(changed.updatedAt).toBe('renamed');
    expect(changed.timetable).toEqual(template.timetable);

    const refreshed = refreshSemesterTemplate(template, [entries[1]!], 'refreshed');
    expect(refreshed.timetable).toEqual([{ ...template.timetable[1] }]);
    expect(refreshed.updatedAt).toBe('refreshed');
    expect(template.timetable).toHaveLength(2);
  });

  it('accepts a stored template shape suitable for backup round-tripping', () => {
    const template: SemesterTemplate = createSemesterTemplate(
      'template-1',
      'Autumn',
      entries,
      '2026-10-01T00:00:00.000Z',
    );
    expect(template.timetable.every((entry) => !('id' in entry))).toBe(true);
  });
});
