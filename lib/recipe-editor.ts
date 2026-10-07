/**
 * Lógica pura de las PANTALLAS de "Recetas y producción": el editor de receta
 * de la ficha del producto, la pantalla de Producción y los filtros de
 * Inventario. Sin I/O ni React; se testea en `tests/recipe-editor.test.ts`.
 *
 * Las cuentas de verdad (costo, conversión, plan de un lote) viven en
 * `lib/recipes.ts` y `lib/units.ts`, espejos de la base. Esto es lo que
 * decide la pantalla: qué unidad proponer, qué insumos ofrecer, cómo leer un
 * número que alguien escribió con coma, qué color lleva un margen.
 */

import { compatibleUnits, roundStock } from "@/lib/units";
import { recipeCost, recipeMargin, type IngredientInfo, type RecipeLine } from "@/lib/recipes";

/**
 * Unidad que se propone al agregar un insumo a una receta: la más chica de su
 * dimensión, porque así se piensan las recetas ("20 g de café", "200 ml de
 * leche"), aunque el insumo se compre por kilo o por litro. Lo que no tiene
 * dimensión (Unidad, Caja…) se queda en su unidad.
 */
export function defaultLineUnit(stockUnit: string): string {
  const smaller: Record<string, string> = { kg: "g", lb: "g", L: "ml", m: "cm" };
  const candidate = smaller[stockUnit];
  return candidate && compatibleUnits(stockUnit).includes(candidate) ? candidate : stockUnit;
}

/**
 * Lee una cantidad tal como la escribe una persona en Colombia: "0,5", "1.5",
 * " 20 ". Devuelve `null` si no es un número positivo. Si hay coma, la coma es
 * el decimal y los puntos son miles ("1.250,5"); sin coma, el punto es el
 * decimal ("1.5"), que es lo que deja el teclado numérico del celular.
 */
