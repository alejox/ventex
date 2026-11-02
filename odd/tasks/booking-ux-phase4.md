# Booking UX — Phase 4 (customer reschedule)

## Objective
Let a public-site customer move their own appointment to another day/time
with the same phone lookup they already use to cancel, from the UX audit of
2026-11-01. Phases 1–3: `odd/tasks/booking-ux-phase{1,2,3}.md` (2 and 3 not yet
on main; this branch stacks on phase 3).

## Problem
- Today a customer who can't make it can only cancel (`CancelAppointment.tsx`,
  `public_site_cancel_appointment`) and book again, losing the slot and
  creating a second customer action the business sees as cancel + new booking.

## Decisions (defaults, no product fork)
- Same service; same staff member when one is assigned (availability checked for
  that person); unassigned keeps the "any available" rule (admin exclusion included).
- After a reschedule the appointment goes back to `pending` so the business
  re-confirms it; owner + assigned staff get a notification (same model as cancel:
  `recipient_staff_id`, active member gate).
- Only `pending`/`confirmed`, not started, found by the same phone match as cancel.
- The appointment's own slot does not block its new time (excluded from busy).

## Scope / tasks
- [x] T1 SQL: `public_site_reschedule_appointment(slug, appointment_id, phone, date, time)`
  SECURITY DEFINER, same ownership/phone checks as cancel, same advisory lock and
  slot rules as `public_site_book` (excluding itself), tuteo errors, notifications.
  Full `create or replace` from live definitions if any existing function changes.
  Rolled-back live test.
- [ ] T2 UI: "Cambiar fecha" per appointment in the cancel/lookup modal (site theme
  `--site-*`), reusing the widget's day/slot pickers for that service/staff, confirm
  step, success state ("Tu cita quedó para …, el negocio la confirmará").
  Service/store/types; pure helpers with tests.

## Constraints
- Public site: `--site-*` variables only, Spanish tuteo. Components → stores → services.
- Migrations via MCP + identical .sql, unique timestamp; regen types.

## Route
- T1–T2 delegated writer (SQL + multiple non-trivial UI files).

## Progress / evidence
- T1 (delegated writer): `supabase/migrations/20261102100000_public_site_reschedule_appointment.sql`
  applied via MCP (identical file), `utils/supabase/database.types.ts` regenerated.
  Approach: `public_site_slots`/`public_site_day_slots`/`public_site_availability`
  gain `p_exclude_appointment_id uuid default null` (old signature dropped in the
  same migration, bodies from live `pg_get_functiondef`, ACL anon/authenticated/
  service_role kept), so the moved appointment never blocks its own new time —
  no status flip, no trigger side effects. `public_site_find_appointments` now also
  returns `serviceId`, `staffId`, `reschedulable`. New RPC raises `CITA_NO_ENCONTRADA`,
  `CITA_NO_REPROGRAMABLE` (22023) or tuteo P0001 messages; notifications
  `event='rescheduled'` (owner) / `'rescheduled_staff'` (member gate), routed by the
  existing `notificationDestination` (type `appointment` + `appointment_id`).
  Rolled-back live test (`do $$ … raise exception`), palo-de-agua: reschedule
  10:00→11:00 ok (pending, 11:00–12:00, owner notice "Cita reprogramada");
  11:00→11:30 overlapping its own slot ok; taken 15:00 → "Ese horario ya fue tomado";
  wrong phone → CITA_NO_ENCONTRADA; same time → "Tu cita ya está en ese horario";
  cancelled → CITA_NO_REPROGRAMABLE; old 4-arg `public_site_slots` call works;
  `day_slots` 11:30 free with exclusion vs taken without. p-bbarbershop: cross-day
  move with a staff member with membership → owner + staff (`rescheduled_staff`)
  notices. No rows left behind (verified).
