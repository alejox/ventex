import test from "node:test";
import assert from "node:assert/strict";
import { initialMobileGroup, toggleMobileGroup } from "../lib/mobile-navigation";

test("mobile opens only the current group without desktop preferences", () => {
  const groups = [{ id: "sales", items: [{ id: "pos" }] }, { id: "inventory", items: [{ id: "products" }] }];
  assert.equal(initialMobileGroup(groups, "products"), "inventory");
  assert.equal(initialMobileGroup(groups, "settings"), null);
});

test("mobile accordion can collapse current group and opening another replaces it", () => {
  assert.equal(toggleMobileGroup("inventory", "inventory"), null);
  assert.equal(toggleMobileGroup("inventory", "sales"), "sales");
  assert.equal(toggleMobileGroup(null, "inventory"), "inventory");
});
