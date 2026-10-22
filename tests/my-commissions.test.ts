import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MAX_PERIOD_DAYS,
  commissionChip,
  isPeriodTooLong,
  myPeriodOf,
  presetPeriod,
  myCommissionCards,
  settlementStatusLabel,
} from "@/lib/my-commissions";
import { collectMyCommissionLines, type MyLineRow } from "@/services/commissions-self.service";
import {
  hasStaffRecord,
  visibleNavItems,
  withSelfServiceNavItems,
  workerNavItems,
} from "@/config/business";

const BOGOTA = "America/Bogota";


// ---- Período en la zona del negocio ----

test("myPeriodOf: medianoche del negocio, `to` inclusivo (corte exclusivo al día siguiente)", () => {
  const p = myPeriodOf("2026-10-01", "2026-10-21", BOGOTA);
  assert.equal(p.from, "2026-10-01");
  assert.equal(p.to, "2026-10-21");
  // Bogotá es UTC-5 todo el año.
  assert.equal(p.fromTs, "2026-10-01T05:00:00.000Z");
  assert.equal(p.toTs, "2026-10-22T05:00:00.000Z");
});

test("presetPeriod this-month: del 1 al día de HOY en la zona del negocio, no del navegador", () => {
  // 2026-11-01 02:00 UTC es todavía 31 de octubre en Bogotá.
  const now = new Date("2026-11-01T02:00:00.000Z");
  const p = presetPeriod("this-month", BOGOTA, now);
  assert.equal(p.from, "2026-10-01");
  assert.equal(p.to, "2026-10-31");
});

test("presetPeriod last-month: el mes calendario anterior completo, cruzando el año", () => {
  const now = new Date("2026-01-10T15:00:00.000Z");
  const p = presetPeriod("last-month", BOGOTA, now);
  assert.equal(p.from, "2025-12-01");
  assert.equal(p.to, "2025-12-31");
  assert.equal(p.toTs, "2026-01-01T05:00:00.000Z");
});

test("isPeriodTooLong: el tope del RPC (MAX_PERIOD_DAYS) se respeta en el cliente", () => {
  assert.equal(MAX_PERIOD_DAYS, 370);
  assert.equal(isPeriodTooLong(myPeriodOf("2026-01-01", "2026-12-31", BOGOTA)), false);
  assert.equal(isPeriodTooLong(myPeriodOf("2025-01-01", "2026-12-31", BOGOTA)), true);
  // Rango al revés también es inválido.
  assert.equal(isPeriodTooLong(myPeriodOf("2026-10-10", "2026-10-01", BOGOTA)), true);
});

// ---- Paginado de líneas (PostgREST corta en max-rows) ----

const row = (i: number): MyLineRow => ({
  sale_item_id: `it-${i}`,
  sale_id: `s-${i}`,
  sale_number: i,
  sold_at: "2026-10-05T15:00:00.000Z",
  item_name: `Línea ${i}`,
  quantity: "1",
  line_net: "1000.00",
  commission_amount: "100.50",
  settled: i % 2 === 0,
  settlement_paid_on: i % 2 === 0 ? "2026-10-15" : null,
});

test("collectMyCommissionLines: junta TODAS las páginas, sin saltear ni repetir", async () => {
  const total = 2503;
  const calls: [number, number][] = [];
  const page = async (from: number, to: number) => {
    calls.push([from, to]);
    const rows: MyLineRow[] = [];
    for (let i = from; i <= Math.min(to, total - 1); i++) rows.push(row(i));
    return { data: rows, error: null };
  };
  const lines = await collectMyCommissionLines(page, 1000);
  assert.equal(lines.length, total);
  assert.deepEqual(calls, [[0, 999], [1000, 1999], [2000, 2999]]);
  assert.equal(new Set(lines.map((l) => l.id)).size, total);
  assert.equal(lines[0].commission, 100.5);
  assert.equal(lines[0].quantity, 1);
  assert.equal(lines[2502].id, "it-2502");
});

test("collectMyCommissionLines: una página exacta pide una más y corta en la vacía", async () => {
  const calls: number[] = [];
  const lines = await collectMyCommissionLines(async (from) => {
    calls.push(from);
    return { data: from === 0 ? [row(0), row(1)] : [], error: null };
  }, 2);
  assert.equal(lines.length, 2);
  assert.deepEqual(calls, [0, 2]);
});

