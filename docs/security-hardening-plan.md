# Security-Hardening Implementation Plan

Prepared 2026-11-17 from the findings in `docs/credentials-inventory.md`.
**No change in this plan touches production credentials, Supabase dashboard settings,
Google Cloud configuration, or any secret value.** Everything is repository-local
(workflow, scripts, build config, UI copy).

Key constraints discovered during analysis:

- `index.html` ships an **inline `<script>`** (pre-paint theme bootstrap) and an
  **inline `<style>`** plus `style=` attributes (no-JS fallback). A naive
  `script-src 'self'` CSP would break the production app.
- Attachments are previewed through `<iframe src="blob:…">` for PDFs
  (`src/pages/MaterialsPage.tsx` line 630); downloads/ICS export use `blob:` URLs.
- The bundled supabase-js contains the literal string `sb_secret_` as a key-format
  classifier — any post-build secret scan must be length-qualified or it will
  false-positive on library code.
- The single-file preview build (`vite.preview.config.ts`, used by
  `scripts/verify-preview.mjs`) inlines every script — it must stay CSP-free.
- GitHub Pages cannot set HTTP headers, so CSP can only be delivered via `<meta>`.

Recommended execution order: **C5 → C1 → C2 → C3 → C6 → C4** (rationale in §8).

---

## C1. Validate Supabase URL and publishable-key format in CI

**Issue.** `deploy.yml`'s "Verify production Supabase configuration" step only checks
that `VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY` are non-empty. A wrong
project URL, a `http://localhost` value, or — worst case — a **service-role key pasted
into the repository-variables slot** would pass the gate and be silently baked into
the public bundle (Vite inlines all `VITE_*` values at build time). This is inventory
gap G2 / risk R1.

**Proposed fix.**

1. New `scripts/validate-supabase-env.mjs` with pure, unit-testable validators:
   - **URL**: must parse as an absolute URL with protocol `https:` and a hostname of
     the form `<ref>.supabase.co` (no `localhost`, no plain `http:`); trailing slash
     tolerated. Errors name the variable, never its value.
   - **Key**: accept `sb_publishable_[A-Za-z0-9_-]{20,}` **or** the legacy anon JWT
     shape; **reject** anything starting `sb_secret_` and reject any JWT whose decoded
     payload `role` claim is `service_role`. This catches the dangerous mistake while
     staying compatible with either Supabase key format.
2. Call it from `deploy.yml` as a step that runs before Build:
   - strict mode on the deploy path (both values required, as today);
   - `--allow-missing` on pull requests, so PR builds (which may run without the
     variables) still validate whatever is present instead of failing.
3. **Defense-in-depth**: register the same validator as a Vite build plugin in
   `vite.config.ts` (`apply: 'build'`), so a locally-built bundle from `.env.local`
   values gets the identical guard. Dev server (`vite`) is unaffected; missing values
   remain legal (unconfigured build).

**Affected files.** `.github/workflows/deploy.yml`, `scripts/validate-supabase-env.mjs`
(new), `vite.config.ts`, `tests/supabaseEnv.test.ts` (new), `docs/credentials-inventory.md` (G2 status).

**Risks.**

- Over-strict URL matching could reject a future custom Supabase domain. Mitigation:
  constrain to `*.supabase.co` today and document the escape hatch; relax only with
  review.
- Deploy blocks on invalid input — that is the intended fail-closed behaviour. The
  currently configured values match the accepted formats (verified via bundle
  presence checks), so existing deploys are unaffected.
- Plugin must tolerate absent env vars (PR builds / unconfigured dev) without failing.

**Tests.**

- Unit tests: valid publishable key; valid legacy anon JWT; reject `sb_secret_…`;
  reject JWT with `role: "service_role"`; accept `role: "anon"`; reject
  `http://`/`localhost`/malformed URL; accept trailing slash.
- CI: intentionally-wrong dummy values on a throwaway branch must fail the workflow
  with a message naming the variable and no value echoed.

---

## C2. Post-build secret scan of `dist/`

**Issue.** Even with input validation (C1), nothing verifies the **output**. If a
future variable, dependency, or script ever smuggles a secret-shaped token into the
bundle, it ships to GitHub Pages unnoticed. Naive grepping false-positives because
supabase-js legitimately contains the literal `sb_secret_` (key-format classifier).

**Proposed fix.** New `scripts/scan-dist-secrets.mjs`, run in CI **after Build and
before the artifact upload** (on the deploy path), scanning `dist/**/*.{js,html}`:

