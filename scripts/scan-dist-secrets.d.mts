/**
 * Type surface for scripts/scan-dist-secrets.mjs so TypeScript callers
 * (unit tests) can import the scanner type-safely.
 */
export interface Finding {
  pattern: string;
  index: number;
}

export declare function scanForSecrets(text: string): Finding[];
