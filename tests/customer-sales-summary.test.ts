import test from "node:test";
import assert from "node:assert/strict";
import { isVoidSale, summarizeCustomerSales } from "../services/customers.service";
import type { CustomerSale } from "../services/customers.service";

const venta = (over: Partial<CustomerSale> = {}): CustomerSale => ({
  id: "s1",
  sale_number: 1,
  created_at: "2026-10-01T15:00:00Z",
  payment_method: "efectivo",
  total: 100,
  item_count: 1,
  status: "completed",
  ...over,
});

test("las anuladas no suman ni cuentan como visita", () => {
  // Orden de fetchCustomerSales: la más reciente primero.
  const sales = [
    venta({ id: "a", sale_number: 3, total: 500, status: "void", created_at: "2026-10-05T10:00:00Z" }),
    venta({ id: "b", sale_number: 2, total: 200, created_at: "2026-10-03T10:00:00Z" }),
    venta({ id: "c", sale_number: 1, total: 50, created_at: "2026-10-01T10:00:00Z" }),
  ];
  const r = summarizeCustomerSales(sales);
  assert.equal(r.count, 2);
  assert.equal(r.totalSpent, 250);
  assert.equal(r.lastSale?.id, "b");
});

test("solo anuladas: cero ventas y sin última visita", () => {
  const r = summarizeCustomerSales([venta({ status: "void" })]);
  assert.deepEqual(r, { count: 0, totalSpent: 0, lastSale: null });
});

test("sin ventas", () => {
  assert.deepEqual(summarizeCustomerSales([]), { count: 0, totalSpent: 0, lastSale: null });
});

test("isVoidSale reconoce solo 'void'", () => {
  assert.equal(isVoidSale({ status: "void" }), true);
  assert.equal(isVoidSale({ status: "completed" }), false);
});