- fail on `sb_secret_[A-Za-z0-9_-]{20,}` (length-qualified, so the bare classifier
  literal `startsWith("sb_secret_")` in bundled supabase-js does **not** match);
- fail on any JWT-shaped string whose decoded payload has `role: "service_role"`
  (a legacy anon JWT passes — it is also a publishable key);
- on detection, print file path and a redacted context slice only; exit non-zero.
  Same scan runs as a local npm script (`npm run scan:dist`) for parity.

**Affected files.** `scripts/scan-dist-secrets.mjs` (new), `.github/workflows/deploy.yml`,
`package.json` (script entry), `tests/distScan.test.ts` (new, synthetic fixtures only —
never real key material), `docs/credentials-inventory.md` (G2/R1 status).

**Risks.**

- False negatives are possible by construction (scans are pattern-based); this is a
  tripwire, not a guarantee. The primary control remains C1's input validation.
- A future legit feature (none known) embedding long `sb_secret_`-prefixed strings
  would fail the build — acceptable fail-closed behaviour.

**Tests.**

- Unit tests with synthetic fixtures: fake secret token fails; bare classifier
  literal passes; `service_role` JWT fixture fails; `anon` JWT fixture passes;
  clean bundle passes.

---

## C3. Fix missing `VITE_APP_VERSION`

**Issue.** `src/store/backup.ts` line 67 reads `import.meta.env.VITE_APP_VERSION` to
stamp the ZIP backup manifest (`appVersion` in `src/store/archive.ts`), but the
variable is defined nowhere — not in `.env.example`, CI, or `vite.config.ts`. Every
backup archive currently records an undefined app version, which weakens future
recovery/migration tooling (inventory gap G1).

**Proposed fix.** Derive it from `package.json` at build time in `vite.config.ts`:

```ts
define: { 'import.meta.env.VITE_APP_VERSION': JSON.stringify(pkg.version) }
```

No CI configuration, never goes stale when the version is bumped, no secrets. Add the
same `define` to `vite.preview.config.ts` so single-file preview archives carry the
same metadata. Document in `.env.example` that the value is auto-derived and must not
be set manually.

**Affected files.** `vite.config.ts`, `vite.preview.config.ts`, `.env.example` (comment),
`tests/backup.test.ts`, `docs/credentials-inventory.md` (G1 status).

**Risks.** Minimal. The define key must exactly match the import.meta.env property and
be JSON-stringified. Behaviour change is limited to archive metadata becoming correct.

**Tests.** Extend `tests/backup.test.ts`: the archive manifest's `appVersion` equals
`package.json`'s `version` (a real semver string, not `undefined`).

---

## C4. Content Security Policy compatible with GitHub Pages, Supabase and Google OAuth

**Issue.** No CSP exists anywhere (inventory gap G3). Any successful XSS would have
direct script execution and free access to localStorage — planner data **and** the
persisted Supabase session tokens (`sb-…-auth-token`, risk R2).

**Proposed policy** (delivered as `<meta http-equiv="Content-Security-Policy">`, the
only option on GitHub Pages):

| Directive                               | Value                                                      | Why                                                                                                                                                                                  |
| --------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `default-src`                           | `'self'`                                                   | Baseline                                                                                                                                                                             |
| `script-src`                            | `'self' 'sha256-<hash>'`                                   | Vite emits external chunks; the one inline script (theme bootstrap) gets a build-time-computed SHA-256 hash — no `unsafe-inline` needed                                              |
| `style-src`                             | `'self' 'unsafe-inline'`                                   | Inline `<style>` (boot skeleton) + `style=` attributes (no-JS fallback, React inline styles). Documented trade-off; can be tightened to hashes later                                 |
| `img-src`                               | `'self' data: blob:`                                       | Self-hosted icons; attachment previews via object URLs                                                                                                                               |
| `connect-src`                           | `'self' https://<ref>.supabase.co wss://<ref>.supabase.co` | supabase-js REST + Realtime websocket. Exact origin injected at build time from `VITE_SUPABASE_URL` (tighter than a wildcard); omitted on PR builds where the client is unconfigured |
| `frame-src`                             | `'self' blob:`                                             | PDF attachment preview iframe                                                                                                                                                        |
| `worker-src`                            | `'self'`                                                   | App-shell service worker                                                                                                                                                             |
| `manifest-src` / `font-src`             | `'self'`                                                   | PWA manifest; no external fonts exist                                                                                                                                                |
| `object-src`, `base-uri`, `form-action` | `'none'`, `'self'`, `'self'`                               | Hardening defaults                                                                                                                                                                   |

