import { test } from "node:test";
import assert from "node:assert/strict";
import { createSubmitGuard } from "../lib/submit-guard";

test("submission lock is synchronous and releases after failure for retry", async () => {
  const guard = createSubmitGuard();
  assert.equal(guard.acquire(), true);
  assert.equal(guard.acquire(), false);
  try { await Promise.reject(Error("save failed")); } catch { /* retry below */ } finally { guard.release(); }
  assert.equal(guard.acquire(), true);
  guard.release();
  assert.equal(guard.acquire(), true);
});
