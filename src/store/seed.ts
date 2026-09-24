/**
 * StudyDesk — sample data seeder
 *
 * WHY THIS EXISTS
 * ---------------
 * A fresh visitor to https://arun-v-p.github.io/StudyDesk/ currently sees a
 * near-black page containing four grey sentences:
 *
 *     "No pending tasks. Add one above."
 *     "No upcoming deadlines."
 *     "No classes today."
 *
 * Every panel is empty, so no feature is visible and the app reads as broken or
 * unfinished. That is the first impression for anyone you send the link to —
 * including anyone evaluating it as a portfolio piece.
 *
 * Seeding a realistic term on first run fixes that instantly: the timetable
 * fills with colour-coded blocks, deadlines group into Overdue / Today /
 * Tomorrow, the calendar shows dots, notes populate, and the Today dashboard
 * has something to summarise.
 *
 * IMPORTANT — dates are generated RELATIVE TO TODAY, so the demo always looks
 * current. Hardcoded dates go stale within a week and are worse than nothing.
 *
 * WIRING
 * ------
 *   1. Call `maybeOfferSample()` once from App.tsx on mount. It shows a
 *      dismissible prompt rather than silently writing to the user's storage —
 *      never surprise someone by populating their planner.
 *   2. Wire `loadSampleTerm()` to a "Load sample term" button in the empty
 *      states and in Settings.
 *   3. `clearAllData()` belongs next to it, behind a ConfirmDialog.
 *
 * These write the CURRENT (unversioned) storage format — plain arrays under
 * `studydesk_*` keys — so they also work against the deployed build today.
 * If you adopt fixes/usePersistentState.ts, switch to `writeEnvelope()` below;
 * its migration path accepts both shapes.
 */

import type { Deadline, Note, PlannerEntry, Task, TimetableEntry } from '../types';
import { dayKey, dayKeyOffset } from '../lib/dates';
import { storage } from '../lib/safeStorage';

export const SEED_KEYS = {
  tasks: 'studydesk.tasks',
  deadlines: 'studydesk.deadlines',
  timetable: 'studydesk.timetable',
  notes: 'studydesk.notes',
  planner: 'studydesk.planner',
} as const;

/* -------------------------------------------------------------------------- */
/* Date helpers — LOCAL, never toISOString() (see AUDIT.md §2.6)                */
/* -------------------------------------------------------------------------- */

/** Local date `offsetDays` from today. Delegates to lib/dates so there is one implementation. */
export function dayFromToday(offsetDays: number, now = new Date()): string {
  return dayKeyOffset(offsetDays, now);
}

export { dayKey as localDateKey };

let counter = 0;
/** Deterministic, collision-free id without pulling in `uuid`. */
export function sampleId(prefix: string): string {
  counter += 1;
  return `sample-${prefix}-${counter.toString(36)}-${Date.now().toString(36)}`;
}

/* -------------------------------------------------------------------------- */
/* Seed content                                                                */
/* -------------------------------------------------------------------------- */

export function buildSampleTasks(now = new Date()): Task[] {
  const iso = now.toISOString();
  const rows: [string, boolean][] = [
    ['Revise Chapter 4 — Fluid Mechanics', true],
    ['Submit lab report (heat exchanger)', false],
    ['Problem set 7 — Numerical Methods', false],
    ['Read paper on heat transfer coefficients', false],
    ['Email supervisor about project scope', false],
    ['Print and annotate lecture 12 slides', true],
    ['Book library study room for Friday', false],
    ['Draft dissertation outline', false],
  ];
  return rows.map(([title, completed]) => ({
    id: sampleId('task'),
    title,
    completed,
    createdAt: iso,
  }));
}

/**
 * Spread across overdue / today / tomorrow / upcoming so every group in
 * Deadlines.tsx renders — which is exactly what a fresh visitor cannot see now.
 */
