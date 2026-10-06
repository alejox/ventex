import assert from "node:assert/strict";
import test from "node:test";
import { formatWeekRange, initialCalendarView, initialStaffFilter, parseCalendarView } from "../lib/calendar-layout";
import { samePermissions } from "../app/dashboard/staff/components/permission-diff";

const d = (iso: string) => new Date(`${iso}T12:00:00`);

test("en pantalla angosta abre en Día; en escritorio, en Semana", () => {
  assert.equal(initialCalendarView(null, true), "day");
  assert.equal(initialCalendarView(null, false), "week");
});

test("la vista elegida a mano manda sobre el ancho de pantalla", () => {
  assert.equal(initialCalendarView("week", true), "week");
  assert.equal(initialCalendarView("month", false), "month");
});

test("lo guardado se valida antes de usarlo", () => {
  assert.equal(parseCalendarView("day"), "day");
  assert.equal(parseCalendarView("agenda"), null);
  assert.equal(parseCalendarView(null), null);
});

test("el rango de semana nombra los dos meses cuando cruza", () => {
  assert.equal(formatWeekRange(d("2026-09-28"), d("2026-10-04")), "28 sep – 4 oct");
  assert.equal(formatWeekRange(d("2026-10-05"), d("2026-10-11")), "5 – 11 oct");
  assert.equal(formatWeekRange(d("2026-12-28"), d("2027-01-03")), "28 dic 2026 – 3 ene 2027");
});

test("un trabajador con ficha abre en Mis citas; el resto ve a todo el equipo", () => {
  assert.equal(initialStaffFilter(true, "staff-1"), "staff-1");
  assert.equal(initialStaffFilter(true, null), "all");
  assert.equal(initialStaffFilter(false, "staff-1"), "all");
});

test("permisos: solo cuentan los encendidos, sin importar el orden", () => {
  assert.equal(samePermissions({ pos: true, sales: true }, { sales: true, pos: true }), true);
  assert.equal(samePermissions({ pos: true, sales: false }, { pos: true }), true);
  assert.equal(samePermissions({ pos: true }, { pos: true, inventory: true }), false);
});
