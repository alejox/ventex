import test from "node:test";
import assert from "node:assert/strict";
import {
  pointsEarnedFor,
  maxRedeemablePoints,
  pointsDiscountAmount,
  loyaltyLineDiscounts,
} from "../services/loyalty.service";
import type { CartLine, CatalogItem } from "../services/pos.service";

const product = (over: Partial<CatalogItem> = {}): CatalogItem => ({
  id: "p1",
  kind: "product",
  name: "GASEOSA",
  sku: "PRD-1",
  barcode: null,
  price: 2000,
  package_price: null,
  units_per_package: 1,
  stock_level: 100,
  open_price: false,
  allows_fractions: false,
  category_name: "Bebidas",
  category_id: "cat-1",
  image_url: null,
  has_commission: false,
  commission_type: null,
  commission_value: null,
  ...over,
});

const line = (over: Partial<CartLine> = {}): CartLine => ({
  item: product(),
  quantity: 1,
  ...over,
});

// ---- pointsEarnedFor ----

test("1. pointsEarnedFor: redondea hacia abajo", () => {
  assert.equal(pointsEarnedFor(9999, 1000), 9);
  assert.equal(pointsEarnedFor(10000, 1000), 10);
});

test("2. pointsEarnedFor: sin tasa configurada no otorga puntos", () => {
  assert.equal(pointsEarnedFor(10000, null), 0);
  assert.equal(pointsEarnedFor(10000, 0), 0);
  assert.equal(pointsEarnedFor(10000, -5), 0);
});

test("3. pointsEarnedFor: total en cero o negativo no otorga puntos", () => {
  assert.equal(pointsEarnedFor(0, 1000), 0);
  assert.equal(pointsEarnedFor(-100, 1000), 0);
});

// ---- maxRedeemablePoints ----

test("4. maxRedeemablePoints: tope por saldo del cliente", () => {
  // Saldo 5, venta de 10000 a $50/punto -> la venta admitiría 200, gana el saldo.
  assert.equal(maxRedeemablePoints(5, 10000, 50), 5);
});

test("5. maxRedeemablePoints: tope por lo que vale la venta", () => {
  // Saldo 500, venta de 100 a $50/punto -> solo 2 puntos caben en la venta.
  assert.equal(maxRedeemablePoints(500, 100, 50), 2);
});

test("6. maxRedeemablePoints: sin valor por punto no se puede canjear", () => {
  assert.equal(maxRedeemablePoints(500, 10000, null), 0);
  assert.equal(maxRedeemablePoints(500, 10000, 0), 0);
});

test("7. maxRedeemablePoints: sin saldo o sin venta no hay nada que canjear", () => {
  assert.equal(maxRedeemablePoints(0, 10000, 50), 0);
  assert.equal(maxRedeemablePoints(500, 0, 50), 0);
  assert.equal(maxRedeemablePoints(-3, 10000, 50), 0);
});

// ---- pointsDiscountAmount ----

test("8. pointsDiscountAmount: puntos por valor", () => {
  assert.equal(pointsDiscountAmount(4, 50), 200);
});

test("9. pointsDiscountAmount: sin puntos o sin valor no hay descuento", () => {
  assert.equal(pointsDiscountAmount(0, 50), 0);
  assert.equal(pointsDiscountAmount(4, null), 0);
  assert.equal(pointsDiscountAmount(4, 0), 0);
  assert.equal(pointsDiscountAmount(-1, 50), 0);
});

// ---- loyaltyLineDiscounts ----

test("10. loyaltyLineDiscounts: una sola línea absorbe todo el descuento", () => {
  const cart = [line({ item: product({ price: 5000 }), quantity: 1 })];
  const result = loyaltyLineDiscounts(cart, 100, 10); // $1000 a repartir
  assert.deepEqual(result, [{ key: "p1:unit", discountAmount: 1000 }]);
});

test("11. loyaltyLineDiscounts: se satura una línea y sigue con la próxima", () => {
  const cart = [
    line({ item: product({ id: "a", price: 1500 }), quantity: 1 }), // vale 1500
    line({ item: product({ id: "b", price: 5000 }), quantity: 1 }), // vale 5000
  ];
  // 20 puntos * 100 = 2000 a repartir. Empieza por la de MÁS remanente (b, 5000).
  const result = loyaltyLineDiscounts(cart, 100, 20);
  assert.deepEqual(result, [{ key: "b:unit", discountAmount: 2000 }]);
});

test("12. loyaltyLineDiscounts: el descuento nunca supera lo que vale el carrito", () => {
  const cart = [
    line({ item: product({ id: "a", price: 1000 }), quantity: 1 }),
    line({ item: product({ id: "b", price: 1000 }), quantity: 1 }),
  ];
  // 100 puntos * 100 = 10000 a repartir, pero el carrito solo vale 2000.
  const result = loyaltyLineDiscounts(cart, 100, 100);
  const total = result.reduce((s, r) => s + r.discountAmount, 0);
  assert.equal(total, 2000);
  assert.equal(result.length, 2);
});

test("13. loyaltyLineDiscounts: respeta un descuento ya puesto (oferta o manual)", () => {
  // La línea ya tiene $500 de descuento (de una oferta): su remanente es 1500.
  const cart = [
    line({ item: product({ id: "a", price: 2000 }), quantity: 1, discountAmount: 500, offerId: "o1", offerName: "Oferta" }),
  ];
  const result = loyaltyLineDiscounts(cart, 100, 5); // $500 a repartir
  // El monto final ya incluye lo que tenía antes: 500 + 500 = 1000.
  assert.deepEqual(result, [{ key: "a:unit", discountAmount: 1000 }]);
});

test("14. loyaltyLineDiscounts: sin puntos que canjear no toca el carrito", () => {
  const cart = [line()];
  assert.deepEqual(loyaltyLineDiscounts(cart, 100, 0), []);
  assert.deepEqual(loyaltyLineDiscounts(cart, null, 5), []);
});

test("15. loyaltyLineDiscounts: una línea sin remanente (ya cubierta) se salta", () => {
  const cart = [
    line({ item: product({ id: "a", price: 1000 }), quantity: 1, discountAmount: 1000 }), // remanente 0
    line({ item: product({ id: "b", price: 3000 }), quantity: 1 }), // remanente 3000
  ];
  const result = loyaltyLineDiscounts(cart, 100, 10); // $1000
  assert.deepEqual(result, [{ key: "b:unit", discountAmount: 1000 }]);
});
