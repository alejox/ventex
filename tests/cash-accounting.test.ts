import { test } from "node:test";
import assert from "node:assert/strict";
import {
  aggregateOverview,
  overviewFromRpc,
  saleCashReceived,
  type OverviewSaleRow,
} from "@/services/finance.service";
import { incomeBreakdown } from "@/services/reports.service";
import { localDayStartIso } from "@/services/expenses.service";
import { shiftCashBreakdown, shiftCloseReport, sumCashLines } from "@/lib/pos-shift-close";
import { abonoMethodLabel, abonoMethodOptions } from "@/lib/credits";

// ---- Flujo de caja: ventas cobradas, no facturadas -------------------------

test("saleCashReceived: lo fiado no es caja; un pago dividido suma solo lo cobrado", () => {
  assert.equal(saleCashReceived({ total: 50000, payment_method: "efectivo", sale_payments: [] }), 50000);
  assert.equal(saleCashReceived({ total: 50000, payment_method: "credito", sale_payments: [] }), 0);
  assert.equal(
    saleCashReceived({
      total: 80000,
      payment_method: "split",
      sale_payments: [
        { payment_method: "efectivo", amount: "30000" },
        { payment_method: "credito", amount: 50000 },
      ],
    }),
    30000,
  );
  // Venta fiada CON fila de pago 'credito' (lo que escribe create_sale hoy).
  assert.equal(
    saleCashReceived({ total: 20000, payment_method: "credito", sale_payments: [{ payment_method: "credito", amount: 20000 }] }),
    0,
  );
  // Venta vieja sin filas: su total entero, salvo que fuera fiada.
  assert.equal(saleCashReceived({ total: "12000", payment_method: "transferencia" }), 12000);
});

const MONTHS = [
  { key: "2026-09", label: "Sep" },
  { key: "2026-10", label: "Oct" },
];

const sale = (over: Partial<OverviewSaleRow>): OverviewSaleRow => ({
  id: "s",
  sale_number: 1,
  created_at: "2026-10-02T15:00:00Z",
  total: 0,
  payment_method: "efectivo",
  sale_payments: [],
  ...over,
});

test("aggregateOverview: ingresos = cobrado al vender + abonos + facturas, y el fiado aparte", () => {
  const o = aggregateOverview(
    {
      sales: [
        sale({ id: "a", sale_number: 1, total: 50000, payment_method: "efectivo" }),
        sale({ id: "b", sale_number: 2, total: 40000, payment_method: "credito" }),
        sale({
          id: "c",
          sale_number: 3,
          total: 80000,
          payment_method: "split",
          sale_payments: [
            { payment_method: "tarjeta", amount: 30000 },
            { payment_method: "credito", amount: 50000 },
          ],
        }),
      ],
      abonos: [
        { id: "p1", amount: 15000, created_at: "2026-10-03T15:00:00Z", customer_name: "Ana" },
        { id: "p2", amount: "5000", created_at: "2026-09-20T15:00:00Z", customer_name: null },
      ],
      docs: [
        { id: "f1", invoice_number: 7, type: "factura", total: 10000, paid_at: "2026-10-04T15:00:00Z" },
        // Compra emitida en agosto, PAGADA en octubre: egreso de octubre.
        { id: "c1", invoice_number: 8, type: "compra", total: 25000, paid_at: "2026-10-05T15:00:00Z" },
      ],
      expenses: [{ id: "e1", description: "Arriendo", amount: 1000, expense_date: "2026-10-01", category: null }],
    },
    MONTHS,
  );
  assert.equal(o.salesIncome, 80000); // 50.000 + 30.000 (tarjeta); nada de lo fiado
  assert.equal(o.abonosIncome, 20000);
  assert.equal(o.invoicesIncome, 10000);
  assert.equal(o.revenue, 110000);
  assert.equal(o.salesBilled, 170000);
  assert.equal(o.creditIssued, 90000);
  assert.equal(o.salesCount, 3);
  assert.equal(o.expenses, 26000);
  assert.equal(o.net, 110000 - 26000);
  const oct = o.monthly.find((m) => m.key === "2026-10")!;
  const sep = o.monthly.find((m) => m.key === "2026-09")!;
  assert.equal(oct.income + sep.income, o.revenue);
  assert.equal(sep.income, 5000);
  assert.equal(oct.expense, 26000);
  // La venta fiada no figura en recientes (no entró plata); el abono sí.
  assert.ok(!o.recent.some((r) => r.label === "Venta #2"));
  assert.ok(o.recent.some((r) => r.label === "Abono de Ana" && r.amount === 15000));
  assert.ok(o.recent.some((r) => r.label === "Compra #8" && r.amount === -25000));
  assert.equal(o.expensesByCategory.find((c) => c.id === "compras")?.amount, 25000);
});

test("overviewFromRpc: lee el desglose nuevo y tolera un RPC viejo sin él", () => {
  const nuevo = overviewFromRpc(
    { revenue: 110000, sales_income: "80000", abonos_income: 20000, invoices_income: 10000, sales_billed: 170000, credit_issued: 90000 },
    MONTHS,
  );
  assert.equal(nuevo.salesIncome + nuevo.abonosIncome + nuevo.invoicesIncome, nuevo.revenue);
  assert.equal(nuevo.creditIssued, 90000);
  const viejo = overviewFromRpc({ revenue: 5000 }, MONTHS);
  assert.equal(viejo.salesIncome, 5000);
  assert.equal(viejo.abonosIncome, 0);
  assert.equal(viejo.creditIssued, 0);
});

