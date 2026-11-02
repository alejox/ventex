import assert from "node:assert/strict";
import test from "node:test";
import { toMessage } from "../lib/errors";
import {
  canReschedule,
  markCurrentSlot,
  rescheduleWhen,
} from "../lib/site-reschedule";
import { celdasDelMes, claveMes, parseDateInput, toDateInput } from "../lib/booking-month";
import type { DaySlot, UpcomingAppointment } from "../services/public-site.types";

const appointment = (over: Partial<UpcomingAppointment> = {}): UpcomingAppointment => ({
  id: "a1",
  date: "2026-11-17",
  time: "10:00",
  service: "Corte",
  staff: "Ana",
  status: "confirmed",
  serviceId: "s1",
  staffId: "st1",
  reschedulable: true,
  ...over,
});

const slots: DaySlot[] = [
  { time: "09:30", state: "taken" },
  { time: "10:00", state: "free" },
  { time: "10:30", state: "free" },
];

test("canReschedule: needs a service and the RPC's go-ahead", () => {
  assert.equal(canReschedule(appointment()), true);
  assert.equal(canReschedule(appointment({ reschedulable: false })), false);
  assert.equal(canReschedule(appointment({ serviceId: null })), false);
  // Payload from before the RPC learned these fields: no pickers to offer.
  assert.equal(canReschedule(appointment({ serviceId: undefined, reschedulable: undefined })), false);
});

test("markCurrentSlot: the appointment's own time is never offered as new", () => {
  const marked = markCurrentSlot(slots, "2026-11-17", appointment());
  assert.deepEqual(marked, [
    { time: "09:30", state: "taken" },
    { time: "10:00", state: "current" },
    { time: "10:30", state: "free" },
  ]);
});

test("markCurrentSlot: another day keeps every slot as it came", () => {
  assert.deepEqual(markCurrentSlot(slots, "2026-11-18", appointment()), slots);
});

test("rescheduleWhen: long Spanish date plus the business clock", () => {
  assert.equal(rescheduleWhen("2026-11-17", "15:30", "12"), "martes, 17 de noviembre a las 3:30 PM");
  assert.equal(rescheduleWhen("2026-11-17", "15:30", "24"), "martes, 17 de noviembre a las 15:30");
});

test("toMessage: CITA_NO_REPROGRAMABLE reads as a tuteo sentence", () => {
  const message = toMessage({ message: "CITA_NO_REPROGRAMABLE", code: "22023" });
  assert.match(message, /no se puede cambiar/);
  assert.doesNotMatch(message, /CITA_/);
});

test("booking-month: local dates and month grid start on Sunday", () => {
  assert.equal(toDateInput(new Date(2026, 10, 2)), "2026-11-02");
  assert.equal(parseDateInput("2026-11-02").getDate(), 2);
  assert.equal(claveMes("2026-11-17"), "2026-11");
  const cells = celdasDelMes("2026-11");
  // 1 Nov 2026 is a Sunday: no leading gaps, 30 days.
  assert.equal(cells[0], "2026-11-01");
  assert.equal(cells.length, 30);
  const december = celdasDelMes("2026-12");
  // 1 Dec 2026 is a Tuesday: two gaps.
  assert.deepEqual(december.slice(0, 3), [null, null, "2026-12-01"]);
});
