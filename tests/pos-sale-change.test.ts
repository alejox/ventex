import assert from "node:assert/strict";
import { test } from "node:test";
import { saleChangeSummary } from "../app/dashboard/pos/components/sale-change";

test("efectivo sin dividir: calcula recibido y cambio", () => {
  assert.deepEqual(saleChangeSummary(45000, "efectivo", 0, "50000"), {
    total: 45000,
    tendered: 50000,
    change: 5000,
  });
});

test("efectivo con el valor exacto: sin cambio", () => {
  assert.deepEqual(saleChangeSummary(45000, "efectivo", 0, "45000"), {
    total: 45000,
    tendered: 45000,
    change: 0,
  });
});

test("efectivo sin monto anotado: no inventa recibido ni cambio", () => {
  assert.deepEqual(saleChangeSummary(45000, "efectivo", 0, ""), {
    total: 45000,
    tendered: null,
    change: 0,
  });
});

test("tarjeta, transferencia o crédito: nunca hay cambio", () => {
  for (const method of ["tarjeta", "transferencia", "credito"] as const) {
    assert.deepEqual(saleChangeSummary(45000, method, 0, "100000"), {
      total: 45000,
      tendered: null,
      change: 0,
    });
  }
});

test("pago dividido: el monto recibido del modal no aplica", () => {
  assert.deepEqual(saleChangeSummary(45000, "efectivo", 2, "100000"), {
    total: 45000,
    tendered: null,
    change: 0,
  });
});
