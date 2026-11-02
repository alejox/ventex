# Booking UX — Phase 5 (polish)

## Objective
Last pass of the booking UX audit of 2026-11-01: visual and copy consistency in
the booking surfaces (dashboard calendar/appointments and the public booking
flow). Phases 1–4: `odd/tasks/booking-ux-phase{1,2,3,4}.md` (2–4 not yet on main;
this branch stacks on phase 4).

## Scope / tasks
- [x] T1 Theme colours: dashboard booking UI (calendar, appointment modal, list,
  TimeGrid, Pendientes, Ajustes → Reservas) uses token classes instead of
  hard-coded hex/Tailwind palette colours (`bg-blue-500`, `#…`); public booking UI
  uses `--site-*` variables instead of fixed colours. Status colours keep meaning
  and contrast in light and dark.
- [x] T2 Copy: consistent capitalization (Spanish sentence case: "Nueva cita", not
  "Nueva Cita") in buttons, titles, chips and labels; "equipo"/"profesional"/
  "negocio" instead of "barbero(s)" in shared (multi-vertical) copy; tuteo.
- [x] T3 Readable dates: list view and Pendientes show dates like "lun 3 nov" /
  "Hoy", "Mañana" (business timezone, `es-CO`), not ISO `2026-11-03`; pure
  formatter in `lib/` with tests.

## Constraints
- Token classes from `app/globals.css`, no new hex. Spanish (Colombia, tuteo).
- No behaviour changes beyond presentation; e2e selectors updated if copy changes.

## Route
- T1–T3 delegated writer (many non-trivial files).

## Progress / evidence
- T1 (delegated writer) — `823104d` style(calendar). Inventory (rg for palette
  classes/hex/rgb): only 9 hits, all dashboard. `app/dashboard/calendar/page.tsx`
  (completed/pending chips + list bars → `success`/`warning`),
  `components/appointments/AppointmentModal.tsx` (status options, paid banner →
  `success`/`warning`; delete button `bg-error-dim text-white` → `bg-error
  text-on-error`, same as `Button` danger), `components/calendar/TimeGrid.tsx`
  (now-line `#ea4335` → `bg-error`). Public booking components already used
  `--site-*` only: no change. No new tokens.
- T2 — `3b8e202` fix(calendar). "Nueva Cita"/"Eliminar Cita" → sentence case;
  BookingAdminCard hint "a los barberos" → "al resto del equipo"; no voseo
  found. E2E selectors updated (calendar, appointment-datetime,
  appointment-status, responsive-mobile). Pending outside surface:
  `config/business.ts:507` command-palette entry still says "Nueva Cita".
- T3 — `971e034` feat(calendar). `lib/appointment-day.ts`
  `formatAppointmentDay(day, today)`; RED observed (module missing), GREEN 6/6
  in `tests/appointment-day.test.ts`. Used in list + Pendientes rows (with
  `<time dateTime>`) and the AppointmentModal header. "Today" is the page's
  existing device-clock `todayIso` (same one `isOverdue` uses); the calendar has
  no business-timezone "today" yet.
- Parent: command-palette entry in `config/business.ts` → "Nueva cita".
- Checks after T3: `npm test` 1206/1206 pass; `npx tsc --noEmit` clean; eslint
  on changed files clean; `npx playwright test --list` 225 tests in 35 files.

## Next step
Parent review / RDD assessment of the three commits; optionally fix the
command-palette "Nueva Cita" in `config/business.ts`.