export function buildSampleDeadlines(now = new Date()): Deadline[] {
  const iso = now.toISOString();
  const rows: [string, string, string, number, string, Deadline['priority'] | 'done'][] = [
    [
      'Thermodynamics Assignment 3',
      'ME-301',
      'Entropy generation in a nozzle — show all steps.',
      -2,
      '17:00',
      'high',
    ],
    [
      'Numerical Methods — Problem Set 7',
      'MA-204',
      'Gauss–Seidel vs Jacobi convergence comparison.',
      0,
      '23:59',
      'high',
    ],
    [
      'Lab report — Heat exchanger',
      'ME-311',
      'Include the LMTD correction factor derivation.',
      1,
      '12:00',
      'medium',
    ],
    [
      'Materials Science quiz',
      'ME-210',
      'Chapters 5–7: phase diagrams and diffusion.',
      3,
      '09:30',
      'medium',
    ],
    [
      'Engineering Ethics essay',
      'HS-102',
      '1,500 words on the Bhopal case study.',
      6,
      '18:00',
      'low',
    ],
    [
      'Dissertation proposal draft',
      'ME-401',
      'Submit to supervisor for first-round comments.',
      12,
      '17:00',
      'high',
    ],
    [
      'Fluid Mechanics tutorial sheet',
      'ME-205',
      'Optional but will appear in the midterm.',
      -5,
      '12:00',
      'done',
    ],
  ];

  return rows.map(([title, subject, description, offset, dueTime, priority]) => ({
    id: sampleId('dl'),
    title,
    subject,
    description,
    dueDate: dayFromToday(offset, now),
    dueTime,
    priority: priority === 'done' ? 'medium' : priority,
    completed: priority === 'done',
    createdAt: iso,
  }));
}

/**
 * Deliberately includes the cases the shipped Timetable.tsx CANNOT render —
 * :15 and :30 starts, a 2-hour span, an overlapping pair, and entries outside
 * the hardcoded 08:00–20:00 window. Seeding these makes the §2.1 bug visible
 * immediately, which is the fastest way to confirm the fix worked.
 */
export function buildSampleTimetable(): TimetableEntry[] {
  const rows: [number, string, string, string, string, string][] = [
    [1, '09:00', '10:30', 'Linear Algebra', 'A-101', 'Bring the problem set'],
    [1, '14:00', '15:30', 'Thermodynamics', 'B-204', ''],
    [
      2,
      '09:30',
      '11:00',
      'Numerical Methods',
      'C-12',
      'Half-past start — invisible in the shipped build',
    ],
    [2, '11:00', '13:00', 'Materials Science Lab', 'L-3', 'Two-hour span'],
    [3, '07:30', '08:30', 'Study Group', 'Library', 'Before the 08:00 window edge'],
    [3, '13:15', '14:45', 'Fluid Mechanics', 'A-205', ':15 start — invisible in the shipped build'],
    [4, '10:00', '12:00', 'Engineering Drawing', 'D-1', ''],
    [
      4,
      '11:00',
      '12:30',
      'Thermodynamics',
      'B-204',
      'Overlaps Drawing — unreachable in the shipped build',
    ],
    [5, '09:00', '10:00', 'Linear Algebra', 'A-101', ''],
    [5, '15:00', '16:30', 'Numerical Methods', 'C-12', ''],
    [6, '20:30', '21:30', 'Study Group', 'Online', 'After the 20:00 window edge'],
  ];
  return rows.map(([day, startTime, endTime, subject, room, note]) => ({
    id: sampleId('tt'),
    day,
    startTime,
    endTime,
    subject,
    room,
    note,
  }));
}

export function buildSampleNotes(now = new Date()): Note[] {
  const rows: [string, string, boolean, number][] = [
    [
      'Carnot cycle — key relations',
      'η = 1 − T_c / T_h\n\nEfficiency depends ONLY on the reservoir temperatures, never on the working fluid. That is why no real engine can beat a Carnot engine operating between the same two reservoirs.\n\nRemember: temperatures in Kelvin, always.',
      true,
      -0.08,
    ],
    [
      'Gauss elimination cheatsheet',
      'Forward elimination → O(n³/3)\nBack substitution  → O(n²/3)\n\nPartial pivoting avoids divide-by-zero and reduces round-off. Always pick the largest magnitude entry in the column.',
      false,
      -1.2,
    ],
    [
      "Questions for Friday's tutorial",
      '1. When does the Dittus–Boelter correlation break down?\n2. Sign convention for work done ON the system vs BY the system.\n3. Is the entrance region effect significant at Re = 10⁴?',
      false,
      -3.5,
    ],
    [
      'Dissertation — working title ideas',
      '• Optimising heat exchanger geometry with a genetic algorithm\n• CFD validation of LMTD corrections under off-design flow\n• Surrogate modelling for rapid thermal network sizing',
      false,
      -6.1,
    ],
  ];
  return rows.map(([title, content, pinned, daysAgo]) => {
    const created = new Date(now.getTime() + daysAgo * 86_400_000).toISOString();
    return {
      id: sampleId('note'),
      title,
      content,
      tags: [],
      pinned,
      createdAt: created,
      updatedAt: created,
    };
  });
}

