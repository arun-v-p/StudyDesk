// Post-build tripwire: scan built output for secret-shaped material.
//
// Vite inlines build-time configuration into dist/, so a mistyped variable
// could ship a credential to GitHub Pages unnoticed. This scan checks the
// FINAL bundle after build and before upload.
//
// Known false-positive source, deliberately not matched: the bundled
// supabase-js contains the bare literal "sb_secret_" as a key-format
// classifier (r.startsWith("sb_secret_")). Patterns are therefore
// length-qualified so only actual key-shaped material is flagged.
//
// Detection output names the file, pattern, and byte offset only — never
// the matched content.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

/** Length-qualified: the bare classifier literal in supabase-js does not match. */
const PATTERNS = [
  {
    name: 'supabase secret key (sb_secret_…)',
    regex: /sb_secret_[A-Za-z0-9_-]{20,}/g,
  },
  {
    name: 'Google OAuth client secret (GOCSPX-…)',
    regex: /GOCSPX-[A-Za-z0-9_-]{20,}/g,
  },
];

/** JWT-shaped strings worth inspecting (three base64url segments). */
const JWT_PATTERN = /eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{8,}/g;

/**
 * Decodes the payload segment of a JWT-shaped string.
 * @param {string} token
 * @returns {Record<string, unknown> | null}
 */
function decodeJwtPayload(token) {
  const segments = token.split('.');
  try {
    const parsed = JSON.parse(Buffer.from(segments[1], 'base64url').toString('utf8'));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * @typedef {Object} Finding
 * @property {string} pattern Human-readable pattern name.
 * @property {number} index Byte offset of the match (content is never reported).
 */

/**
 * Scan one document's text for secret-shaped material.
 * @param {string} text
 * @returns {Finding[]} Findings; empty when the text is clean.
 */
export function scanForSecrets(text) {
  const findings = [];
  for (const { name, regex } of PATTERNS) {
    for (const match of text.matchAll(regex)) {
      findings.push({ pattern: name, index: match.index ?? 0 });
    }
  }
  for (const match of text.matchAll(JWT_PATTERN)) {
    const payload = decodeJwtPayload(match[0]);
    // This bundle ships no JWTs at all (the publishable key uses the
    // sb_publishable_ format), so any JWT-shaped string is fail-closed.
    // Legacy anon JWTs are reclassified as acceptable if the project ever
    // switches key formats — adjust here deliberately, with review.
    if (payload?.role === 'anon') continue;
    findings.push({
      pattern:
        payload?.role === 'service_role' ? 'service-role JWT' : 'unexpected JWT-shaped string',
      index: match.index ?? 0,
    });
  }
  return findings;
}

/**
 * Collect files under a directory (recursive) with scannable extensions.
 * @param {string} dir
 * @returns {string[]}
 */
function collectFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...collectFiles(full));
    else if (/\.(js|mjs|html|css)$/i.test(entry)) out.push(full);
  }
  return out;
}

/**
 * CLI entry: node scripts/scan-dist-secrets.mjs <dir>
 * @returns {number} Process exit code.
 */
function runCli() {
  const dir = process.argv[2] ?? 'dist';
  let files;
  try {
    files = collectFiles(dir);
  } catch {
    console.error(`::error::Could not read build output directory "${dir}".`);
    return 1;
  }

  let violations = 0;
  for (const file of files) {
    const text = readFileSync(file, 'utf8');
    for (const finding of scanForSecrets(text)) {
      violations += 1;
      console.error(
        `::error::${file}: possible ${finding.pattern} at byte offset ${finding.index} (matched content is not displayed).`,
      );
    }
  }

  if (violations > 0) {
    console.error(
      '::error::Secret-shaped material was found in the build output; deployment blocked.',
    );
    return 1;
  }
  console.log(`Build output scan clean (${files.length} file${files.length === 1 ? '' : 's'}).`);
  return 0;
}

// Run as CLI only when executed directly; tests import scanForSecrets.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(runCli());
}
