# Placing StudyDesk v2 into your repository

This is a complete, working rewrite — not the mockup. It builds, passes lint,
typechecks, has 80 passing tests, and renders. This document covers how to land
it in `arun-v-p/StudyDesk` cleanly, and how to hand it to a client.

---

## 1. What this is

A from-scratch implementation of the design in `redesign-preview.html`, built on
your existing domain model. Nothing is mocked and nothing is stubbed.

|                       | Original (`29d8ede`)     | This                                  |
| --------------------- | ------------------------ | ------------------------------------- |
| Source                | 1,641 LOC / 14 files     | 6,676 LOC / 50 files                  |
| Design tokens         | 0 (352 hardcoded hex)    | Full semantic layer, dark + light     |
| Routing               | none (`useState` switch) | `HashRouter`, 7 routes, deep-linkable |
| Tests                 | 0                        | 80                                    |
| Lint / format         | none                     | ESLint (+`jsx-a11y`) / Prettier       |
| `<label>` elements    | 0                        | every control                         |
| `aria-*` attributes   | 0                        | throughout                            |
| `focus:outline-none`  | 19                       | 0                                     |
| Error boundary        | none                     | per-route + shell                     |
| Export / import       | none                     | JSON backup, validated                |
| Schema version        | none                     | `v: 1` envelope + migrations          |
| Storage-key migration | n/a                      | automatic, non-destructive            |

The ~4x size increase is real and deliberate. It is almost entirely the things
the audit found missing: validation, an accessible primitive layer, the layout
engine, tests, and comments explaining _why_ each fix exists. There is no
duplication to strip — the five near-identical store hooks, the two copies of
deadline-status logic and the 15 copies of one input class string are each
collapsed into one implementation.

---

## 2. Placement — the clean way

Because the file layout changed (`components/` → `pages/`, `features/`, `lib/`,
`store/`), **replace `src/` wholesale rather than merging into it.** Merging
file-by-file will leave you with two competing conventions.

```bash
# From a clone of your repo
git checkout -b v2-redesign

# Remove the old source and configs
rm -rf src
rm -f vite.config.js tsconfig.json index.html package.json .gitignore

# Copy the new tree in
cp -r /path/to/studydesk-v2/{src,tests,public,index.html,package.json,tsconfig.json,vite.config.ts,.gitignore,.prettierrc.json,.prettierignore,.eslintrc.cjs,.env.example,LICENSE,README.md} .
cp -r /path/to/studydesk-v2/.github .

npm install
npm run ci        # lint → format:check → typecheck → test → build
```

If `npm run ci` is green, commit. Do not commit `node_modules/` or `dist/` —
both are gitignored.

### Incremental alternative (if you want to review before committing)

Keep both trees side by side and switch the entrypoint:

```bash
cp -r /path/to/studydesk-v2/src src-v2
# point index.html at src-v2/main.tsx, verify, then delete src/ and rename
```

This works because nothing in `src-v2` imports from `src`. It is a good way to
diff behaviour, but do not ship it — two source trees rot immediately.

---

## 3. Your existing users' data is preserved

This is the part most likely to go wrong, so it is handled automatically.

The storage keys were renamed to a namespaced scheme:

```
studydesk_tasks      →  studydesk.tasks
studydesk_deadlines  →  studydesk.deadlines
studydesk_timetable  →  studydesk.timetable
studydesk_notes      →  studydesk.notes
studydesk_planner    →  studydesk.planner
```

localStorage is keyed per origin, so anyone who already used the deployed app
has real records under the old names. `src/store/legacyMigration.ts` runs in
`main.tsx` **before React mounts** and copies them into the new format. It is:

- **idempotent** — a flag key stops it re-running
- **non-destructive** — it copies; the legacy keys stay as a rollback net
- **non-clobbering** — it never overwrites data already under the new key
- **retryable** — if a write fails it does not set the flag, so it tries again

Users see a "Data from a previous version" card in Settings and can purge the
old copies themselves once they are satisfied. Eight tests cover this path.

> If you are handing this to a client as a **new** deployment on a different
> origin, none of this fires — there is no legacy data to find.

---

## 4. Placeholder audit

You asked for no placeholders. Verified by grep across `src/`:

- **No `TODO` / `FIXME` / `HACK` / `Lorem` / stub functions.**
- **No hardcoded name.** The original rendered `Good evening, Arun` for every
  visitor. Here the name comes from Settings; when blank, the greeting simply
  omits it. (`"Arun"` survives in exactly one place — a code comment in
  `Topbar.tsx` explaining what was fixed. Delete it if you prefer.)
- **No fake data at runtime.** The sample term in `src/store/seed.ts` is only
  reachable from an explicit button in Settings, behind a confirmation modal.
  A fresh visitor sees a real empty state, never invented content.
