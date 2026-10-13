import { test } from "node:test";
import assert from "node:assert/strict";
import { priceMultipliers } from "../lib/product-tax";

test("a business without IVA saves prices as typed (multiplier 1)", () => {
  assert.deepEqual(
    priceMultipliers({ includeTax: false, rate: 0, rawRate: 0.19, purchaseTax: "IVA", sellingTax: "IVA" }),
    { purchase: 1, selling: 1 }
  );
});

test("a business with IVA grosses up both sides by default", () => {
  assert.deepEqual(
    priceMultipliers({ includeTax: true, rate: 0.19, rawRate: 0.19, purchaseTax: "IVA", sellingTax: "IVA" }),
    { purchase: 1.19, selling: 1.19 }
  );
});

test("a business with IVA respects 'Ninguno' per side", () => {
  assert.deepEqual(
    priceMultipliers({ includeTax: true, rate: 0.05, rawRate: 0.05, purchaseTax: "Ninguno", sellingTax: "IVA" }),
    { purchase: 1, selling: 1.05 }
  );
  assert.deepEqual(
    priceMultipliers({ includeTax: true, rate: 0.05, rawRate: 0.05, purchaseTax: "IVA", sellingTax: "Ninguno" }),
    { purchase: 1.05, selling: 1 }
  );
});