export function buildSamplePlanner(now = new Date()): PlannerEntry[] {
  const rows: [number, string, string, PlannerEntry['category']][] = [
    [0, 'Gym — upper body', '18:30, 45 minutes', 'health'],
    [0, "Review today's lecture notes", 'Before sleep — 20 minutes', 'academic'],
    [1, 'Call home', '', 'personal'],
    [2, 'Study group — Numerical Methods', 'Library, 16:00', 'academic'],
    [4, 'Part-time shift', '17:00–21:00', 'work'],
    [6, 'Meal prep for the week', '', 'health'],
    [9, 'Dissertation reading block', 'Two papers, deep work', 'academic'],
    [13, 'Submit dissertation proposal', 'Deadline is the same day', 'academic'],
  ];
  return rows.map(([offset, title, description, category]) => ({
    id: sampleId('plan'),
    date: dayFromToday(offset, now),
    title,
    description,
    category,
  }));
}

/* -------------------------------------------------------------------------- */
/* Write / clear                                                               */
/* -------------------------------------------------------------------------- */

/** Plain-array format — what the deployed build reads today. */
function writeRaw(key: string, value: unknown): boolean {
  // storage.setItem swallows the throw and reports persistence failure.
  return storage.setItem(key, JSON.stringify(value));
}

/**
 * Envelope format for fixes/usePersistentState.ts. Its `migrate()` accepts both
 * this and the plain-array shape, so switching over later is safe.
 */
function writeEnvelope(key: string, value: unknown, schemaVersion = 1): boolean {
  return writeRaw(key, { v: schemaVersion, data: value });
}

export interface SeedResult {
  ok: boolean;
  counts: Record<string, number>;
}

/**
 * Populate every collection with a realistic term.
 *
 * @param mode 'replace' overwrites existing data (use behind a ConfirmDialog);
 *             'merge' only fills collections that are currently empty, so a
 *             user who has already added a few things keeps them.
 */
export function loadSampleTerm(
  mode: 'replace' | 'merge' = 'replace',
  envelope = false,
): SeedResult {
  const now = new Date();
  const write = envelope ? writeEnvelope : writeRaw;

  const collections: [string, unknown[]][] = [
    [SEED_KEYS.tasks, buildSampleTasks(now)],
    [SEED_KEYS.deadlines, buildSampleDeadlines(now)],
    [SEED_KEYS.timetable, buildSampleTimetable()],
    [SEED_KEYS.notes, buildSampleNotes(now)],
    [SEED_KEYS.planner, buildSamplePlanner(now)],
  ];

  const counts: Record<string, number> = {};
  let ok = true;

  for (const [key, items] of collections) {
    if (mode === 'merge' && hasData(key)) {
      counts[key] = -1; // skipped
      continue;
    }
    if (!write(key, items)) ok = false;
    counts[key] = items.length;
  }

  return { ok, counts };
}

/** True when a key holds a non-empty array. */
export function hasData(key: string): boolean {
  try {
    const raw = storage.getItem(key);
    if (!raw) return false;
    const parsed: unknown = JSON.parse(raw);
    const value = Array.isArray(parsed)
      ? parsed
      : parsed && typeof parsed === 'object' && 'data' in parsed
        ? (parsed as { data: unknown }).data
        : null;
    return Array.isArray(value) && value.length > 0;
  } catch {
    return false;
  }
}

/** True when the whole app is empty — i.e. this is a first run. */
export function isFirstRun(): boolean {
  return !Object.values(SEED_KEYS).some(hasData);
}

export function clearAllData(): void {
  for (const key of Object.values(SEED_KEYS)) {
    try {
      storage.removeItem(key);
    } catch (err) {
      console.error(`[studydesk] could not clear "${key}"`, err);
    }
  }
}

/* -------------------------------------------------------------------------- */
/* First-run prompt                                                            */
/* -------------------------------------------------------------------------- */

const DISMISSED_KEY = 'studydesk.sampleDismissed';

/**
 * Returns true once, the first time a visitor arrives with no data and having
 * not previously dismissed the offer. Render a small banner from App.tsx:
 *
 *   const [offer, setOffer] = useState(maybeOfferSample);
 *   …
 *   {offer && <SampleBanner onAccept={() => { loadSampleTerm(); setOffer(false); }}
 *                           onDismiss={() => { dismissSample(); setOffer(false); }} />}
 *
 * It never writes without consent.
 */
export function maybeOfferSample(): boolean {
  try {
    if (storage.getItem(DISMISSED_KEY)) return false;
    return isFirstRun();
  } catch {
    return false;
  }
}

export function dismissSample(): void {
  try {
    storage.setItem(DISMISSED_KEY, new Date().toISOString());
  } catch {
    /* non-fatal */
  }
}
