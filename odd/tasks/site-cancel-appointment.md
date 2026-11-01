# Site: cancel an appointment by phone

## Objective
Let a visitor of a public business site (`app/[slug]`, barbershops/salons) cancel their own upcoming appointment using the phone number they booked with, from a "Cancelar mi cita" button on the site.

## Why
Today the only way to cancel is to message the business on WhatsApp. The user asked for the simplest flow: phone number → see upcoming appointments → cancel.

## Design
- Two public RPCs (`security definer`, granted to `anon`/`authenticated`), scoped to a published site with booking enabled:
  - `public_site_find_appointments(p_slug, p_phone)` → upcoming (`appointment_date + start_time` >= now in the site timezone) `pending|confirmed` appointments whose customer phone matches by the last 10 digits. Returns id, date, time, service, staff only (never the customer name).
  - `public_site_cancel_appointment(p_slug, p_phone, p_appointment_id)` → re-checks site, phone match, status and future start, sets `status = 'cancelled'` (frees the slot), inserts a `notifications` row for the owner ("Cita cancelada por el cliente"). Idempotent on an already-cancelled appointment.
- Phone matching compares the last 10 digits after stripping non-digits, so dashboard-created customers with `+57`/spaces still match.
- Known limit (accepted, user's choice of "simplest"): anyone who knows a phone number can see and cancel that phone's upcoming appointments on that site. No OTP/token.

## Scope / allowed surfaces
- `supabase/migrations/20261101100000_public_site_cancel_appointment.sql`
- `supabase/manual-tests/20261101100000_public_site_cancel_appointment.rollback.sql`
- `services/public-site.service.ts`, `services/public-site.types.ts`
- `stores/public-cancel.store.ts` (new; `public-booking.store.ts` left untouched)
- `lib/errors.ts` (`CITA_NO_ENCONTRADA` / `CITA_NO_CANCELABLE` translations)
- `app/[slug]/CancelAppointment.tsx` (new), `app/[slug]/templates/SiteSections.tsx`
- `lib/co-mobile.ts` (`phoneLookupKey`, mirror of the SQL phone match), `tests/co-mobile.test.ts` (new)
- T2: `supabase/migrations/20261101110000_cancel_notification_whatsapp_data.sql` (new), `lib/appointment-cancel-message.ts` (new), `tests/appointment-cancel-message.test.ts` (new), `components/NotificationsBell.tsx`

## Tasks
- [x] T1 — Migration + RPCs + client flow + button + tests. Route: delegated (writer trigger: 4+ non-trivial files). Checks: `npm test`, `npx tsc --noEmit`, `npm run lint`, migration applied via MCP and smoke-tested.

- [x] T2 — "Avisar por WhatsApp" for the owner: the "Cita cancelada por el cliente" notification gets a `wa.me` button to the CUSTOMER's phone with a prefilled "Se ha cancelado tu cita…" message (no WhatsApp API: same `wa.me` model as promos, a person taps Send). The cancel RPC adds `event`, `date`, `time`, `service` to the notification `data`. Route: delegated (migration + pure message builder + test + bell UI). Checks: `npm test`, `npx tsc --noEmit`, eslint, migration applied + smoke-tested.

## Progress / evidence
- T1: RED `phoneLookupKey is not a function` → GREEN 6/6; `npm test` 1133/1133; `tsc` clean; eslint clean on changed files.
- Migration applied to remote via MCP; manual test (rollback) all 9 expectations met: find 1 (no name), short phone [], cancel already=false, re-cancel already=true, 1 notification, find after [], foreign phone CITA_NO_ENCONTRADA, completed/past CITA_NO_CANCELABLE.
- T2: RED `Cannot find module` → GREEN 7/7; `npm test` 1140/1140; tsc + eslint clean. Migration applied via MCP; rollback smoke test shows notification data with event/date/time/service. Site button relabeled "Cancelar cita" (user request).
- Pending: browser check of the UI; regenerate `database.types.ts` to drop the `untypedRpc` helper.
- RDD: off (global) — no native review.
- Delivery strategy: ask-on-risk; forecast ~350 lines, single PR.

## Next step
T1.
