import test from "node:test";
import assert from "node:assert/strict";
import { normalizeLandingConfig } from "../services/public-site.types";

test("legacy configs with the retired Instagram feed still load, without its keys or section", () => {
  const config = normalizeLandingConfig({
    instagramLayout: "carousel",
    instagramCount: 9,
    sections: [{ id: "instagram", visible: true, title: "x", subtitle: "y" }],
  });
  assert.equal("instagramLayout" in config, false);
  assert.equal("instagramCount" in config, false);
  assert.equal(config.sections.some((section) => (section.id as string) === "instagram"), false);
  assert.ok(config.sections.length > 0);
});
