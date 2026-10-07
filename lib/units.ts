/**
 * Conversión de unidades para recetas e insumos.
 *
 * ESPEJO de `public.unit_factor(p_from, p_to)`
 * (supabase/migrations/20261008100000_recipes_schema.sql): si cambia uno,
 * cambia el otro. La base es la que descuenta stock; esto existe para que la
 * pantalla muestre lo mismo que va a pasar (costo de la receta, cuánto gasta un
 * lote, qué unidades ofrecer en el selector).
 *
 * Una cantidad se escribe en la unidad que le resulta natural a la persona
 * (20 g de un café que se compra por kg) y se convierte a la unidad del insumo
 * al usarla. Solo se convierte DENTRO de una dimensión: masa (g, kg, lb),
 * volumen (ml, L) y longitud (cm, m). Unidad, Par, Docena, Caja y Pack solo son
 * compatibles consigo mismas: "1 caja" no se puede pasar a gramos.
 */

type Dimension = "mass" | "volume" | "length";

/** Cuánto vale cada unidad en la base de su dimensión (g, ml, cm). */
const UNIT_BASE: Record<string, { dim: Dimension; base: number }> = {
  g: { dim: "mass", base: 1 },
  kg: { dim: "mass", base: 1000 },
  lb: { dim: "mass", base: 453.59237 },
  ml: { dim: "volume", base: 1 },
  L: { dim: "volume", base: 1000 },
  cm: { dim: "length", base: 1 },
  m: { dim: "length", base: 100 },
};

/** Orden en que se ofrecen las unidades de una misma dimensión. */
const UNITS_BY_DIMENSION: Record<Dimension, string[]> = {
  mass: ["g", "kg", "lb"],
  volume: ["ml", "L"],
  length: ["cm", "m"],
};

/** Decimales con los que la base guarda el stock (`numeric(12,3)`). */
export const STOCK_DECIMALS = 3;

/**
 * Factor para pasar una cantidad de `from` a `to` (`qty_to = qty_from * factor`).
 * `null` = unidades incompatibles.
 */
export function unitFactor(from: string | null | undefined, to: string | null | undefined): number | null {
  if (!from || !to) return null;
  if (from === to) return 1;
  const f = UNIT_BASE[from];
  const t = UNIT_BASE[to];
  if (!f || !t || f.dim !== t.dim) return null;
  return f.base / t.base;
}

/** ¿Se puede medir algo que se maneja en `stockUnit` usando `unit`? */
export function areUnitsCompatible(unit: string, stockUnit: string): boolean {
  return unitFactor(unit, stockUnit) !== null;
}

/** Convierte `qty` de `from` a `to`; `null` si las unidades no son compatibles. */
export function convertQty(qty: number, from: string, to: string): number | null {
  const factor = unitFactor(from, to);
  return factor === null ? null : qty * factor;
}

/**
 * Unidades en las que se puede escribir una cantidad de un insumo que se
 * maneja en `stockUnit`. La del insumo va primero; una unidad sin dimensión
 * (Unidad, Caja…) solo se ofrece a sí misma.
 */
export function compatibleUnits(stockUnit: string): string[] {
  const info = UNIT_BASE[stockUnit];
  if (!info) return [stockUnit];
  return [stockUnit, ...UNITS_BY_DIMENSION[info.dim].filter((u) => u !== stockUnit)];
}

/**
 * Redondeo del stock igual al de la base (`round(x, 3)` de Postgres): 3
 * decimales, mitad LEJOS del cero, también en negativos. El `1 + EPSILON`
 * compensa el binario de JS (1,0005 × 1000 da 1000,4999…).
 */
export function roundStock(qty: number): number {
  const factor = 10 ** STOCK_DECIMALS;
  const rounded = Math.round(Math.abs(qty) * factor * (1 + Number.EPSILON)) / factor;
  return qty < 0 ? -rounded : rounded;
}

/**
 * Cuánto se descuenta del insumo por `multiplier` unidades vendidas (o tandas),
 * ya en la unidad del insumo y redondeado como en la base. `null` si las
 * unidades no son compatibles.
 */
export function consumedQty(
  lineQty: number,
  lineUnit: string,
  stockUnit: string,
  multiplier = 1,
): number | null {
  const factor = unitFactor(lineUnit, stockUnit);
  if (factor === null) return null;
  return roundStock(lineQty * factor * multiplier);
}

/**
 * La cantidad POR UNIDAD de la receta se pierde al redondear el stock a 3
 * decimales: 0,5 g de un insumo guardado en kg es 0,0005 kg → 0,001 (el doble)
 * o 0 según el caso. Sirve para avisar en el editor que conviene manejar ese
 * insumo en una unidad más chica (g en vez de kg).
 */
export function losesPrecision(lineQty: number, lineUnit: string, stockUnit: string): boolean {
  const factor = unitFactor(lineUnit, stockUnit);
  if (factor === null || !(lineQty > 0)) return false;
  const exact = lineQty * factor;
  return Math.abs(roundStock(exact) - exact) > 1e-9;
}
