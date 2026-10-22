# My commissions (per-staff commissions view)

## Objective
Every staff member with a staff record ("ficha") sees their OWN commissions: pending (not yet settled), paid settlements (date, method, amount), and the per-line detail for a period. Never anyone else's.

## Problem / why
Commissions live in `sale_items.commission_amount` + `commission_settlement_id`; settlements in `commission_settlements`. Workers are redirected away from `/dashboard/staff/*` (including `comisiones`), so a barber has no way to know what they are owed. Reading `sale_items` directly is not per-staff scoped (RLS is tenant-wide with pos|sales|panel), so the view must not rely on it.

## Decisions
- Data comes from SECURITY DEFINER RPCs scoped to `current_staff_id()` (added in `20261021100000_private_agenda.sql`, live). The client never filters by staff id itself.
- No extra permission: any member with a staff record sees "Mis comisiones" (own data). Owners without a staff record do not get the item.
- Amounts follow the same rules as the owner's commissions page (frozen `commission_amount`; voided sales excluded from pending exactly as the owner view does).
- Migration prepared and verified with a rollback-only test; applying to production needs explicit user confirmation.

## Tasks
- [x] T1 — RPCs + migration + rollback manual test; service/store; `/dashboard/mis-comisiones` page; nav item for members with a staff record; tests (route: delegated writer; trigger: 2+ non-trivial files, security). Migration applied to production 2026-10-22 after user confirmation.

## Acceptance criteria
- A worker sees only lines/settlements whose `staff_id` is their own; totals match the owner's view for that person.
- Workers without a staff record and owners without one never see the item; calling the RPC returns nothing / is refused.

## Checks
`npm test`, `npx tsc --noEmit`, `npx eslint <touched files>`, `npm run build`, rollback-only SQL manual test.

## T1 evidence (2026-10-22)
- Files: `supabase/migrations/20261021120000_my_commissions.sql`, `supabase/manual-tests/20261021120000_my_commissions.rollback.sql`, `lib/my-commissions.ts`, `services/commissions-self.service.ts`, `stores/my-commissions.store.ts`, `app/dashboard/mis-comisiones/page.tsx`, `config/business.ts` (nav item `my-commissions`, `hasStaffRecord`, `withSelfServiceNavItems`), `components/DashboardShell.tsx` (threading + icon), `tests/my-commissions.test.ts`.
- RPCs: `my_commission_lines(p_from, p_to)` (completed sales only, `[from,to)`, ≤370 days else 22023) and `my_commission_summary()` (jsonb: `pending_total`, `pending_count`, last 24 `settlements` incl. void). Both SECURITY DEFINER, `search_path=''`, scoped to `current_staff_id()` + `get_effective_user_id()`; no staff → 42501 `SIN_FICHA` (page shows an empty state). EXECUTE: authenticated only.
- Semantics = owner view: frozen `commission_amount`; paid = `commission_settlement_id IS NOT NULL`; voided sales excluded; "Por cobrar" = all-time unsettled with amount > 0.
- RED: `npx tsx --test tests/my-commissions.test.ts` failed (module `@/lib/my-commissions` missing) → GREEN 13/13.
- Checks: `npm test` 1094/1094 pass; `npx tsc --noEmit` exit 0; eslint (touched files) exit 0; `npm run build` exit 0 (route `/dashboard/mis-comisiones`).
- Rollback-only SQL (migration + DO … RAISE + rollback): A líneas=2 (propias=2, de B=0, anuladas=0) | pagada con fecha y neto=t | por cobrar=1000.00 = directa | A ve su liquidación, ajenas=0 | 400 días=22023 | B líneas=1 propias=1 | dueño 42501 SIN_FICHA (los dos RPC) | A suspendido 42501 (los dos RPC) | anon=f, authenticated=t. Post-check: 0 functions, 0 test rows, 0 sessions persisted.
- Note: `workspace_memberships_owner_shape` forces every `member` to have `staff_id`, so "member without ficha" only exists as a non-active membership.
- Not verified: browser rendering (no browser run).

## Review fix (MEDIUM: truncated lines / client-side period totals) — 2026-10-22
- Finding: `my_commission_lines` was fetched in one call; PostgREST caps RPC results at max-rows (1000), so long periods truncated and the cards (summed client-side) came out below the owner view.
- Fix 1 (paging): `collectMyCommissionLines(page, pageSize)` in `services/commissions-self.service.ts` reuses `fetchAllRows`/`PAGE_SIZE` (`services/finance.service.ts`); `fetchMyCommissionLines` pages the RPC builder with `.order("sold_at", desc).order("sale_item_id", asc).range()`, matching the function's now-explicit total order `order by s.created_at desc, si.id asc`.
- Fix 2 (server totals): new `public.my_commission_period_totals(p_from, p_to)` → jsonb `{earned, paid_in_period, pending_in_period, lines_count}` (same filter as the lines RPC, same SIN_FICHA/22023 guards, EXECUTE authenticated only). The store fetches it; the KPI cards come from `myCommissionCards(summary, totals)` (`lib/my-commissions.ts`), never from the loaded lines. `summarizeMyLines` removed. "Por cobrar" unchanged.
- RED: 5 new tests failed (`collectMyCommissionLines`/`myCommissionCards` undefined) → GREEN 16/16 in `tests/my-commissions.test.ts` (2503 rows over 3 pages concatenated without gaps/dupes; exact-page boundary; page error propagates; cards use server totals; null before data).
- Re-run of the aborted-transaction test (migration + DO … RAISE + rollback) added: `A período: devengado=1500.00/1500.00 pagado=500.00/500.00 pendiente=1000.00/1000.00 líneas=2/2 iguales=t | totales 400 días=22023 | dueño totales=42501`; every earlier assertion unchanged. Post-check: 0 `my_commission_%` functions, 0 test rows/sales/settlements/sessions, 0 suspended memberships.
- Checks: `npm test` 1097/1097; `npx tsc --noEmit` 0; eslint (touched) 0; `npm run build` 0.

## Progress
- 2026-10-21: document created; T1 delegated.
- 2026-10-22: T1 implemented and verified locally; migration pending user confirmation; no commit yet.
- Engram mirror: pending (Engram tools not loaded this session).
