// Post-build verification that the shipped HTML carries a complete,
// resolved Content-Security-Policy. Complements tests/csp.test.ts (which
// covers the builder) by catching build-time drift: HTML minification
// changes, placeholder leaks, or missing policy pages.
//
// Usage: node scripts/verify-csp.mjs dist [more dirs...]
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const REQUIRED_DIRECTIVES = [
  "default-src 'self'",
  // Unanchored: the policy string begins with default-src, not script-src.
  /script-src 'self'( 'sha256-[^']+')+/,
  "frame-src 'self' blob:",
  "worker-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
];

/**
 * Collect every HTML document under a directory (recursive).
 * @param {string} dir
 * @returns {string[]}
 */
function collectHtml(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...collectHtml(full));
    else if (/\.html$/i.test(entry)) out.push(full);
  }
  return out;
}

function extractPolicy(html) {
  // The policy value itself contains single quotes ('self'), so the closing
  // delimiter must match the opening one, not "any quote".
  const match = html.match(
    /<meta\s+http-equiv=["']Content-Security-Policy["']\s+content=(?:"([^"]*)"|'([^']*)')/i,
  );
  return match?.[1] ?? match?.[2] ?? null;
}

/**
 * @param {string} file
 * @returns {string[]} Problems found in this file (empty = clean).
 */
function verifyFile(file) {
  const html = readFileSync(file, 'utf8');
  const problems = [];
  if (html.includes('__STUDYDESK_CSP__')) {
    problems.push('CSP placeholder was not resolved');
    return problems;
  }
  const policy = extractPolicy(html);
  if (!policy) {
    problems.push('no Content-Security-Policy meta tag found');
    return problems;
  }
  for (const required of REQUIRED_DIRECTIVES) {
    const ok = typeof required === 'string' ? policy.includes(required) : required.test(policy);
    if (!ok) problems.push(`missing directive: ${required}`);
  }
  if (/script-src[^;]*'unsafe-inline'/.test(policy)) {
    problems.push("script-src must not allow 'unsafe-inline'");
  }
  if (policy.includes('accounts.google.com')) {
    problems.push('policy must not widen to accounts.google.com (OAuth is a top-level redirect)');
  }
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  if (supabaseUrl) {
    try {
      const { origin, host } = new URL(supabaseUrl.trim());
      if (!policy.includes(`connect-src 'self' ${origin}`) || !policy.includes(`wss://${host}`)) {
        problems.push(`connect-src is missing the Supabase origin for ${origin}`);
      }
    } catch {
      problems.push('VITE_SUPABASE_URL is not a parseable URL');
    }
  }
  return problems;
}

/**
 * @returns {number} Process exit code.
 */
function runCli() {
  const dirs = process.argv.slice(2);
  if (dirs.length === 0) dirs.push('dist');
  const files = dirs
    .flatMap((dir) => (existsSync(dir) ? collectHtml(dir) : []))
    .filter((file) => !/node_modules/.test(file))
    // public/ files are copied verbatim by Vite (never HTML-transformed);
    // 404.html is a SPA-routing passthrough, not an app-shell page.
    .filter((file) => !/(^|[\\/])404\.html$/i.test(file));
  if (files.length === 0) {
    console.error('::error::No HTML documents found to verify.');
    return 1;
  }

  let failures = 0;
  for (const file of files) {
    const problems = verifyFile(file);
    if (problems.length > 0) {
      failures += 1;
      for (const problem of problems) console.error(`::error::${file}: ${problem}.`);
    } else {
      console.log(`CSP verified: ${file}`);
    }
  }
  return failures > 0 ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(runCli());
}
