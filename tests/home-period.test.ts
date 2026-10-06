import { test } from "node:test";
import assert from "node:assert/strict";
import {
  changeTone,
  chartScale,
  daysFromToday,
  formatChange,
  homePeriodRange,
  pctChange,
  pendingChecksFor,
  pendingItems,
  previousPeriod,
  rangeLabel,
} from "@/services/finance.service";
import { visibleNavItems, workerNavItems } from "@/config/business";

const d = (iso: string) => {
  const [y, m, day] = iso.split("-").map(Number);
  return new Date(y, m - 1, day);
};
const day = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const span = (r: { from: Date; to: Date } | null) => (r ? [day(r.from), day(r.to)] : null);

const NOW = new Date(2026, 9, 6, 15, 30); // 6 oct 2026, 15:30 local

test("homePeriodRange: hoy, 7 días, este mes (hasta mañana) y mes pasado", () => {
  assert.deepEqual(span(homePeriodRange("today", NOW)), ["2026-10-06", "2026-10-07"]);
  assert.deepEqual(span(homePeriodRange("last7", NOW)), ["2026-09-30", "2026-10-07"]);
  assert.deepEqual(span(homePeriodRange("month", NOW)), ["2026-10-01", "2026-10-07"]);
  assert.deepEqual(span(homePeriodRange("lastMonth", NOW)), ["2026-09-01", "2026-10-01"]);
});

test("homePeriodRange: personalizado incluye el último día, ordena las puntas y exige las dos", () => {
  assert.deepEqual(span(homePeriodRange("custom", NOW, "2026-09-10", "2026-09-20")), ["2026-09-10", "2026-09-21"]);
  assert.deepEqual(span(homePeriodRange("custom", NOW, "2026-09-20", "2026-09-10")), ["2026-09-10", "2026-09-21"]);
  assert.equal(homePeriodRange("custom", NOW, "2026-09-10", ""), null);
});

test("previousPeriod: hoy contra ayer y 7 días contra los 7 anteriores", () => {
  assert.deepEqual(span(previousPeriod("today", homePeriodRange("today", NOW)!)), ["2026-10-05", "2026-10-06"]);
  assert.deepEqual(span(previousPeriod("last7", homePeriodRange("last7", NOW)!)), ["2026-09-23", "2026-09-30"]);
});

test("previousPeriod: este mes contra los MISMOS días del mes anterior, no el mes entero", () => {
  assert.deepEqual(span(previousPeriod("month", homePeriodRange("month", NOW)!)), ["2026-09-01", "2026-09-07"]);
});

test("previousPeriod: un 31 de marzo no invade marzo al compararse con febrero", () => {
  const march31 = new Date(2026, 2, 31, 10);
  assert.deepEqual(span(previousPeriod("month", homePeriodRange("month", march31)!)), ["2026-02-01", "2026-03-01"]);
});

test("previousPeriod: mes pasado contra el anterior completo; personalizado contra el tramo previo", () => {
  assert.deepEqual(span(previousPeriod("lastMonth", homePeriodRange("lastMonth", NOW)!)), ["2026-08-01", "2026-09-01"]);
  const custom = homePeriodRange("custom", NOW, "2026-09-10", "2026-09-19")!;
  assert.deepEqual(span(previousPeriod("custom", custom)), ["2026-08-31", "2026-09-10"]);
});

test("rangeLabel nombra el período de la comparación", () => {
  assert.equal(rangeLabel({ from: d("2026-10-05"), to: d("2026-10-06") }), "5 oct");
  assert.equal(rangeLabel({ from: d("2026-09-01"), to: d("2026-09-07") }), "1–6 sept");
  assert.equal(rangeLabel({ from: d("2026-09-28"), to: d("2026-10-05") }), "28 sept – 4 oct");
  assert.equal(rangeLabel({ from: d("2026-08-01"), to: d("2026-09-01") }), "ago 2026");
});

test("pctChange: sin base no hay porcentaje (ni ∞ ni 100 % inventado)", () => {
  assert.equal(pctChange(112, 100), 0.12);
  assert.equal(pctChange(50, 0), null);
  assert.equal(pctChange(-50, -100), 0.5, "un flujo negativo que mejora sube");
});

test("formatChange y changeTone", () => {
  assert.equal(formatChange(0.12), "▲ 12 %");
  assert.equal(formatChange(-0.035), "▼ 3,5 %");
  assert.equal(formatChange(0.0001), "= 0 %");
  assert.equal(changeTone(0.2, true), "good");
  assert.equal(changeTone(0.2, false), "bad", "más egresos es malo");
  assert.equal(changeTone(-0.2, false), "good");
  assert.equal(changeTone(null, true), "neutral");
});

test("chartScale: tope redondo que cubre el máximo y marcas parejas", () => {
  const s = chartScale([0, 487_312, 120_000]);
  assert.equal(s.max, 500_000);
  assert.deepEqual(s.ticks, [0, 100_000, 200_000, 300_000, 400_000, 500_000]);
  assert.deepEqual(chartScale([0, 0]), { max: 1, ticks: [0] });
  assert.ok(chartScale([1_000_000]).max >= 1_000_000);
});

test("pendingChecksFor sale del menú, no de reglas propias por rubro", () => {
  const tienda = visibleNavItems("tienda", null).map((i) => i.id);
  const tiendaChecks = pendingChecksFor(tienda, true);
  assert.ok(!tiendaChecks.includes("appointments"), "una tienda no agenda citas");
  assert.ok(tiendaChecks.includes("credits"));
  assert.ok(tiendaChecks.includes("license"));

  const salon = visibleNavItems("salon", null).map((i) => i.id);
  assert.ok(pendingChecksFor(salon, true).includes("appointments"));

  const servicios = visibleNavItems("servicios", null).map((i) => i.id);
  assert.ok(pendingChecksFor(servicios, true).includes("overdueInvoices"));
  assert.ok(!pendingChecksFor(salon, true).includes("overdueInvoices"), "un salón no factura");
});

test("pendingChecksFor: un trabajador nunca ve comisiones ni licencia", () => {
  const nav = workerNavItems({ pos: true, calendar: true, customers: true }).map((i) => i.id);
  const checks = pendingChecksFor(nav, false);
  assert.deepEqual(checks, ["appointments", "credits", "openShift"]);
});

test("pendingItems: oculta los ceros y lo que no se pudo consultar; licencia solo dentro de la ventana", () => {
  const items = pendingItems(
    ["appointments", "credits", "overdueInvoices", "commissions", "license"],
    { appointments: 3, credits: 0, overdueInvoices: 1, license: 20 },
  );
  assert.deepEqual(items.map((i) => i.label), ["3 citas para hoy", "1 factura vencida"]);
  assert.equal(items[1].href, "/dashboard/billing?filtro=vencidas");

  const lic = pendingItems(["license"], { license: 1 });
  assert.equal(lic[0].label, "Tu plan vence en 1 día");
  assert.equal(pendingItems(["license"], { license: -3 })[0].label, "Tu plan venció hace 3 días");
  assert.equal(pendingItems(["license"], { license: 0 })[0].label, "Tu plan vence hoy");
});

test("daysFromToday: columnas date sin correrse por zona", () => {
  assert.equal(daysFromToday("2026-10-06", NOW), 0);
  assert.equal(daysFromToday("2026-10-09", NOW), 3);
  assert.equal(daysFromToday("2026-10-01", NOW), -5);
});
