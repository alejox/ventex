import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement, useState } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { usePricePair } from "../lib/usePricePair";
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

test("delayed business settings preserve typed total, manual tax selection preserves base", async () => {
  const { repricePair } = await import("../lib/product-tax");
  assert.deepEqual(repricePair({ base: "100", total: "119" }, 1, true), { base: "119", total: "119" });
  assert.deepEqual(repricePair({ base: "100", total: "119" }, 1.05, true), { base: "113.33", total: "119" });
  assert.deepEqual(repricePair({ base: "100", total: "119" }, 1, false), { base: "100", total: "100" });
  assert.deepEqual(repricePair({ base: "", total: "" }, 1, true), { base: "", total: "" });
});


for (const scenario of [
  { multiplier: 1, key: "false:0.19", expected: "119:119" },
  { multiplier: 1.05, key: "true:0.05", expected: "113.33:119" },
  { multiplier: 1, key: "true:0.19", expected: "100:100" },
]) {
  test(`price hook preserves the correct side after transition to ${scenario.key}/${scenario.multiplier}`, () => {
    function Harness() {
      const [phase, setPhase] = useState(0);
      const [pair, setters] = usePricePair(phase < 2 ? 1.19 : scenario.multiplier, phase < 2 ? "true:0.19" : scenario.key);
      if (phase === 0) { setters.fromTotal("119"); setPhase(1); }
      if (phase === 1) setPhase(2);
      return createElement("span", null, `${pair.base}:${pair.total}`);
    }
    assert.equal(renderToStaticMarkup(createElement(Harness)), `<span>${scenario.expected}</span>`);
  });
}
