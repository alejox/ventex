import { test } from "node:test";
import assert from "node:assert/strict";
import {
  monthlyRows,
  monthsBackTo,
  monthsIn,
  paymentBreakdown,
  reportMonths,
  totalsOf,
  withInvoiceIncome,
} from "@/services/reports.service";
import { resolveExpenseRange } from "@/services/expenses.service";
import { salesExportColumns, localDateTime, type SaleListItem } from "@/services/sales.service";

const NOW = new Date(2026, 9, 6, 12); // 6 oct 2026

test("reportMonths: presets y personalizado (cortado en el mes en curso)", () => {
  assert.deepEqual(reportMonths("last6", NOW), { fromMonth: "2026-05", toMonth: "2026-10" });
  assert.deepEqual(reportMonths("last12", NOW), { fromMonth: "2025-11", toMonth: "2026-10" });
  assert.deepEqual(reportMonths("thisYear", NOW), { fromMonth: "2026-01", toMonth: "2026-10" });
  assert.deepEqual(reportMonths("lastYear", NOW), { fromMonth: "2025-01", toMonth: "2025-12" });
  assert.deepEqual(reportMonths("custom", NOW, "2026-12", "2026-08"), { fromMonth: "2026-08", toMonth: "2026-10" });
  assert.equal(reportMonths("custom", NOW, "2026-08", ""), null);
});

test("monthsBackTo: cuántos meses le pide al RPC (que cuenta desde hoy)", () => {
  assert.equal(monthsBackTo("2026-10", NOW), 1);
  assert.equal(monthsBackTo("2026-05", NOW), 6);
  assert.equal(monthsBackTo("2025-01", NOW), 22);
});

test("monthlyRows: meses vacíos en cero y flujo acumulado", () => {
  const span = { fromMonth: "2026-08", toMonth: "2026-10" };
  assert.deepEqual(monthsIn(span), ["2026-08", "2026-09", "2026-10"]);
  const rows = monthlyRows(
    [
      { key: "2026-07", income: 999, expense: 0 }, // fuera del período
      { key: "2026-08", income: 100, expense: 150 },
      { key: "2026-10", income: 300, expense: 100 },
    ],
    span,
  );
  assert.deepEqual(
    rows.map((r) => [r.key, r.income, r.expense, r.net, r.cumulative]),
    [
      ["2026-08", 100, 150, -50, -50],
      ["2026-09", 0, 0, 0, -50],
      ["2026-10", 300, 100, 200, 150],
    ],
  );
  assert.deepEqual(totalsOf(rows), { income: 400, expense: 250, net: 150 });
});

test("paymentBreakdown: un pago dividido suma en cada medio; las ventas viejas caen enteras", () => {
  const slices = paymentBreakdown([
    { total: 80000, payment_method: "split", sale_payments: [
      { payment_method: "efectivo", amount: 50000 },
      { payment_method: "transferencia", amount: "30000" },
    ] },
    { total: 20000, payment_method: "efectivo", sale_payments: [] },
    { total: 10000, payment_method: "credito", sale_payments: null },
    { total: 0, payment_method: "efectivo" },
  ]);
  assert.deepEqual(
    slices.map((s) => [s.method, s.amount, s.count]),
    [
      ["efectivo", 70000, 2],
      ["transferencia", 30000, 1],
      ["credito", 10000, 1],
    ],
  );
  assert.equal(slices.find((s) => s.method === "split"), undefined, "'Pago dividido' no es un medio");
});

test("withInvoiceIncome: las facturas cobradas cierran la diferencia con los ingresos", () => {
  const base = paymentBreakdown([{ total: 100, payment_method: "efectivo" }]);
  const all = withInvoiceIncome(base, 350);
  assert.deepEqual(all.map((s) => [s.method, s.amount]), [["facturas", 250], ["efectivo", 100]]);
  assert.equal(withInvoiceIncome(base, 100).length, 1);
});

test("resolveExpenseRange: personalizado con `to` exclusivo, puntas ordenadas y lado abierto", () => {
  assert.deepEqual(resolveExpenseRange("custom", "2026-09-01", "2026-09-30", NOW), { from: "2026-09-01", to: "2026-10-01" });
  assert.deepEqual(resolveExpenseRange("custom", "2026-09-30", "2026-09-01", NOW), { from: "2026-09-01", to: "2026-10-01" });
  assert.deepEqual(resolveExpenseRange("custom", "2026-09-15", "", NOW), { from: "2026-09-15", to: null });
  assert.deepEqual(resolveExpenseRange("month", "", "", NOW), { from: "2026-10-01", to: "2026-11-01" });
});

test("salesExportColumns: con ítem filtrado suma sus dos columnas", () => {
  const sale = {
    sale_number: 8, created_at: "2026-10-06T01:15:00Z", customer_name: null, status: "completed",
    payment_method: "efectivo", item_count: 3, subtotal: 100, discount_amount: 0, tax_amount: 0, total: 100,
    item_units: 2, item_total: 6000,
  } as SaleListItem;
  const base = salesExportColumns(() => "Efectivo");
  assert.equal(base.length, 10);
  const withItem = salesExportColumns(() => "Efectivo", "Gaseosa");
  assert.deepEqual(withItem.slice(-2).map((c) => [c.header, c.value(sale)]), [
    ["Unidades de Gaseosa", 2],
    ["Vendido de Gaseosa", 6000],
  ]);
  assert.equal(base[2].value(sale), "De paso");
  assert.match(localDateTime(sale.created_at), /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
});
