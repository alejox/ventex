import assert from "node:assert/strict";
import test from "node:test";
import { loadStatusOf } from "../lib/booking-load-state";

const base = { enabled: true, wantedKey: "s|2026-11-01|", count: 0 };

test("nothing to query is idle, never loading", () => {
  assert.equal(loadStatusOf({ ...base, enabled: false, loadedKey: null, failedKey: null }), "idle");
});

test("an answer for another key is still loading", () => {
  assert.equal(loadStatusOf({ ...base, loadedKey: null, failedKey: null }), "loading");
  assert.equal(loadStatusOf({ ...base, loadedKey: "old", failedKey: null, count: 3 }), "loading");
});

test("a failed load for the wanted key is failed, not empty", () => {
  assert.equal(loadStatusOf({ ...base, loadedKey: base.wantedKey, failedKey: base.wantedKey }), "failed");
});

test("an older failure does not mark the current key as failed", () => {
  assert.equal(loadStatusOf({ ...base, loadedKey: base.wantedKey, failedKey: "old", count: 2 }), "ready");
});

test("a successful empty answer is empty, with data it is ready", () => {
  assert.equal(loadStatusOf({ ...base, loadedKey: base.wantedKey, failedKey: null }), "empty");
  assert.equal(loadStatusOf({ ...base, loadedKey: base.wantedKey, failedKey: null, count: 5 }), "ready");
});
