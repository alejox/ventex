import assert from "node:assert/strict";
import test from "node:test";
import { layoutDay, minutesToTime, snapToHalfHour, toMinutes, visibleHourRange } from "../lib/calendar-layout";

const at = (id: string, from: string, to: string) => ({ id, start: toMinutes(from), end: toMinutes(to) });
const byId = (placed: ReturnType<typeof layoutDay>) => Object.fromEntries(placed.map((p) => [p.id, p]));

test("toMinutes reads HH:MM and HH:MM:SS", () => {
  assert.equal(toMinutes("09:30"), 570);
  assert.equal(toMinutes("15:00:00"), 900);
});

test("appointments that do not overlap keep the full width", () => {
  const p = byId(layoutDay([at("a", "09:00", "10:00"), at("b", "10:00", "11:00")]));
  assert.deepEqual([p.a.column, p.a.columns, p.b.column, p.b.columns], [0, 1, 0, 1]);
});

test("overlapping appointments split the width", () => {
  const p = byId(layoutDay([at("a", "09:00", "10:30"), at("b", "10:00", "11:00")]));
  assert.equal(p.a.columns, 2);
  assert.equal(p.b.columns, 2);
  assert.notEqual(p.a.column, p.b.column);
});

test("a chain overlap shares one cluster, a later cluster is independent", () => {
  const p = byId(layoutDay([
    at("a", "09:00", "10:00"), at("b", "09:30", "10:30"), at("c", "10:00", "11:00"),
    at("d", "13:00", "14:00"),
  ]));
  assert.equal(p.a.columns, 2);
  assert.equal(p.c.columns, 2);
  // c reutiliza la columna de a: ya terminó cuando c empieza.
  assert.equal(p.c.column, p.a.column);
  assert.equal(p.d.columns, 1);
});

test("a zero-length appointment still has a visible height and overlaps by it", () => {
  const [one] = layoutDay([at("a", "09:00", "09:00")]);
  assert.equal(one.visualEnd - one.start, 30);
  const p = byId(layoutDay([at("a", "09:00", "09:00"), at("b", "09:10", "10:00")]));
  assert.equal(p.a.columns, 2);
});

test("visibleHourRange widens the default to fit early and late appointments", () => {
  assert.deepEqual(visibleHourRange([], []), { from: 7, to: 21 });
  assert.deepEqual(visibleHourRange([toMinutes("05:30")], [toMinutes("22:15")]), { from: 5, to: 23 });
});

test("clicks snap down to the half hour", () => {
  assert.equal(minutesToTime(snapToHalfHour(toMinutes("10:44"))), "10:30");
  assert.equal(minutesToTime(snapToHalfHour(toMinutes("10:15"))), "10:00");
});