Explicit non-requirements (the "Google OAuth compatibility" question):

- **Google OAuth and email OTP are top-level browser redirects**
  (`signInWithOAuth({ provider: 'google' })` → Supabase authorize endpoint →
  `accounts.google.com` → back). CSP does not govern top-level navigations, so
  `accounts.google.com` **must not** appear in the policy — adding it would widen
  the surface for no benefit.
- `frame-ancestors` and `report-uri` cannot be expressed in a meta tag (Pages can't
  set headers); documented as a known limitation, not a blocker.

**Proposed implementation.** New `contentSecurityPolicy()` plugin in
`vite.config.ts` (`apply: 'build'`), mirroring the existing plugin style:

1. `transformIndexHtml` injects a meta tag with a `__CSP__` placeholder.
2. In `generateBundle`, read the **final** built `index.html` asset, compute the
   SHA-256 of each inline script exactly as shipped, substitute the placeholder, and
   rewrite the asset — guaranteeing the hash matches the minified output (hashing the
   source HTML would mismatch after Vite minification).
3. Plugin ordering ensures the CSP is baked in **before** `policyRouteEntries()`
   copies the HTML into `/privacy` and `/terms` (those pages inherit the identical
   policy; `writeBundle` of that plugin runs after files are written, so ordering is
   safe).
4. The preview config (`vite.preview.config.ts`) does **not** include the plugin, so
   `preview-dist/` and `scripts/verify-preview.mjs` stay unaffected, and dev-server
   HMR (inline React preamble) is untouched.

**Affected files.** `vite.config.ts` (new plugin), `tests/csp.test.ts` (new),
`docs/credentials-inventory.md` (G3 status), CI smoke step in `deploy.yml`
(assert the built `dist/index.html` and both policy pages contain the CSP meta with
the required directives).

**Risks.**

- Hash mismatch after a Vite/HTML-minifier change would block script execution.
  Mitigated by computing the hash from the final bundle, not the source, plus a CI
  assertion and a manual QA pass (auth, sync, PDF preview, ICS export, offline shell)
  before merge.
- Future features needing new origins (e.g. the planned cloud **file storage**
  endpoints) will require policy updates — the plugin centralises the policy in one
  function so that is a one-line change.
- `style-src 'unsafe-inline'` is a deliberate, documented trade-off (lower-risk
  surface than scripts; hashes for styles are brittle here).

**Tests.**

- Unit-test the policy builder: required directives present; supabase origins added
  when env is set and omitted when not; no `unsafe-inline` in `script-src`.
- CI smoke: grep built HTML for the CSP meta and `frame-src 'self' blob:`,
  `connect-src` containing the exact Supabase origin.
- Manual QA checklist (listed at implementation time): theme flash, sign-in (Google +
  OTP), PDF preview, backup download/restore, ICS import/export, offline reload.

---

## C5. Pin GitHub Actions to full commit SHAs

**Issue.** All four actions are pinned by version tag (`@v7`, `@v5`). Tag refs are
mutable; a compromised tag would inject code into the deploy pipeline (inventory
risk R4). Dependabot keeps versions current but cannot protect against tag mutation.

**Proposed fix.** Pin each `uses:` to its full commit SHA with the version in a
comment. Verified today via `git ls-remote` (all lightweight tags, so the tag SHA is
the commit; no `^{}` peel lines):

| Action                          | Tag | Commit SHA                                 |
| ------------------------------- | --- | ------------------------------------------ |
| `actions/checkout`              | v7  | `3d3c42e5aac5ba805825da76410c181273ba90b1` |
| `actions/setup-node`            | v7  | `949feb2413d6458794dcd2491c4babbbce0c15c1` |
| `actions/upload-pages-artifact` | v5  | `fc324d3547104276b827a68afc52ff2a11cc49c9` |
| `actions/deploy-pages`          | v5  | `368f82528645a54fb793d4d04e342629a3f51346` |

SHAs will be re-verified at implementation time before writing. Dependabot's
`github-actions` ecosystem handles SHA-pinned actions natively and keeps the version
comment updated.

**Affected files.** `.github/workflows/deploy.yml`.

**Risks.** A mistranscribed SHA fails the workflow immediately (fail-fast, easy
revert). No functional change otherwise.

