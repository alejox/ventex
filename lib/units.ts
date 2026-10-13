/**
 * Conversión de unidades para recetas e insumos.
 *
 * ESPEJO de `public.unit_factor(p_from, p_to)` y de
 * `public.product_unit_factor(p_from, p_unit, p_content_qty, p_content_unit)`
 * (supabase/migrations/20261008100000_recipes_schema.sql y
 * 20261011100000_product_content_presentation.sql): si cambia uno, cambia el
 * otro. La base es la que descuenta stock; esto existe para que la pantalla
 * muestre lo mismo que va a pasar (costo de la receta, cuánto gasta un lote,
 * qué unidades ofrecer en el selector).
 *
 * Una cantidad se escribe en la unidad que le resulta natural a la persona
 * (20 g de un café que se compra por kg) y se convierte a la unidad del insumo
 * al usarla. Se convierte DENTRO de una dimensión: masa (g, kg, lb), volumen
 * (ml, L) y longitud (cm, m). Unidad, Par, Docena, Caja y Pack no tienen
 * dimensión propia… salvo que el producto declare su CONTENIDO ("cada unidad
 * trae 900 ml"): entonces una bolsa de leche se cuenta por bolsas en stock, en
 * compras y en el POS, y la receta la gasta en ml. Ese es `UnitHolder`.
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

/** Unidades que MIDEN (espejo de `public.is_measure_unit`): las que admiten fracción. */
export const MEASURE_UNITS: readonly string[] = ["g", "kg", "lb", "ml", "L", "cm", "m"];

/**
 * Las unidades que se pueden elegir para un producto, en el orden del selector.
 * Una sola lista para la ficha completa y el alta rápida: el alta rápida tenía
 * la suya con "Kg" y "Litro", que no son unidades de medida, y esos productos
 * no se podían vender en fracciones ni convertir en recetas.
 */
export const PRODUCT_UNITS: readonly string[] = ["Unidad", "kg", "g", "lb", "L", "ml", "m", "cm", "Par", "Docena", "Caja", "Pack"];

export function isMeasureUnit(unit: string | null | undefined): boolean {
  return !!unit && Object.prototype.hasOwnProperty.call(UNIT_BASE, unit);
}

/** Decimales con los que la base guarda el stock (`numeric(12,3)`). */
export const STOCK_DECIMALS = 3;

/**
 * Un producto visto como destino de conversión: su unidad y, si la tiene, su
 * presentación ("cada unidad trae 900 ml"). El contenido solo cuenta cuando la
 * unidad NO mide (Unidad, Caja…): una unidad que ya mide no necesita contenido.
 */
export interface UnitHolder {
  unit: string;
  content_qty?: number | null;
  content_unit?: string | null;
}

/** Solo la unidad (sin contenido) o el producto completo. */
export type UnitTarget = string | UnitHolder;

function holderOf(target: UnitTarget): UnitHolder {
  return typeof target === "string" ? { unit: target } : target;
}

/** Contenido válido de un producto (cantidad > 0 en una unidad que mide), o null. */
function contentOf(h: UnitHolder): { qty: number; unit: string } | null {
  const unit = h.content_unit;
  const qty = Number(h.content_qty);
  if (!unit || !isMeasureUnit(unit) || !(qty > 0) || isMeasureUnit(h.unit)) return null;
  return { qty, unit };
}

/**
 * Factor para pasar una cantidad de `from` a `to` (`qty_to = qty_from * factor`)
 * dentro de una misma dimensión. `null` = unidades incompatibles.
 */
export function unitFactor(from: string | null | undefined, to: string | null | undefined): number | null {
  if (!from || !to) return null;
  if (from === to) return 1;
  const f = UNIT_BASE[from];
  const t = UNIT_BASE[to];
  if (!f || !t || f.dim !== t.dim) return null;
  return f.base / t.base;
}

/**
 * Factor para pasar una cantidad escrita en `from` a la unidad del PRODUCTO
 * (espejo de `public.product_unit_factor`):
 *   1. misma dimensión que la unidad del producto → `unitFactor`;
 *   2. el producto declara contenido y `from` es de esa dimensión →
 *      `unitFactor(from, contenido) / cantidad del contenido`
 *      (150 ml de una bolsa de 900 ml = 150 × 1/900 = 0,1667 bolsas);
 *   3. si no, `null`.
 */
export function productUnitFactor(from: string | null | undefined, product: UnitTarget): number | null {
  const h = holderOf(product);
  const direct = unitFactor(from, h.unit);
  if (direct !== null) return direct;
  const content = contentOf(h);
  if (!content) return null;
  const toContent = unitFactor(from, content.unit);
  return toContent === null ? null : toContent / content.qty;
}

/** ¿Se puede medir en `unit` algo que se maneja como `product`? */
export function areUnitsCompatible(unit: string, product: UnitTarget): boolean {
  return productUnitFactor(unit, product) !== null;
}

/** Convierte `qty` de `from` a la unidad del producto; `null` si no se puede. */
export function convertQty(qty: number, from: string, to: UnitTarget): number | null {
  const factor = productUnitFactor(from, to);
  return factor === null ? null : qty * factor;
}

/**
 * Unidades en las que se puede escribir una cantidad de un producto. La suya
 * va primero; después las de su dimensión o, si declara contenido, las de la
 * dimensión del contenido. Sin dimensión ni contenido, solo se ofrece a sí misma.
 */
export function compatibleUnits(product: UnitTarget): string[] {
  const h = holderOf(product);
  const info = UNIT_BASE[h.unit];
  if (info) return [h.unit, ...UNITS_BY_DIMENSION[info.dim].filter((u) => u !== h.unit)];
  const content = contentOf(h);
  if (!content) return [h.unit];
  return [h.unit, ...UNITS_BY_DIMENSION[UNIT_BASE[content.unit].dim]];
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
  product: UnitTarget,
  multiplier = 1,
): number | null {
  const factor = productUnitFactor(lineUnit, product);
  if (factor === null) return null;
  return roundStock(lineQty * factor * multiplier);
}

/**
 * La cantidad POR UNIDAD de la receta se deforma al redondear el stock a 3
 * decimales: 0,5 g de un insumo guardado en kg es 0,0005 kg → 0,001 (el doble)
 * o 0. Avisa cuando el redondeo se come más del 1 % o deja la línea en cero.
 * Una bolsa de 900 ml gastada en 150 ml (0,16667 → 0,167) pasa sin aviso: la
 * diferencia es del 0,2 % y no hay unidad mejor en la que llevar bolsas.
 */
export function losesPrecision(lineQty: number, lineUnit: string, product: UnitTarget): boolean {
  const factor = productUnitFactor(lineUnit, product);
  if (factor === null || !(lineQty > 0)) return false;
  const exact = lineQty * factor;
  const rounded = roundStock(exact);
  if (rounded === 0) return true;
  return Math.abs(rounded - exact) / exact > 0.01;
}

/** "900 ml c/u" para un producto con contenido; `null` si no declara. */
export function contentLabel(product: UnitHolder): string | null {
  const content = contentOf(product);
  if (!content) return null;
  const qty = content.qty.toLocaleString("es-CO", { maximumFractionDigits: 3 });
  return `${qty} ${content.unit} c/u`;
}
