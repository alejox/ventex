import assert from "node:assert/strict";
import test from "node:test";
import { formatAppointmentTime } from "../lib/time";

test("appointment times default to 12 hours and distinguish midnight from noon", () => {
  assert.equal(formatAppointmentTime("00:00:00"), "12:00 AM");
  assert.equal(formatAppointmentTime("09:05"), "9:05 AM");
  assert.equal(formatAppointmentTime("12:00"), "12:00 PM");
  assert.equal(formatAppointmentTime("14:30:00"), "2:30 PM");
  assert.equal(formatAppointmentTime("23:59"), "11:59 PM");
});

test("24-hour display preserves hours and minutes without AM/PM", () => {
  assert.equal(formatAppointmentTime("00:00", "24"), "00:00");
  assert.equal(formatAppointmentTime("09:05:00", "24"), "09:05");
  assert.equal(formatAppointmentTime("14:30", "24"), "14:30");
});
