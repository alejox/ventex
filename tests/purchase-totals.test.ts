import test from "node:test";
import assert from "node:assert/strict";
import { purchaseTaxRateFor, purchaseTotalsOf } from "../lib/purchase-totals";
import { lineTotalOf } from "../services/purchases.service";

test("el IVA va sobre subtotal − descuento, no sobre el subtotal", () => {
  // Mismo caso que el ensayo SQL: 30.000 + 315.000, descuento 1.000, IVA 19 %.
  const subtotal =
    lineTotalOf({ package_quantity: 0, loose_quantity: 3, unit_price: 10000, package_price: 0 }) +
    lineTotalOf({ package_quantity: 2, loose_quantity: 5, unit_price: 7000, package_price: 140000 });
  assert.deepEqual(purchaseTotalsOf(subtotal, 1000, 0.19), {
    subtotal: 345000,
    taxAmount: 65360,
    total: 409360,
  });
  // La cuenta vieja (IVA sobre el subtotal entero) daba 65.550 / 409.550.
  assert.notEqual(purchaseTotalsOf(subtotal, 1000, 0.19).taxAmount, Math.round(345000 * 0.19));
});

test("sin descuento ni IVA el total es el subtotal", () => {
  assert.deepEqual(purchaseTotalsOf(55000, 0, 0), { subtotal: 55000, taxAmount: 0, total: 55000 });
  assert.deepEqual(purchaseTotalsOf(55000, 0, 0.19), { subtotal: 55000, taxAmount: 10450, total: 65450 });
});

test("un descuento mayor que el subtotal no deja totales negativos", () => {
  assert.deepEqual(purchaseTotalsOf(100, 150, 0.19), { subtotal: 100, taxAmount: 0, total: 0 });
});

test("redondea a centavos como la base", () => {
  const t = purchaseTotalsOf(10.005, 0, 0.19);
  assert.equal(t.subtotal, 10.01);
  assert.equal(t.taxAmount, 1.9);
  assert.equal(t.total, 11.91);
});

test("editando se conserva la tasa guardada; solo un cambio explícito la mueve", () => {
  // Compra guardada al 19 %, el negocio ahora usa 16 %: sigue al 19 %.
  assert.equal(purchaseTaxRateFor("IVA", 0.19, 0.16), 0.19);
  // Pasar a "Ninguno" es explícito.
  assert.equal(purchaseTaxRateFor("Ninguno", 0.19, 0.16), 0);
  // Compra sin IVA a la que se le activa: toma la tasa vigente.
  assert.equal(purchaseTaxRateFor("IVA", 0, 0.16), 0.16);
  // Alta: la del negocio.
  assert.equal(purchaseTaxRateFor("IVA", undefined, 0.19), 0.19);
});

test("los códigos de compras llegan traducidos", async () => {
  const { toMessage } = await import("../lib/errors");
  assert.equal(
    toMessage({ message: "COMPRA_ANULAR_CON_ACCION: para anular una compra usa la acción Anular", code: "42501" }),
    "Para anular una compra usa la acción Anular: así se devuelve el stock.",
  );
  assert.match(toMessage({ message: "DESCUENTO_COMPRA_INVALIDO: x" }), /mayor que el subtotal/);
  assert.match(toMessage({ message: "PEDIDO_NO_EMITIDO: x" }), /ya no está pendiente/);
});