test("collectMyCommissionLines: un error de página se propaga, no devuelve lo parcial", async () => {
  await assert.rejects(
    collectMyCommissionLines(async (from) =>
      from === 0 ? { data: [row(0), row(1)], error: null } : { data: null, error: { message: "boom" } },
    2),
  );
});

// ---- Tarjetas: salen de los totales del SERVIDOR ----

test("myCommissionCards: usa los totales del servidor, no las líneas cargadas", () => {
  const cards = myCommissionCards(
    { pendingTotal: 9000, pendingCount: 3, settlements: [] },
    { earned: 250000.5, paidInPeriod: 120000.25, pendingInPeriod: 130000.25, linesCount: 2400 },
  );
  assert.deepEqual(cards, { porCobrar: 9000, pagadoEnPeriodo: 120000.25, generadoEnPeriodo: 250000.5, lineas: 2400 });
});

test("myCommissionCards: sin datos todavía, las tarjetas quedan vacías (null), no en cero", () => {
  assert.deepEqual(myCommissionCards(null, null), {
    porCobrar: null,
    pagadoEnPeriodo: null,
    generadoEnPeriodo: null,
    lineas: null,
  });
});

// ---- Chips ----

test("commissionChip: liquidada = Pagada, sin liquidar = Pendiente", () => {
  assert.deepEqual(commissionChip({ settled: true }), { label: "Pagada", tone: "paid" });
  assert.deepEqual(commissionChip({ settled: false }), { label: "Pendiente", tone: "pending" });
});

test("settlementStatusLabel: una liquidación anulada se dice, no se esconde", () => {
  assert.equal(settlementStatusLabel("paid"), "Pagada");
  assert.equal(settlementStatusLabel("void"), "Anulada");
});

// ---- Menú: "Mis comisiones" solo para miembros con ficha ----

const hasMine = (items: { id: string }[]) => items.some((i) => i.id === "my-commissions");

test("hasStaffRecord: solo un miembro (no el dueño) con ficha", () => {
  assert.equal(hasStaffRecord({ membershipKind: "member", staffId: "st-1" }), true);
  assert.equal(hasStaffRecord({ membershipKind: "member", staffId: null }), false);
  assert.equal(hasStaffRecord({ membershipKind: "owner", staffId: "st-1" }), false);
  assert.equal(hasStaffRecord({ membershipKind: null, staffId: null }), false);
  assert.equal(hasStaffRecord(null), false);
});

test("visibleNavItems / workerNavItems nunca listan Mis comisiones por su cuenta", () => {
  assert.equal(hasMine(visibleNavItems("salon", null)), false);
  assert.equal(hasMine(workerNavItems({ pos: true, calendar: true })), false);
});

test("withSelfServiceNavItems: trabajador con ficha la ve; sin ficha, no", () => {
  const base = workerNavItems({ pos: true });
  assert.equal(hasMine(withSelfServiceNavItems(base, { membershipKind: "member", staffId: "st-1" })), true);
  assert.equal(hasMine(withSelfServiceNavItems(base, { membershipKind: "member", staffId: null })), false);
});

test("withSelfServiceNavItems: admin-miembro con ficha la ve; dueño nunca", () => {
  const owner = visibleNavItems("salon", null);
  assert.equal(hasMine(withSelfServiceNavItems(owner, { membershipKind: "member", staffId: "st-9" })), true);
  assert.equal(hasMine(withSelfServiceNavItems(owner, { membershipKind: "owner", staffId: null })), false);
});

test("withSelfServiceNavItems: no duplica y respeta el orden de NAV_ITEMS", () => {
  const base = workerNavItems({ pos: true });
  const once = withSelfServiceNavItems(base, { membershipKind: "member", staffId: "st-1" });
  const twice = withSelfServiceNavItems(once, { membershipKind: "member", staffId: "st-1" });
  assert.equal(twice.filter((i) => i.id === "my-commissions").length, 1);
  const item = once.find((i) => i.id === "my-commissions");
  assert.equal(item?.href, "/dashboard/mis-comisiones");
  assert.equal(item?.name, "Mis comisiones");
});
