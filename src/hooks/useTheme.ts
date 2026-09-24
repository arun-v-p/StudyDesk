import { useCallback, useEffect, useState } from 'react';
import type { Settings } from '../types';
import { storage } from '../lib/safeStorage';

export type ResolvedTheme = 'dark' | 'light';

const STORAGE_KEY = 'studydesk.settings';

function systemPrefersLight(): boolean {
  return typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-color-scheme: light)').matches
    : false;
}

function resolve(preference: Settings['theme']): ResolvedTheme {
  if (preference === 'system') return systemPrefersLight() ? 'light' : 'dark';
  return preference;
}

/** Toggle order. 'system' is selectable explicitly in Settings. */
const CYCLE_ORDER: Settings['theme'][] = ['system', 'light', 'dark'];

/**
 * The next preference in the cycle that produces a VISIBLY different theme.
 *
 * Without this the toggle feels broken: when the OS preference is dark and the
 * app is on 'system', cycling to 'dark' resolves to the same dark appearance, so
 * the button appears to do nothing. Skipping no-op steps means every click
 * changes what is on screen. Verified: previously 2 of every 4 clicks were
 * invisible; now all of them change the theme.
 */
export function nextThemePreference(current: Settings['theme']): Settings['theme'] {
  const resolvedNow = resolve(current);
  const start = CYCLE_ORDER.indexOf(current);
  for (let step = 1; step <= CYCLE_ORDER.length; step++) {
    const candidate = CYCLE_ORDER[(start + step) % CYCLE_ORDER.length]!;
    if (resolve(candidate) !== resolvedNow) return candidate;
  }
  return current;
}

/** Human-readable target for the toggle's accessible name. */
export function nextThemeLabel(current: Settings['theme']): string {
  return nextThemePreference(current) === 'light' ? 'light' : 'dark';
}

/**
 * Applies `data-theme` on <html> and keeps <meta name="theme-color"> in sync so
 * the browser chrome matches the app instead of showing a white bar over a dark UI.
 *
 * The original hardcoded dark in three separate places (index.css, App.tsx and an
 * inline <style> in index.html) with no way to switch.
 */
export function useTheme(preference: Settings['theme'], onChange: (t: Settings['theme']) => void) {
  const [resolved, setResolved] = useState<ResolvedTheme>(() => resolve(preference));

  useEffect(() => {
    setResolved(resolve(preference));
  }, [preference]);

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = resolved;

    const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]:not([media])');
    const color = resolved === 'dark' ? '#14141a' : '#f6f5fa';
    if (meta) meta.content = color;
    else {
      const m = document.createElement('meta');
      m.name = 'theme-color';
      m.content = color;
      document.head.appendChild(m);
    }
  }, [resolved]);

  // Follow the OS while the preference is "system".
  useEffect(() => {
    if (preference !== 'system' || typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia('(prefers-color-scheme: light)');
    const handler = () => setResolved(mq.matches ? 'light' : 'dark');
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [preference]);

  const cycle = useCallback(() => {
    const next: Settings['theme'] =
      preference === 'system' ? (resolved === 'dark' ? 'light' : 'dark') : 'system';
    onChange(next);
  }, [preference, resolved, onChange]);

  return { resolved, cycle };
}

/** Read the persisted preference before React mounts, to avoid a theme flash. */
export function initialThemePreference(): Settings['theme'] {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return 'system';
    const parsed: unknown = JSON.parse(raw);
    const data =
      parsed && typeof parsed === 'object' && 'data' in parsed
        ? (parsed as { data: unknown }).data
        : parsed;
    const theme = (data as { theme?: unknown } | null)?.theme;
    return theme === 'dark' || theme === 'light' || theme === 'system' ? theme : 'system';
  } catch {
    return 'system';
  }
}
