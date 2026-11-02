import assert from "node:assert/strict";
import test from "node:test";
import {
  initialStaffId,
  needsStaffChoice,
  staffChoiceMode,
  staffSummaryLabel,
} from "../lib/booking-staff-choice";

test("staffChoiceMode: no visible staff means nobody to pick, whatever the option", () => {
  assert.equal(staffChoiceMode(0, true), "none");
  assert.equal(staffChoiceMode(0, false), "none");
});

test("staffChoiceMode: with staff, the option decides between any and required", () => {
  assert.equal(staffChoiceMode(3, true), "any");
  assert.equal(staffChoiceMode(3, false), "required");
  assert.equal(staffChoiceMode(1, false), "required");
});

test("initialStaffId: 'any' mode starts on Cualquiera disponible (null)", () => {
  assert.equal(initialStaffId(["a", "b"], true), null);
  assert.equal(initialStaffId(["a"], true), null);
});

test("initialStaffId: required mode preselects only a single visible person", () => {
  assert.equal(initialStaffId(["a"], false), "a");
  assert.equal(initialStaffId(["a", "b"], false), null);
  assert.equal(initialStaffId([], false), null);
});

test("needsStaffChoice: only blocks in required mode while nobody is picked", () => {
  assert.equal(needsStaffChoice("required", null), true);
  assert.equal(needsStaffChoice("required", "a"), false);
  assert.equal(needsStaffChoice("any", null), false);
  assert.equal(needsStaffChoice("none", null), false);
});

test("staffSummaryLabel: never prints Cualquiera disponible in required mode", () => {
  assert.equal(staffSummaryLabel("any", null), "Cualquiera disponible");
  assert.equal(staffSummaryLabel("none", null), "Cualquiera disponible");
  assert.equal(staffSummaryLabel("any", "Ana"), "Ana");
  assert.equal(staffSummaryLabel("required", "Ana"), "Ana");
  assert.equal(staffSummaryLabel("required", null), null);
});
