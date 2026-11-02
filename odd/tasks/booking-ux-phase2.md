# Booking UX — Phase 2 (customer fluency)

## Objective
Make the public booking flow on business sites smoother and consistent with the
site template, from the UX audit of 2026-11-01. Phase 1: `odd/tasks/booking-ux-phase1.md`.

## Problem
- The hours picker is a hand-built overlay (`BookingWidget.tsx:649-764`) that
  opens as soon as a day is tapped, so the calendar can't be browsed, with no
  focus management or scroll lock.
- The cancel-by-phone modal (`CancelAppointment.tsx`) uses dashboard tokens, so
  it clashes with dark/branded site templates.
- The success screen has no add-to-calendar, doesn't say how to cancel, and
  echoes the raw phone.
- Staff are picked from a plain `<select>` with no photo; notes is single-line.
- Booking CTAs differ per template ("Agendar", "Reserva tu turno"…), and public
  copy mixes "turno" and "cita".

## Scope / tasks
- [x] T1 Inline hours: tapping a day selects it and shows its slots inline
  (next to / under the calendar), no overlay; keyboard and screen-reader
  friendly; selected day highlighted; picking a slot scrolls to step 3 on mobile.
- [x] T2 Cancel modal follows the site theme (`--site-*` variables) instead of
  dashboard tokens.
- [x] T3 Success screen: "Agregar a mi calendario" (Google Calendar link + .ics),
  how to cancel (points to "Cancelar cita"), phone formatted.
- [x] T4 Staff picker as cards with photo/initials, name, role, plus
  "Cualquiera disponible"; notes as a textarea.
- [ ] T5 Copy: one CTA label "Reservar cita" across templates; "cita" instead of
  "turno" in public booking copy (aria-labels too; update e2e specs that match).

## Constraints
- Public site uses `--site-*` CSS variables, never dashboard tokens.
- Spanish, Colombian tuteo. Components → stores → services.
- Pure logic (ics/calendar link, phone format, copy helpers) in lib/ with tests.

## Route
- T1–T5 delegated writer (2+ non-trivial files per task).

## Progress / evidence
- T1 (delegated writer): hours overlay removed; day tap only selects it
  (`aria-pressed`), slots render in a `role="region"` "Horarios del …" panel
  beside the calendar (nested `@container`, `@xl`) or below it; hint "Elige un
  día para ver los horarios." until a day is picked (no auto-preselected day);
  picking a slot scrolls step 3 into view only when it is below the fold
  (reduced-motion → instant). e2e specs moved from the dialog to the region.
  Checks: npm test 1162 pass; tsc clean; eslint clean; playwright --list 5 tests.
  Commit 9e71c56.
- T2 (delegated writer): `CancelAppointment` keeps the shared `Modal`
  (behaviour) but repaints its panel via `className` with `--site-*`
  (important modifier), title/description as site-colored spans, no dashboard
  X (themed "Cerrar" at the bottom). `ConfirmDialog` replaced by an inline
  per-row "¿Cancelar esta cita?" step (same "Sí, cancelar" / "No, mantenerla"
  labels, so e2e (b) still matches). Phone validated client-side with
  `normalizeColombianMobile` + the widget's copy before searching. Checks:
  npm test 1162 pass; tsc clean; eslint clean; playwright --list 5 tests.
  Commit 6ec0d15.
- T3 (delegated writer): `lib/booking-calendar.ts` (`eventTimes`,
  `escapeIcsText`, `foldIcsLine` octet-aware, `buildIcs` CRLF,
  `googleCalendarUrl`) and `lib/phone-format.ts` (`formatColombianMobile`).
  Time zone: `site.timezone` when valid → UTC instants (`…Z`); otherwise
  floating local time (documented in the module). Success screen: "Agregar a mi
  calendario" (Google link + .ics Blob download), "¿No puedes ir? Usa «Cancelar
  cita» más abajo con tu celular.", phone shown as "300 123 4567". RED: both
  test files failed with "Cannot find module"; GREEN: 11/11. Checks: npm test
  1173 pass; tsc clean; eslint clean; playwright --list 5 tests.
  Commit bfc69c9.
- T4 (delegated writer): staff `<select>` → `<fieldset>` + `role="radiogroup"`
  ("Profesional") of native visually-hidden radios styled as cards
  ("Cualquiera disponible" first, then photo via `next/image` from
  `PublicStaff.photoUrl` or initials, name, role); arrow keys/Tab come from the
  native radios. Notes is a `<textarea rows={3}>` (same label; there was no
  maxLength before, none added). No SQL change. Checks: npm test 1173 pass; tsc
  clean; eslint clean; playwright --list 5 tests.
