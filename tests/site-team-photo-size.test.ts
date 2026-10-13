import assert from "node:assert/strict";
import test from "node:test";
import { defaultLandingConfig, normalizeLandingConfig, teamPhotoSize } from "../services/public-site.types";

test("team photos default to small", () => {
  assert.equal(defaultLandingConfig().teamPhotoSize, "small");
  assert.equal(normalizeLandingConfig({}).teamPhotoSize, "small");
});

test("team photo size keeps known values and falls back on anything else", () => {
  assert.equal(normalizeLandingConfig({ teamPhotoSize: "large" }).teamPhotoSize, "large");
  assert.equal(normalizeLandingConfig({ teamPhotoSize: "small" }).teamPhotoSize, "small");
  for (const junk of ["LARGE", "big", 1, null, undefined, {}]) {
    assert.equal(teamPhotoSize(junk), "small", String(junk));
  }
});
