import test from "node:test";
import assert from "node:assert/strict";
import {
  aggregateCommissions,
  pendingSettlePeriod,
  previousMonthPeriod,
  type CommissionLine,
} from "../services/staff.service";

/**
 * "Por pagar" no puede depender del mes: el día 1 lo que se debía del mes
 * anterior se sigue debiendo. Estos tests custodian los períodos que ofrece la
 * pantalla de Comisiones y la agregación que alimenta "Todo lo pendiente".
 */

test("1. Mes anterior: del 1 al último día, aunque hoy sea el 1", () => {
  const p = previousMonthPeriod(new Date(2026, 9, 1, 9, 0)); // 1 de octubre
  assert.equal(p.from, "2026-09-01");
  assert.equal(p.to, "2026-09-30");
  const cut = new Date(p.toTs);
  assert.equal(cut.getMonth(), 9, "el corte exclusivo es el 1 de octubre");
  assert.equal(cut.getDate(), 1);
});

test("2. Mes anterior en enero cae en diciembre del año anterior", () => {
  const p = previousMonthPeriod(new Date(2027, 0, 15));
  assert.equal(p.from, "2026-12-01");
  assert.equal(p.to, "2026-12-31");
});

test("3. Liquidar todo lo pendiente arranca el día de la venta más vieja", () => {
  const oldest = new Date(2026, 7, 12, 20, 30).toISOString(); // 12 ago, 20:30 local
  const p = pendingSettlePeriod(oldest, new Date(2026, 9, 3, 10, 0));
  assert.equal(p.from, "2026-08-12", "el día LOCAL de la venta, no el de UTC");
  assert.equal(p.to, "2026-10-03");
  assert.ok(new Date(p.fromTs).getTime() <= new Date(oldest).getTime(), "la venta más vieja queda dentro");
});

test("4. Sin nada pendiente el período es hoy", () => {
  const p = pendingSettlePeriod(null, new Date(2026, 9, 3, 10, 0));
  assert.equal(p.from, "2026-10-03");
  assert.equal(p.to, "2026-10-03");
});

const line = (over: Partial<CommissionLine>): CommissionLine => ({
  sale_id: "s1",
  staff_id: "a",
  line_total: 100,
  commission_amount: 10,
  commission_settlement_id: null,
  created_at: "2026-09-20T15:00:00.000Z",
  ...over,
});

test("5. Agrega pendiente y liquidado, y recuerda la venta pendiente más vieja", () => {
  const rows = aggregateCommissions(
    [{ id: "a", full_name: "Ana" }, { id: "b", full_name: "Beto" }],
    [
      line({ sale_id: "s1", created_at: "2026-09-20T15:00:00.000Z" }),
      line({ sale_id: "s2", created_at: "2026-08-30T15:00:00.000Z" }),
      // Liquidada y más vieja: no cuenta para "pendiente desde".
      line({ sale_id: "s3", created_at: "2026-07-01T15:00:00.000Z", commission_settlement_id: "x" }),
      line({ sale_id: "s4", staff_id: "b", commission_amount: 5 }),
    ],
  );
  const ana = rows.find((r) => r.staff_id === "a")!;
  assert.equal(ana.pending, 20);
  assert.equal(ana.settled, 10);
  assert.equal(ana.commission, 30);
  assert.equal(ana.salesCount, 3);
  assert.equal(ana.oldestPendingAt, "2026-08-30T15:00:00.000Z");
  assert.equal(rows[0].staff_id, "a", "ordena por lo que más se debe");
});

test("6. Una persona con todo liquidado no tiene 'pendiente desde'", () => {
  const [row] = aggregateCommissions(
    [{ id: "a", full_name: "Ana" }],
    [line({ commission_settlement_id: "x" })],
  );
  assert.equal(row.pending, 0);
  assert.equal(row.oldestPendingAt, null);
});
