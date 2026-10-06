import test from "node:test";
import assert from "node:assert/strict";
import {
  amountDue,
  isOverdue,
  matchesPurchaseFilter,
  parsePurchaseFilter,
  purchaseBucketOf,
  purchaseFilterCounts,
  purchaseTotals,
} from "../app/dashboard/purchases/purchase-filters";

const TODAY = "2026-10-06";
const inv = (status: string, due_date: string | null, total: number | string = 100) => ({ status, due_date, total });

test("vencida = pendiente con vencimiento ANTERIOR a hoy", () => {
  assert.equal(isOverdue(inv("pending", "2026-10-05"), TODAY), true);
  // El día del vencimiento todavía no está vencida.
  assert.equal(isOverdue(inv("pending", "2026-10-06"), TODAY), false);
  assert.equal(isOverdue(inv("pending", null), TODAY), false);
  // Pagada o anulada nunca está vencida, aunque la fecha haya pasado.
  assert.equal(isOverdue(inv("paid", "2026-01-01"), TODAY), false);
  assert.equal(isOverdue(inv("cancelled", "2026-01-01"), TODAY), false);
});

test("purchaseBucketOf clasifica por estado y vencimiento", () => {
  assert.equal(purchaseBucketOf(inv("paid", null), TODAY), "paid");
  assert.equal(purchaseBucketOf(inv("cancelled", "2026-01-01"), TODAY), "cancelled");
  assert.equal(purchaseBucketOf(inv("pending", "2026-12-01"), TODAY), "pending");
  assert.equal(purchaseBucketOf(inv("pending", "2026-09-30"), TODAY), "overdue");
});

test("amountDue: solo lo pendiente debe plata, y el total viene como string desde la base", () => {
  assert.equal(amountDue(inv("pending", null, "250000.50")), 250000.5);
  assert.equal(amountDue(inv("paid", null, 500)), 0);
  assert.equal(amountDue(inv("cancelled", null, 500)), 0);
  assert.equal(amountDue(inv("pending", null, "abc")), 0);
});

test("el chip Pendientes incluye las vencidas; Vencidas solo esas", () => {
  const overdue = inv("pending", "2026-09-01");
  assert.equal(matchesPurchaseFilter(overdue, "pending", TODAY), true);
  assert.equal(matchesPurchaseFilter(overdue, "overdue", TODAY), true);
  assert.equal(matchesPurchaseFilter(inv("pending", null), "overdue", TODAY), false);
  assert.equal(matchesPurchaseFilter(inv("paid", null), "pending", TODAY), false);
  assert.equal(matchesPurchaseFilter(inv("cancelled", null), "all", TODAY), true);
});

test("purchaseTotals suma lo por pagar y lo vencido", () => {
  const rows = [
    inv("pending", "2026-09-01", 100),
    inv("pending", "2026-12-01", 50),
    inv("paid", "2026-09-01", 999),
    inv("cancelled", "2026-09-01", 999),
  ];
  assert.deepEqual(purchaseTotals(rows, TODAY), { due: 150, overdue: 100, overdueCount: 1, pendingCount: 2 });
  assert.deepEqual(purchaseFilterCounts(rows, TODAY), { all: 4, pending: 2, overdue: 1, paid: 1, cancelled: 1 });
});

test("parsePurchaseFilter cae a Todas con un valor desconocido en la URL", () => {
  assert.equal(parsePurchaseFilter("overdue"), "overdue");
  assert.equal(parsePurchaseFilter("cualquier-cosa"), "all");
  assert.equal(parsePurchaseFilter(null), "all");
});
