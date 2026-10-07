import test from "node:test";
import assert from "node:assert/strict";
import {
  candidateLabel,
  costShares,
  defaultLineUnit,
  editorLineIssues,
  editorToLines,
  formatQty,
  ingredientCandidates,
  ingredientNeedsRestock,
  marginTone,
  parseQty,
  recipeCostRows,
  sortRecipeRows,
} from "../lib/recipe-editor";
import type { IngredientInfo } from "../lib/recipes";

test("defaultLineUnit propone la unidad chica de la dimensión", () => {
  assert.equal(defaultLineUnit("kg"), "g");
  assert.equal(defaultLineUnit("lb"), "g");
  assert.equal(defaultLineUnit("L"), "ml");
  assert.equal(defaultLineUnit("m"), "cm");
  assert.equal(defaultLineUnit("g"), "g");
  assert.equal(defaultLineUnit("Unidad"), "Unidad");
  assert.equal(defaultLineUnit("Caja"), "Caja");
});

test("parseQty acepta coma o punto decimal y rechaza lo que no es positivo", () => {
  assert.equal(parseQty("20"), 20);
  assert.equal(parseQty(" 0,5 "), 0.5);
  assert.equal(parseQty("1.5"), 1.5);
  assert.equal(parseQty("1.250,5"), 1250.5);
  assert.equal(parseQty(",5"), 0.5);
  assert.equal(parseQty(""), null);
  assert.equal(parseQty("0"), null);
  assert.equal(parseQty("-3"), null);
  assert.equal(parseQty("abc"), null);
  assert.equal(parseQty("1,2,3"), null);
});

test("formatQty usa coma decimal y abrevia la unidad", () => {
  assert.equal(formatQty(1.5, "kg"), "1,5 kg");
  assert.equal(formatQty(3, "Unidad"), "3 u.");
  assert.equal(formatQty(0.0004, "kg"), "0 kg");
  assert.equal(formatQty(-0.25, "L"), "-0,25 L");
});

test("marginTone pinta pérdida, margen fino y sano", () => {
  assert.equal(marginTone(null), "unknown");
  assert.equal(marginTone(-5), "loss");
  assert.equal(marginTone(12), "thin");
  assert.equal(marginTone(30), "healthy");
  assert.equal(marginTone(69), "healthy");
});

const products = [
  { id: "self", name: "Latte", unit: "Unidad", stock_level: 0, tracks_stock: false },
  { id: "cafe", name: "Café", unit: "kg", stock_level: 2.5, is_ingredient: true },
  { id: "leche", name: "Leche", unit: "L", stock_level: 10, is_ingredient: true },
  { id: "vaso", name: "Vaso", unit: "Unidad", stock_level: 100 },
  { id: "capu", name: "Capuchino", unit: "Unidad", stock_level: 0, tracks_stock: false },
  { id: "viejo", name: "Azúcar vieja", unit: "kg", stock_level: 1, is_ingredient: true, status: "inactive" },
];

test("ingredientCandidates excluye el propio producto, los de receta de venta y los archivados", () => {
  const ids = ingredientCandidates(products, { selfId: "self", saleRecipeProductIds: new Set(["capu"]) }).map((p) => p.id);
  // Insumos primero (por nombre), después el resto.
  assert.deepEqual(ids, ["cafe", "leche", "vaso"]);
});

test("ingredientCandidates conserva lo que ya está en la receta aunque esté archivado", () => {
  const ids = ingredientCandidates(products, {
    selfId: "self",
    saleRecipeProductIds: new Set(),
    keepIds: new Set(["viejo"]),
  }).map((p) => p.id);
  assert.ok(ids.includes("viejo"));
});

test("candidateLabel muestra stock o 'sin inventario'", () => {
  assert.equal(candidateLabel(products[1]), "Café · 2,5 kg en stock");
  assert.equal(candidateLabel(products[0]), "Latte · Unidad · sin inventario");
});

test("editorToLines y editorLineIssues", () => {
  const lines = [
    { key: "1", ingredientId: "cafe", qty: "20", unit: "g" },
    { key: "2", ingredientId: "", qty: "1", unit: "Unidad" },
    { key: "3", ingredientId: "leche", qty: "", unit: "ml" },
    { key: "4", ingredientId: "cafe", qty: "5", unit: "g" },
  ];
  assert.deepEqual(editorToLines(lines.slice(0, 1)), [{ ingredientId: "cafe", quantity: 20, unit: "g" }]);
  assert.deepEqual(editorLineIssues(lines), [null, "missing-ingredient", "missing-qty", "duplicate"]);
});

