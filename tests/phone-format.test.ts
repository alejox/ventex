import assert from "node:assert/strict";
import test from "node:test";
import { formatColombianMobile } from "../lib/phone-format";

test("a Colombian mobile is grouped 3-3-4", () => {
  assert.equal(formatColombianMobile("3001234567"), "300 123 4567");
  assert.equal(formatColombianMobile("+57 300-123-4567"), "300 123 4567");
  assert.equal(formatColombianMobile(" (300) 1234567 "), "300 123 4567");
});

test("anything that is not a mobile is returned trimmed, untouched", () => {
  assert.equal(formatColombianMobile(" 6012345678 "), "6012345678");
  assert.equal(formatColombianMobile("123"), "123");
  assert.equal(formatColombianMobile(""), "");
});
