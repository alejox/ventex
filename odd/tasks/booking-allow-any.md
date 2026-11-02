# Booking: business option to hide "Cualquiera disponible"

## Objective
Each business decides whether its public booking widget offers "Cualquiera
disponible". The user does not want it on their site; other tenants keep today's
behaviour (default on).

## Decisions
- Column `business_sites.booking_allow_any boolean not null default true`
  (per site, next to `booking_enabled` / `slot_interval_minutes`), edited in
  Ajustes → Reservas.
- Off: the widget shows only real people, nothing preselected (one visible person
  → preselected), day/hours wait for a choice ("Elige primero con quién").
  `public_site_book` rejects a null staff when the option is off and the site has
  visible staff (tuteo message). A site with no visible staff keeps working.
- The admin-assignment card only matters for "Cualquiera disponible": shown only
  while the option is on.

## Scope / tasks
- [x] T1 SQL: column + `public_site_by_slug` exposes it + `public_site_book` guard
  (full create or replace from live). Types regenerated. Rolled-back live test.
- [ ] T2 UI: widget (no "any" card when off) + Ajustes → Reservas switch, service,
  store; pure helper + tests.

## Route
- T1–T2 delegated writer. Stacked on `feat/appointment-modal-polish` (unpushed) so
  the running dev server shows both.

## Progress / evidence
- T1 (delegated writer): `supabase/migrations/20261102120000_booking_allow_any.sql`
  applied via MCP `apply_migration` (`booking_allow_any`, version
  20261102160153); sha256 of the stored statement equals the file
  (`b89e23ed…3d15`). ACL of both functions unchanged
  (`postgres/anon/authenticated/service_role=X`). No column grant needed:
  `authenticated` holds table-level privileges and RLS limits writes.
  Guard placed after time validation, before the service lookup.
  Rolled-back live test on `labarbe` (`do $$ … raise exception $$`):
  RPC `bookingAllowAny=true` → off: `false`; off + null staff →
  `P0001 Elige con quién quieres tu cita.`; off + staff → booked (Carlos Henao);
  on + null → booked (auto-assigned Julian Jimenez). Afterwards 0 of 14 sites
  have the flag off and 0 test customers remain. Types regenerated (+3 lines).
