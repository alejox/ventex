# Private agenda and optional stations (sillas)

## Objective
Staff (workers) must not see other staff's appointments, customers or prices. A worker sees full detail only of their own appointments; for everything else they see only that a slot (or a station/chair) is busy — no customer, service or staff name. Owner and admins see the full agenda. Businesses can optionally create stations ("sillas"), either shared (picked per appointment) or fixed per staff member.

## Problem / why
Verified live 2026-10-21: `workspace_appointments_read`/`_write` = `user_id = get_effective_user_id() AND worker_can('calendar')` — any worker with Agenda reads/edits/deletes every appointment of the tenant (customer, phone, service). "Mis citas" is only a client-side filter. Sales/sale_items (incl. commissions) are readable with `pos|sales|panel`. No station concept exists.

## Decisions
- Privacy is enforced in the database (RLS + SECURITY DEFINER busy RPC), never only in the UI.
- Full visibility: owner and admins (`is_tenant_owner()`, which includes admins), and workers with the new child permission `calendar_all` ("Ver agenda completa", child of `calendar`; charging stays gated by `pos`). Other workers: own appointments (`staff_id` = their membership's `staff_id`) in full; everything else busy-only.
- Stations are optional: none created → behaves exactly as today. Fixed assignment optional via `staff.default_station_id`; shared stations picked per appointment.
- Live-DB security migrations are prepared and verified with rollback-only manual tests; applying them to production requires explicit user confirmation.

## Tasks
- [x] T1 — Private agenda (code + migration file ready; migration applied to production 2026-10-21 after user confirmation): RLS on `appointments` per staff for workers + `agenda_busy_slots` RPC (times only, optional station) + calendar/modal using it; tests; migration file + rollback manual test (route: delegated writer; trigger: 2+ non-trivial files, security)
- [ ] T2 — Stations schema: `stations` table, `appointments.station_id`, `staff.default_station_id`, per-station no-overlap trigger, default from fixed assignment (route: delegated writer)
- [ ] T3 — Stations UI: manage stations, pick station in appointment modal, busy-by-station view (route: delegated writer)
- [ ] T4 — Public booking capacity by free stations when the business has stations (route: delegated writer)
- [ ] T5 — Sales/commission privacy for workers (own lines only) without breaking POS (route: delegated writer; needs its own design pass)

## Acceptance criteria
- A worker's API reads of `appointments` return only their own rows; busy RPC exposes no customer/service/staff identity.
- Owner/admin calendars unchanged.
- No stations → booking and agenda behave as today.

## Checks
`npm test`, `npx tsc --noEmit`, `npx eslint <touched files>`, `npm run build`, rollback-only SQL manual tests per migration.

## Progress
- 2026-10-21: document created after read-only mapping and live RLS verification; T1 delegated.
- 2026-10-21: T1 implemented (delegated writer). Migration `supabase/migrations/20261021100000_private_agenda.sql` (current_staff_id, split appointment policies select/insert/update/delete keyed on is_tenant_owner() OR staff_id = current_staff_id(), agenda_busy_slots(date,date) → date/start/end/is_mine only, overlap trigger → SECURITY DEFINER). Manual test `supabase/manual-tests/20261021100000_private_agenda.rollback.sql` run against live with the migration in the same aborted transaction: owner 2/2, worker A 1, A update/delete B = 0 rows, A insert-for-B 42501, A reassign-to-B 42501, A own insert ok, busy 3 rows/2 mine/B slot visible, no identity columns, own overlap 23P01, no-permission busy 42501; live re-checked unchanged afterwards. App: lib/agenda-privacy.ts (RED: module missing → GREEN 9/9), store fetchAppointments(withBusy) + busySlots, calendar "Ocupado" blocks and no person filter for plain workers, modal locks "Asignado a" to own staff. Checks: npm test 1072/1072, tsc clean, eslint clean, build ok. Known impact: POS `fetchBillableAppointments` for a cashier worker now lists only their own appointments.
- 2026-10-21: T1 amended per user decision — `calendar_all` permission. `config/business.ts` (type, label, hint, short label, parent `calendar`; `calendar` hint now says it is own-only), RLS predicate adds `OR worker_can('calendar_all')` on select/insert/update/delete, `canSeeFullAgenda` true for `calendar`+`calendar_all`. No DB whitelist of permission keys exists (only CHECKs on lifecycle/owner shape); `/api/worker/create|update` sanitize by iterating `WORKER_PERMISSION_LABELS`, so they pick the key up automatically; Permisos UI renders children from `WORKER_PERMISSION_PARENT` (shows nested under Calendario, only where `calendar` applies). Admin preset and Encargado template include it automatically. RED: 2 failing tests (parent/label + canSeeFullAgenda) → GREEN. Manual test re-run in aborted tx with worker C: `C ve 2 de 2 | C update B=1 fila | C busy propias=0`; all prior assertions unchanged; post-check: live policies still read/write, no new functions, no 2099 rows, no pa-test sessions, 0 memberships with calendar_all. Checks: npm test 1076/1076, tsc clean, eslint clean, build ok. Migration still NOT applied.
- 2026-10-21: T1 UX rule — new appointment "Asignado a" defaults to the user's own staff (`profile.staffId`) when it is in the active staff list, for any role; owners without staff keep auto-assign; plain workers stay locked; editing never changes staff. Pure helper `defaultAppointmentStaffId` in lib/agenda-privacy.ts (RED 5 failing → GREEN 16/16), applied in AppointmentModal at init and once when the staff list loads (render-phase adjustment, no effect). Checks: npm test 1081/1081, tsc clean, eslint clean, build ok.
- 2026-10-21: user confirmed; `private_agenda` applied via MCP (first attempt failed with a tool error, verified nothing applied, retried once OK). Post-check: 4 split appointment policies, `current_staff_id`/`agenda_busy_slots` exist, overlap trigger SECURITY DEFINER. Independent read-only security review: no high/medium findings. Types regenerated (+11 lines), tsc clean, npm test 1081/1081.
- Engram mirror: pending (Engram tools not loaded this session).