test("incomeBreakdown: sin 'credito', con abonos, y suma exactamente los ingresos", () => {
  const sales = [
    { total: 50000, payment_method: "efectivo", sale_payments: [] },
    { total: 40000, payment_method: "credito", sale_payments: [{ payment_method: "credito", amount: 40000 }] },
    {
      total: 80000,
      payment_method: "split",
      sale_payments: [
        { payment_method: "tarjeta", amount: 30000 },
        { payment_method: "credito", amount: 50000 },
      ],
    },
  ];
  const slices = incomeBreakdown(sales, { revenue: 110000, abonosIncome: 20000 });
  assert.ok(!slices.some((s) => s.method === "credito"));
  assert.equal(slices.find((s) => s.method === "abonos")?.amount, 20000);
  assert.equal(slices.find((s) => s.method === "facturas")?.amount, 10000);
  assert.equal(slices.reduce((s, x) => s + x.amount, 0), 110000);
});

test("localDayStartIso: medianoche LOCAL del día, no de Greenwich", () => {
  const iso = localDayStartIso("2026-10-07");
  const d = new Date(iso);
  assert.equal(d.getFullYear(), 2026);
  assert.equal(d.getMonth(), 9);
  assert.equal(d.getDate(), 7);
  assert.equal(d.getHours(), 0);
});

// ---- Arqueo: base + ventas + abonos − salidas = esperado --------------------

test("shiftCashBreakdown: el desglose nuevo suma el esperado del servidor", () => {
  const { lines, expected } = shiftCashBreakdown({
    openingCash: 120000,
    cashIn: 300000,
    cashAbonos: 12000,
    withdrawals: 92000,
    movementsByKind: { comision: 62000, gasto: "20000", devolucion: 10000 },
    expectedCash: 340000,
  });
  assert.deepEqual(
    lines.map((l) => l.label),
    ["Base de caja", "Efectivo de ventas", "Abonos en efectivo", "Gastos", "Devoluciones", "Comisiones", "Traslados"],
  );
  assert.equal(sumCashLines(lines), expected);
});

test("shiftCashBreakdown: un kind desconocido va a 'Otros retiros' y sigue cuadrando", () => {
  const { lines } = shiftCashBreakdown({
    openingCash: 0,
    cashIn: 100,
    cashAbonos: 0,
    withdrawals: 30,
    movementsByKind: { traslado: 10, nuevo: 20 },
    expectedCash: 70,
  });
  assert.equal(lines.find((l) => l.key === "otros")?.amount, 20);
  assert.equal(sumCashLines(lines), 70);
});

test("shiftCashBreakdown: un cierre viejo (sin desglose) deduce el efectivo de ventas", () => {
  const { lines } = shiftCashBreakdown({ openingCash: 100000, withdrawals: 20000, expectedCash: 350000 });
  assert.equal(lines.find((l) => l.key === "ventas")?.amount, 270000);
  assert.ok(lines.some((l) => l.label === "Retiros de caja"));
  assert.ok(!lines.some((l) => l.key === "abonos"));
  assert.equal(sumCashLines(lines), 350000);
});

test("el comprobante impreso trae los abonos y las salidas por tipo", () => {
  const fmt = (n: number | null | undefined) => `$${Math.round(n ?? 0)}`;
  const r = shiftCloseReport(
    {
      openedAt: "2026-10-06T13:00:00Z",
      closedAt: "2026-10-06T22:00:00Z",
      openingCash: 120000,
      closingCash: 70000,
      expectedCash: 70000,
      difference: 0,
      salesCount: 0,
      salesTotal: 0,
      withdrawals: 62000,
      byMethod: {},
      cashIn: 0,
      cashAbonos: 12000,
      movementsByKind: { comision: 62000 },
    },
    fmt,
  );
  const arqueo = r.sections.find((s) => s.title === "Arqueo")!;
  assert.deepEqual(arqueo.rows.find((x) => x.label === "Abonos en efectivo"), { label: "Abonos en efectivo", value: "$12000" });
  assert.deepEqual(arqueo.rows.find((x) => x.label === "Comisiones"), { label: "Comisiones", value: "-$62000" });
  assert.deepEqual(arqueo.rows.find((x) => x.label === "Gastos"), { label: "Gastos", value: "$0" });
});

// ---- Medio de pago del abono ------------------------------------------------

test("abonoMethodOptions: sin fiado, y respeta lo que el negocio apagó", () => {
  assert.deepEqual(abonoMethodOptions({}).map((m) => m.value), ["efectivo", "tarjeta", "transferencia"]);
  assert.deepEqual(abonoMethodOptions({ acceptsCard: false }).map((m) => m.value), ["efectivo", "transferencia"]);
  assert.deepEqual(
    abonoMethodOptions({ acceptsCard: false, acceptsTransfer: false }).map((m) => m.value),
    ["efectivo"],
  );
  assert.equal(abonoMethodLabel("tarjeta"), "Datáfono");
  assert.equal(abonoMethodLabel(null), "Efectivo");
});
