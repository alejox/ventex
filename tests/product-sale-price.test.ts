import test from "node:test";
import assert from "node:assert/strict";
import { parseProductSalePrice } from "../services/inventory.service";
import { useInventoryStore } from "../stores/inventory.store";
import type { NewProductInput } from "../services/inventory.service";

test("accepts a valid tax-inclusive catalog price without changing its value", () => {
  assert.equal(parseProductSalePrice("190000"), 190000);
  assert.equal(parseProductSalePrice("190000.50"), 190000.5);
});

test("rejects missing, malformed, non-finite, and nonpositive fixed prices", () => {
  for (const value of ["", " ", "abc", "190000abc", "1,900", "Infinity", "NaN", "1e999", "-1", "0", "0.00"]) {
    assert.throws(() => parseProductSalePrice(value), Error, value);
  }
});

test("open-price products may have an explicit zero suggestion, but not a missing price", () => {
  assert.equal(parseProductSalePrice("0", true), 0);
  assert.equal(parseProductSalePrice("190000", true), 190000);
  for (const value of ["", " ", "-1", "Infinity", "NaN", "1e999"]) {
    assert.throws(() => parseProductSalePrice(value, true), Error, value);
  }
});

test("create and update reject invalid prices before attempting an image upload", async () => {
  const input: NewProductInput = {
    name: "Sample", category_id: "", distributor_id: "", sku: "", unit: "Unidad",
    purchase_price: "", price: "", image_url: "", has_commission: false,
    commission_type: "percentage", commission_value: "",
  };
  // An invalid File-like value would fail if the upload path were reached.
  const image = {} as File;
  assert.equal(await useInventoryStore.getState().addProduct(input, image), false);
  assert.match(useInventoryStore.getState().error ?? "", /precio de venta válido/i);
  assert.equal(await useInventoryStore.getState().updateProduct("product-id", input, image), false);
  assert.match(useInventoryStore.getState().error ?? "", /precio de venta válido/i);
});

test("un insumo ('Solo insumo') puede quedar sin precio de venta", () => {
  assert.equal(parseProductSalePrice("", false, true), 0);
  assert.equal(parseProductSalePrice("0", false, true), 0);
  assert.equal(parseProductSalePrice("2500", false, true), 2500);
  assert.throws(() => parseProductSalePrice("-1", false, true), Error);
});
