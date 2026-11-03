# StudyDesk — Coding Agent Implementation Guide

Use this document when asking Codex, ChatGPT, Claude Code, Cursor, or another coding agent to improve StudyDesk.

## 1. Product direction

StudyDesk is a local-first study planner. Its immediate job is to help a student decide what to study next, protect their data, and complete work before deadlines and exams.

The product should remain useful without an account or internet connection. Accounts and cloud sync are a later, optional enhancement—not a prerequisite for basic study planning.

### Product principles

- Make the next useful action obvious.
- Never hide or silently discard student data.
- Explain automation: students must be able to see why an item was scheduled.
- Let students override recommendations and schedules.
- Design for mobile and slower devices first.
- Treat privacy, accessibility, and reliability as product features.

## 2. How to give an agent a good task

Give one outcome-focused task at a time. Include:

1. **User problem** — what is difficult today.
2. **Desired outcome** — what the student can do after the change.
3. **Scope** — pages, components, data models, or integrations that may change.
4. **Acceptance criteria** — observable checks that define done.
5. **Constraints** — privacy, no destructive migrations, no new service unless approved, etc.
6. **Verification** — tests/build/manual checks expected.

Avoid instructions such as “make it better” or “fix the whole app.” They make implementation scope unclear and encourage inconsistent design decisions.

## 3. Copy-paste task template

