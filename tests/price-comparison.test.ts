import test from "node:test";
import assert from "node:assert/strict";
import { bestOtherPrice, isPayingMore, pricesByProduct, purchaseLineUnitCost, type DistributorPrice } from "../lib/price-comparison";

const row = (product_id: string, distributor_id: string, distributor_name: string, unit_cost: number): DistributorPrice =>
  ({ product_id, distributor_id, distributor_name, unit_cost, last_purchase_at: "2026-10-23T00:00:00Z" });

test("bestOtherPrice devuelve el proveedor más barato distinto del actual", () => {
  const rows = [
    row("p1", "d1", "Distribuidora Uno", 1000),
    row("p1", "d2", "Distribuidora Dos", 850),
    row("p1", "d3", "Distribuidora Tres", 920),
  ];
  const best = bestOtherPrice(rows, "p1", "d1");
  assert.deepEqual(best, { distributor_id: "d2", distributor_name: "Distribuidora Dos", unit_cost: 850 });
});

test("sin otro proveedor devuelve null", () => {
  assert.equal(bestOtherPrice([row("p1", "d1", "Uno", 1000)], "p1", "d1"), null);
  assert.equal(bestOtherPrice([], "p1", "d1"), null);
});

test("ignora el proveedor actual aunque sea el más barato", () => {
  const rows = [row("p1", "d1", "Uno", 500), row("p1", "d2", "Dos", 900)];
  assert.equal(bestOtherPrice(rows, "p1", "d1")?.distributor_id, "d2");
});

test("isPayingMore compara contra el mejor de otro proveedor", () => {
  const best = { distributor_id: "d2", distributor_name: "Dos", unit_cost: 850 };
  assert.equal(isPayingMore(1000, best), true);
  assert.equal(isPayingMore(850, best), false);
  assert.equal(isPayingMore(800, best), false);
  assert.equal(isPayingMore(1000, null), false);
});

test("pricesByProduct agrupa preservando el orden (más barato primero)", () => {
  const rows = [
    row("p1", "d2", "Dos", 850),
    row("p1", "d1", "Uno", 1000),
    row("p2", "d1", "Uno", 300),
  ];
  const map = pricesByProduct(rows);
  assert.deepEqual(map.get("p1")?.map((r) => r.unit_cost), [850, 1000]);
  assert.deepEqual(map.get("p2")?.map((r) => r.unit_cost), [300]);
});

test("purchaseLineUnitCost: caja divide por unidades, suelto usa unit_price, vacío es null", () => {
  const base = { loose_quantity: 0, unit_price: 0 };
  // Por caja: 24.000 la caja de 24 → 1.000 la unidad.
  assert.equal(
    purchaseLineUnitCost({ ...base, package_quantity: 2, package_price: 24000, units_per_package: 24 }),
    1000,
  );
  // Suelto.
  assert.equal(
    purchaseLineUnitCost({ package_quantity: 0, loose_quantity: 3, package_price: 0, unit_price: 950, units_per_package: 24 }),
    950,
  );
  // Línea sin costo todavía.
  assert.equal(purchaseLineUnitCost({ package_quantity: 0, loose_quantity: 0, package_price: 0, unit_price: 0, units_per_package: 1 }), null);
});