- **Every `placeholder` attribute is a genuine input hint**, and each has a
  real `<label>` beside it — so the placeholder is a convenience, not the label.
- **No hardcoded site URL.** `index.html` uses `%VITE_SITE_URL%`, resolved by
  `vite.config.ts` from `GITHUB_REPOSITORY`, or overridden in `.env.local`.

### The two things you must still supply

These are assets, not code, and cannot be generated honestly for you:

1. **Screenshots.** `README.md` references `docs/*.png`. Capture them from the
   running app at 2x, both themes. Seed a sample term first so the screens look
   populated.
2. **`og-image.png`.** One is generated at `public/og-image.png` as a
   reasonable stand-in (gradient wordmark + a dashboard card). Replace it with
   a real screenshot composite before sharing the link publicly.

---

## 5. Pre-handoff checklist

Run these before you call it delivered.

```bash
npm run ci                        # lint, format, types, 80 tests, build
npm run preview                   # serve dist/ and click through it
```

Then manually verify:

- [ ] **Both themes.** Toggle in the topbar; check every page. Light-theme semantic colours are deliberately darker than dark's — confirm the chips stay legible.
- [ ] **Keyboard only.** Tab through a full flow: add a task, open a deadline modal, Escape out, ⌘K search. The focus ring is visible everywhere by design.
- [ ] **Touch.** On a phone or with devtools device mode, confirm edit/delete buttons are visible without hovering. This was broken in the original.
- [ ] **Timetable edge cases.** Create a 09:30 class, a 3-hour class, and two overlapping classes. All must render. This is the headline fix.
- [ ] **Reload persistence.** Add data, hard-reload, confirm it survives.
- [ ] **Export → clear → import.** The full round trip.
- [ ] **Legacy migration.** If you have old data on the origin, confirm it appears and the Settings card shows.
- [ ] **Deep links.** Copy `#/timetable`, open in a new tab. Refresh on it. Both must work — `HashRouter` was chosen specifically because GitHub Pages cannot rewrite paths.
- [ ] **Lighthouse.** Aim for ≥95 on Accessibility. Run it; do not assume.
- [ ] **Console clean.** No errors or warnings on load or during normal use.

### Client-specific configuration

| Change                   | Where                                                                      |
| ------------------------ | -------------------------------------------------------------------------- |
| Their domain             | `.env.local` → `VITE_SITE_URL=https://their.domain/`                       |
| App name                 | `index.html` title/meta, `Sidebar.tsx` brand, `manifest.webmanifest`       |
| Brand colour             | `src/theme.css` → `--sd-accent` in both theme blocks (one line each)       |
| Logo                     | `public/favicon.svg`, regenerate `icon-512.png` and `apple-touch-icon.png` |
| Default theme            | `DEFAULT_SETTINGS.theme` in `src/types.ts`                                 |
| Pomodoro durations       | `DURATIONS` in `src/features/timer/usePomodoro.ts`                         |
| Timetable day order      | `DISPLAY_ORDER` in `src/pages/TimetablePage.tsx`                           |
| Remove the sample seeder | delete `src/store/seed.ts` and its Settings card + tests                   |

Because colour is tokenised, rebranding to a client palette is **two hex values**,
not the 352-string edit the original would have required.

---

## 6. Known gaps

Stated plainly so nothing is a surprise at handoff.

- **No service worker.** The manifest is present and the app is local-first, so
  it works offline once cached by the browser — but there is no explicit offline
  shell or install prompt wiring yet. Adding `vite-plugin-pwa` is the natural
  next step.
- **No analytics or error reporting.** `ErrorBoundary` has an `onError` prop
  ready for a Sentry DSN; nothing is wired.
- **No sync.** By design. Two tabs sync via the `storage` event; two _devices_
  do not. Export/import is the bridge.
- **No E2E suite.** Unit and integration tests cover the logic and rendering.
  Playwright flows were recommended in the audit but are not included here.
- **Screenshots absent** (see §4).
- **`react-router-dom` v7.** The app already targets the current major and no
  longer relies on the old v6 future-flag warnings.

---

## 7. Verifying it yourself

```bash
npm install
npm run ci        # must exit 0
npm run dev       # http://localhost:3000
```

Expected CI output: ESLint clean, Prettier clean, `tsc --noEmit` clean under
`strict` + `noUnusedLocals` + `noUncheckedIndexedAccess`, **80 tests passing
across 6 files**, and a build producing ~12 chunks with route-level splitting.

First paint is `react` (54 kB gz) + `dates` (7.9 kB gz) + `index` (19.2 kB gz).
The original shipped a single 64.2 kB gz chunk containing everything; every page
except Today is now loaded on demand.
