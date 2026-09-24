import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// Explicit cleanup: without it, consecutive renders accumulate in the document
// and role queries match multiple elements.
afterEach(() => {
  cleanup();
  localStorage.clear();
});

// jsdom lacks these; the app uses both.
if (typeof window !== 'undefined') {
  if (!window.matchMedia) {
    window.matchMedia = ((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia;
  }
  window.scrollTo = window.scrollTo ?? (() => {});
}
