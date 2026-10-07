import test from "node:test";
import assert from "node:assert/strict";
import { computeTotals, lineTotalCents } from "../services/pos.service";
import type { CartLine, CatalogItem } from "../services/pos.service";

// `create_sale` redondea `line_total` (numeric(12,2)) en CADA línea, con la
// cantidad a 3 decimales y la mitad hacia arriba. `computeTotals` tiene que
// llegar al mismo número: un pago dividido por el total del POS se compara
// contra el de la base con tolerancia de un centavo.

const item = (price: number): CatalogItem => ({
  id: `p-${price}`,
  kind: "product",
  name: "Queso",
  sku: null,
  barcode: null,
  price,
  package_price: null,
  units_per_package: 1,
  stock_level: null,
  open_price: false,
  allows_fractions: true,
  category_name: null,
  category_id: null,
  image_url: null,
  has_commission: false,
  commission_type: null,
  commission_value: null,
});

const line = (price: number, quantity: number, discountAmount = 0): CartLine => ({
  item: item(price),
  quantity,
  discountAmount,
});

test("lineTotalCents: mitad hacia arriba sin el error del flotante", () => {
  // 3333,33 × 1,5 = 4999,995 → la base guarda 5000,00. En flotante el
  // producto da 4999,99499… y Math.round lo bajaba a 4999,99.
  assert.equal(lineTotalCents(3333.33, 1.5), 500000);
  assert.equal(lineTotalCents(1999.99, 0.333), 66600); // 665,99667 → 666,00
  assert.equal(lineTotalCents(1000, 2), 200000);
  assert.equal(lineTotalCents(0, 3), 0);
});

test("lineTotalCents: la cantidad va a 3 decimales como round(quantity, 3)", () => {
  // 0,12345 → 0,123 (no 0,12345): 10.000 × 0,123 = 1230,00
  assert.equal(lineTotalCents(10000, 0.12345), 123000);
});

test("computeTotals redondea por línea, no solo la suma", () => {
  // Tres líneas de 0,333 kg a 1999,99: cada una 666,00 en la base (1998,00).
  // Redondear solo la suma daba 1997,99, y el split de 1997,99 fallaba con
  // "La suma de los pagos no coincide con el total".
  const cart = [line(1999.99, 0.333), line(1999.99, 0.333), line(1999.99, 0.333)];
  const t = computeTotals(cart, 0.19, false, true);
  assert.equal(t.gross, 1998);
  assert.equal(t.total, 1998);
  assert.equal(t.subtotal, 1678.99); // round(1998 / 1,19, 2)
  assert.equal(t.taxAmount, 319.01);
});

test("computeTotals: descuento por línea en centavos y exención como el RPC", () => {
  const cart = [line(3333.33, 1.5, 0.1), line(1000, 1, 0.2)];
  // gross 5000,00 + 1000,00; descuento 0,30 → neto 5999,70
  const noTax = computeTotals(cart, 0.19, false, false);
  assert.equal(noTax.gross, 6000);
  assert.equal(noTax.discount, 0.3);
  assert.equal(noTax.total, 5999.7);

  const exempt = computeTotals(cart, 0.19, true, true);
  assert.equal(exempt.total, 5041.76); // round(5999,70 / 1,19, 2)
  assert.equal(exempt.exemptionDiscount, 957.94);
});

test("computeTotals: el total de vitrina nunca baja de cero", () => {
  const t = computeTotals([line(100, 1, 150)], 0.19, false, true);
  assert.equal(t.total, 0);
});
