# Lint cleanup

## Objective and authorization

Remove the current ESLint errors and warnings without changing business behavior. The user explicitly authorized correcting all reported lint findings.

## Scope and constraints

- Preserve pagination semantics, filtering, auth, POS copy and school data.
- Prefer event-driven page resets or derived/clamped state over synchronous state updates in effects.
- Do not disable ESLint rules or add broad suppressions.
- Keep tests and docs with behavior changes. No database, API, permission or deployment changes.

## Configuration and delivery

- Branch: `feat/modular-brand` (continue current feature branch; no push/PR without authorization).
- TDD: off; runner `npm test` (`npx tsx --test tests/**/*.test.ts`). RDD: globally disabled.
- Route: delegated writer after read-only mapping because findings span 9 files. Forecast: ~100–250 authored lines; single work-unit commit unless verification reveals a real split.

## Tasks

- [x] **L1 — Correct lint findings.** Fix 7 errors and 5 warnings reported by `npm run lint` in admin pagination, Pedidos/reseller pagination, DataTable, POS quote copy, school student memoization, promotions settings and the unused E2E import. Acceptance: full lint exits 0 with no warnings and behavior remains equivalent. Checks: lint, typecheck, tests, focused E2E where relevant.
- [x] **L2 — Validate and document.** Run full build/tests/diff checks, update this task document with exact evidence and limitations. No push/PR/deploy.

## Progress and evidence

- Baseline `npm run lint`: exit 1, 7 errors + 5 warnings across 9 files. Detailed output saved at `/tmp/ventex-lint-before-fix.txt`.
- L1 observed: removed synchronous pagination effects and moved resets to user/data mutation handlers; corrected quote escaping, memoization dependencies, and unused symbols. `npm run lint` exits 0 with no warnings; `npx tsc --noEmit`, `npm run build`, and `git diff --check` pass. `npm test` could not execute because `node_modules/.bin/tsx` is absent and the sandbox cannot resolve `registry.npmjs.org`; no test assertions were changed. Commit: pending.
- L2 complete: no push, PR or deployment performed. Remaining limitation is dependency availability for the repository test runner.
