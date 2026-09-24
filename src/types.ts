/** Domain model. Every collection is stored as an array under a `studydesk.*` key. */

export type Priority = 'low' | 'medium' | 'high';
export type Category = 'personal' | 'academic' | 'work' | 'health';

export interface Task {
  id: string;
  title: string;
  completed: boolean;
  /** Local yyyy-MM-dd. Absent means "no specific day" (inbox). */
  dueDate?: string;
  createdAt: string;
  completedAt?: string;
}

export interface Deadline {
  id: string;
  title: string;
  subject: string;
  description: string;
  /** Local yyyy-MM-dd. Never derive this from toISOString(). */
  dueDate: string;
  /** HH:mm, 24h. Empty string means "all day". */
  dueTime: string;
  priority: Priority;
  completed: boolean;
  createdAt: string;
}

export interface TimetableEntry {
  id: string;
  /** 0=Sun … 6=Sat, matching Date#getDay(). */
  day: number;
  startTime: string; // HH:mm
  endTime: string; // HH:mm
  subject: string;
  room: string;
  note: string;
}

export interface ExamTimetableEntry {
  id: string;
  subject: string;
  date: string;
  startTime: string;
  endTime: string;
  room: string;
  note: string;
  validFrom: string;
  validUntil: string;
}

export interface StudyMaterialSubject {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface StudyMaterialFolder {
  id: string;
  subjectId: string;
  name: string;
  parentFolderId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface StudyMaterialFile {
  id: string;
  subjectId: string;
  folderId: string | null;
  blobId: string;
  name: string;
  kind: 'pdf' | 'txt' | 'md' | 'docx';
  mimeType: string;
  sizeBytes: number;
  lastModified: number;
  createdAt: string;
  updatedAt: string;
}

export interface Note {
  id: string;
  title: string;
  content: string;
  tags: string[];
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PlannerEntry {
  id: string;
  /** Local yyyy-MM-dd. */
  date: string;
  title: string;
  description: string;
  category: Category;
}

export interface Settings {
  displayName: string;
  theme: 'dark' | 'light' | 'system';
  weekStartsOn: 0 | 1;
}

export const PRIORITIES: readonly Priority[] = ['low', 'medium', 'high'] as const;
export const CATEGORIES: readonly Category[] = ['personal', 'academic', 'work', 'health'] as const;

export const DEFAULT_SETTINGS: Settings = {
  displayName: '',
  theme: 'system',
  weekStartsOn: 1,
};
