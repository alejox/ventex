import test from "node:test";
import assert from "node:assert/strict";
import { resolveSiteUrl } from "../lib/site";

test("production SEO uses the public domain when the URL is missing or local", () => {
  for (const configured of [
    undefined,
    "",
    "http://localhost:3000",
    "http://shop.localhost:3000",
    "http://127.0.0.1:3000",
    "http://[::1]:3000",
    "invalid-url",
  ]) {
    assert.equal(resolveSiteUrl(configured, "production"), "https://www.ventex.app");
  }
});

test("development keeps localhost for local preview", () => {
  assert.equal(resolveSiteUrl(undefined, "development"), "http://localhost:3000");
  assert.equal(resolveSiteUrl("http://localhost:3001/", "development"), "http://localhost:3001");
});

test("an explicitly configured public origin remains canonical", () => {
  assert.equal(
    resolveSiteUrl("https://www.ventex.app/", "production"),
    "https://www.ventex.app",
  );
  assert.equal(
    resolveSiteUrl("https://staging.example.com/path/", "production"),
    "https://staging.example.com",
  );
});
