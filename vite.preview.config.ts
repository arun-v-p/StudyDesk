import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

/**
 * Separate config for `npm run build:preview`.
 *
 * Inlines every JS and CSS asset into one self-contained HTML file so the build
 * can be opened directly — double-clicked from disk, attached to an email, or
 * viewed in a sandboxed preview pane with no network and no same-origin access.
 * This is a REVIEW ARTIFACT, not the production build; `npm run build` still
 * emits properly split, cacheable chunks for deployment.
 */
// Mirror the env resolution from vite.config.ts so the %VITE_SITE_URL% tokens
// in index.html still substitute under this config.
process.env.VITE_SITE_URL =
  process.env.VITE_SITE_URL ??
  (process.env.GITHUB_REPOSITORY
    ? `https://${process.env.GITHUB_REPOSITORY.split('/')[0]}.github.io/${
        process.env.GITHUB_REPOSITORY.split('/')[1]
      }/`
    : 'http://localhost:4173/');

export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss(), viteSingleFile({ removeViteModuleLoader: true })],
  build: {
    outDir: 'preview-dist',
    // Everything must inline; a leftover external asset would 404 offline.
    assetsInlineLimit: 100_000_000,
    cssCodeSplit: false,
    sourcemap: false,
    rollupOptions: { output: { inlineDynamicImports: true } },
  },
});
