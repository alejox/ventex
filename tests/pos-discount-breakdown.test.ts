import test from "node:test";
import assert from "node:assert/strict";
import { discountBreakdown } from "../lib/pos-discount-breakdown";

test("sin descuentos no hay desglose", () => {
  assert.deepEqual(discountBreakdown([{}, { discountAmount: 0 }]), []);
});

test("ofertas con su nombre y descuento manual por separado", () => {
  const parts = discountBreakdown([
    { discountAmount: 1000, offerId: "o1", offerName: "2x1 gaseosa" },
    { discountAmount: 500, offerId: "o2", offerName: "Martes de pan" },
    { discountAmount: 2000, manualDiscount: 2000 },
  ]);
  assert.deepEqual(parts, [
    { origin: "offers", label: "Ofertas", amount: 1500, names: ["2x1 gaseosa", "Martes de pan"] },
    { origin: "manual", label: "Descuento manual", amount: 2000 },
  ]);
});

test("premio y puntos salen de lo aplicado en pantalla", () => {
  const parts = discountBreakdown(
    [
      { discountAmount: 15000 }, // premio de cortes (canal automático, sin manual)
      { discountAmount: 3000 }, // puntos
    ],
    { rewardAmount: 15000, pointsAmount: 3000 },
  );
  assert.deepEqual(parts.map((p) => [p.origin, p.amount]), [
    ["reward", 15000],
    ["points", 3000],
  ]);
});

test("puntos encima de un descuento manual: cada uno con lo suyo", () => {
  const parts = discountBreakdown([{ discountAmount: 5000, manualDiscount: 2000 }], { pointsAmount: 3000 });
  assert.deepEqual(parts.map((p) => [p.origin, p.amount]), [
    ["manual", 2000],
    ["points", 3000],
  ]);
});

test("lo que no se puede atribuir va a 'Otros' y el desglose suma el total", () => {
  // Oferta que perdió su etiqueta al canjear puntos sobre la misma línea.
  const parts = discountBreakdown([{ discountAmount: 4000 }], { pointsAmount: 1000 });
  assert.deepEqual(parts.map((p) => [p.origin, p.amount]), [
    ["points", 1000],
    ["other", 3000],
  ]);
  assert.equal(parts.reduce((s, p) => s + p.amount, 0), 4000);
});

test("un monto aplicado viejo nunca hace sumar más que el descuento real", () => {
  const parts = discountBreakdown([{ discountAmount: 1000 }], { rewardAmount: 5000, pointsAmount: 2000 });
  assert.deepEqual(parts.map((p) => [p.origin, p.amount]), [["reward", 1000]]);
});
