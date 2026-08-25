import test from "node:test";
import assert from "node:assert/strict";
import {
  parseDiscountPercent,
  lineDiscountFor,
  MAX_DISCOUNT_PERCENT,
} from "../services/pos.service";
import type { CartLine, CatalogItem } from "../services/pos.service";

const item: CatalogItem = {
  id: "p1",
  kind: "product",
  name: "BAÑO",
  sku: "PRD-1",
  barcode: null,
  price: 2000,
  package_price: 24000,
  units_per_package: 12,
  stock_level: 10,
  open_price: false,
  allows_fractions: false,
  category_name: null,
  image_url: null,
  has_commission: false,
  commission_type: null,
  commission_value: null,
};

const line: CartLine = { item, quantity: 1 };

test("1. El porcentaje fuera de 0-100 se rechaza", () => {
  // El caso del informe de QA: 150% sobre un ítem de $2.000 generaba un
  // descuento de $3.000 —más que el producto— y dejaba el total en $0.
  assert.equal(parseDiscountPercent("150"), null);
  assert.equal(parseDiscountPercent("-10"), null);
  assert.equal(parseDiscountPercent("101"), null);
  assert.equal(parseDiscountPercent("abc"), null);
  assert.equal(parseDiscountPercent(""), null);
});

test("2. Los extremos del rango son válidos", () => {
  assert.equal(parseDiscountPercent("0"), 0);
  assert.equal(parseDiscountPercent("100"), 100);
  assert.equal(parseDiscountPercent("12.5"), 12.5);
  assert.equal(MAX_DISCOUNT_PERCENT, 100);
});

test("3. Un descuento válido nunca supera el valor de la línea", () => {
  assert.equal(lineDiscountFor(line, 0), 0);
  assert.equal(lineDiscountFor(line, 50), 1000);
  assert.equal(lineDiscountFor(line, 100), 2000);

  const threeUnits: CartLine = { item, quantity: 3 };
  assert.equal(lineDiscountFor(threeUnits, 100), 6000);
});

test("4. Por caja descuenta sobre el precio de la caja, no el de la unidad", () => {
  // Si acá se leyera `item.price` en vez de `linePrice`, una caja de $24.000
  // se descontaría como si valiera $2.000.
  const asPackage: CartLine = { item, quantity: 1, unitKind: "package" };
  assert.equal(lineDiscountFor(asPackage, 100), 24000);
  assert.equal(lineDiscountFor(asPackage, 25), 6000);
});
