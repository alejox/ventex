import assert from "node:assert/strict";
import test from "node:test";
import { byStaffFilter, isOverdue, removePending, sortByDateTime, upsertPending } from "../lib/pending-appointments";

type Row = { id: string; appointment_date: string; start_time: string; status: string; staff_id: string | null };
const row = (id: string, date: string, time: string, status = "pending", staff: string | null = "ana"): Row =>
  ({ id, appointment_date: date, start_time: time, status, staff_id: staff });

test("sortByDateTime orders by date, then hour, then id, without mutating", () => {
  const list = [row("b", "2026-11-03", "09:00"), row("a", "2026-11-01", "15:00"), row("c", "2026-11-01", "09:00:00")];
  const sorted = sortByDateTime(list);
  assert.deepEqual(sorted.map((r) => r.id), ["c", "a", "b"]);
  assert.equal(list[0].id, "b");
});

test("upsertPending adds or replaces a pending appointment in order", () => {
  const list = [row("a", "2026-11-01", "09:00"), row("b", "2026-11-05", "09:00")];
  assert.deepEqual(upsertPending(list, row("c", "2026-11-03", "10:00")).map((r) => r.id), ["a", "c", "b"]);
  // Moved to a later day: same id, new place.
  assert.deepEqual(upsertPending(list, row("a", "2026-11-09", "09:00")).map((r) => r.id), ["b", "a"]);
});

test("upsertPending drops an appointment that is no longer pending", () => {
  const list = [row("a", "2026-11-01", "09:00"), row("b", "2026-11-05", "09:00")];
  assert.deepEqual(upsertPending(list, row("a", "2026-11-01", "09:00", "confirmed")).map((r) => r.id), ["b"]);
  assert.deepEqual(upsertPending(list, row("z", "2026-11-01", "09:00", "cancelled")).map((r) => r.id), ["a", "b"]);
});

test("removePending removes by id", () => {
  assert.deepEqual(removePending([row("a", "2026-11-01", "09:00")], "a"), []);
});

test("isOverdue is true only for days before today", () => {
  assert.equal(isOverdue(row("a", "2026-10-31", "09:00"), "2026-11-01"), true);
  assert.equal(isOverdue(row("a", "2026-11-01", "09:00"), "2026-11-01"), false);
  assert.equal(isOverdue(row("a", "2026-11-02", "09:00"), "2026-11-01"), false);
});

test("byStaffFilter mirrors the calendar person filter", () => {
  const list = [row("a", "2026-11-01", "09:00", "pending", "ana"), row("b", "2026-11-01", "10:00", "pending", null)];
  assert.equal(byStaffFilter(list, "all").length, 2);
  assert.deepEqual(byStaffFilter(list, "unassigned").map((r) => r.id), ["b"]);
  assert.deepEqual(byStaffFilter(list, "ana").map((r) => r.id), ["a"]);
});
