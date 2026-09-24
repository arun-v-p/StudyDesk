/**
 * `crypto.randomUUID()` replaces the `uuid` package — native, zero-dependency,
 * and available in every secure context (GitHub Pages is HTTPS).
 * The fallback covers non-secure contexts such as http://localhost on old browsers.
 */
export function createId(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  // Math.random fallback — only for dev; not cryptographically unique.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    const v = ch === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
