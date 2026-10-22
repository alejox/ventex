# Delete staff with a never-accepted invitation

## Objective
Let the owner delete a staff member whose system-access invitation is still pending (never accepted), which today is impossible.

## Problem / why
Sending an invitation creates a `workspace_memberships` row (`status = 'pending'`, `accepted_at` null, `provisional_auth_user = true`) plus a provisional `auth.users` account. `workspace_memberships.staff_id` is `ON DELETE RESTRICT`, so deleting the staff row fails, and there is no way to cancel an invitation. Observed in production 2026-10-21: a duplicate "DAVE" (pending, 0 sales / 0 shifts / 0 settlements) could not be deleted.

## Scope
- Server-side delete path (route handler using the admin client) that, for the tenant's TRUE owner only:
  1. verifies the staff row belongs to the caller's workspace;
  2. if it has a membership: requires `status = 'pending'`, `accepted_at IS NULL`, and no `shifts` rows for that membership; otherwise refuses (existing friendly message + "mark inactive" hint);
  3. deletes the membership, then the provisional auth user only when `provisional_auth_user = true` and that auth user is not referenced by any other membership/profile that matters;
  4. deletes the staff row.
- Staff without a membership keep the current client delete path.
- UI: the delete confirmation and errors reuse the existing flow.

## Constraints
- Tenancy via `get_effective_user_id()` / owner checks; admin/reseller-style double check (server role check + data re-check).
- Never delete an accepted/active/suspended account through this path.
- No new DB migration unless strictly required (report first).

## Tasks
- [x] T1 — Server route + service + store wiring + tests (route: delegated writer; trigger: 2+ non-trivial files, auth-sensitive)
  - Evidence: `app/api/worker/delete-staff/route.ts` (owner-only, admin client; decision in pure `staffDeleteDecision` in `lib/staff-delete.ts`), `deleteStaffViaApi` in `services/worker.service.ts`, store `deleteStaff` routes members with an account through it and drops them from `accounts`; page shows delete for members with an account only to the true owner and the confirmation says a pending invitation is cancelled.
  - RED: `tests/staff-delete.test.ts` 23 tests / 18 failing before `staffDeleteDecision`/`STAFF_DELETE_CODES` existed; `tests/staff-access-cta.test.tsx` new admin-visibility test failing (7 / 1 failing).
  - GREEN: `npm test` 1060/1060 pass; `npx tsc --noEmit` exit 0; eslint on touched files exit 0; `npm run build` exit 0 (route `/api/worker/delete-staff` listed).
  - Not verified: live DB / browser run (no DB tools in the writer). Commit pending (parent).

- [x] T2 — Revoked-but-never-used invitations (failed invitation email) are cancellable too: status in (pending, revoked), accepted_at and activated_at null (route: inline; 2 files) — live DB had 2 such rows; RED 2 new tests failing, then `npm test` 1063/1063, tsc/eslint clean, `npm run build` compiled.

## Acceptance criteria
- Pending-invitation staff with no shifts can be deleted by the owner; membership and provisional auth user are gone.
- Accepted/active accounts, staff with shifts or paid commissions, and non-owners are refused with a clear Spanish message.

## Checks
`npm test`, `npx tsc --noEmit`, `npx eslint <touched files>`, `npm run build`.

## Progress
- 2026-10-21: document created; T1 delegated.
- 2026-10-21: T1 implemented by delegated writer; checks green; live E2E against the pending "DAVE" record not yet run.
- Engram mirror: pending (Engram tools not loaded this session).
