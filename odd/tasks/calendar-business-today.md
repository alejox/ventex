# Calendar "today" in the business timezone

## Objective
The agenda decides "today" and "now" (Hoy/Mañana labels, overdue pendings,
"Recordar por WhatsApp", "Marcar como no vino", today highlight, "Hoy" button,
now-line) from the business timezone (`business_sites.timezone` via
`fetchBusinessTimeZone`, device timezone as fallback), not the device clock.

## Problem
`app/dashboard/calendar/page.tsx` (`todayIso`, `openedAt`, `today`, `goToday`,
~L484 `now`) and `components/appointments/AppointmentModal.tsx` (`localNow`,
`toISODate()` in the header) use `new Date()` local fields. A person viewing the
agenda from another timezone sees wrong "Hoy", overdue chips and actions.

## Scope / tasks
- [x] T1 Pure helper `businessNow(tz, instant)` → `{ date: 'YYYY-MM-DD', minutes }`
  in `lib/tz.ts` (reuse `calendarDayIn`), tests first. Store loads the business
  timezone once (appointments store, via `fetchBusinessTimeZone`). Calendar page,
  AppointmentModal, TimeGrid now-line and TodayOperations use it.

## Route
- T1 delegated writer (3+ non-trivial files).

## Progress / evidence
- T1 done in `5e27cdc` (`fix(calendar): use the business timezone for today and now`), route: delegated writer.
  - `lib/tz.ts`: `businessNow(tz, instant)` (date + minutes on the business clock, h23 so midnight is 0) and `localDateOf(day)` (local-midnight `Date` for grid navigation).
  - `stores/appointments.store.ts`: `timeZone` (starts as `browserTimeZone()`) + `ensureTimeZone()` reusing the session-cached `fetchBusinessTimeZone`.
  - Calendar page: `todayIso`/`openedAt`/`today` derive from `businessNow(timeZone, openedInstant)`; initial `currentDate` and `goToday` use the business day; when the zone arrives the grid jumps to the business today unless the user navigated; month `isOnToday` compares with the business day; `TimeGrid` gets `timeZone` for the now-line.
  - AppointmentModal: `openedAt` (no-show/reminder), header "Hoy/Mañana" and the fallback date of a new appointment use the business clock.
  - TodayOperations: fetches `calendarDayIn(timeZone)` and refetches when the zone arrives.
  - Left as is: `DateTimeField` weekday fallback `new Date().getDay()` (only when no date is set); store `selectedDate: new Date()` (not read by the modal, which receives the page's `currentDate`); grid date arithmetic on local `Date`s.
- RED: `tests/business-now.test.ts` failed (`localDateOf is not a function`) before the helpers; GREEN 4/4 after.
- Checks: `npm test` 1210/1210 pass; `npx tsc --noEmit` exit 0; `npx eslint` on the 7 changed files exit 0.

## Next step
Manual check on the agenda with the device zone set away from the business zone; native review per RDD.
