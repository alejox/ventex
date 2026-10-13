import { test } from "node:test";
import assert from "node:assert/strict";
import { productImageUrl } from "../lib/product-image";

test("barcode image persists unless a new file was selected", () => {
  assert.equal(productImageUrl("https://images.example/product.jpg", false), "https://images.example/product.jpg");
  assert.equal(productImageUrl("https://images.example/product.jpg", true), "");
});
test("cleared and local previews are never persisted as remote URLs", () => {
  for (const url of ["", "blob:https://example/id", "data:image/png;base64,abc", "javascript:alert(1)"]) assert.equal(productImageUrl(url, false), "");
});
