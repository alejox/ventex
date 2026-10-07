/**
 * Lógica pura de "Recetas y producción": costo de una receta, margen, plan de
 * un lote y detección de ciclos. Sin I/O: la usan los stores y las pantallas, y
 * se testea sin base (`tests/recipes.test.ts`).
 *
 * La base es la autoridad (save_recipe, apply_sale_recipe,
 * register_production_batch): esto existe para que la pantalla muestre ANTES de
 * confirmar exactamente lo que la base va a hacer. Las fórmulas son las mismas
 * —conversión con `lib/units.ts` (espejo de `public.unit_factor`), redondeo del
 * stock a 3 decimales, costo unitario = costo / unidades por caja—, así que si
 * cambia una de las dos, cambia la otra.
 */

import { consumedQty, convertQty, unitFactor } from "@/lib/units";
import { sumMoney } from "@/lib/money-sum";

export type RecipeKind = "sale" | "production";

/** Una línea de receta tal como se guarda: cantidad en la unidad que se escribió. */
export interface RecipeLine {
  ingredientId: string;
  quantity: number;
  unit: string;
}

/** Lo que hace falta saber de un insumo para costearlo y planificar un lote. */
export interface IngredientInfo {
  id: string;
  name: string;
  unit: string;
  /** Costo de compra (de la CAJA si units_per_package > 1). Ausente = sin permiso o sin costo. */
  purchase_price?: number | null;
  units_per_package?: number | null;
  stock_level: number;
  tracks_stock: boolean;
}

/**
 * Costo de UNA unidad de stock del insumo (1 kg, 1 L, 1 vaso). Mismo cálculo
 * que `getUnitCost` (services/inventory.service.ts) y que la base: el costo
 * guardado es por caja cuando el producto se compra por caja.
 */
export function ingredientUnitCost(ing: Pick<IngredientInfo, "purchase_price" | "units_per_package">): number {
  const price = Number(ing.purchase_price ?? 0);
  if (!Number.isFinite(price) || price <= 0) return 0;
  return price / Math.max(Number(ing.units_per_package ?? 1) || 1, 1);
}

export interface RecipeCostLine {
  ingredientId: string;
  name: string;
  /** Cantidad convertida a la unidad del insumo (sin redondear: es para costear). */
  stockQty: number | null;
  stockUnit: string;
  unitCost: number;
  cost: number;
  /** El insumo no tiene costo cargado (o no se puede ver): el total queda incompleto. */
  missingCost: boolean;
  /** La unidad de la línea no se puede pasar a la del insumo. */
  incompatible: boolean;
}

export interface RecipeCost {
  /** Costo de la receta (por unidad vendida, o por LOTE en una de producción). */
  total: number;
  /** Algún insumo sin costo: el total es un piso, no el costo real. */
  incomplete: boolean;
  lines: RecipeCostLine[];
}

/**
 * Costo de una receta: Σ cantidad convertida × costo unitario del insumo.
 * Un insumo desconocido o sin costo marca la receta como incompleta en vez de
 * contarla como gratis en silencio.
 */
export function recipeCost(lines: RecipeLine[], ingredients: ReadonlyMap<string, IngredientInfo>): RecipeCost {
  let incomplete = false;
  const out: RecipeCostLine[] = lines.map((line) => {
    const ing = ingredients.get(line.ingredientId);
    if (!ing) {
      incomplete = true;
      return {
        ingredientId: line.ingredientId, name: "", stockQty: null, stockUnit: line.unit,
        unitCost: 0, cost: 0, missingCost: true, incompatible: false,
      };
    }
    const stockQty = convertQty(line.quantity, line.unit, ing.unit);
    const unitCost = ingredientUnitCost(ing);
    const missingCost = unitCost <= 0;
    if (missingCost || stockQty === null) incomplete = true;
    const cost = stockQty === null ? 0 : stockQty * unitCost;
    return {
      ingredientId: line.ingredientId, name: ing.name, stockQty, stockUnit: ing.unit,
      unitCost, cost, missingCost, incompatible: stockQty === null,
    };
  });
  return { total: sumMoney(out.map((l) => l.cost)), incomplete, lines: out };
}

/**
 * Costo por UNIDAD del preparado que rinde una receta de producción
 * (costo del lote ÷ rendimiento convertido a la unidad del producto).
 */
export function productionUnitCost(
  batchCost: number,
  yieldQty: number,
  yieldUnit: string,
  productUnit: string,
): number | null {
  const yieldInProductUnit = convertQty(yieldQty, yieldUnit, productUnit);
  if (yieldInProductUnit === null || !(yieldInProductUnit > 0)) return null;
  return batchCost / yieldInProductUnit;
}

