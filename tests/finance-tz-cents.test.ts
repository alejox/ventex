import { test } from "node:test";
import assert from "node:assert/strict";
import { addMoney, sumMoney, toCents } from "@/lib/money-sum";
import { calendarDayIn, isValidTimeZone, monthKeyIn, zonedMidnight } from "@/lib/tz";
import {
  aggregateOverview,
  averageTicket,
  homePeriodRange,
  overviewFromRpc,
  saleCashReceived,
  toIsoRange,
  todayIn,
} from "@/services/finance.service";
import { localDayStartIso, resolveExpenseRange } from "@/services/expenses.service";
import { monthSpanToIso, paymentBreakdown, reportMonths, totalsOf, monthlyRows } from "@/services/reports.service";

const day = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

// ---- Sumas en centavos ----

test("sumMoney: sin artefactos de punto flotante", () => {
  assert.notEqual(0.1 + 0.2, 0.3, "el problema existe");
  assert.equal(sumMoney([0.1, 0.2]), 0.3);
  // Mil veces $0,10 en floats da 99.9999999999986.
  assert.equal(sumMoney(Array(1000).fill(0.1)), 100);
  assert.equal(sumMoney(["1250.10", 2.2, null, undefined, "x"]), 1252.3);
  assert.equal(addMoney(0.7, 0.1), 0.8);
  assert.equal(toCents(19.999), 2000);
});

test("aggregateOverview: totales a centavos y el ticket sin ventas de total 0", () => {
  const months = [{ key: "2026-10", label: "Oct" }];
  const sale = (id: string, total: number) => ({
    id,
    sale_number: Number(id),
    total,
    payment_method: "efectivo",
    created_at: "2026-10-06T15:00:00.000Z",
  });
  const sales = [...Array(10)].map((_, i) => sale(String(i + 1), 0.1));
  sales.push(sale("99", 0)); // premio canjeado entero
  const o = aggregateOverview(
    {
      sales,
      abonos: [{ id: "a", amount: 0.2, created_at: "2026-10-06T15:00:00.000Z", customer_name: null }],
      docs: [],
      expenses: [
        { id: "e1", description: "x", amount: 0.1, expense_date: "2026-10-06" },
        { id: "e2", description: "y", amount: 0.2, expense_date: "2026-10-06" },
      ],
    },
    months,
    "America/Bogota",
  );
  assert.equal(o.salesIncome, 1);
  assert.equal(o.revenue, 1.2);
  assert.equal(o.expenses, 0.3);
  assert.equal(o.net, 0.9);
  assert.equal(o.monthly[0].income, 1.2);
  assert.equal(o.monthly[0].expense, 0.3);
  assert.equal(o.salesCount, 11, "el conteo crudo incluye el premio");
  assert.equal(o.ticketCount, 10, "el ticket no");
  assert.equal(averageTicket(o.salesBilled, o.ticketCount), 0.1);
  assert.equal(averageTicket(100, 0), 0);
});

test("overviewFromRpc: ticket_count, y un RPC viejo cae al conteo crudo", () => {
  assert.equal(overviewFromRpc({ sales_count: 67, ticket_count: 55 }, []).ticketCount, 55);
  assert.equal(overviewFromRpc({ sales_count: 67 }, []).ticketCount, 67);
});

test("saleCashReceived y paymentBreakdown suman en centavos", () => {
  const split = {
    total: 0.3,
    payment_method: "split",
    sale_payments: [
      { payment_method: "efectivo", amount: 0.1 },
      { payment_method: "efectivo", amount: 0.2 },
    ],
  };
  assert.equal(saleCashReceived(split), 0.3);
  const slices = paymentBreakdown([split, ...Array(9).fill({ total: 0.1, payment_method: "efectivo" })]);
  assert.equal(slices[0].amount, 1.2);
  const rows = monthlyRows(
    [
      { key: "2026-09", income: 0.1, expense: 0.3 },
      { key: "2026-10", income: 0.2, expense: 0 },
    ],
    { fromMonth: "2026-09", toMonth: "2026-10" },
  );
  assert.equal(rows[0].net, -0.2);
  assert.equal(rows[1].cumulative, 0);
  assert.deepEqual(totalsOf(rows), { income: 0.3, expense: 0.3, net: 0 });
});

