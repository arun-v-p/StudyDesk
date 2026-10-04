import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import type { Plugin } from 'vite';
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

function appShellServiceWorker(): Plugin {
  let transformedIndex = '';
  let publicDir = '';
  return {
    name: 'studydesk-app-shell-service-worker',
    apply: 'build',
    configResolved(config) {
      publicDir = config.publicDir;
    },
    transformIndexHtml(html) {
      transformedIndex = html;
      return html;
    },
    generateBundle(_options, bundle) {
      const files = Object.entries(bundle)
        .filter(([name]) => {
          if (name === 'index.html') return true;
          if (!/\.(?:js|css|svg|png|webmanifest)$/.test(name)) return false;
          const output = bundle[name];
          return output?.type === 'asset' || output?.type === 'chunk';
        })
        .sort(([left], [right]) => left.localeCompare(right));
      const hash = createHash('sha256');
      for (const [name, output] of files) {
        hash.update(name);
        hash.update('\0');
        if (output?.type === 'asset') hash.update(output.source);
        else if (output?.type === 'chunk') hash.update(output.code);
        hash.update('\0');
      }
      hash.update(transformedIndex);
      const publicFiles = [
        'manifest.webmanifest',
        'favicon.svg',
        'icon-512.png',
        'apple-touch-icon.png',
      ];
      for (const file of publicFiles) {
        hash.update(file);
        hash.update(readFileSync(resolve(publicDir, file)));
      }
      const urls = [...files.map(([name]) => name), ...publicFiles];
      hash.update(serviceWorkerSource('__BUILD_ID__', urls));
      const buildId = hash.digest('hex').slice(0, 16);
      this.emitFile({
        type: 'asset',
        fileName: 'sw.js',
        source: serviceWorkerSource(buildId, urls),
      });
    },
  };
}

function serviceWorkerSource(buildId: string, files: string[]): string {
  return `const CACHE_PREFIX = 'studydesk-shell-';
const CACHE_NAME = CACHE_PREFIX + '${buildId}';
const SCOPE_URL = self.registration.scope;
  const APP_SHELL_URL = new URL('./', SCOPE_URL).href;
  const PRECACHE_URLS = [APP_SHELL_URL, ...${JSON.stringify(files)}.map((file) => new URL(file, SCOPE_URL).href)];
  const STATIC_PATHS = new Set(PRECACHE_URLS.map((url) => new URL(url).pathname));
  const SHELL_URL = APP_SHELL_URL;

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys
      .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
      .map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      const shell = await cache.match(SHELL_URL);
      if (shell) return shell;
      try {
        return await fetch(request);
      } catch {
        return new Response(
          '<!doctype html><meta charset="utf-8"><title>StudyDesk offline</title><main><h1>StudyDesk is offline</h1><p>The app shell is not available on this device yet. Reconnect and reload once to make it available offline.</p></main>',
          { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
        );
      }
    })());
    return;
  }
  if (!STATIC_PATHS.has(new URL(request.url).pathname)) return;
  event.respondWith(caches.open(CACHE_NAME).then(async (cache) => {
    const cached = await cache.match(request, { ignoreSearch: true, ignoreVary: true });
    return cached || fetch(request);
  }));
});
`;
}

// Must be assigned before Vite reads index.html, so the tokens resolve.
process.env.VITE_SITE_URL = resolveSiteUrl();

export default defineConfig({
  base: resolveBase(),
  plugins: [react(), tailwindcss(), appShellServiceWorker()],
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
