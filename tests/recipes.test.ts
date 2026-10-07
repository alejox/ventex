import test from "node:test";
import assert from "node:assert/strict";
import {
  batchPlan,
  ingredientUnitCost,
  productionUnitCost,
  recipeCost,
  recipeMargin,
  wouldCreateCycle,
  type IngredientInfo,
} from "../lib/recipes";

function byId(list: IngredientInfo[]): Map<string, IngredientInfo> {
  return new Map(list.map((i) => [i.id, i]));
}

const cafe: IngredientInfo = { id: "cafe", name: "Café", unit: "kg", purchase_price: 40000, stock_level: 1, tracks_stock: true };
const leche: IngredientInfo = { id: "leche", name: "Leche", unit: "L", purchase_price: 4000, stock_level: 2, tracks_stock: true };
const vaso: IngredientInfo = { id: "vaso", name: "Vaso", unit: "Unidad", purchase_price: 300, stock_level: 1, tracks_stock: true };
// Caja de 24 vasos a 7.200: el costo guardado es el de la CAJA.
const vasoCaja: IngredientInfo = { id: "vasoCaja", name: "Vaso (caja)", unit: "Unidad", purchase_price: 7200, units_per_package: 24, stock_level: 48, tracks_stock: true };

test("costo unitario del insumo: el costo de caja se divide por las unidades", () => {
  assert.equal(ingredientUnitCost(cafe), 40000);
  assert.equal(ingredientUnitCost(vasoCaja), 300);
  assert.equal(ingredientUnitCost(vaso), ingredientUnitCost(vasoCaja));
  assert.equal(ingredientUnitCost({ purchase_price: 0 }), 0);
  assert.equal(ingredientUnitCost({ purchase_price: undefined }), 0);
});

test("costo del latte: 20 g de café + 200 ml de leche + 1 vaso = 800 + 800 + 300", () => {
  const cost = recipeCost(
    [
      { ingredientId: "cafe", quantity: 20, unit: "g" },
      { ingredientId: "leche", quantity: 200, unit: "ml" },
      { ingredientId: "vasoCaja", quantity: 1, unit: "Unidad" },
    ],
    byId([cafe, leche, vasoCaja]),
  );
  assert.equal(cost.total, 1900);
  assert.equal(cost.incomplete, false);
  assert.deepEqual(cost.lines.map((l) => l.cost), [800, 800, 300]);
});

test("un insumo sin costo deja la receta incompleta (no la cuenta como gratis en silencio)", () => {
  const sinCosto = { ...leche, purchase_price: 0 };
  const cost = recipeCost(
    [
      { ingredientId: "cafe", quantity: 20, unit: "g" },
      { ingredientId: "leche", quantity: 200, unit: "ml" },
    ],
    byId([cafe, sinCosto]),
  );
  assert.equal(cost.total, 800);
  assert.equal(cost.incomplete, true);
  assert.equal(cost.lines[1].missingCost, true);
});

test("una unidad incompatible se marca y no suma costo", () => {
  const cost = recipeCost([{ ingredientId: "cafe", quantity: 20, unit: "ml" }], byId([cafe]));
  assert.equal(cost.lines[0].incompatible, true);
  assert.equal(cost.incomplete, true);
  assert.equal(cost.total, 0);
});

test("margen sobre el precio de venta", () => {
  assert.deepEqual(recipeMargin(6000, 1900), { profit: 4100, pct: 68.3 });
  assert.deepEqual(recipeMargin(0, 1900), { profit: -1900, pct: null });
});

test("costo por unidad del preparado: lote de 24.020 que rinde 12 L, producto en L o en ml", () => {
  assert.equal(productionUnitCost(12010, 12, "L", "L"), 1000.8333333333334);
  assert.equal(productionUnitCost(12000, 12, "L", "ml"), 1);
  assert.equal(productionUnitCost(12000, 12, "L", "kg"), null);
});

const colorante: IngredientInfo = { id: "color", name: "Colorante", unit: "ml", purchase_price: 20, stock_level: 500, tracks_stock: true };
const azucar: IngredientInfo = { id: "azucar", name: "Azúcar", unit: "kg", purchase_price: 4000, stock_level: 5, tracks_stock: true };
const agua: IngredientInfo = { id: "agua", name: "Agua", unit: "L", purchase_price: 1, stock_level: 0, tracks_stock: false };
const granizado = {
  yieldQty: 12,
  yieldUnit: "L",
  lines: [
    { ingredientId: "color", quantity: 200, unit: "ml" },
    { ingredientId: "azucar", quantity: 2, unit: "kg" },
    { ingredientId: "agua", quantity: 10, unit: "L" },
  ],
};

test("plan de lote por tandas: 2 tandas = 24 L (igual que el ensayo SQL)", () => {
  const plan = batchPlan(granizado, "L", { batches: 2 }, byId([colorante, azucar, agua]));
  assert.ok(plan);
  assert.equal(plan.outputQty, 24);
  assert.equal(plan.batches, 2);
  assert.deepEqual(
    plan.lines.map((l) => [l.name, l.qty, l.stockAfter]),
    [["Colorante", 400, 100], ["Azúcar", 4, 1], ["Agua", 20, null]],
  );
  assert.equal(plan.anyNegative, false);
});

test("plan de lote por cantidad producida, con rendimiento en L y producto en ml", () => {
  const plan = batchPlan(granizado, "ml", { outputQty: 6000 }, byId([colorante, azucar, agua]));
  assert.ok(plan);
  assert.equal(plan.batches, 0.5);
  assert.deepEqual(plan.lines.map((l) => l.qty), [100, 1, 5]);
});

test("plan de lote marca los insumos que quedan en negativo", () => {
  const plan = batchPlan(granizado, "L", { batches: 3 }, byId([colorante, azucar, agua]));
  assert.ok(plan);
  assert.equal(plan.anyNegative, true);
  assert.deepEqual(plan.lines.filter((l) => l.goesNegative).map((l) => [l.name, l.stockAfter]), [
    ["Colorante", -100],
    ["Azúcar", -1],
  ]);
});

test("plan de lote inválido: sin cantidad, rendimiento incompatible o insumo desconocido", () => {
  const ings = byId([colorante, azucar, agua]);
  assert.equal(batchPlan(granizado, "L", { batches: 0 }, ings), null);
  assert.equal(batchPlan(granizado, "kg", { batches: 1 }, ings), null);
  assert.equal(batchPlan(granizado, "L", { batches: 1 }, byId([colorante])), null);
});

test("ciclos: directo, indirecto y sin ciclo", () => {
  // líquido ← azúcar; jarabe ← líquido
  const graph = new Map<string, string[]>([
    ["liquido", ["azucar", "agua"]],
    ["jarabe", ["liquido"]],
  ]);
  assert.equal(wouldCreateCycle(graph, "liquido", ["liquido"]), true);
  // azúcar pasaría a fabricarse con jarabe, que usa líquido, que usa azúcar
  assert.equal(wouldCreateCycle(graph, "azucar", ["jarabe"]), true);
  assert.equal(wouldCreateCycle(graph, "masa", ["harina", "agua"]), false);
});
