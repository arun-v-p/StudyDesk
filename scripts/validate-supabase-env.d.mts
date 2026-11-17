/**
 * Type surface for scripts/validate-supabase-env.mjs so TypeScript callers
 * (vite.config.ts, unit tests) can import the validators type-safely.
 */
export type Verdict = { ok: true } | { ok: false; reason: string };

export declare function validateSupabaseUrl(value: string | undefined): Verdict;
export declare function validatePublishableKey(value: string | undefined): Verdict;
