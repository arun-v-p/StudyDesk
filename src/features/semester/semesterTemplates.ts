import type { SemesterTemplate, TimetableEntry } from '../../types';

export type TimetableTemplateEntry = Omit<TimetableEntry, 'id'>;

export function validateTemplateName(
  value: string,
  existing: SemesterTemplate[],
  editingId?: string,
): string | null {
  const name = value.trim();
  if (!name) return 'Enter a template name.';
  if (name.length > 60) return 'Template names must be 60 characters or fewer.';
  if (
    existing.some(
      (template) =>
        template.id !== editingId &&
        template.name.trim().toLocaleLowerCase() === name.toLocaleLowerCase(),
    )
  )
    return 'A template with that name already exists.';
  return null;
}

function snapshot(entries: TimetableEntry[]): TimetableTemplateEntry[] {
  return entries.map(({ day, startTime, endTime, subject, room, note }) => ({
    day,
    startTime,
    endTime,
    subject,
    room,
    note,
  }));
}

export function createSemesterTemplate(
  id: string,
  name: string,
  entries: TimetableEntry[],
  now = new Date().toISOString(),
): SemesterTemplate {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Enter a template name.');
  return {
    id,
    name: trimmed,
    timetable: snapshot(entries),
    createdAt: now,
    updatedAt: now,
  };
}

export function renameSemesterTemplate(
  template: SemesterTemplate,
  name: string,
  now = new Date().toISOString(),
): SemesterTemplate {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Enter a template name.');
  return { ...template, name: trimmed, updatedAt: now };
}

export function refreshSemesterTemplate(
  template: SemesterTemplate,
  entries: TimetableEntry[],
  now = new Date().toISOString(),
): SemesterTemplate {
  return { ...template, timetable: snapshot(entries), updatedAt: now };
}

function signature(entry: TimetableTemplateEntry): string {
  return [
    entry.day,
    entry.startTime,
    entry.endTime,
    entry.subject.trim().toLocaleLowerCase(),
    entry.room.trim().toLocaleLowerCase(),
    entry.note.trim().toLocaleLowerCase(),
  ].join('|');
}

export function applySemesterTemplate(
  template: SemesterTemplate,
  current: TimetableEntry[],
  selectedIndexes: number[],
  mode: 'append' | 'replace',
  createId: () => string,
): { items: TimetableEntry[]; added: number; skippedDuplicates: number } {
  const selected = [...new Set(selectedIndexes)]
    .filter((index) => Number.isInteger(index) && index >= 0 && index < template.timetable.length)
    .map((index) => template.timetable[index]!);
  const base = mode === 'replace' ? [] : [...current];
  const existing = new Set(base.map(signature));
  let skippedDuplicates = 0;
  const additions: TimetableEntry[] = [];
  for (const entry of selected) {
    const key = signature(entry);
    if (existing.has(key)) {
      skippedDuplicates += 1;
      continue;
    }
    existing.add(key);
    additions.push({ ...entry, id: createId() });
  }
  return { items: [...base, ...additions], added: additions.length, skippedDuplicates };
}
