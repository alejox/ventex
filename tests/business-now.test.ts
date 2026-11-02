import { test } from "node:test";
import assert from "node:assert/strict";
import { businessNow, localDateOf } from "@/lib/tz";

test("businessNow: the business day can differ from the UTC day", () => {
  // 03:30 UTC on Nov 3 is still 22:30 on Nov 2 in Bogotá (UTC−5).
  const instant = new Date("2026-11-03T03:30:00Z");
  assert.deepEqual(businessNow("America/Bogota", instant), { date: "2026-11-02", minutes: 22 * 60 + 30 });
  assert.deepEqual(businessNow("UTC", instant), { date: "2026-11-03", minutes: 3 * 60 + 30 });
});

test("businessNow: a zone ahead of UTC moves to the next day", () => {
  const instant = new Date("2026-11-02T23:15:00Z");
  assert.deepEqual(businessNow("Europe/Madrid", instant), { date: "2026-11-03", minutes: 15 });
});

test("businessNow: midnight is minute 0, never 24:00", () => {
  const instant = new Date("2026-11-03T05:00:00Z");
  assert.deepEqual(businessNow("America/Bogota", instant), { date: "2026-11-03", minutes: 0 });
});

test("localDateOf: a 'YYYY-MM-DD' becomes that day at local midnight", () => {
  const d = localDateOf("2026-11-02");
  assert.equal(d.getFullYear(), 2026);
  assert.equal(d.getMonth(), 10);
  assert.equal(d.getDate(), 2);
  assert.equal(d.getHours(), 0);
});
