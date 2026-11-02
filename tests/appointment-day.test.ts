import assert from "node:assert/strict";
import test from "node:test";
import { formatAppointmentDay } from "../lib/appointment-day";

const TODAY = "2026-11-02";

test("formatAppointmentDay names today, tomorrow and yesterday", () => {
  assert.equal(formatAppointmentDay("2026-11-02", TODAY), "Hoy");
  assert.equal(formatAppointmentDay("2026-11-03", TODAY), "Mañana");
  assert.equal(formatAppointmentDay("2026-11-01", TODAY), "Ayer");
});

test("formatAppointmentDay crosses month and year boundaries for relative names", () => {
  assert.equal(formatAppointmentDay("2026-12-01", "2026-11-30"), "Mañana");
  assert.equal(formatAppointmentDay("2026-12-31", "2027-01-01"), "Ayer");
});

test("formatAppointmentDay prints a short weekday, day and month for other days of this year", () => {
  assert.equal(formatAppointmentDay("2026-11-05", TODAY), "jue 5 nov");
  assert.equal(formatAppointmentDay("2026-09-03", TODAY), "jue 3 sept");
  assert.equal(formatAppointmentDay("2026-01-01", TODAY), "jue 1 ene");
});

test("formatAppointmentDay adds the year only when it is not the current one", () => {
  assert.equal(formatAppointmentDay("2027-01-04", TODAY), "lun 4 ene 2027");
  assert.equal(formatAppointmentDay("2025-12-30", TODAY), "mar 30 dic 2025");
});

test("formatAppointmentDay ignores a time suffix and never shifts the day", () => {
  assert.equal(formatAppointmentDay("2026-11-05T00:00:00", TODAY), "jue 5 nov");
  assert.equal(formatAppointmentDay("2026-11-02", "2026-11-02T23:59:59"), "Hoy");
});

test("formatAppointmentDay returns the input unchanged when it is not a date", () => {
  assert.equal(formatAppointmentDay("", TODAY), "");
  assert.equal(formatAppointmentDay("pronto", TODAY), "pronto");
});
