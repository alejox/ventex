# Settings title and logo drag-and-drop

## Outcome
Use “Configuración” for the settings destination and section heading. Allow selecting or dropping a business logo with immediate preview, preserving the existing store/service upload and explicit Save flow.

## Scope and constraints
- Existing Spanish UI copy; English identifiers.
- No direct I/O in components, schema changes, remote operations, or publishing.
- Preserve unrelated `.atl` changes.
- Menu already uses the requested label; change only inconsistent settings heading.
- RDD is disabled globally; ordinary verification applies.
- Delivery: ask-on-risk; forecast below 250 authored changed lines, one work unit.

## Tasks
- [x] T1 — Unify heading and implement accessible logo drop/select with preview, validation, upload failure handling, and focused regression checks.
  - Route: delegated direct; preparation and two non-trivial UI files require a bounded writer.
  - Allowed source surfaces: app/dashboard/settings/layout.tsx; app/dashboard/settings/business/page.tsx; lib/business-logo.ts; tests/business-logo.test.ts; e2e/settings-logo.spec.ts.
  - Acceptance: menu/heading use Configuración; click and drop share validation/upload; preview appears before upload completes; unsupported/oversized files rejected; concurrent uploads guarded; existing saved logo retained on failure; object URLs cleaned up; explicit Save behavior preserved.
  - Checks: deterministic validation tests RED → GREEN where applicable, focused ESLint, standalone typecheck, unit suite; browser interaction check if feasible.
  - Commit: implementation work-unit commit follows this checked task record; exact identity recorded in Progress after commit.
  - Native risk assessment: unassessable/high due to undeclared untracked inventory; independent verifier completed. Review disabled/unmanaged.

## Progress
Implementation complete. Existing menu label already matched. Upload still uses settings store/service; local blob preview appears before upload resolves. Save remains explicit.

Verification observed:
- Validation tests RED (missing helper) then GREEN, 3/3.
- Focused ESLint and standalone TypeScript check passed.
- Full unit suite passed: 975 tests (writer).
- Independent verifier passed focused tests and typecheck.
- Isolated Chromium harness passed actual component select/drop, immediate preview, success/save payload, null/thrown failure recovery, type/size rejection, concurrency/submit guards, drag navigation prevention, keyboard selection, unmount cleanup.
- Parent repeated `node /private/tmp/ventex-logo-verify/run.cjs`: PASS.
- Actual authenticated Supabase upload not exercised; browser harness mocked store/services. Production build not run; standalone typecheck used.
- Rollback boundary: the four implementation/test files; no database or service changes.
- Authored change count remains below 250; no delivery strategy fork required.

## Next step
Commit local work unit; no push or merge authorized.
