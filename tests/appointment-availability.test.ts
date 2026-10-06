import assert from "node:assert/strict";
import test from "node:test";
import { conflictsFor, freeStaff, isTaken, overlaps, pickStaff } from "../lib/appointment-availability";

const appt = (id: string, staff: string | null, from: string, to: string) => ({ id, staff_id: staff, start_time: from, end_time: to });

test("back-to-back appointments do not overlap", () => {
  assert.equal(overlaps(540, 600, 600, 660), false);
  assert.equal(overlaps(540, 601, 600, 660), true);
});

test("a person with an overlapping appointment is not free, someone else is", () => {
  const busy = [appt("1", "ana", "15:00", "16:00")];
  assert.equal(conflictsFor(busy, "ana", "15:30", "16:30").length, 1);
  assert.equal(conflictsFor(busy, "ana", "16:00", "17:00").length, 0);
  assert.deepEqual(freeStaff(busy, ["ana", "luis"], "15:30", "16:00"), ["luis"]);
});

test("editing an appointment does not conflict with itself", () => {
  const busy = [appt("1", "ana", "15:00", "16:00")];
  assert.equal(conflictsFor(busy, "ana", "15:00", "16:00", "1").length, 0);
});

test("unassigned picks the free person with the lightest day", () => {
  const busy = [appt("1", "ana", "09:00", "10:00"), appt("2", "ana", "11:00", "12:00"), appt("3", "luis", "09:00", "10:00")];
  // A las 9:30 solo está libre pedro.
  assert.equal(pickStaff(busy, ["ana", "luis", "pedro"], "09:30", "10:00"), "pedro");
  // A las 14:00 todos libres: luis tiene 1 cita, ana 2, pedro 0.
  assert.equal(pickStaff(busy, ["ana", "luis", "pedro"], "14:00", "15:00"), "pedro");
  assert.equal(pickStaff(busy, ["ana", "luis"], "14:00", "15:00"), "luis");
  // Nadie libre.
  assert.equal(pickStaff(busy, ["ana", "luis"], "09:00", "10:00"), null);
});

test("a slot is taken for a person when theirs overlaps, and for 'any' only when everyone is busy", () => {
  const busy = [appt("1", "ana", "15:00", "16:00")];
  assert.equal(isTaken(busy, { staffId: "ana", pool: ["ana", "luis"] }, "15:00", "15:30"), true);
  assert.equal(isTaken(busy, { staffId: "luis", pool: ["ana", "luis"] }, "15:00", "15:30"), false);
  assert.equal(isTaken(busy, { staffId: null, pool: ["ana", "luis"] }, "15:00", "15:30"), false);
  busy.push(appt("2", "luis", "15:00", "15:45"));
  assert.equal(isTaken(busy, { staffId: null, pool: ["ana", "luis"] }, "15:15", "15:45"), true);
});

test("old unassigned appointments take a seat from the team", () => {
  const busy = [appt("1", null, "15:00", "16:00")];
  assert.equal(isTaken(busy, { staffId: null, pool: ["ana"] }, "15:00", "15:30"), true);
  assert.equal(isTaken(busy, { staffId: null, pool: ["ana", "luis"] }, "15:00", "15:30"), false);
  // Sin equipo no hay a quién asignar: nunca se bloquea.
  assert.equal(isTaken(busy, { staffId: null, pool: [] }, "15:00", "15:30"), false);
});
