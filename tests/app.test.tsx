import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../src/App';
import { SEED_KEYS, loadSampleTerm } from '../src/store/seed';

beforeEach(() => {
  localStorage.clear();
  // HashRouter state lives on window.location, which jsdom carries across tests
  // in a file. Without this reset, a test that navigated to #/notes leaves every
  // later test starting on the Notes route.
  window.location.hash = '';
});

/**
 * Integration coverage for defects the audit found in the shipped build:
 * no error boundary, no routing, hover-only actions, unnamed icon buttons and
 * a bare-sentence first-run screen.
 */
const h1 = (name: RegExp | string) => screen.findByRole('heading', { level: 1, name });

describe('App shell', () => {
  it('renders the shell and navigates by route', async () => {
    const user = userEvent.setup();
    render(<App />);
    await h1(/^today$/i);

    await user.click(screen.getByRole('link', { name: /^notes/i }));
    // The Notes route is lazy, so wait for the chunk.
    await h1(/^notes$/i);
    expect(window.location.hash).toBe('#/notes');
  });

  it('marks the active nav item with aria-current', async () => {
    const user = userEvent.setup();
    render(<App />);
    await h1(/^today$/i);
    await user.click(screen.getByRole('link', { name: /^deadlines/i }));
    await h1(/^deadlines$/i);
    expect(screen.getByRole('link', { name: /^deadlines/i })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByRole('link', { name: /^today$/i })).not.toHaveAttribute('aria-current');
  });

  it('shows a first-run empty state with a call to action, not a bare sentence', async () => {
    render(<App />);
    await h1(/^today$/i);
    expect(await screen.findByRole('heading', { name: /your day is clear/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /add a deadline/i })).toBeInTheDocument();
    // The exact strings the live build shows today.
    expect(screen.queryByText(/no pending tasks\. add one above\./i)).not.toBeInTheDocument();
  });

  it('gives every icon-only button an accessible name', async () => {
    render(<App />);
    await h1(/^today$/i);
    const unnamed = screen
      .getAllByRole('button')
      .filter(
        (b) => b.querySelector('svg') && !b.textContent?.trim() && !b.getAttribute('aria-label'),
      );
    expect(unnamed.map((b) => b.outerHTML.slice(0, 80))).toEqual([]);
  });

  it('never suppresses the focus ring with focus:outline-none', async () => {
    // The audited build applied this to 19 inputs, breaking keyboard navigation.
    render(<App />);
    await h1(/^today$/i);
    for (const el of document.querySelectorAll('input, textarea, select, button, a')) {
      expect(el.className, el.outerHTML.slice(0, 90)).not.toMatch(/focus:outline-none/);
    }
  });

  it('labels every form control with a real <label>', async () => {
    render(<App />);
    await h1(/^today$/i);
    for (const el of document.querySelectorAll('input, textarea, select')) {
      const id = el.getAttribute('id');
      const label =
        el.getAttribute('aria-label') || (id && document.querySelector(`label[for="${id}"]`));
      expect(label, el.outerHTML.slice(0, 90)).toBeTruthy();
    }
  });
});

describe('data seeding', () => {
  it('populates every panel from the sample term', async () => {
    loadSampleTerm('replace', true);
    const user = userEvent.setup();
    render(<App />);
    await h1(/^today$/i);

    expect(screen.queryByText(/no classes scheduled/i)).not.toBeInTheDocument();
    const classes = screen.getAllByText(
      /thermodynamics|linear algebra|study group|materials science/i,
    );
    expect(classes.length).toBeGreaterThan(0);

    await user.click(screen.getByRole('link', { name: /^deadlines/i }));
    await h1(/^deadlines$/i);
    // Every urgency group renders, which is impossible on an empty store.
    expect(await screen.findByRole('heading', { name: /^overdue/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /^due today/i })).toBeInTheDocument();
  });

  it('survives malformed localStorage that white-screened the shipped build', async () => {
    // §2.2: 9 of 12 malformed payloads blanked the deployed bundle permanently.
    for (const key of Object.values(SEED_KEYS)) localStorage.setItem(key, '{}');
    localStorage.setItem('studydesk.notes', 'null');
    localStorage.setItem('studydesk.tasks', '[{"id":"t1","title":"x","completed":fal');

    expect(() => render(<App />)).not.toThrow();
    await h1(/^today$/i);
    // RTL mounts into its own container rather than #root, so assert on the body.
    expect(document.body.textContent?.trim().length ?? 0).toBeGreaterThan(20);
  });
});

describe('timetable rendering', () => {
  it('renders the classes the shipped grid hid', async () => {
    loadSampleTerm('replace', true);
    const user = userEvent.setup();
    render(<App />);
    await h1(/^today$/i);

    await user.click(screen.getByRole('link', { name: /^timetable/i }));
    const grid = await screen.findByLabelText(/weekly class timetable/i);

    const labels = Array.from(grid.querySelectorAll('[aria-label]')).map(
      (b) => b.getAttribute('aria-label') ?? '',
    );
    expect(labels.some((l) => l.includes('09:30'))).toBe(true); // half-hour start
    expect(labels.some((l) => l.includes('11:00 to 13:00'))).toBe(true); // multi-hour span
    expect(labels.some((l) => l.includes('07:30'))).toBe(true); // before the old 08:00 window
    expect(labels.some((l) => l.includes('20:30'))).toBe(true); // after the old 20:00 window
    // Overlapping pair both reachable — the old `find()` made the second invisible.
    expect(labels.filter((l) => l.includes('Thermodynamics')).length).toBeGreaterThanOrEqual(2);
  });

  it('retains focus while typing in text and time fields', async () => {
    const user = userEvent.setup();
    render(<App />);
    await h1(/^today$/i);

    await user.click(screen.getByRole('link', { name: /^timetable/i }));
    await screen.findByRole('heading', { level: 1, name: /^timetable$/i });
    await user.click(screen.getByRole('button', { name: /add class/i }));

    const subject = screen.getByRole('textbox', { name: /Subject/ });
    await user.type(subject, 'Math');
    expect(subject).toHaveValue('Math');
    expect(subject).toHaveFocus();

    const starts = screen.getByLabelText(/Starts/);
    await user.clear(starts);
    await user.type(starts, '10:30');
    expect(starts).toHaveValue('10:30');
    expect(starts).toHaveFocus();
  });
});

describe('theme cycling', () => {
  it('never offers a preference that resolves to the current appearance', async () => {
    const { nextThemePreference } = await import('../src/hooks/useTheme');
    // With no OS light preference, matchMedia().matches is false -> system resolves dark.
    // So cycling from 'system' must skip 'dark' (same appearance) and land on 'light'.
    expect(nextThemePreference('system')).toBe('light');
    expect(nextThemePreference('dark')).toBe('light');
    expect(nextThemePreference('light')).toBe('dark');
  });

  it('changes the applied theme on every click', async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole('heading', { level: 1, name: /^today$/i });

    const toggle = () =>
      screen.getAllByRole('button').find((b) => /theme/i.test(b.getAttribute('aria-label') ?? ''));
    const seen: string[] = [document.documentElement.dataset.theme ?? ''];
    for (let i = 0; i < 4; i++) {
      await user.click(toggle()!);
      seen.push(document.documentElement.dataset.theme ?? '');
    }
    // Every consecutive pair must differ — no dead clicks.
    for (let i = 1; i < seen.length; i++) {
      expect(seen[i], `click ${i} produced no visible change: ${seen.join(' -> ')}`).not.toBe(
        seen[i - 1],
      );
    }
  });
});
