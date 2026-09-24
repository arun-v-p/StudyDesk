import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './theme.css';
import App from './App';
import { initialThemePreference } from './hooks/useTheme';
import { migrateLegacyKeys } from './store/legacyMigration';

/**
 * StrictMode is enabled deliberately. The original omitted it, which hid a real
 * defect: the Timer ran side effects inside a setState updater, and StrictMode
 * double-invokes updaters. That timer has been rewritten to be pure.
 *
 * The theme is applied before mount to avoid a light-to-dark flash.
 */
document.documentElement.dataset.theme =
  initialThemePreference() === 'system'
    ? window.matchMedia?.('(prefers-color-scheme: light)').matches
      ? 'light'
      : 'dark'
    : initialThemePreference();

/**
 * Migrate any data written by the previous build (flat `studydesk_*` keys) into
 * the namespaced, versioned keys this build uses. Runs before mount so the very
 * first render already sees the user's data instead of an empty app.
 */
migrateLegacyKeys();

function mount() {
  const container = document.getElementById('root');
  if (!container) {
    // Should be impossible, but a clear message beats a blank page.
    console.error('[studydesk] #root container not found — cannot mount');
    return;
  }

  // Replace the boot skeleton from index.html with the real app.
  container.innerHTML = '';

  createRoot(container).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

/**
 * Wait for the document before mounting.
 *
 * A `<script type="module">` is deferred by the browser, so it normally runs
 * after parsing. But the single-file preview build (`npm run build:preview`)
 * inlines the bundle into <head>, and any context that executes it eagerly —
 * or an injected/deferred loader — would otherwise hit a null `#root`. Checking
 * readyState costs nothing and removes the ordering assumption entirely.
 */
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', mount, { once: true });
} else {
  mount();
}
