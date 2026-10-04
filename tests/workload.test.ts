import { describe, expect, it } from 'vitest';
import type { Task } from '../src/types';
import {
  addFocusMinutes,
  isValidMinutes,
  migrateTaskData,
  remainingEstimate,
  taskCompletionPatch,
} from '../src/features/tasks/workload';

const task = (overrides: Partial<Task> = {}): Task => ({
  id: 'task-1',
  title: 'Read chapter',
  completed: false,
  createdAt: '2026-10-04T00:00:00.000Z',
  estimatedMinutes: 60,
  subtasks: [
    { id: 'one', title: 'Read notes', completed: true },
    { id: 'two', title: 'Answer questions', completed: false },
  ],
  ...overrides,
});

describe('task workload', () => {
  it('migrates legacy tasks with safe planning defaults', () => {
    expect(migrateTaskData([{ id: 'old', title: 'Existing task', completed: false }])).toEqual([
      { id: 'old', title: 'Existing task', completed: false, estimatedMinutes: 0, subtasks: [] },
    ]);
  });

  it('calculates remaining estimate from recorded task focus time without negative values', () => {
    expect(remainingEstimate(task({ actualFocusMinutes: 25 }))).toBe(35);
    expect(remainingEstimate(task({ actualFocusMinutes: 90 }))).toBe(0);
    expect(remainingEstimate(task({ estimatedMinutes: 0, actualFocusMinutes: 25 }))).toBeNull();
  });

  it('aggregates an attributed completed session once into the task total', () => {
    const afterOneSession = task({ actualFocusMinutes: 20 });
    expect(addFocusMinutes(afterOneSession, 25)).toBe(45);
    // The caller stores this returned value once per completion transition.
    expect(addFocusMinutes({ ...afterOneSession, actualFocusMinutes: 45 }, 0)).toBe(45);
  });

  it('completes remaining subtasks while preserving every subtask record', () => {
    const patch = taskCompletionPatch(task(), true);
    expect(patch.completed).toBe(true);
    expect(patch.subtasks).toEqual([
      { id: 'one', title: 'Read notes', completed: true },
      { id: 'two', title: 'Answer questions', completed: true },
    ]);
    expect(taskCompletionPatch(task({ completed: true }), false).subtasks).toBeUndefined();
  });

  it('accepts only bounded, non-negative whole-minute values', () => {
    expect(isValidMinutes(0)).toBe(true);
    expect(isValidMinutes(90)).toBe(true);
    expect(isValidMinutes(-1)).toBe(false);
    expect(isValidMinutes(1.5)).toBe(false);
    expect(isValidMinutes(525_601)).toBe(false);
  });
});