\`\`\`md
You are working in the StudyDesk repository.

## Goal

[One sentence describing the student-facing result.]

## User problem

[What a student cannot do, what is confusing, or what fails.]

## Required behaviour

- [Behaviour 1]
- [Behaviour 2]
- [Behaviour 3]

## Acceptance criteria

- [ ] [An observable UI/result check]
- [ ] [A data persistence or error-handling check]
- [ ] [An accessibility or mobile check]
- [ ] Tests are added/updated for the changed behaviour.
- [ ] Typecheck, lint, and production build pass.

## Constraints

- Preserve existing user data and backwards compatibility.
- Do not remove unrelated features or reformat unrelated files.
- Keep the app usable without an account unless this task explicitly adds authentication.
- Use local dates/times; do not accidentally convert study schedules to UTC.
- Explain any migration, external service, or security trade-off before implementing it.

## Deliverable

Implement the change, run verification, and report:

1. files changed,
2. behaviour added,
3. tests/checks run,
4. known limitations or follow-up work.
   \`\`\`

## 4. Standard agent workflow

Ask the agent to follow this sequence for every feature:

1. Inspect the relevant code, tests, persistence model, and existing UI patterns.
2. State the implementation plan briefly before editing.
3. Implement only the agreed scope.
4. Add or update tests for the reported regression and the new behaviour.
5. Run typecheck, lint, tests, and production build.
6. Inspect the production output or deployed preview when deployment is in scope.
7. Report the result with any remaining risks.

### Required quality gate

\`\`\`text
Before declaring a feature complete:

- npm run typecheck
- npm run lint
- npm test
- npm run build
- Confirm the changed flow manually in a browser when it is user-facing.
  \`\`\`

If the full test suite cannot run because of the environment, the agent must say exactly which command failed, why, and which focused checks did pass.

## 5. Staged implementation roadmap

Do not send this entire roadmap to one agent in one request. Treat each numbered item as a separate milestone with a review between milestones.

### Milestone 0 — Release reliability

**Objective:** ensure the deployed site always matches the reviewed source.

- Add a visible build version, commit SHA, and build timestamp in Settings.
- Add automated deployment smoke tests that load the GitHub Pages URL and verify the version.
- Make service-worker updates visible and easy to apply.
- Add a release checklist and rollback instructions.

**Definition of done:** a user can report the version running in their browser; a deployment cannot be marked successful when it serves a prior bundle.

**Agent prompt starter:**

\`\`\`md
Implement release identity and deployment verification for StudyDesk.
Show the git commit SHA and build timestamp in Settings. Add a CI smoke test that
loads the deployed GitHub Pages site and confirms it serves the expected release identity.
Do not expose secrets. Keep the app functional for local development builds.
\`\`\`

### Milestone 1 — Daily planning basics

**Objective:** make tasks, completion, and recovery obvious.

- Completed-task history with task name, completed date, and reopen action.
- Task list filters: Open, Completed, Today, Overdue, All.
- Due date, priority, estimate, and recurring-task support.
- Undo for completion, deletion, and rescheduling.
- Clear empty states that still show completed work when relevant.

**Definition of done:** a student can always identify a completed task and safely undo accidental completion.

### Milestone 2 — Time and focus

**Objective:** connect plans to actual time spent.

- Assign focus sessions to tasks.
- Track planned versus actual time.
- Add session history, pause/resume, and interruption notes.
- Show a “next best task” based on deadline, estimate, and available time.
- Keep notifications optional and accessible.

**Definition of done:** a student can see what they planned, what they studied, and what to do next.

### Milestone 3 — Flexible revision planning

**Objective:** replace rigid generated schedules with student-controlled plans.

- Multiple sessions per subject.
- Availability windows, blocked times, weekends off, and class conflicts.
- Drag/drop or form-based rescheduling.
- Explain why a session was placed at a time.
- Link a session to a resource, note, URL, chapter, or uploaded file.
- Allow a student to regenerate only uncompleted sessions.

**Definition of done:** an automatically generated plan is a useful draft, never an uneditable rule.

### Milestone 4 — Accounts and sync

**Objective:** allow optional multi-device use without weakening local-first use.

- Decide the data model, authentication provider, database, and sync/conflict strategy before implementation.
- Keep an offline local copy and make sync state visible.
- Add account deletion, data export, privacy policy, and recovery flows.
- Encrypt data in transit and use appropriate access control for every record.

**Definition of done:** the app works offline, syncs safely when a user chooses to sign in, and never exposes one student's data to another.

### Milestone 5 — Collaboration and integrations

**Objective:** support useful sharing without building an unnecessary social network.

- Read-only sharing of a resource list or revision plan.
- Explicit group membership and roles for study groups.
- ICS import/export and institution timetable import.
- Drive/OneDrive integrations only with least-privilege permissions and clear consent.

**Definition of done:** shared content is intentional, reversible, and scoped to the people the student chose.

### Milestone 6 — Production operations

**Objective:** operate the app responsibly at real-user scale.

- Error monitoring, uptime monitoring, and privacy-safe product metrics.
- CI previews, dependency updates, backups, and rollback procedures.
- Accessibility review against WCAG 2.2 AA.
- Security verification against OWASP ASVS appropriate to the app's architecture.
- Incident response, abuse reporting, and support documentation.

## 6. Prompts for common task types

### Bug report

\`\`\`md
Investigate and fix this StudyDesk bug:

Observed: [what happens]
Expected: [what should happen]
Steps to reproduce:

1. [...]
2. [...]

Preserve existing data. Add a regression test that fails before the fix and passes after it.
Do not implement unrelated redesigns.
\`\`\`

### New feature

\`\`\`md
Add [feature] to StudyDesk for [student user].

Student outcome: [what they can achieve].
Primary flow: [step-by-step flow].
Empty state: [what appears with no data].
Failure state: [what happens when validation/storage/network fails].
Accessibility: keyboard operation, visible focus, labelled controls, and screen-reader status.
Persistence: [what must remain after refresh].

First inspect related pages and existing patterns. Then implement, test, and build.
\`\`\`

### UX review

\`\`\`md
Review [page/flow] from a student's perspective.

Do not edit code yet. Identify:

1. unclear labels,
2. missing recovery actions,
3. hidden state or confusing empty states,
4. mobile and keyboard issues,
5. the three highest-impact improvements.

Support each finding with a file/component reference and a concrete recommendation.
\`\`\`

### Security or privacy review

\`\`\`md
Review StudyDesk's [feature/data flow] for privacy and security risks.

Do not claim the app is secure without evidence. Map findings to concrete risks:
data exposure, missing authorization, unsafe input, insecure storage, account recovery,
third-party integration permissions, backups, and deletion.

Recommend prioritized mitigations and tests. Do not change authentication, databases,
or external services unless explicitly approved.
\`\`\`

## 7. Architecture decisions to make before cloud sync

Before asking an agent to add login or a backend, decide these explicitly:

| Decision       | Questions to answer                                                        |
| -------------- | -------------------------------------------------------------------------- |
| Identity       | Email/password, Google/Microsoft, institution SSO, or more than one?       |
| Data ownership | Is every record private by default? Who can share it?                      |
| Storage        | Which provider, region, backup policy, and retention period?               |
| Sync           | Last-write-wins, record-level merge, or conflict UI?                       |
| Offline        | Which operations queue while offline and how are conflicts explained?      |
| Attachments    | Size limits, malware scanning, encryption, sharing rules, deletion policy? |
| Privacy        | Required policy, consent, student age requirements, export/delete flow?    |
| Cost           | Free limits, monitoring budget, support burden, and scale targets?         |

Do not delegate these product decisions to an agent without review.

## 8. Definition of production ready

“Production ready” means more than a successful build. For StudyDesk, require:

- A deployment is traceable to an exact source revision.
- Critical flows have automated tests and manual smoke tests.
- Users can export and restore their records.
- Errors are visible to the user and observable by maintainers without leaking private study data.
- Accessibility, mobile use, keyboard navigation, and slow-network behavior are tested.
- The security model matches the actual architecture.
- Privacy and deletion/export expectations are documented.
- A rollback and incident-response process exists.

## 9. What not to ask an agent to do without a decision

Require your approval before an agent:

- adds sign-in, payment, cloud storage, analytics, advertising, or AI APIs;
- uploads student files or sends data to a third party;
- changes or deletes persisted data formats;
- alters deployment configuration, permissions, or secrets;
- makes a feature public or adds sharing.

## 10. Recommended first three tickets

1. **Release identity and deployment smoke test** — fix the current mismatch between a “successful” deployment and the bundle users actually receive.
2. **Task history and recovery** — completed-task view, reopen, undo, filter, and regression tests.
3. **Flexible revision sessions** — multiple sessions per subject, availability windows, and a clear rescheduling experience.

Each ticket should be implemented, reviewed, tested, deployed to a preview, and manually checked before starting the next one.
