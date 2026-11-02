# Booking UX — Phase 1 (trust)

## Objective
Fix the booking-flow gaps that lose appointments or leave people uninformed,
from the UX audit of 2026-11-01 (customer site, barber, admin).

## Problem
- Public widget: a failed availability load shows "Cargando disponibilidad…"
  forever (`BookingWidget.tsx:424`, store keeps `[]` on error); a failed day
  load says "El negocio no atiende ese día".
- The assigned staff member gets no notification for a new site booking
  (only the owner does, `public_site_book`).
- Cancelling from the dashboard has no confirmation and no way to tell the
  customer (`AppointmentModal.tsx:353-369`).
- "Pendientes" only counts the period on screen (`calendar/page.tsx:252,525`).
- No e2e coverage for booking/cancel/confirm; `public-calendar-privacy.spec.ts`
  likely stale.

## Scope / tasks
- [x] T1 Widget error states: distinguish loading vs failed for availability and
  day slots; show an error message with "Reintentar". Pure state helper + unit test.
- [ ] T2 Notify assigned staff on new site booking (`recipient_staff_id`, same
  model as the cancel notice). Full `create or replace` from the live definition.
- [x] T3 Dashboard cancel: `useConfirm` before cancelling; after cancelling,
  offer "Avisar por WhatsApp" to the customer (reuse `lib/appointment-cancel-message.ts`
  if it fits).
- [ ] T4 "Pendientes": count/list pending appointments across all dates (future
  + overdue), not just the visible period.
- [ ] T5 E2E: fix stale privacy spec; add specs for public booking, cancel by
  phone, confirming a pending booking (self-cleaning).

## Constraints
- UI copy Spanish, Colombian tuteo. Components → stores → services.
- Tenancy via `get_effective_user_id()`; public RPCs SECURITY DEFINER as today.
- Migrations: apply via MCP, save identical .sql (unique timestamp — note:
  `20261101120000` is already used twice).
- E2E runs against the shared Supabase project: mutating specs must clean up.

## Delivery
Strategy `ask-on-risk`; forecast ~600 authored lines → user already asked to
push phase results to main.

## Route
- T1, T3, T4: delegated writer A (UI, 2+ non-trivial files).
- T2, T5: delegated writer B (SQL + e2e).

## Progress / evidence
- T1 (delegated writer A) — commit `aef6e8b`. Store keeps `slotErrorKey` /
  `availabilityErrorKey`; `loadStatusOf` (`lib/booking-load-state.ts`) derives
  idle/loading/failed/empty/ready; widget shows "No pudimos cargar los
  horarios…" + "Reintentar" on failure. Retrying a failed key clears its answer
  so it shows as loading. RED (module missing) → GREEN 5/5
  (`tests/booking-load-state.test.ts`). npm test 1154/1154, tsc clean, eslint clean.
- T3 (delegated writer A) — `useConfirm` ("¿Cancelar esta cita?", "Sí, cancelar" /
  "No, mantenerla", danger) before cancelling; a cancelled appointment shows a
  "Cita cancelada" footer row with "Avisar por WhatsApp" (same pattern as the
  confirmed row), reusing `buildCancelNoticeMessage`. One added unit test (no RED:
  builder already existed). npm test 1155/1155, tsc clean, eslint clean.
