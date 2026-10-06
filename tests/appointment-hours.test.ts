import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_GRID_HOURS,
  FALLBACK_START_SLOTS,
  closedIntervals,
  gridHourRange,
  isWithinOpenHours,
  openStartSlots,
  quarterHourSlots,
  weekdayOf,
  type OpeningHour,
} from "../lib/appointment-hours";

// Lunes a viernes 9–19, sábado 8:30–14, domingo cerrado.
const week: OpeningHour[] = [
  { weekday: 0, is_open: false, opens_at: "09:00", closes_at: "19:00" },
  ...[1, 2, 3, 4, 5].map((weekday) => ({ weekday, is_open: true, opens_at: "09:00", closes_at: "19:00" })),
  { weekday: 6, is_open: true, opens_at: "08:30", closes_at: "14:00" },
];

test("weekdayOf usa el día local de la fecha (0 = domingo)", () => {
  assert.equal(weekdayOf("2026-10-04"), 0);
  assert.equal(weekdayOf("2026-10-06"), 2);
});

test("sin horario cargado la grilla queda en 7–21 y no se sombrea nada", () => {
  assert.deepEqual(gridHourRange(null, [1, 2]), { ...DEFAULT_GRID_HOURS });
  assert.deepEqual(gridHourRange([], [1]), { ...DEFAULT_GRID_HOURS });
  assert.deepEqual(closedIntervals(null, 1, 420, 1260), []);
});

test("la grilla va de la apertura más temprana al cierre más tardío de los días a la vista", () => {
  assert.deepEqual(gridHourRange(week, [1, 2, 3, 4, 5, 6, 0]), { from: 8, to: 19 });
  assert.deepEqual(gridHourRange(week, [2]), { from: 9, to: 19 });
});

test("un día cerrado a la vista usa la escala del resto de la semana", () => {
  assert.deepEqual(gridHourRange(week, [0]), { from: 8, to: 19 });
});

test("la semana entera cerrada vuelve al rango por defecto", () => {
  const closed = week.map((h) => ({ ...h, is_open: false }));
  assert.deepEqual(gridHourRange(closed, [1]), { ...DEFAULT_GRID_HOURS });
});

test("se sombrea antes de abrir y después de cerrar; el día cerrado entero", () => {
  assert.deepEqual(closedIntervals(week, 1, 8 * 60, 19 * 60), [{ start: 8 * 60, end: 9 * 60 }]);
  assert.deepEqual(closedIntervals(week, 6, 7 * 60, 19 * 60), [
    { start: 7 * 60, end: 8 * 60 + 30 },
    { start: 14 * 60, end: 19 * 60 },
  ]);
  assert.deepEqual(closedIntervals(week, 0, 8 * 60, 19 * 60), [{ start: 8 * 60, end: 19 * 60 }]);
  assert.deepEqual(closedIntervals(week, 1, 9 * 60, 19 * 60), []);
});

test("isWithinOpenHours exige el tramo entero dentro del horario", () => {
  assert.equal(isWithinOpenHours(week, 1, 9 * 60, 10 * 60), true);
  assert.equal(isWithinOpenHours(week, 1, 18 * 60 + 30, 19 * 60 + 15), false);
  assert.equal(isWithinOpenHours(week, 0, 10 * 60, 11 * 60), false);
  assert.equal(isWithinOpenHours(null, 0, 2 * 60, 3 * 60), true);
});

test("el selector ofrece solo horas abiertas, desde la apertura y terminando antes del cierre", () => {
  const saturday = openStartSlots(week, 6);
  assert.equal(saturday[0], "08:30");
  assert.equal(saturday[saturday.length - 1], "13:30");
  assert.ok(!saturday.includes("14:00"));
  assert.deepEqual(openStartSlots(week, 0), []);
  assert.equal(openStartSlots(null, 0), FALLBACK_START_SLOTS);
  assert.equal(FALLBACK_START_SLOTS[0], "06:00");
  assert.equal(FALLBACK_START_SLOTS[FALLBACK_START_SLOTS.length - 1], "22:00");
});

test("Otra hora… cubre el día entero cada 15 minutos", () => {
  const all = quarterHourSlots();
  assert.equal(all.length, 96);
  assert.equal(all[0], "00:00");
  assert.equal(all[1], "00:15");
  assert.equal(all[95], "23:45");
});