export function parseQty(raw: string): number | null {
  const value = raw.trim().replace(/\s+/g, "");
  if (value === "") return null;
  let normalized = value;
  if (value.includes(",")) {
    // Con coma, el punto es separador de miles: "1.250,5" → 1250.5.
    normalized = value.replace(/\./g, "").replace(",", ".");
  }
  if (!/^\d*\.?\d+$/.test(normalized) && !/^\d+\.$/.test(normalized)) return null;
  const n = Number(normalized);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Cantidad legible con coma decimal y hasta 3 decimales: 1,5 kg · 0,25 L · 12 u. */
export function formatQty(qty: number, unit: string): string {
  const value = roundStock(qty);
  const text = value.toLocaleString("es-CO", { maximumFractionDigits: 3 });
  return `${text} ${unitLabel(unit, value)}`;
}

/** "Unidad" se lee mejor abreviado junto a un número: "3 u." en vez de "3 Unidad". */
export function unitLabel(unit: string, qty?: number): string {
  if (unit === "Unidad") return "u.";
  if (unit === "Par") return qty === 1 ? "par" : "pares";
  if (unit === "Docena") return qty === 1 ? "docena" : "docenas";
  if (unit === "Caja") return qty === 1 ? "caja" : "cajas";
  if (unit === "Pack") return qty === 1 ? "pack" : "packs";
  return unit;
}

export type MarginTone = "loss" | "thin" | "healthy" | "unknown";

/**
 * Cómo pintar un margen. Por debajo de 0 se pierde plata en cada venta; por
 * debajo del 30 % el margen es fino para un producto preparado (la mano de
 * obra, el arriendo y la merma no están en la receta). Son umbrales de
 * lectura, no reglas del negocio: solo deciden el color.
 */
export function marginTone(pct: number | null): MarginTone {
  if (pct === null || !Number.isFinite(pct)) return "unknown";
  if (pct < 0) return "loss";
  if (pct < 30) return "thin";
  return "healthy";
}

export interface CandidateProduct {
  id: string;
  name: string;
  unit: string;
  stock_level: number;
  tracks_stock?: boolean | null;
  is_ingredient?: boolean | null;
  status?: string | null;
}

/**
 * Productos que se pueden usar como insumo de una receta, en el orden en que
 * conviene ofrecerlos: primero los marcados "Solo insumo", después el resto,
 * cada grupo por nombre.
 *
 * Quedan afuera: el propio producto (no se gasta a sí mismo), los que tienen
 * receta de VENTA (no llevan stock propio: su stock está en SUS insumos, así
 * que gastarlos no descontaría nada real) y los archivados, salvo que ya estén
 * en la receta (no se esconde lo que ya se eligió).
 */
export function ingredientCandidates<T extends CandidateProduct>(
  products: readonly T[],
  opts: { selfId?: string | null; saleRecipeProductIds: ReadonlySet<string>; keepIds?: ReadonlySet<string> },
): T[] {
  return products
    .filter((p) => {
      if (opts.keepIds?.has(p.id)) return true;
      if (p.id === opts.selfId) return false;
      if (opts.saleRecipeProductIds.has(p.id)) return false;
      if (p.status === "inactive") return false;
      return true;
    })
    .sort((a, b) => {
      const ia = a.is_ingredient ? 0 : 1;
      const ib = b.is_ingredient ? 0 : 1;
      if (ia !== ib) return ia - ib;
      return a.name.localeCompare(b.name, "es");
    });
}

/** Texto de una opción del buscador de insumos: nombre, unidad y stock. */
export function candidateLabel(p: CandidateProduct): string {
  if (p.tracks_stock === false) return `${p.name} · ${p.unit} · sin inventario`;
  return `${p.name} · ${formatQty(p.stock_level, p.unit)} en stock`;
}

/** Una línea del editor, tal como está en pantalla (la cantidad aún es texto). */
export interface EditorLine {
  key: string;
  ingredientId: string;
  qty: string;
  unit: string;
}

/** Las líneas válidas del editor en el formato que guarda la base. */
export function editorToLines(lines: readonly EditorLine[]): RecipeLine[] {
  const out: RecipeLine[] = [];
  for (const l of lines) {
    const quantity = parseQty(l.qty);
    if (!l.ingredientId || quantity === null) continue;
    out.push({ ingredientId: l.ingredientId, quantity, unit: l.unit });
  }
  return out;
}

export type EditorLineIssue = "missing-ingredient" | "missing-qty" | "duplicate" | null;

/** Qué le falta a cada línea para poder guardarse (para marcarla en pantalla). */
export function editorLineIssues(lines: readonly EditorLine[]): EditorLineIssue[] {
  const seen = new Set<string>();
  return lines.map((l) => {
    if (!l.ingredientId) return "missing-ingredient";
    if (seen.has(l.ingredientId)) return "duplicate";
    seen.add(l.ingredientId);
    if (parseQty(l.qty) === null) return "missing-qty";
    return null;
  });
}

/**
 * Participación de cada insumo en el costo, para la barra de composición. Solo
 * entran los que tienen costo; si ninguno lo tiene no hay barra que dibujar.
 */
export function costShares(lines: readonly { ingredientId: string; name: string; cost: number }[]): {
  ingredientId: string;
  name: string;
  cost: number;
  pct: number;
}[] {
  const positive = lines.filter((l) => l.cost > 0);
  const total = positive.reduce((acc, l) => acc + l.cost, 0);
  if (!(total > 0)) return [];
  return positive
    .map((l) => ({ ...l, pct: (l.cost / total) * 100 }))
    .sort((a, b) => b.cost - a.cost);
}

/** Lo que hace falta de un producto para los filtros de insumos del catálogo. */
interface StockedProduct {
  stock_level: number;
  minimum_stock: number;
  tracks_stock?: boolean | null;
  is_ingredient?: boolean | null;
}

/**
 * Insumo por reponer: marcado "Solo insumo", lleva inventario y está en
 * negativo, en cero o en/debajo de su mínimo. Es el mismo aviso que manda la
 * base ("Reponer insumo"), así que la lista y la campana dicen lo mismo.
 */
export function ingredientNeedsRestock(p: StockedProduct): boolean {
  if (!p.is_ingredient || p.tracks_stock === false) return false;
  if (p.stock_level <= 0) return true;
  return p.minimum_stock > 0 && p.stock_level <= p.minimum_stock;
}

export interface RecipeRowInput {
  id: string;
  kind: "sale" | "production";
  targetId: string;
  targetKind: "product" | "service";
  name: string;
  price: number;
  unit: string;
  lines: RecipeLine[];
  yieldQty: number | null;
  yieldUnit: string | null;
}

export interface RecipeCostRow extends RecipeRowInput {
  cost: number;
  incomplete: boolean;
  /** Venta: margen sobre el precio. Producción: no aplica (`null`). */
  marginPct: number | null;
  profit: number | null;
}

/**
 * Filas de "Recetas y costos". En una receta de producción el costo es el del
 * LOTE completo; el margen no aplica porque el preparado no se vende directo.
 */
export function recipeCostRows(
  inputs: readonly RecipeRowInput[],
  ingredients: ReadonlyMap<string, IngredientInfo>,
): RecipeCostRow[] {
  return inputs.map((r) => {
    const cost = recipeCost(r.lines, ingredients);
    if (r.kind === "production") {
      return { ...r, cost: cost.total, incomplete: cost.incomplete, marginPct: null, profit: null };
    }
    const margin = recipeMargin(r.price, cost.total);
    return { ...r, cost: cost.total, incomplete: cost.incomplete, marginPct: margin.pct, profit: margin.profit };
  });
}

export type RecipeSortKey = "name" | "cost" | "margin";

/** Orden de la tabla. Lo que no tiene margen (producción, sin precio) va al final. */
export function sortRecipeRows(
  rows: readonly RecipeCostRow[],
  key: RecipeSortKey,
  dir: "asc" | "desc",
): RecipeCostRow[] {
  const sign = dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    if (key === "name") return sign * a.name.localeCompare(b.name, "es");
    if (key === "cost") return sign * (a.cost - b.cost);
    const am = a.marginPct;
    const bm = b.marginPct;
    if (am === null && bm === null) return a.name.localeCompare(b.name, "es");
    if (am === null) return 1;
    if (bm === null) return -1;
    return sign * (am - bm);
  });
}
