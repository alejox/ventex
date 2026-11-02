# Appointment modal — visual hierarchy

## Objective
The edit/create appointment modal (`components/appointments/AppointmentModal.tsx`)
looks flat: every field is the same white pill on white, the header repeats the
date shown again in "Fecha y hora", the phone input has no label, "+ Crear
cliente" floats between fields, and the two collapsibles look different. Give it
hierarchy without changing behaviour.

## Scope / tasks
- [x] T1 Header: customer as the main line (initials avatar + name), service ·
  assigned person as subtitle, status chip; no duplicated date (the body card owns it).
- [x] T2 Body grouped into sections on tinted surfaces (`surface-container-low`)
  with small icon + label headings: Cliente (select, labelled "Teléfono" field,
  "Crear cliente" as a link aligned with the section heading), Servicio y
  profesional, Fecha y hora. Consistent spacing.
- [x] T3 Collapsibles ("Notas y detalles opcionales", "Personalizar título",
  "Más acciones") share one style with a rotating chevron; footer separated on a
  tinted bar.
- [x] T4 Clarity (user follow-up: "no es claro"): pending hint above the footer
  ("Confírmala y después podrás avisarle al cliente por WhatsApp"; with unsaved
  edits it says confirming also saves them — true: `confirmPending` runs
  `saveForm()` before `updateStatus`); "Guardar cambios" disabled while editing
  without changes (still rendered, so `form="appointment-edit-form"` stays);
  phone block labelled "Teléfono del cliente" + helper (feeds the WhatsApp
  notices, edited in the customer record); "Asignado a" → "Profesional";
  no required asterisks anywhere (was "Fecha y hora *" / "Título *" only);
  "Cambiar" drawn as a pill button; "Más acciones" grouped: Mover / estados,
  separator, then "Cancelar cita" and "Eliminar cita" in error color.

## Constraints
- Presentation only: same fields, handlers, copy meaning, e2e selectors keep working
  (labels/roles unchanged or e2e updated). Token classes only, light + dark.
  Spanish tuteo.

## Route
- T1–T4 delegated writer (AppointmentModal.tsx + DateTimeField.tsx; writer
  trigger: 2 non-trivial files).

## Progress / evidence
- T1–T4 done in one work-unit commit (presentation only; no handler/state/data
  changes). Test-first exception: pure presentation, no meaningful runnable RED;
  existing `tests/appointment-modal-layout.test.tsx` still guards the markup.
- `npm test`: 1210/1210 pass. `npx tsc --noEmit`: clean. `npx eslint` on both
  files: clean. E2E not run (needs dev server on :3001 + login); no spec
  selector changed meaning (dialog names, "Personalizar título", "Más acciones",
  "Eliminar cita", "Confirmar reserva", status chip text, `/Cambiar/` button).
- DateTimeField gained an optional `label` prop (default "Fecha y hora", no
  asterisk); the modal passes `null` because its section heading owns it.
- Known edge: with "Guardar cambios" disabled when not dirty, an edited
  appointment with no staff can no longer be re-saved unchanged just to trigger
  auto-assignment; any edit re-enables it.

## Next step
Visual check in light/dark and on mobile width; run the appointment e2e specs.
