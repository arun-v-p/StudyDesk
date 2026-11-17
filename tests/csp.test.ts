import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { buildCspPolicy, computeInlineScriptHashes } from '../scripts/csp-policy.mjs';

const PROJECT_URL = 'https://abcdefghijklmnopqrst.supabase.co';

describe('computeInlineScriptHashes', () => {
  it('hashes inline script content exactly as shipped', () => {
    const script = `\n      (function () { var x = 1; })();\n    `;
    const html = `<head><script>${script}</script></head>`;
    const expected = `'sha256-${createHash('sha256').update(script, 'utf8').digest('base64')}'`;
    expect(computeInlineScriptHashes(html)).toEqual([expected]);
  });

  it('skips external scripts and empty inline blocks', () => {
    const html = [
      '<script src="/assets/app.js"></script>',
      '<script type="module" crossorigin src="/assets/index.js"></script>',
      '<script>   </script>',
      '<script>real code</script>',
    ].join('\n');
    const hashes = computeInlineScriptHashes(html);
    expect(hashes).toHaveLength(1);
    expect(hashes[0]).toMatch(/^'sha256-[A-Za-z0-9+/=]+'$/);
  });
});

describe('buildCspPolicy', () => {
  const policy = buildCspPolicy({
    supabaseUrl: PROJECT_URL,
    scriptHashes: ["'sha256-AAAA'"],
  });

  it('locks the baseline down to self', () => {
    expect(policy).toContain("default-src 'self'");
    expect(policy).toContain("worker-src 'self'");
    expect(policy).toContain("manifest-src 'self'");
    expect(policy).toContain("font-src 'self'");
    expect(policy).toContain("object-src 'none'");
    expect(policy).toContain("base-uri 'self'");
    expect(policy).toContain("form-action 'self'");
  });

  it('allows only hashed inline scripts, never unsafe-inline', () => {
    expect(policy).toContain("script-src 'self' 'sha256-AAAA'");
    expect(policy).not.toMatch(/script-src[^;]*'unsafe-inline'/);
  });

  it('permits the inline styles the app genuinely needs', () => {
    expect(policy).toContain("style-src 'self' 'unsafe-inline'");
  });

  it('supports attachment previews and object URLs', () => {
    expect(policy).toContain('img-src');
    expect(policy).toContain('blob:');
    expect(policy).toContain("frame-src 'self' blob:");
  });

  it('targets the exact Supabase REST and Realtime origins', () => {
    expect(policy).toContain(
      `connect-src 'self' ${PROJECT_URL} wss://abcdefghijklmnopqrst.supabase.co`,
    );
  });

  it('omits Supabase origins when the build is unconfigured', () => {
    const unconfigured = buildCspPolicy({ supabaseUrl: undefined, scriptHashes: [] });
    expect(unconfigured).toContain("connect-src 'self'");
    expect(unconfigured).not.toContain('supabase');
  });

  it('ignores malformed Supabase URLs instead of widening connect-src', () => {
    const malformed = buildCspPolicy({
      supabaseUrl: 'http://localhost:54321',
      scriptHashes: [],
    });
    expect(malformed).not.toContain('localhost');
  });

  it('never widens to Google OAuth endpoints', () => {
    // Google sign-in is a top-level redirect, which CSP does not govern.
    expect(policy).not.toContain('accounts.google.com');
    expect(policy).not.toContain('google');
  });
});
