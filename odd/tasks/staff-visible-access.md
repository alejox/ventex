# Visible staff system access

## Outcome
Owners can find first-time system access directly on staff cards without opening overflow.

## Scope
- Move existing Dar acceso al sistema action into a visible card footer for true owner + no account only.
- Reuse existing grant modal; retain overflow management for existing active/pending/suspended accounts.
- Keep CTA sibling to main card button, accessible and mobile-friendly; no permission/schema/service changes.
- Authorized local implementation only, preserve prior staff photo work on current branch.
- Delegated direct: reading prepares write and page/regression tests. Forecast 60–180 authored lines, advisory only; ask-on-risk delivery.
- RDD globally off.

## Tasks
- [x] T1 — Visible grant CTA and role/account-state regression coverage.
  - Surfaces: app/dashboard/staff/page.tsx; tests/staff-access-cta.test.tsx.
  - Checks: meaningful RED/GREEN, owner/no account visible + correct modal member; existing account/admin/worker hidden; account overflow retained; no nested buttons, keyboard/mobile browser; photo regressions; lint/typecheck/full tests/build/diff-check.
  - Commit: `171ba44` — feat(staff): expose system access on staff cards.
  - Evidence: two meaningful RED failures before edit; focused CTA/photo 7/7 GREEN, full 1005/1005, changed-source ESLint, typecheck, production build, diff-check passed. Independent focused 7/7 and browser/diff passed; parent repeated CTA tests 3/3.
  - Browser: real staff page/menu/store with profile/service/grant-modal fixtures verifies visible owner/no-account CTA, correct member keyboard selection, other roles/states hidden, existing account overflow retained, disabled submission, no nested buttons, >=40px controls and 390px no overflow.
  - Limitations: real access granting/authenticated persistence/full Next runtime not tested. Sandbox build stalled; approved external retry passed. Existing ignored public/webs full-lint failures unchanged.
  - Risk: high/unassessable untracked inventory, independent verification passed; RDD disabled/unmanaged.
  - Size: 103 authored source/test lines. Rollback: revert this task commit only; photo task remains intact.

## Next step
Local implementation verified. Optional authenticated grant testing remains; no migration or publication performed.
