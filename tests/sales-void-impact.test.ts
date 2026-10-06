import { test } from "node:test";
import assert from "node:assert/strict";
import { saleVoidImpact } from "@/services/sales.service";

type Line = Parameters<typeof saleVoidImpact>[0]["items"][number];

const line = (over: Partial<Line> = {}): Line => ({
  id: "l1",
  product_name: "Corte",
  sku: null,
  unit_price: 20000,
  quantity: 1,
  line_total: 20000,
  unit_kind: "unit",
  units_per_item: 1,
  staff_name: null,
  commission_amount: 0,
  commission_settlement_id: null,
  ...over,
});

test("venta en efectivo: devuelve el total en efectivo", () => {
  const impact = saleVoidImpact({ payment_method: "efectivo", total: 45000, items: [line()] });
  assert.equal(impact.cashRefund, 45000);
  assert.equal(impact.otherRefund, 0);
  assert.equal(impact.creditReleased, 0);
});

test("pago dividido: solo la parte en efectivo sale de la caja (como void_sale)", () => {
  const impact = saleVoidImpact(
    { payment_method: "split", total: 50000, items: [line()] },
    [
      { payment_method: "efectivo", amount: 20000 },
      { payment_method: "tarjeta", amount: 25000 },
      { payment_method: "credito", amount: 5000 },
    ],
  );
  assert.equal(impact.cashRefund, 20000);
  assert.equal(impact.otherRefund, 25000);
  assert.equal(impact.creditReleased, 5000);
});

test("datáfono o transferencia: no hay efectivo que devolver, se avisa aparte", () => {
  const card = saleVoidImpact({ payment_method: "tarjeta", total: 30000, items: [] });
  assert.equal(card.cashRefund, 0);
  assert.equal(card.otherRefund, 30000);
  const fiado = saleVoidImpact({ payment_method: "credito", total: 12000, items: [] });
  assert.equal(fiado.creditReleased, 12000);
  assert.equal(fiado.cashRefund, 0);
});

test("puntos ganados y canjeados, premio y comisión ya pagada", () => {
  const impact = saleVoidImpact(
    {
      payment_method: "efectivo",
      total: 10000,
      items: [
        line({ commission_amount: 4000, commission_settlement_id: "liq-1" }),
        line({ id: "l2", commission_amount: 1500, commission_settlement_id: null }),
      ],
    },
    [],
    [
      { kind: "earn", points: 10 },
      { kind: "redeem", points: -50 },
    ],
    [{ reward: "Corte gratis" }],
  );
  assert.equal(impact.pointsEarned, 10);
  assert.equal(impact.pointsRedeemed, 50);
  assert.deepEqual(impact.rewards, ["Corte gratis"]);
  // Solo la liquidada: la pendiente se libera sola al anular.
  assert.equal(impact.paidCommission, 4000);
});
