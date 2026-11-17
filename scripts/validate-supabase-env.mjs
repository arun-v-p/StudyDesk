// Validation for the public Supabase build inputs.
//
// Vite inlines every VITE_* value into the shipped bundle, so these two
// variables are permanently public browser configuration. The dangerous
// mistake this module prevents is a service-role / secret key (or a wrong
// URL) being pasted into the build configuration: validation runs both in
// CI (scripts/validate-supabase-env.mjs) and as a Vite build plugin
// (vite.config.ts), failing the build before anything can be published.
//
// Error messages deliberately name the variable but never echo its value.
import { pathToFileURL } from 'node:url';

/**
 * Supabase project endpoints are a single-label subdomain of supabase.co.
 * Custom domains are intentionally not accepted; relax this only with review.
 */
const SUPABASE_HOST_PATTERN = /^[a-z0-9][a-z0-9-]*\.supabase\.co$/i;

/** New-format publishable keys: fixed prefix plus a long token body. */
const PUBLISHABLE_KEY_PATTERN = /^sb_publishable_[A-Za-z0-9_-]{20,}$/;

/** @typedef {{ ok: true } | { ok: false, reason: string }} Verdict */

/**
 * @param {string | undefined} value Raw VITE_SUPABASE_URL value.
 * @returns {Verdict}
 */
export function validateSupabaseUrl(value) {
  if (typeof value !== 'string' || value.trim() === '') {
    return { ok: false, reason: 'is missing' };
  }
  let parsed;
  try {
    parsed = new URL(value.trim());
  } catch {
    return { ok: false, reason: 'is not an absolute URL' };
  }
  if (parsed.protocol !== 'https:') {
    return { ok: false, reason: 'must use https://' };
  }
  if (!SUPABASE_HOST_PATTERN.test(parsed.hostname)) {
    return {
      ok: false,
      reason: 'must be a Supabase project URL shaped like https://<project-ref>.supabase.co',
    };
  }
  if (parsed.pathname !== '/' && parsed.pathname !== '') {
    return { ok: false, reason: 'must not include a path' };
  }
  if (parsed.search !== '' || parsed.hash !== '') {
    return { ok: false, reason: 'must not include a query or fragment' };
  }
  return { ok: true };
}

/**
 * Decodes the payload segment of a JWT-shaped string.
 * @param {string} token
 * @returns {Record<string, unknown> | null} null when the input is not a decodable JWT.
 */
function decodeJwtPayload(token) {
  const segments = token.split('.');
  if (segments.length !== 3) return null;
  try {
    const json = Buffer.from(segments[1], 'base64url').toString('utf8');
    const parsed = JSON.parse(json);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Accepts only keys that are safe to embed in a public frontend bundle:
 * the modern publishable format, or the legacy anon JWT. Anything that
 * looks like a secret or a service-role key is rejected outright.
 * @param {string | undefined} value Raw VITE_SUPABASE_PUBLISHABLE_KEY value.
 * @returns {Verdict}
 */
export function validatePublishableKey(value) {
  if (typeof value !== 'string' || value.trim() === '') {
    return { ok: false, reason: 'is missing' };
  }
  const candidate = value.trim();
  if (candidate.startsWith('sb_secret_')) {
    return {
      ok: false,
      reason:
        'looks like a Supabase secret key, which must never be placed in a VITE_ variable or frontend build',
    };
  }
  if (PUBLISHABLE_KEY_PATTERN.test(candidate)) {
    return { ok: true };
  }
  const payload = decodeJwtPayload(candidate);
  if (payload) {
    if (payload.role === 'service_role') {
      return {
        ok: false,
        reason:
          'is a service-role key, which must never be placed in a VITE_ variable or frontend build',
      };
    }
    if (payload.role === 'anon') {
      return { ok: true };
    }
    return { ok: false, reason: 'is not a publishable (anon) Supabase key' };
  }
  return {
    ok: false,
    reason: 'must be a publishable key (sb_publishable_… or the legacy anon JWT format)',
  };
}

/**
 * CLI entry. Strict mode (default) requires both variables; --allow-missing
 * skips validation only when both are absent (pull-request builds may run
 * without them). A single present value is always validated.
 * @returns {number} Process exit code.
 */
function runCli() {
  const allowMissing = process.argv.includes('--allow-missing');
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

  if (!url && !key) {
    if (allowMissing) {
      console.log('Supabase build inputs are not configured for this build; skipping validation.');
      return 0;
    }
    console.error(
      '::error::VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY are not set; a production build cannot be deployed.',
    );
    return 1;
  }
  if (allowMissing && (!url || !key)) {
    console.error(
      '::error::Only one of VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY is set; both must be provided together.',
    );
    return 1;
  }

  const urlVerdict = validateSupabaseUrl(url);
  if (!urlVerdict.ok) {
    console.error(`::error::VITE_SUPABASE_URL ${urlVerdict.reason}.`);
  }
  const keyVerdict = validatePublishableKey(key);
  if (!keyVerdict.ok) {
    console.error(`::error::VITE_SUPABASE_PUBLISHABLE_KEY ${keyVerdict.reason}.`);
  }
  if (!urlVerdict.ok || !keyVerdict.ok) {
    console.error(
      '::error::A production deploy was blocked before building. Fix the repository variables named above (values are never echoed).',
    );
    return 1;
  }
  console.log('Supabase build inputs are valid public browser configuration.');
  return 0;
}

// Run as CLI only when executed directly; tests import the validators.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(runCli());
}
