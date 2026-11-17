// Content Security Policy for the production build.
//
// Delivered as a <meta> tag because GitHub Pages cannot set HTTP headers.
// Two constraints shape this module:
//
// 1. index.html ships an inline pre-paint theme script. Rather than allowing
//    'unsafe-inline' for scripts (which would make the CSP nearly useless),
//    the exact content of every inline script is hashed and added to
//    script-src. Hashes are computed from the FINAL built HTML, after Vite
//    minification, so they always match what actually ships.
// 2. Google OAuth and passwordless email sign-in are TOP-LEVEL redirects
//    (browser navigations via Supabase), not frames or fetches — CSP does not
//    govern them, so accounts.google.com deliberately does not appear here.
import { createHash } from 'node:crypto';
import { validateSupabaseUrl } from './validate-supabase-env.mjs';

const SCRIPT_PATTERN = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;

/**
 * Compute CSP hash-source entries for every inline (src-less, non-empty)
 * <script> block in the given HTML, exactly as shipped.
 * @param {string} html Final built HTML document.
 * @returns {string[]} Quoted hash-source entries, e.g. "'sha256-…'".
 */
export function computeInlineScriptHashes(html) {
  const hashes = [];
  for (const match of html.matchAll(SCRIPT_PATTERN)) {
    const attrs = match[1] ?? '';
    const content = match[2] ?? '';
    if (/\bsrc\s*=/i.test(attrs)) continue;
    if (content.trim() === '') continue;
    const digest = createHash('sha256').update(content, 'utf8').digest('base64');
    hashes.push(`'sha256-${digest}'`);
  }
  return hashes;
}

/**
 * Build the full CSP directive list.
 * @param {Object} options
 * @param {string | undefined} options.supabaseUrl Build-time VITE_SUPABASE_URL value.
 * @param {string[]} options.scriptHashes Quoted hash sources for inline scripts.
 * @returns {string} The CSP value for the meta tag.
 */
export function buildCspPolicy({ supabaseUrl, scriptHashes }) {
  const connectSrc = ["'self'"];
  const urlVerdict = validateSupabaseUrl(supabaseUrl);
  if (urlVerdict.ok && supabaseUrl) {
    const parsed = new URL(supabaseUrl.trim());
    connectSrc.push(parsed.origin, `wss://${parsed.host}`);
  }

  const directives = [
    `default-src 'self'`,
    `script-src 'self' ${scriptHashes.join(' ')}`.trim(),
    // Inline styles cover the pre-paint boot skeleton and the no-JS fallback
    // message; Tailwind itself ships as an external stylesheet. Deliberate
    // trade-off — style injection is far lower risk than script injection.
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' data: blob:`,
    `font-src 'self'`,
    `connect-src ${connectSrc.join(' ')}`,
    // Attachment previews render PDFs from object URLs inside an iframe.
    `frame-src 'self' blob:`,
    `worker-src 'self'`,
    `manifest-src 'self'`,
    `object-src 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
  ];
  return directives.join('; ');
}