**Tests.** Workflow runs green on the PR itself (the pipeline executes on
`pull_request`), which exercises checkout/setup-node; the Pages steps are exercised
on merge to `master`/`main`.

---

## C6. Review local-only sign-out behaviour

**Issue.** `AccountMenu.tsx` calls `supabase.auth.signOut({ scope: 'local' })`. This
revokes the session on the current device only; the refresh token remains valid
server-side, so **any other signed-in device keeps full access**, and the menu copy
("Signing out does not delete your local or cloud data.") does not disclose this.
On a shared lab computer this is a real exposure: a user may believe signing out
protects their account when it only protects that browser profile (inventory risk R6).

**Findings (behaviour confirmed safe today).**

- Per-profile data isolation is already correct: `AccountProfile.tsx` switches
  localStorage namespaces by user ID (`studydesk.profile.<id>.*`), and sign-out
  returns to the guest profile; supabase-js removes the local session storage.
- No data loss occurs on sign-out (copy is accurate on that point).

**Proposed fix (minimal, behaviour-preserving where possible).**

1. Update menu copy to disclose the scope: e.g. "Signing out keeps your data and
   stays signed in on other devices."
2. Add a secondary action **"Log out of all devices"** calling
   `signOut({ scope: 'global' })`, which revokes refresh tokens server-side —
   important for lost/shared devices. (supabase-js ^2.118 supports the scope option.)
3. Keep the default button as local sign-out (matches the per-device profile design).
4. One-line update to the privacy/terms copy in `src/pages/PolicyPages.tsx` if the
   global action is added.

**Affected files.** `src/features/sync/AccountMenu.tsx`,
`tests/accountMenu.test.tsx`, `src/pages/PolicyPages.tsx` (copy), README sign-in
section if needed.

**Risks.** Global sign-out invalidates sessions on the user's other devices — that is
the requested behaviour of that button, but it must be clearly labelled. No
infrastructure change; uses an existing supabase-js API.

**Tests.** Extend `tests/accountMenu.test.tsx`: assert default button calls
`signOut` with `{ scope: 'local' }` and the new action with `{ scope: 'global' }`;
assert updated copy renders; assert busy/disabled states and error path unchanged.

---

## 8. Execution order

1. **C5** (SHA pinning) — smallest change, touches the same file as C1, zero risk.
2. **C1** (env validation) — the primary fail-closed gate; everything after it relies
   on correct inputs.
3. **C2** (post-build scan) — completes the input+output guard pair.
4. **C3** (`VITE_APP_VERSION`) — trivial, independent.
5. **C6** (sign-out) — small UI/test change, independent of build config.
6. **C4** (CSP) — most invasive; needs manual QA, so it lands last with its own
   verification pass.

Each change ships as its own commit/PR, so any can be reverted independently.

## 9. Prerequisites for the cloud file-storage & recovery architecture

The planned private Storage migration (resumable uploads, quotas, deletion lifecycle,
attachment recovery — `supabase/README.md`) expands user data into server-side files.
**Complete C1, C2, C3, C4 and C6 first:**

| Prerequisite                           | Why it must come first                                                                                                                                                                                                                                                       |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **C1 + C2** (validation + output scan) | Storage work adds new env/config surface and the temptation of server-side access. The fail-closed gates must exist before any new credentials-adjacent code lands, so a service-role key can never reach the bundle.                                                        |
| **C4** (CSP)                           | Uploads/downloads and preview flows add `connect-src` origins, `frame-src`/`img-src` blob usage and possibly `<form>`/fetch patterns. Building the policy infrastructure now means storage UI plugs into it instead of forcing a CSP rework after files are already flowing. |
| **C3** (`VITE_APP_VERSION`)            | The recovery architecture depends on archive metadata for forward/backward compatibility and migration decisions. Version stamping must be truthful before recovery tooling starts reading it.                                                                               |
| **C6** (sign-out)                      | Server-side files make shared-device exposure concrete (a lingering session on a lab machine can access files). Global sign-out and honest copy should exist before file data becomes reachable.                                                                             |
| **C5** (SHA pinning)                   | Not a hard prerequisite, but supply-chain hygiene should be in place before CI grows more storage-related steps.                                                                                                                                                             |

Additional recommendation from the inventory worth folding in during this work
(optional, listed for completeness): enable GitHub push protection / secret scanning
(G4) — C2 covers built output, push protection covers the git history itself.
