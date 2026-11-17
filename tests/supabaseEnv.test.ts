import { describe, expect, it } from 'vitest';
import { validatePublishableKey, validateSupabaseUrl } from '../scripts/validate-supabase-env.mjs';

/** Synthetic keys only — no real credential material is used in tests. */
const FAKE_PUBLISHABLE = 'sb_publishable_0123456789abcdefghij';

function fakeJwt(payload: Record<string, unknown>): string {
  const encode = (value: object) =>
    Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
  return [encode({ alg: 'HS256', typ: 'JWT' }), encode(payload), 'c2lnbmF0dXJl'].join('.');
}

describe('validateSupabaseUrl', () => {
  it('accepts a standard Supabase project URL with or without a trailing slash', () => {
    expect(validateSupabaseUrl('https://abcdefghijklmnopqrst.supabase.co')).toEqual({ ok: true });
    expect(validateSupabaseUrl('https://abcdefghijklmnopqrst.supabase.co/')).toEqual({ ok: true });
  });

  it('rejects missing, empty, and non-URL values', () => {
    expect(validateSupabaseUrl(undefined).ok).toBe(false);
    expect(validateSupabaseUrl('   ').ok).toBe(false);
    expect(validateSupabaseUrl('not a url').ok).toBe(false);
  });

  it('rejects plain http and localhost endpoints', () => {
    expect(validateSupabaseUrl('http://abcdefghijklmnopqrst.supabase.co').ok).toBe(false);
    expect(validateSupabaseUrl('http://localhost:54321').ok).toBe(false);
    expect(validateSupabaseUrl('https://localhost:54321').ok).toBe(false);
  });

  it('rejects hosts that are not Supabase project endpoints', () => {
    expect(validateSupabaseUrl('https://example.com').ok).toBe(false);
    expect(validateSupabaseUrl('https://deep.nested.supabase.co').ok).toBe(false);
    expect(validateSupabaseUrl('https://supabase.co').ok).toBe(false);
  });

  it('rejects URLs carrying a path, query, or fragment', () => {
    expect(validateSupabaseUrl('https://abcdefghijklmnopqrst.supabase.co/auth/v1').ok).toBe(false);
    expect(validateSupabaseUrl('https://abcdefghijklmnopqrst.supabase.co/?apikey=x').ok).toBe(
      false,
    );
    expect(validateSupabaseUrl('https://abcdefghijklmnopqrst.supabase.co/#frag').ok).toBe(false);
  });
});

describe('validatePublishableKey', () => {
  it('accepts the modern publishable key format', () => {
    expect(validatePublishableKey(FAKE_PUBLISHABLE)).toEqual({ ok: true });
  });

  it('accepts the legacy anon JWT format', () => {
    expect(validatePublishableKey(fakeJwt({ role: 'anon', iss: 'supabase' }))).toEqual({
      ok: true,
    });
  });

  it('rejects secret keys outright, in either format', () => {
    const secret = `sb_secret_${'0123456789abcdefghij'}`;
    const verdict = validatePublishableKey(secret);
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.reason).toMatch(/secret key/i);
  });

  it('rejects a service-role JWT outright', () => {
    const verdict = validatePublishableKey(fakeJwt({ role: 'service_role' }));
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.reason).toMatch(/service-role/i);
  });

  it('rejects other JWT payloads, such as user access tokens', () => {
    expect(validatePublishableKey(fakeJwt({ role: 'authenticated', sub: 'user' })).ok).toBe(false);
    expect(validatePublishableKey(fakeJwt({ email: 'someone@example.com' })).ok).toBe(false);
  });

  it('rejects missing values and unrecognised formats', () => {
    expect(validatePublishableKey(undefined).ok).toBe(false);
    expect(validatePublishableKey('   ').ok).toBe(false);
    expect(validatePublishableKey('sk_live_shortbutwrong').ok).toBe(false);
    expect(validatePublishableKey('sb_publishable_short').ok).toBe(false);
  });

  it('never echoes the value in rejection reasons', () => {
    const secret = `sb_secret_${'0123456789abcdefghij'}`;
    const verdict = validatePublishableKey(secret);
    if (!verdict.ok) expect(verdict.reason).not.toContain(secret);
  });
});
