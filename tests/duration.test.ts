import test from "node:test";
import assert from "node:assert/strict";
import { formatDuration } from "../lib/duration";

test("1. Menos de una hora se dice en minutos", () => {
  assert.equal(formatDuration(30), "30 min");
  assert.equal(formatDuration(45), "45 min");
});

test("2. Las horas justas no arrastran '0 min'", () => {
  assert.equal(formatDuration(60), "1 hora");
  assert.equal(formatDuration(120), "2 horas");
});

test("3. La media hora se dice 'y media', como lo diría una persona", () => {
  assert.equal(formatDuration(90), "1 hora y media");
  assert.equal(formatDuration(150), "2 horas y media");
});

test("4. Cualquier otro resto va en minutos", () => {
  assert.equal(formatDuration(75), "1 hora 15 min");
  assert.equal(formatDuration(135), "2 horas 15 min");
});

test("5. Vacío, cero o basura no dicen nada (no 'NaN min')", () => {
  assert.equal(formatDuration(0), "");
  assert.equal(formatDuration(-10), "");
  assert.equal(formatDuration(null), "");
  assert.equal(formatDuration(undefined), "");
  assert.equal(formatDuration(Number.NaN), "");
});
