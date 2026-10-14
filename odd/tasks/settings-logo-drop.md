# Settings title and logo drag-and-drop

## Outcome
Use “Configuración” for the settings destination and section heading. Allow selecting or dropping a business logo with immediate preview, preserving the existing store/service upload and explicit Save flow.

## Scope and constraints
- Existing Spanish UI copy; English identifiers.
- No direct I/O in components, schema changes, remote operations, or publishing.
- Preserve unrelated `.atl` changes.
- Menu already uses the requested label; change only inconsistent settings heading.
- RDD is disabled globally; ordinary verification applies.
- Delivery: ask-on-risk; total forecast below 400 authored changed lines, two work units.

## Tasks
- [x] T1 — Unify heading and implement accessible logo drop/select with preview, validation, upload failure handling, and focused regression checks.
  - Route: delegated direct; preparation and two non-trivial UI files require a bounded writer.
  - Allowed source surfaces: app/dashboard/settings/layout.tsx; app/dashboard/settings/business/page.tsx; lib/business-logo.ts; tests/business-logo.test.ts; e2e/settings-logo.spec.ts.
  - Acceptance: menu/heading use Configuración; click and drop share validation/upload; preview appears before upload completes; unsupported/oversized files rejected; concurrent uploads guarded; existing saved logo retained on failure; object URLs cleaned up; explicit Save behavior preserved.
  - Checks: deterministic validation tests RED → GREEN where applicable, focused ESLint, standalone typecheck, unit suite; browser interaction check if feasible.
  - Commit: `d2c4132` — feat(settings): add logo drop upload with instant preview.
  - Native risk assessment: unassessable/high due to undeclared untracked inventory; independent verifier completed. Review disabled/unmanaged.
- [x] T2 — Preserve complete logo artwork across every public template and editor preview.
  - Authorization: user approved correcting all templates after read-only validation found cover cropping and unbounded tall logos.
  - Route: delegated direct; multiple CSS templates require a bounded writer.
  - Acceptance: wide/tall/square logos retain proportions without clipping, fit existing header size, and cannot shrink in flex rows; public and preview share rendering.
  - Source surfaces: MercadoTemplate.module.css, DespensaTemplate.module.css, OrganicoTemplate.module.css, templates.module.css, BarberModernTemplate.module.css, BarberArtesanalTemplate.module.css, BarberUrbanaTemplate.module.css under app/[slug]/templates; tests/site-logo-fit.test.ts.
  - Checks: deterministic CSS regression RED → GREEN, isolated Chromium wide/tall/square desktop/mobile checks with actual CSS; npm test; standalone typecheck; git diff --check.
  - Forecast: under 150 additional authored lines; total feature forecast remains under 400. Delivery ask-on-risk unchanged.
  - Commit: completed work unit follows this record; identity recorded below after commit.
  - Risk assessment: unassessable/high (untracked inventory); independent verifier completed. RDD disabled/unmanaged.
  - Verification: focused regression RED on cover before change, GREEN 1/1; npm test 976/976; standalone typecheck and diff-check passed. Independent actual-CSS Chromium harness: 42 cases (seven CSS families × wide/tall/square × desktop/mobile). Parent repeated harness successfully.
  - Limitations: isolated minimal brand markup, not full Next.js header screenshots or long-name pressure. No production build. Public and preview use same renderer.
  - Rollback boundary: seven template CSS files and site-logo-fit regression test; upload behavior unaffected.

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
T1 and T2 complete locally on `feat/settings-logo-drop`. Await delivery instruction; no push or merge authorized.
