import assert from "node:assert/strict";
import test from "node:test";
import { buildReminderMessage, canRemind, formatReminderDate } from "../lib/appointment-reminder";

const now = { date: "2026-11-01", minutes: 10 * 60 };

test("la fecha va como la dice una persona, sin correrse de día por la zona horaria", () => {
  assert.equal(formatReminderDate("2026-11-07"), "sábado 7 de noviembre");
  assert.equal(formatReminderDate("2026-11-01"), "domingo 1 de noviembre");
  assert.equal(formatReminderDate("basura"), null);
});

test("mensaje completo con nombre, servicio, fecha, hora y negocio", () => {
  assert.equal(
    buildReminderMessage({ customerName: "Ana María", service: "Corte", date: "2026-11-07", time: "3:30 p. m.", businessName: "Barbería Sur" }),
    "Hola Ana, te recordamos tu cita de Corte el sábado 7 de noviembre a las 3:30 p. m. en Barbería Sur. Si no puedes asistir, avísanos por aquí.",
  );
});

test("sin los datos opcionales el mensaje sigue siendo una frase correcta", () => {
  assert.equal(
    buildReminderMessage({ date: "2026-11-07", time: "15:30" }),
    "Hola, te recordamos tu cita el sábado 7 de noviembre a las 15:30. Si no puedes asistir, avísanos por aquí.",
  );
});

test("se recuerda una cita confirmada que todavía no empezó", () => {
  const appt = { status: "confirmed", appointment_date: "2026-11-01", start_time: "11:00:00" };
  assert.equal(canRemind(appt, now), true);
  assert.equal(canRemind({ ...appt, appointment_date: "2026-11-05", start_time: "08:00" }, now), true);
  assert.equal(canRemind({ ...appt, start_time: "10:00" }, now), false);
  assert.equal(canRemind({ ...appt, appointment_date: "2026-10-31" }, now), false);
  assert.equal(canRemind({ ...appt, status: "pending" }, now), false);
  assert.equal(canRemind({ ...appt, status: "no_show" }, now), false);
});
