# Owner cash shift: the owner/admin can choose to work with a cash drawer

## Objective

A business setting lets the owner, and workspace admins, choose to work with a cash shift: open the drawer, register withdrawals, and close with an arqueo. When the setting is on, the POS asks them to open the drawer before selling, with a button to start without one.

## Problem

- Only workers can open, close or reconcile a cash shift. A one-person business never gets an arqueo.
- The block is client-only. The live RPCs `open_shift`, `current_shift`, `close_shift` and `register_cash_withdrawal` key on `get_active_membership_id()`, gate only on `worker_can('pos')`, and already accept owners. Every workspace has an owner membership (`member_kind='owner'`).
  - `create_sale` already stamps any open shift of the caller's membership, the owner's included.
  - The arqueo filters by `membership_id`, so each drawer is isolated.
- The POS gates the shift UI on `profile.isWorker`:
  - `app/dashboard/pos/page.tsx`: `:152`, `:160`, `:187`, `:1509-1525`.
  - `PosCatalog.tsx`: `:128`, `:316`, `:378`.
  - Admins have `is_worker = false`, so they are hidden too.

## Decisions (user, 2026-10-14)

- New setting, **off by default**. Existing tenants see no change.
- It applies to the owner **and** to workspace admins (any non-worker who sells).
- When on, entering the POS without an open drawer shows a modal with **"Abrir caja"** and **"Iniciar sin abrir caja"**.
  - Skipping lasts for the rest of the **local day**. It is per device, stored in localStorage behind try/catch; the next day it asks again.
  - The modal also appears after closing the drawer if they keep selling.
  - It does NOT appear while a drawer is open, even one opened on a previous day.
- While selling without a drawer, a discreet banner shows "Estás vendiendo sin caja abierta · Abrir caja".
- No server-side requirement for the owner. Because they can always skip, `create_sale` is **not** touched. Workers' enforcement is unchanged.
- Cash must never land in someone else's drawer:
  - `register_customer_payment`: cash abonos prefer the caller's own open shift. When the setting is on and an owner/admin has no shift, the abono is not stamped into a worker's drawer, so there is no "único turno abierto" fallback.
  - `open_shift_for_commission`, used by `settle_commissions`: prefer the paying caller's own open shift, then the staff member's shift, then the existing "único turno abierto" fallback.

## Scope

- DB, as migration files reviewed and then applied via MCP:
  - `settings.owner_uses_shifts boolean not null default false`, with an owner-only write guard (same pattern as `guard_shift_requirement_setting`).
  - The `register_customer_payment` / `open_shift_for_commission` fallbacks, rewritten from the LIVE definitions (migrations lag live).
- Settings UI, in Configuración → General next to "Exigir turno activo para facturar". Only owner/admin can change it.
- POS UI: drawer chip (Retiro / Cerrar caja), entry modal, skip-for-today, banner, and the existing Open/Close/Withdrawal modals for owner/admin when the setting is on.
- Shift history: owner/admin shifts show the person's name (not "Empleado") and the section is visible even without worker accounts.
- Docs: `README-turnos.md`, the CLAUDE.md "Owners are exempt" line, and the AGENTS.md shift notes.

## Out of scope

- `create_sale`, `void_sale`, worker rules, purchases.

## Tasks

- [x] **T1 Setting.** Route: delegated (writer trigger, 4 files). Commit `05868a3`. RED `mapSettings is not a function` → GREEN 2/2 (`tests/owner-uses-shifts-setting.test.ts`). Migration `20261014100000_owner_uses_shifts_setting.sql` (sibling guard; not applied).
  - Migration: column + guard trigger.
  - Regenerate the types for `utils/supabase/database.types.ts` or hand-edit the Row/Insert/Update.
  - `services/settings.service.ts` type, defaults, mapping and dedicated save; store action.
  - The toggle in Configuración → General (owner/admin only).
- [x] **T2 POS for owner/admin.** Route: delegated. Commit `5d82f39`. RED module missing → GREEN 7/7 (`tests/owner-shift-prompt.test.ts`); POS wiring is UI-only (no meaningful RED). Opening a drawer clears today's skip, so the prompt returns after closing.
  - Gates become `isWorker || (ownerUsesShifts && !isWorker)`.
  - Entry modal with skip-for-today (pure helper, tested).
  - Banner.
  - Close → re-prompt.
- [x] **T3 Cash fallbacks.** Route: delegated. Commit `3971282`. Migration `20261014100100_owner_cash_fallbacks.sql` from live defs (not applied); manual test `supabase/manual-tests/20261014100100_owner_cash_fallbacks.rollback.sql` written, NOT executed (no SQL runner). Migration with CREATE OR REPLACE for `register_customer_payment` and `open_shift_for_commission`, based on their live definitions, plus a rollback-safe manual test in `supabase/manual-tests/`.
- [x] **T4 History and docs.** Route: delegated. Commit `838856e`. RED 0/4 → GREEN 4/4 (`tests/shift-holder-name.test.ts`). ShiftHistorySection naming and visibility; README-turnos.md, CLAUDE.md and AGENTS.md.

## Acceptance criteria

- **Setting off:** the owner's experience is identical to today.
- **Setting on**, owner/admin entering the POS without a drawer:
  - The modal appears.
  - "Abrir caja" opens a shift and later sales are stamped with it.
  - "Iniciar sin abrir caja" lets them sell, and the modal does not reappear that day.
  - Retiro and Cerrar caja work, and the arqueo includes only their own drawer.
- A cash abono taken by an owner without a drawer, with the setting on, never lands in a worker's shift.
- A cash commission payment by an owner with their own drawer open is recorded in that drawer.
- `npm test`, `npx tsc --noEmit` and eslint on the touched files all pass.

## Checks

- Commands: `npm test`, `npx tsc --noEmit`, `npx eslint <touched>`.
- Migration review before applying.
- Manual check: owner with the setting on goes through open → sell → withdraw → close.

## Progress

- 2026-10-14: exploration done. Branch `feat/owner-cash-shift`.
- 2026-10-14: T1–T4 implemented (delegated writer). `npm test` 966/966, `npx tsc --noEmit` clean, eslint on touched files clean. Migrations authored, pending parent review/apply; manual SQL test pending execution. DashboardHome quick actions and `chargeAppointment` left unchanged (appointments already stamp any open shift of the caller).

## Next step

Parent reviews and applies `20261014100000` and `20261014100100` via MCP, runs the manual rollback test, then the manual POS check (open → sell → withdraw → close) as owner with the setting on.
