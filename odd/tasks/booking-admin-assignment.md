# Booking: optional auto-assignment to the admin

## Objective
Public-site bookings ("Cualquiera disponible") must not be auto-assigned to the
business admin unless the business opts in. Slots must show as blocked when all
assignable barbers are busy.

## Problem
`public_site_book` auto-assigns among every active staff row with
`show_on_website = true`. The admin's staff row is one of them and nothing in the
data marks it as the admin (live check 2026-11-01: 0 of 19 staff rows linked to
the owner account), so the admin receives automatic bookings and counts as a
capacity slot.

## Decision (user, 2026-11-01)
Business-level setting + explicit picker: "Asignar reservas al administrador"
(off by default) and a selector for which staff row is the admin's.

## Scope
- `settings.booking_admin_staff_id uuid null` (FK staff, ON DELETE SET NULL) and
  `settings.booking_assign_admin boolean not null default false`.
- When `booking_admin_staff_id` is set and `booking_assign_admin` is false:
  that staff row is excluded from auto-assignment AND from the capacity count
  used for "any staff" slot availability (so a slot is blocked when every
  other barber is busy). Choosing that person explicitly by name still follows
  `show_on_website`.
- No admin row selected (null) = current behavior, unchanged.
- Owner-only write (same guard pattern as `owner_uses_shifts`).
- UI in Ajustes (owner only), Spanish tuteo copy.

## Constraints
- `public_site_slots`, `public_site_day_slots`, `public_site_book` were patched
  live via replace(); new changes must be full `create or replace` written
  against the live definition (`pg_get_functiondef`).
- Tenancy via `get_effective_user_id()`; settings row is lazy (read-insert-or-update).

## Tasks
- [x] T1 Migration: settings columns + guard + rewrite the three RPCs; save .sql; regen types.
- [x] T2 Service/store/UI toggle + staff picker in Ajustes; pure helper + unit test.
- [x] T3 Verify: npm test, tsc, lint; SQL check on live functions; commit.

## Acceptance
- Admin selected + toggle off: "any" booking never lands on the admin; slot
  shows "Reservado" when all other visible barbers are busy.
- Toggle on or no admin selected: identical to today.

## Route
- T1+T2 delegated direct (writer: 2+ non-trivial files, SQL rewrite needs live reads).

## Progress / evidence
- T1 (delegated writer): migration `20261101120000_booking_admin_assignment`
  applied via MCP and saved to `supabase/migrations/`. New helper
  `public.site_booking_excluded_staff(user_id, config)` (execute revoked from
  public/anon/authenticated) returns the admin row when `booking_assign_admin`
  is false AND another visible active staff exists in the site catalog (else
  null = one-person fallback). `public_site_slots` / `public_site_day_slots`
  exclude it from capacity and from appointments consuming "any" capacity
  (not when `p_staff_id` = admin); `public_site_book` excludes it from
  auto-assign and from the "nobody free" check. Guard
  `settings_guard_booking_admin`: owner-only + staff must share `user_id`
  (23503). Live checks: all 3 RPCs contain `v_excluded`, grants unchanged;
  `public_site_day_slots('blula', …)` → 18 rows; rolled-back DO block: helper
  returned the admin, cross-tenant staff id rejected. Types regenerated.
- T2 (delegated writer): `lib/booking-admin.ts` (mirror + options + input
  normalizer), `saveBookingAdmin` service/store (lazy read-insert-or-update),
  `components/settings/BookingAdminCard.tsx` mounted in Ajustes → Negocio for
  owners only, saves on change. RED observed (module missing) then GREEN.
- Checks: `npm test` 1148/1148 pass; `npx tsc --noEmit` exit 0; eslint on
  touched files exit 0. Not committed (T3 pending).
- T3: parent spot check npm test 1148/0, tsc exit 0; committed and pushed to main.
