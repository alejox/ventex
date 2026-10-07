import test from "node:test";
import assert from "node:assert/strict";
import { parseRegisterBatchResult } from "../services/production.service";
import { isRecipeWithStockError, productionGraph, toIngredientInfo, toRecipeLines } from "../services/recipes.service";
import { toMessage } from "../lib/errors";

test("parseRegisterBatchResult normaliza la respuesta del RPC (ensayo SQL: 2 tandas = 24 L)", () => {
  const r = parseRegisterBatchResult({
    batch_id: "b1", batch_number: 1, output_qty: "24.000", output_unit: "L", batches: "2.000",
    cost_complete: true, cost_updated: true, already_registered: false, total_cost: null,
    negative_inputs: [{ product_id: "p", name: "Vaso", stock: "-2.000", unit: "Unidad" }],
  });
  assert.equal(r.output_qty, 24);
  assert.equal(r.batches, 2);
  assert.equal(r.total_cost, null);
  assert.deepEqual(r.negative_inputs, [{ product_id: "p", name: "Vaso", stock: -2, unit: "Unidad" }]);
  assert.equal(parseRegisterBatchResult(null).already_registered, false);
});

test("RECETA_CON_STOCK se detecta para pedir confirmación, y se traduce con su detalle", () => {
  const e = { message: "RECETA_CON_STOCK: Latte tiene 5.000 Unidad en stock" };
  assert.equal(isRecipeWithStockError(e), true);
  assert.equal(isRecipeWithStockError({ message: "RECETA_CICLICA: x" }), false);
  assert.equal(
    toMessage(e),
    "Latte tiene 5.000 Unidad en stock. Con receta, su stock se descuenta de los insumos: confirma para dejarlo en 0.",
  );
});

test("los códigos de recetas y lotes llegan traducidos, sin el código crudo", () => {
  assert.equal(
    toMessage({ message: "MODULO_PRODUCCION_INACTIVO" }),
    "El módulo Recetas y producción está apagado. Actívalo en Ajustes → General → Módulos.",
  );
  assert.match(toMessage({ message: "RECETA_CICLICA: Azúcar ya se usa (directa o indirectamente) en uno de sus insumos" }), /^Azúcar ya se usa/);
  assert.match(toMessage({ message: "UNIDAD_INCOMPATIBLE: Café se maneja en kg y no se puede medir en ml" }), /^Café se maneja en kg/);
  assert.equal(toMessage({ message: "LOTE_YA_ANULADO: este lote ya estaba anulado" }), "Este lote ya estaba anulado. Actualiza la lista.");
});

test("helpers de recetas: líneas, insumo y grafo de producción", () => {
  const recipe = {
    id: "r", kind: "production" as const, product_id: "liq", service_id: null, yield_qty: 12, yield_unit: "L",
    notes: null, updated_at: "", items: [{ id: "i", ingredient_id: "azucar", quantity: 2, unit: "kg", position: 1 }],
  };
  assert.deepEqual(toRecipeLines(recipe), [{ ingredientId: "azucar", quantity: 2, unit: "kg" }]);
  assert.deepEqual([...productionGraph([recipe]).entries()], [["liq", ["azucar"]]]);
  assert.equal(toIngredientInfo({ id: "a", name: "A", unit: "kg", stock_level: 1 }).tracks_stock, true);
});
