import type { Task, TaskSubtask } from '../../types';

/** One year is a generous but finite guardrail for persisted numeric input. */
export const MAX_TASK_MINUTES = 525_600;

export function isValidMinutes(value: unknown): value is number {
  return (
    typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= MAX_TASK_MINUTES
  );
}

export function completedSubtasks(subtasks: TaskSubtask[]): number {
  return subtasks.filter((subtask) => subtask.completed === true).length;
}

export function remainingEstimate(task: Task): number | null {
  if (task.estimatedMinutes <= 0) return null;
  return Math.max(0, task.estimatedMinutes - (task.actualFocusMinutes ?? 0));
}

/** Session attribution increments the same stored total shown in task workload. */
export function addFocusMinutes(task: Task, minutes: number): number {
  return (task.actualFocusMinutes ?? 0) + minutes;
}

/** Completing a parent also completes its remaining children; reopening preserves child state. */
export function taskCompletionPatch(task: Task, completed: boolean): Partial<Task> {
  return {
    completed,
    ...(completed ? { completedAt: new Date().toISOString() } : { completedAt: undefined }),
    ...(completed
      ? { subtasks: task.subtasks.map((subtask) => ({ ...subtask, completed: true })) }
      : {}),
  };
}

export function taskWorkloadLabel(task: Task): string {
  const parts = [
    task.estimatedMinutes > 0 ? `${task.estimatedMinutes}m estimated` : 'No estimate',
    `${task.actualFocusMinutes ?? 0}m focused`,
  ];
  const remaining = remainingEstimate(task);
  if (remaining != null) parts.push(`${remaining}m remaining`);
  if (task.subtasks.length > 0) {
    parts.push(`${completedSubtasks(task.subtasks)}/${task.subtasks.length} subtasks`);
  }
  return parts.join(' · ');
}

/** Repairs legacy task rows without changing their existing title/completion behaviour. */
export function migrateTaskData(data: unknown): unknown {
  if (!Array.isArray(data)) return data;
  return data.map((item) => {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) return item;
    const task = item as Record<string, unknown>;
    const rawSubtasks = Array.isArray(task.subtasks) ? task.subtasks : [];
    return {
      ...task,
      estimatedMinutes: isValidMinutes(task.estimatedMinutes) ? task.estimatedMinutes : 0,
      ...(isValidMinutes(task.actualFocusMinutes)
        ? { actualFocusMinutes: task.actualFocusMinutes }
        : {}),
      subtasks: rawSubtasks
        .filter(
          (subtask): subtask is Record<string, unknown> =>
            typeof subtask === 'object' && subtask !== null && !Array.isArray(subtask),
        )
        .filter((subtask) => typeof subtask.id === 'string' && typeof subtask.title === 'string')
        .map((subtask) => ({
          id: subtask.id as string,
          title: subtask.title as string,
          completed: subtask.completed === true,
        })),
    };
  });
}
