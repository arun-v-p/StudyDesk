import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

/**
 * `base` is derived, not hardcoded. A fixed "/StudyDesk/" breaks the moment the
 * repo is renamed, moved to a user page, or put behind a custom domain.
 */
function resolveBase(): string {
  if (process.env.VITE_BASE) return process.env.VITE_BASE;
  const repo = process.env.GITHUB_REPOSITORY; // "owner/name"
  if (!repo) return '/';
  const [owner, name] = repo.split('/');
  if (!owner || !name) return '/';
  // "<owner>.github.io" repos are served from the root.
  if (name.toLowerCase() === `${owner.toLowerCase()}.github.io`) return '/';
  return `/${name}/`;
}

/**
 * Public site URL used by the %VITE_SITE_URL% tokens in index.html (canonical,
 * og:url, og:image, twitter:image). Set it in .env.local to point the app at a
 * client's own domain; otherwise it is derived from the repository so the build
 * never emits an unsubstituted token.
 */
function resolveSiteUrl(): string {
  if (process.env.VITE_SITE_URL) return process.env.VITE_SITE_URL;
  const repo = process.env.GITHUB_REPOSITORY;
  if (!repo) return 'http://localhost:3000/';
  const [owner, name] = repo.split('/');
  if (!owner || !name) return 'http://localhost:3000/';
  return `https://${owner}.github.io/${name}/`;
}

// Must be assigned before Vite reads index.html, so the tokens resolve.
process.env.VITE_SITE_URL = resolveSiteUrl();

export default defineConfig({
  base: resolveBase(),
  plugins: [react(), tailwindcss()],
  server: { host: '0.0.0.0', port: 3000, strictPort: true },
  build: {
    chunkSizeWarningLimit: 250,
    sourcemap: 'hidden',
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          dates: ['date-fns'],
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    css: false,
  },
} as Parameters<typeof defineConfig>[0]);