// ---- Zona horaria del negocio ----

test("tz: día de calendario y medianoche en la zona del negocio", () => {
  assert.equal(isValidTimeZone("America/Bogota"), true);
  assert.equal(isValidTimeZone("Marte/Olympus"), false);
  assert.equal(isValidTimeZone(""), false);
  // 03:00 UTC del 7 = 22:00 del 6 en Bogotá (UTC-5, sin horario de verano).
  const late = new Date("2026-10-07T03:00:00.000Z");
  assert.equal(calendarDayIn("America/Bogota", late), "2026-10-06");
  assert.equal(calendarDayIn("Europe/Madrid", late), "2026-10-07");
  assert.equal(monthKeyIn("America/Bogota", "2026-11-01T04:59:00.000Z"), "2026-10");
  assert.equal(zonedMidnight("2026-10-06", "America/Bogota").toISOString(), "2026-10-06T05:00:00.000Z");
  // Con cambio de horario: Madrid pasa a UTC+1 el 25 oct 2026.
  assert.equal(zonedMidnight("2026-10-25", "Europe/Madrid").toISOString(), "2026-10-24T22:00:00.000Z");
  assert.equal(zonedMidnight("2026-10-26", "Europe/Madrid").toISOString(), "2026-10-25T23:00:00.000Z");
});

test("Panel: 'hoy' y los bordes del rango salen de la zona del NEGOCIO", () => {
  const late = new Date("2026-10-07T03:00:00.000Z"); // 22:00 del 6 en Bogotá
  assert.equal(day(todayIn(late, "America/Bogota")), "2026-10-06");
  const range = homePeriodRange("today", late, "", "", "America/Bogota")!;
  assert.deepEqual(toIsoRange(range, "America/Bogota"), {
    from: "2026-10-06T05:00:00.000Z",
    to: "2026-10-07T05:00:00.000Z",
  });
  // Una zona inválida no rompe: cae a la del dispositivo.
  assert.ok(homePeriodRange("today", late, "", "", "Marte/Olympus"));
});

test("Reportes: meses cortados en la zona del negocio", () => {
  // 1 nov 03:00 UTC = 31 oct 22:00 en Bogotá: todavía es octubre.
  const late = new Date("2026-11-01T03:00:00.000Z");
  assert.equal(reportMonths("last6", late, "", "", "America/Bogota")?.toMonth, "2026-10");
  assert.deepEqual(monthSpanToIso({ fromMonth: "2026-10", toMonth: "2026-10" }, "America/Bogota"), {
    from: "2026-10-01T05:00:00.000Z",
    to: "2026-11-01T05:00:00.000Z",
  });
});

// ---- "Este mes" igual en Panel y Gastos ----

test("'Este mes' tiene los mismos bordes en el Panel y en Gastos", () => {
  const now = new Date(2026, 9, 6, 15, 30);
  const panel = homePeriodRange("month", now)!;
  const gastos = resolveExpenseRange("month", "", "", now);
  assert.deepEqual([day(panel.from), day(panel.to)], [gastos.from, gastos.to]);
  assert.deepEqual(gastos, { from: "2026-10-01", to: "2026-11-01" });

  const late = new Date("2026-11-01T03:00:00.000Z"); // 31 oct en Bogotá
  const panelTz = homePeriodRange("month", late, "", "", "America/Bogota")!;
  const gastosTz = resolveExpenseRange("month", "", "", late, "America/Bogota");
  assert.deepEqual([day(panelTz.from), day(panelTz.to)], [gastosTz.from, gastosTz.to]);
  assert.deepEqual(gastosTz, { from: "2026-10-01", to: "2026-11-01" });
  assert.equal(localDayStartIso("2026-10-01", "America/Bogota"), "2026-10-01T05:00:00.000Z");
});
