import { describe, expect, it } from 'vitest';
import { scanForSecrets } from '../scripts/scan-dist-secrets.mjs';

/** Synthetic fixtures only — no real credential material is used in tests. */
const FAKE_SECRET = `sb_secret_${'0123456789abcdefghij'}`;
const FAKE_GOOGLE_SECRET = `GOCSPX-${'0123456789abcdefghij'}`;

function fakeJwt(payload: Record<string, unknown>): string {
  const encode = (value: object) =>
    Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
  return [encode({ alg: 'HS256', typ: 'JWT' }), encode(payload), 'c2lnbmF0dXJlLXNlZ21lbnQ'].join('.');
}

describe('scanForSecrets', () => {
  it('flags a secret-shaped Supabase key', () => {
    const findings = scanForSecrets(`const k="${FAKE_SECRET}";export default k;`);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.pattern).toMatch(/secret key/i);
  });

  it('does not flag the bare key-format classifier literal in supabase-js', () => {
    const libraryCode = 'const isSecret = r => r.startsWith("sb_secret_") || r.startsWith("sb_publishable_");';
    expect(scanForSecrets(libraryCode)).toEqual([]);
  });

  it('flags a Google OAuth client secret', () => {
    const findings = scanForSecrets(`client_secret: "${FAKE_GOOGLE_SECRET}"`);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.pattern).toMatch(/Google/i);
  });

  it('flags a service-role JWT', () => {
    const findings = scanForSecrets(fakeJwt({ role: 'service_role' }));
    expect(findings).toHaveLength(1);
    expect(findings[0]?.pattern).toMatch(/service-role/i);
  });

  it('flags unexpected JWT-shaped strings', () => {
    const findings = scanForSecrets(fakeJwt({ email: 'someone@example.com' }));
    expect(findings).toHaveLength(1);
    expect(findings[0]?.pattern).toMatch(/JWT/i);
  });

  it('does not flag a legacy anon JWT', () => {
    expect(scanForSecrets(fakeJwt({ role: 'anon' }))).toEqual([]);
  });

  it('passes clean bundle content, including partial prefixes', () => {
    const clean = [
      'const url = "https://abcdefghijklmnopqrst.supabase.co";',
      'const key = "sb_publishable_0123456789abcdefghij";',
      'const classifier = "sb_secret_";',
      'const eyebrow = "eyJ";',
    ].join('\n');
    expect(scanForSecrets(clean)).toEqual([]);
  });

  it('reports the offset without exposing matched content', () => {
    const text = `prefix "${FAKE_SECRET}" suffix`;
    const finding = scanForSecrets(text)[0];
    expect(finding?.index).toBe(8);
  });
});