test("costShares reparte el costo y ordena de mayor a menor", () => {
  const shares = costShares([
    { ingredientId: "a", name: "A", cost: 300 },
    { ingredientId: "b", name: "B", cost: 700 },
    { ingredientId: "c", name: "C", cost: 0 },
  ]);
  assert.deepEqual(shares.map((s) => [s.ingredientId, Math.round(s.pct)]), [["b", 70], ["a", 30]]);
  assert.deepEqual(costShares([{ ingredientId: "x", name: "X", cost: 0 }]), []);
});

test("ingredientNeedsRestock: solo insumos con inventario en cero, negativo o bajo mínimo", () => {
  assert.equal(ingredientNeedsRestock({ stock_level: -0.2, minimum_stock: 0, is_ingredient: true }), true);
  assert.equal(ingredientNeedsRestock({ stock_level: 0, minimum_stock: 0, is_ingredient: true }), true);
  assert.equal(ingredientNeedsRestock({ stock_level: 2, minimum_stock: 3, is_ingredient: true }), true);
  assert.equal(ingredientNeedsRestock({ stock_level: 5, minimum_stock: 3, is_ingredient: true }), false);
  assert.equal(ingredientNeedsRestock({ stock_level: 0, minimum_stock: 0, is_ingredient: false }), false);
  assert.equal(
    ingredientNeedsRestock({ stock_level: 0, minimum_stock: 0, is_ingredient: true, tracks_stock: false }),
    false,
  );
});

test("recipeCostRows y sortRecipeRows", () => {
  const ingredients = new Map<string, IngredientInfo>([
    ["cafe", { id: "cafe", name: "Café", unit: "kg", purchase_price: 60000, units_per_package: 1, stock_level: 2, tracks_stock: true }],
    ["leche", { id: "leche", name: "Leche", unit: "L", purchase_price: 4000, units_per_package: 1, stock_level: 5, tracks_stock: true }],
    ["vaso", { id: "vaso", name: "Vaso", unit: "Unidad", purchase_price: null, units_per_package: 1, stock_level: 50, tracks_stock: true }],
  ]);
  const rows = recipeCostRows(
    [
      {
        id: "r1", kind: "sale", targetId: "latte", targetKind: "product", name: "Latte", price: 6000, unit: "Unidad",
        lines: [{ ingredientId: "cafe", quantity: 20, unit: "g" }, { ingredientId: "leche", quantity: 200, unit: "ml" }],
        yieldQty: null, yieldUnit: null,
      },
      {
        id: "r2", kind: "sale", targetId: "tinto", targetKind: "product", name: "Tinto", price: 1000, unit: "Unidad",
        lines: [{ ingredientId: "cafe", quantity: 10, unit: "g" }, { ingredientId: "vaso", quantity: 1, unit: "Unidad" }],
        yieldQty: null, yieldUnit: null,
      },
      {
        id: "r3", kind: "production", targetId: "masa", targetKind: "product", name: "Masa", price: 0, unit: "Unidad",
        lines: [{ ingredientId: "leche", quantity: 1, unit: "L" }],
        yieldQty: 10, yieldUnit: "Unidad",
      },
    ],
    ingredients,
  );
  // Latte: 0,02 kg × 60.000 + 0,2 L × 4.000 = 1.200 + 800 = 2.000 → 66,7 %.
  assert.equal(rows[0].cost, 2000);
  assert.equal(rows[0].marginPct, 66.7);
  assert.equal(rows[0].incomplete, false);
  // Tinto: vaso sin costo → incompleto.
  assert.equal(rows[1].incomplete, true);
  // Producción: sin margen.
  assert.equal(rows[2].marginPct, null);

  const byMarginDesc = sortRecipeRows(rows, "margin", "desc").map((r) => r.id);
  assert.deepEqual(byMarginDesc, ["r1", "r2", "r3"]);
  const byName = sortRecipeRows(rows, "name", "asc").map((r) => r.id);
  assert.deepEqual(byName, ["r1", "r3", "r2"]);
});
