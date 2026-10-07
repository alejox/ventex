import test from "node:test";
import assert from "node:assert/strict";
import {
  orderLineBreakdown,
  orderLineQuantityLabel,
  orderLineTotal,
  orderTotal,
} from "../lib/purchase-order-lines";
import { purchaseTotalsOf } from "../lib/purchase-totals";

test("producto por unidad: cantidad × costo", () => {
  assert.equal(orderLineTotal({ quantity: 3, unit_price: 10000, units_per_package: 1 }), 30000);
  assert.equal(orderLineTotal({ quantity: 3, unit_price: 10000 }), 30000);
  assert.equal(orderLineTotal({ quantity: 3, unit_price: 10000, units_per_package: null }), 30000);
});

test("producto por caja: cajas completas + sueltas, como receive_purchase_order", () => {
  // Mismo caso que el ensayo SQL: 30 u. de un producto ×24 a 150.000 la caja
  // = 1 caja (150.000) + 6 sueltas a 6.250 = 187.500. La cuenta vieja daba
  // 30 × 150.000 = 4.500.000.
  const b = orderLineBreakdown({ quantity: 30, unit_price: 150000, units_per_package: 24 });
  assert.deepEqual(b, {
    packages: 1,
    looseUnits: 6,
    unitsPerPackage: 24,
    packagePrice: 150000,
    looseUnitPrice: 6250,
    total: 187500,
  });
});

test("el precio de la suelta se redondea a 2 decimales antes de multiplicar", () => {
  // 100.000 / 7 = 14.285,714… -> 14.285,71; 1 caja + 3 sueltas.
  assert.equal(orderLineTotal({ quantity: 10, unit_price: 100000, units_per_package: 7 }), 142857.13);
});

test("cajas exactas y cantidades fraccionarias", () => {
  assert.equal(orderLineTotal({ quantity: 48, unit_price: 150000, units_per_package: 24 }), 300000);
  const b = orderLineBreakdown({ quantity: 30.4, unit_price: 240, units_per_package: 24 });
  assert.equal(b.packages, 1);
  assert.equal(b.looseUnits, 6.4);
  assert.equal(b.total, 304);
});

test("total del pedido = suma de líneas redondeadas, y cuadra con la compra al recibir", () => {
  const lines = [
    { quantity: 30, unit_price: 150000, units_per_package: 24 },
    { quantity: 2, unit_price: 10000, units_per_package: 1 },
  ];
  assert.equal(orderTotal(lines), 207500);
  // Recibido con IVA 19 % (ensayo SQL): 207.500 / 39.425 / 246.925.
  assert.deepEqual(purchaseTotalsOf(orderTotal(lines), 0, 0.19), {
    subtotal: 207500,
    taxAmount: 39425,
    total: 246925,
  });
});

test("etiqueta de cantidad", () => {
  assert.equal(orderLineQuantityLabel({ quantity: 5, unit_price: 1 }), "5 u.");
  assert.equal(orderLineQuantityLabel({ quantity: 30, unit_price: 1, units_per_package: 24 }), "1 caja ×24 + 6 u.");
  assert.equal(orderLineQuantityLabel({ quantity: 48, unit_price: 1, units_per_package: 24 }), "2 cajas ×24");
  assert.equal(orderLineQuantityLabel({ quantity: 6, unit_price: 1, units_per_package: 24 }), "6 u.");
});

test("payload de save_purchase_order: cabecera con estado y líneas limpias", async () => {
  const { purchaseOrderPayload } = await import("../services/purchase-orders.service");
  const payload = purchaseOrderPayload(
    {
      distributor_id: "d1",
      items: [{ product_id: "p1", product_name: "Leche", sku: null, quantity: 30, unit_price: 150000 }],
    },
    "issued",
  );
  assert.deepEqual(payload, {
    header: { distributor_id: "d1", notes: null, status: "issued" },
    items: [{ product_id: "p1", product_name: "Leche", sku: null, quantity: 30, unit_price: 150000 }],
  });
});

test("receive_purchase_order: estado e IVA solo viajan si se apartan del default", async () => {
  const { receiveOrderArgs } = await import("../services/purchase-orders.service");
  // Por defecto (pagada, sin IVA) la llamada coincide con la firma vieja.
  assert.deepEqual(receiveOrderArgs("o1", "2026-10-07"), { p_order_id: "o1", p_issue_date: "2026-10-07" });
  assert.deepEqual(receiveOrderArgs("o1", "2026-10-07", { status: "paid", taxRate: 0 }), {
    p_order_id: "o1",
    p_issue_date: "2026-10-07",
  });
  assert.deepEqual(receiveOrderArgs("o1", "2026-10-07", { status: "pending", taxRate: 0.19 }), {
    p_order_id: "o1",
    p_issue_date: "2026-10-07",
    p_status: "pending",
    p_tax_rate: 0.19,
  });
});