export interface Margin {
  /** Precio − costo. */
  profit: number;
  /** Margen sobre el precio de venta, en %. `null` sin precio. */
  pct: number | null;
}

/**
 * Margen de un producto con receta, con la convención de `calculateMargin`:
 * ganancia sobre el PRECIO de venta (IVA incluido, como se guarda el precio).
 */
export function recipeMargin(price: number, cost: number): Margin {
  const p = Number(price) || 0;
  const c = Number(cost) || 0;
  return {
    profit: sumMoney([p, -c]),
    pct: p > 0 ? Math.round(((p - c) / p) * 1000) / 10 : null,
  };
}

export interface BatchPlanLine {
  ingredientId: string;
  name: string;
  /** Lo que el lote descuenta, en la unidad del insumo (redondeado como la base). */
  qty: number;
  unit: string;
  tracksStock: boolean;
  stockBefore: number;
  /** `null` si el insumo no controla stock (solo cuenta para el costo). */
  stockAfter: number | null;
  goesNegative: boolean;
}

export interface BatchPlan {
  /** Cuánto entra del preparado, en la unidad del producto. */
  outputQty: number;
  /** Tandas equivalentes (output ÷ rendimiento). */
  batches: number;
  lines: BatchPlanLine[];
  /** Algún insumo queda en negativo. */
  anyNegative: boolean;
}

/**
 * Lo que va a pasar al registrar un lote, igual que `register_production_batch`:
 * por tandas (`batches`) o por cantidad producida (`outputQty`, en la unidad del
 * producto). `null` si la receta no tiene rendimiento válido, si la cantidad no
 * es positiva o si una unidad no se puede convertir.
 */
export function batchPlan(
  recipe: { lines: RecipeLine[]; yieldQty: number; yieldUnit: string },
  productUnit: string,
  amount: { batches: number } | { outputQty: number },
  ingredients: ReadonlyMap<string, IngredientInfo>,
): BatchPlan | null {
  const yieldInProductUnit = convertQty(recipe.yieldQty, recipe.yieldUnit, productUnit);
  if (yieldInProductUnit === null || !(yieldInProductUnit > 0)) return null;

  let factor: number;
  let outputQty: number;
  if ("batches" in amount) {
    if (!(amount.batches > 0)) return null;
    factor = Math.round(amount.batches * 1000) / 1000;
    outputQty = Math.round(factor * yieldInProductUnit * 1000) / 1000;
  } else {
    if (!(amount.outputQty > 0)) return null;
    outputQty = Math.round(amount.outputQty * 1000) / 1000;
    factor = outputQty / yieldInProductUnit;
  }

  const lines: BatchPlanLine[] = [];
  for (const line of recipe.lines) {
    const ing = ingredients.get(line.ingredientId);
    if (!ing) return null;
    const qty = consumedQty(line.quantity, line.unit, ing.unit, factor);
    if (qty === null) return null;
    if (qty <= 0) continue;
    const stockAfter = ing.tracks_stock ? Math.round((ing.stock_level - qty) * 1000) / 1000 : null;
    lines.push({
      ingredientId: ing.id,
      name: ing.name,
      qty,
      unit: ing.unit,
      tracksStock: ing.tracks_stock,
      stockBefore: ing.stock_level,
      stockAfter,
      goesNegative: stockAfter !== null && stockAfter < 0,
    });
  }

  return {
    outputQty,
    batches: Math.round(factor * 1000) / 1000,
    lines,
    anyNegative: lines.some((l) => l.goesNegative),
  };
}

/**
 * ¿Guardar `inputIds` como insumos de la receta de PRODUCCIÓN de `targetId`
 * armaría un ciclo (A usa B y B, directa o indirectamente, usa A)?
 *
 * `productionInputs`: para cada producto con receta de producción, sus
 * insumos. Mismo recorrido que hace `save_recipe` en la base (RECETA_CICLICA).
 */
export function wouldCreateCycle(
  productionInputs: ReadonlyMap<string, readonly string[]>,
  targetId: string,
  inputIds: readonly string[],
): boolean {
  const seen = new Set<string>();
  const stack = [...inputIds];
  while (stack.length > 0) {
    const id = stack.pop()!;
    if (id === targetId) return true;
    if (seen.has(id)) continue;
    seen.add(id);
    for (const next of productionInputs.get(id) ?? []) stack.push(next);
  }
  return false;
}

/** ¿La línea mide el insumo en una unidad que se le puede convertir? */
export function lineUnitIsValid(line: RecipeLine, ing: Pick<IngredientInfo, "unit">): boolean {
  return unitFactor(line.unit, ing.unit) !== null;
}
