import assert from "node:assert/strict";
import test from "node:test";
import { onlineFrom } from "../lib/useOnlineStatus";

test("only an explicit onLine=false counts as offline", () => {
  assert.equal(onlineFrom({ onLine: true }), true);
  assert.equal(onlineFrom({ onLine: false }), false);
  // Node >= 21 exposes a global `navigator` without `onLine`: that is a server, not an offline browser.
  assert.equal(onlineFrom({}), true);
  assert.equal(onlineFrom(undefined), true);
});
