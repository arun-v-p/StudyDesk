/**
 * Type surface for scripts/csp-policy.mjs so TypeScript callers
 * (vite.config.ts, unit tests) can import the builders type-safely.
 */
export declare function computeInlineScriptHashes(html: string): string[];

export declare function buildCspPolicy(options: {
  supabaseUrl?: string;
  scriptHashes: string[];
}): string;
