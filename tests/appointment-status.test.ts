import assert from "node:assert/strict";
import test from "node:test";
import {
  APPOINTMENT_STATUSES,
  canMarkNoShow,
  freesSlot,
  hasStarted,
  statusLabel,
} from "../lib/appointment-status";

const now = { date: "2026-11-01", minutes: 10 * 60 + 30 };
const appt = (over: Partial<{ status: string; appointment_date: string; start_time: string; sale_id: string | null }> = {}) => ({
  status: "confirmed",
  appointment_date: "2026-11-01",
  start_time: "10:00:00",
  sale_id: null,
  ...over,
});

test("'No vino' tiene etiqueta y está entre los estados del filtro", () => {
  assert.equal(statusLabel("no_show"), "No vino");
  assert.ok(APPOINTMENT_STATUSES.some((s) => s.value === "no_show"));
  assert.equal(statusLabel("raro"), "raro");
});

test("un 'No vino' libera el horario igual que una cancelada", () => {
  assert.equal(freesSlot("cancelled"), true);
  assert.equal(freesSlot("no_show"), true);
  assert.equal(freesSlot("pending"), false);
  assert.equal(freesSlot("completed"), false);
});

test("la cita empezó: días anteriores, o hoy con la hora ya pasada", () => {
  assert.equal(hasStarted(appt(), now), true);
  assert.equal(hasStarted(appt({ start_time: "10:30" }), now), true);
  assert.equal(hasStarted(appt({ start_time: "11:00" }), now), false);
  assert.equal(hasStarted(appt({ appointment_date: "2026-10-31", start_time: "23:00" }), now), true);
  assert.equal(hasStarted(appt({ appointment_date: "2026-11-02", start_time: "08:00" }), now), false);
});

test("'Marcar como no vino' solo para citas pendientes o confirmadas que ya empezaron y no se cobraron", () => {
  assert.equal(canMarkNoShow(appt(), now), true);
  assert.equal(canMarkNoShow(appt({ status: "pending" }), now), true);
  assert.equal(canMarkNoShow(appt({ start_time: "11:00" }), now), false);
  assert.equal(canMarkNoShow(appt({ status: "completed" }), now), false);
  assert.equal(canMarkNoShow(appt({ status: "cancelled" }), now), false);
  assert.equal(canMarkNoShow(appt({ status: "no_show" }), now), false);
  assert.equal(canMarkNoShow(appt({ sale_id: "s1" }), now), false);
});
