import test from "node:test";
import assert from "node:assert/strict";
import { validateBusinessLogoFile } from "../lib/business-logo";

function file(type: string, size: number): File {
  return { type, size } as File;
}

test("business logo validation accepts supported image formats up to 2 MiB", () => {
  for (const type of ["image/png", "image/jpeg", "image/webp", "image/gif", "image/svg+xml"]) {
    assert.equal(validateBusinessLogoFile(file(type, 2 * 1024 * 1024)), null);
  }
});

test("business logo validation rejects unsupported types and empty files", () => {
  assert.equal(validateBusinessLogoFile(file("application/pdf", 100)), "unsupported");
  assert.equal(validateBusinessLogoFile(file("image/png", 0)), "empty");
});

test("business logo validation rejects files larger than 2 MiB", () => {
  assert.equal(validateBusinessLogoFile(file("image/png", 2 * 1024 * 1024 + 1)), "too_large");
});
