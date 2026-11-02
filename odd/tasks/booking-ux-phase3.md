# Booking UX — Phase 3 (business operations)

## Objective
Make the agenda work better for the people running it (owner, admin, barbers),
from the UX audit of 2026-11-01. Phases 1–2: `odd/tasks/booking-ux-phase1.md`,
`odd/tasks/booking-ux-phase2.md` (phase 2 not yet on main; this branch stacks on it).

## Problem
- Día/Semana time grid has one column per day, never per staff member
  (`components/calendar/TimeGrid.tsx`, `calendar/page.tsx:635`).
- No "No vino" (no-show) status: statuses are pending/confirmed/completed/cancelled.
- No WhatsApp reminder; WhatsApp appears only right after confirming.
- Booking settings are scattered: switch + hours in the page editor, admin
  assignment in Ajustes → Negocio, slot interval has no UI.

## Scope / tasks
- [x] T1 Día view by staff: in Día, one column per visible staff member (plus
  "Sin asignar" when needed); click/drag works per column (drag to another
  column reassigns, with the existing clash check). Semana unchanged.
- [x] T2 "No vino" status (`no_show`): DB check constraint + types, modal action
  "Marcar como no vino" (with confirmation), chip/colour from theme tokens,
  filters/legend, excluded from availability like cancelled, counted in reports
  only if they already split by status.
- [ ] T3 "Recordar por WhatsApp" on confirmed upcoming appointments (modal +
  list row), prefilled reminder message (pure builder + tests).
- [ ] T4 Ajustes → "Reservas" tab: online booking switch, slot interval
  (`business_sites.slot_interval_minutes`), the admin-assignment card (moved
  from Negocio), and a link to edit hours in the page editor. Calendar's
  "Configurar reservas y horarios" points here.

## Constraints
- Dashboard UI: token classes, `Modal`/`useConfirm`/`Button`/`Switch`, Spanish tuteo.
- Migrations via MCP + identical .sql with a unique timestamp; regen types.
- Availability SQL (`public_site_slots`/`day_slots`/`book`) and
  `lib/appointment-availability.ts` must treat `no_show` like `cancelled`.

## Route
- T1–T4 delegated writer.

## Progress / evidence
- T1 (delegated writer): `lib/staff-columns.ts` (pure columns/grouping, RED→GREEN
  `tests/staff-columns.test.ts` 9 tests), `swipeAllowed` in `lib/appointment-drag.ts`
  (+1 test), TimeGrid column abstraction (staff columns in Día, single 2-axis scroller
  with sticky header + sticky hour gutter), drag across columns passes `staffId` to
  `rescheduleAppointment` (service/store), clash check against the TARGET person,
  undo restores the previous person; click on empty slot prefills the person
  (`AppointmentModal.defaultStaffId`). Private agenda (worker without `calendar_all`)
  keeps the single-day column. Checks: npm test 1183/1183, tsc clean, eslint clean.
  Commit: `171d9bf`.
- T2 (delegated writer): migration `20261101150000_appointment_no_show.sql` applied via
  MCP (CHECK + `no_show`; `agenda_busy_slots`, `appointments_prevent_staff_overlap`,
  `appointments_prevent_station_overlap`, `public_site_slots`, `public_site_day_slots`,
  `public_site_book`, `public_site_cancel_appointment` = live defs with only the status
  predicate changed; md5 of each live def after apply == md5 of the expected transform;
  ACLs unchanged). Positive filters (`public_site_find_appointments`,
  `complete_appointment_on_service_sale`, finance pending count) already exclude it.
  Live DO-block check (rolled back via raise): overlap rejected → after `no_show` the
  slot is free → reverting to pending re-validates (23P01) → unknown status rejected.
  `database.types.ts` regenerated: no diff (status is text + CHECK). Client:
  `lib/appointment-status.ts` (labels, `freesSlot`, `hasStarted`, `canMarkNoShow`;
  4 tests), availability ignores freed statuses (+1 test), `fetchDayBusy` excludes both,
  Estado filter/labels/colours (tertiary tokens), modal "Marcar como no vino" (useConfirm,
  only after start time, unpaid pending/confirmed), no Cobrar/Mover for no_show,
  TodayOperations drops it. Reports: none split appointments by status (skipped).
  Checks: npm test 1188/1188, tsc clean, eslint clean. Commit: see T3 entry.
