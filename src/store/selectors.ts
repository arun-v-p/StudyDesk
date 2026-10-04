import { isResolvableDayKey } from '../lib/dates';
import type {
  Deadline,
  ExamTimetableEntry,
  Note,
  PlannerEntry,
  StudyMaterialFile,
  Task,
  TimetableEntry,
} from '../types';

export function selectActiveDeadlines(deadlines: Deadline[]): Deadline[] {
  return deadlines.filter(
    (deadline) => !deadline.completed && isResolvableDayKey(deadline.dueDate),
  );
}

export interface DataCounts {
  activeTasks: number;
  completedTasks: number;
  activeDeadlines: number;
  completedDeadlines: number;
  classes: number;
  notes: number;
  plannerEntries: number;
  exams: number;
  materialFiles: number;
}

export function selectDataCounts(data: {
  tasks: Task[];
  deadlines: Deadline[];
  timetable: TimetableEntry[];
  notes: Note[];
  planner: PlannerEntry[];
  exams: ExamTimetableEntry[];
  materialFiles: StudyMaterialFile[];
}): DataCounts {
  const tasks = data.tasks.reduce(
    (counts, task) => {
      counts[task.completed ? 'completedTasks' : 'activeTasks'] += 1;
      return counts;
    },
    { activeTasks: 0, completedTasks: 0 },
  );
  const deadlines = data.deadlines.reduce(
    (counts, deadline) => {
      counts[deadline.completed ? 'completedDeadlines' : 'activeDeadlines'] += 1;
      return counts;
    },
    { activeDeadlines: 0, completedDeadlines: 0 },
  );
  return {
    ...tasks,
    ...deadlines,
    classes: data.timetable.length,
    notes: data.notes.length,
    plannerEntries: data.planner.length,
    exams: data.exams.length,
    materialFiles: data.materialFiles.length,
  };
}
