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

- [x] T3 — Notify the assigned barber in-app. `notifications.recipient_staff_id` (null = owner-wide). RLS: owner reads/acks rows with `recipient_staff_id is null`; a member reads/acks rows where `recipient_staff_id = current_staff_id()`. The cancel RPC inserts a second notification for `appointments.staff_id` when that staff has an active membership (event `cancelled_by_customer_staff`, no WhatsApp button). Only barbers with a Ventex login receive it (user's choice, option 1). Scope (branch `feat/notify-barber-on-cancel`): migration `20261101120000_notify_staff_on_site_cancel.sql` (column + partial index, both policies rewritten with the same names, revoke TRUNCATE/REFERENCES/TRIGGER from anon/authenticated, RPC identical to `20261101110000` plus the staff insert; the membership must be `member_kind = 'member'`, like `current_staff_id()`), staff title "Se canceló una de tus citas" (does not hit the old-row title fallback), manual test `supabase/manual-tests/20261101120000_notify_staff_on_site_cancel.rollback.sql`, unit test for `cancelled_by_customer_staff` → no WhatsApp link. Client service/bell unchanged: RLS does the filtering, the click goes to `/dashboard/calendar?appointment=` that a worker can open for their own appointment. Known: an admin member with a staff record sees both rows. Route: delegated (migration + RPC + RLS + bell/service + tests). Checks: `npm test`, `npx tsc --noEmit`, eslint, migration applied + RLS smoke test as owner and as worker.

## Progress / evidence
- T1: RED `phoneLookupKey is not a function` → GREEN 6/6; `npm test` 1133/1133; `tsc` clean; eslint clean on changed files.
- Migration applied to remote via MCP; manual test (rollback) all 9 expectations met: find 1 (no name), short phone [], cancel already=false, re-cancel already=true, 1 notification, find after [], foreign phone CITA_NO_ENCONTRADA, completed/past CITA_NO_CANCELABLE.
- T2: RED `Cannot find module` → GREEN 7/7; `npm test` 1140/1140; tsc + eslint clean. Migration applied via MCP; rollback smoke test shows notification data with event/date/time/service. Site button relabeled "Cancelar cita" (user request).
- T3: `npm test` 1141/1141; tsc clean; new test passed first run (no RED: `cancelNoticeLink` already ignored other events). Migration applied via MCP; rollback test as anon/member/owner: owner row 1, staff row 1 ("Se canceló una de tus citas", event cancelled_by_customer_staff), member sees 1 and acks 1, owner sees 1. Known: an admin member with a staff record sees both rows.
- Pending: browser check of the UI; regenerate `database.types.ts` to drop the `untypedRpc` helper.
- RDD: off (global) — no native review.
- Delivery strategy: ask-on-risk; forecast ~350 lines, single PR.

## Next step
T1.
