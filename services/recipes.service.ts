import { createClient } from "@/utils/supabase/client";
import type { IngredientInfo, RecipeKind, RecipeLine } from "@/lib/recipes";

/**
 * Recetas (módulo opt-in "Recetas y producción").
 *
 * Una receta de VENTA dice qué insumos gasta una unidad vendida de un producto
 * o de un servicio; una de PRODUCCIÓN, qué insumos lleva un lote de un
 * preparado y cuánto rinde. Se LEEN directo (RLS: cualquiera con permiso de
 * catálogo o `production`) y se ESCRIBEN solo por `save_recipe`, que valida
 * unidades, ciclos y permisos y apaga el stock propio de un producto con receta
 * de venta. Toda la lógica de cálculo vive en `lib/recipes.ts`.
 */

export type { RecipeKind, RecipeLine } from "@/lib/recipes";

export interface RecipeItem {
  id: string;
  ingredient_id: string;
  /** Cantidad en la unidad que se escribió (20 g aunque el café se maneje en kg). */
  quantity: number;
  unit: string;
  position: number;
}

export interface Recipe {
  id: string;
  kind: RecipeKind;
  product_id: string | null;
  service_id: string | null;
  /** Solo en recetas de producción: cuánto rinde un lote. */
  yield_qty: number | null;
  yield_unit: string | null;
  notes: string | null;
  updated_at: string;
  items: RecipeItem[];
}

const RECIPE_SELECT =
  "id, kind, product_id, service_id, yield_qty, yield_unit, notes, updated_at, recipe_items(id, ingredient_id, quantity, unit, position)";

type RecipeRow = Omit<Recipe, "items" | "kind" | "yield_qty"> & {
  kind: string;
  yield_qty: number | string | null;
  recipe_items: (Omit<RecipeItem, "quantity"> & { quantity: number | string })[] | null;
};

function toRecipe(row: RecipeRow): Recipe {
  return {
    id: row.id,
    kind: row.kind === "production" ? "production" : "sale",
    product_id: row.product_id,
    service_id: row.service_id,
    yield_qty: row.yield_qty === null ? null : Number(row.yield_qty),
    yield_unit: row.yield_unit,
    notes: row.notes,
    updated_at: row.updated_at,
    items: (row.recipe_items ?? [])
      .map((i) => ({ ...i, quantity: Number(i.quantity) }))
      .sort((a, b) => a.position - b.position),
  };
}

/** Todas las recetas del negocio con sus líneas (un negocio tiene decenas, no miles). */
export async function fetchRecipes(): Promise<Recipe[]> {
  const supabase = createClient();
  const { data, error } = await supabase.from("recipes").select(RECIPE_SELECT).order("created_at");
  if (error) throw error;
  return ((data ?? []) as unknown as RecipeRow[]).map(toRecipe);
}

/** La receta de UN producto o servicio, o `null` si no tiene. */
export async function fetchRecipeFor(target: { productId?: string | null; serviceId?: string | null }): Promise<Recipe | null> {
  const supabase = createClient();
  let query = supabase.from("recipes").select(RECIPE_SELECT);
  if (target.productId) query = query.eq("product_id", target.productId);
  else if (target.serviceId) query = query.eq("service_id", target.serviceId);
  else return null;
  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return data ? toRecipe(data as unknown as RecipeRow) : null;
}

export interface SaveRecipeInput {
  /** Uno de los dos: la receta es de un producto o de un servicio. */
  productId?: string | null;
  serviceId?: string | null;
  kind: RecipeKind;
  /** Vacío = borrar la receta (el stock propio del producto queda como estaba). */
  items: RecipeLine[];
  /** Producción: cuánto rinde un lote, y en qué unidad (por defecto la del producto). */
  yieldQty?: number | null;
  yieldUnit?: string | null;
  notes?: string | null;
  /**
   * Confirmación de que un producto CON stock pasa a receta de venta: su stock
   * se lleva a 0 (con su movimiento de kardex). Sin esto, `save_recipe`
   * responde RECETA_CON_STOCK y la pantalla tiene que preguntar.
   */
  clearStock?: boolean;
}

/** Guarda (crea, reemplaza o borra) una receta. Devuelve su id, o `null` si quedó borrada. */
export async function saveRecipe(input: SaveRecipeInput): Promise<string | null> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("save_recipe", {
    // Los tipos generados no marcan los args nulables: uno de los dos va null.
    p_product_id: (input.productId ?? null) as string,
    p_service_id: (input.serviceId ?? null) as string,
    p_kind: input.kind,
    p_items: input.items.map((l) => ({ ingredient_id: l.ingredientId, quantity: l.quantity, unit: l.unit })),
    p_yield_qty: input.kind === "production" ? (input.yieldQty ?? undefined) : undefined,
    p_yield_unit: input.kind === "production" ? (input.yieldUnit ?? undefined) : undefined,
    p_notes: input.notes ?? undefined,
    p_clear_stock: input.clearStock ?? false,
  });
  if (error) throw error;
  return (data as string | null) ?? null;
}

/**
 * ¿El rechazo es "este producto todavía tiene stock"? La pantalla lo convierte
 * en una confirmación ("tiene 12 u.: al pasar a receta quedan en 0") y reintenta
 * con `clearStock`.
 */
export function isRecipeWithStockError(e: unknown): boolean {
  const message = e && typeof e === "object" ? (e as { message?: unknown }).message : e;
  return typeof message === "string" && /^RECETA_CON_STOCK\b/.test(message);
}

/** Las líneas de una receta guardada, en el formato de `lib/recipes.ts`. */
export function toRecipeLines(recipe: Pick<Recipe, "items">): RecipeLine[] {
  return recipe.items.map((i) => ({ ingredientId: i.ingredient_id, quantity: i.quantity, unit: i.unit }));
}

/**
 * Un producto del catálogo (store de inventario, ya con `attachCosts`) como
 * insumo para costear y planificar. Sin permiso de costos, `purchase_price`
 * llega ausente y el costo de la receta sale "incompleto": la pantalla esconde
 * la columna en ese caso.
 */
export function toIngredientInfo(product: {
  id: string;
  name: string;
  unit: string;
  purchase_price?: number | null;
  units_per_package?: number | null;
  stock_level: number;
  tracks_stock?: boolean | null;
}): IngredientInfo {
  return {
    id: product.id,
    name: product.name,
    unit: product.unit,
    purchase_price: product.purchase_price ?? null,
    units_per_package: product.units_per_package ?? 1,
    stock_level: Number(product.stock_level) || 0,
    tracks_stock: product.tracks_stock !== false,
  };
}

/**
 * Para cada producto con receta de PRODUCCIÓN, sus insumos: el grafo con el que
 * `wouldCreateCycle` avisa antes de guardar (la base igual lo rechaza).
 */
export function productionGraph(recipes: Recipe[]): Map<string, string[]> {
  const graph = new Map<string, string[]>();
  for (const r of recipes) {
    if (r.kind === "production" && r.product_id) {
      graph.set(r.product_id, r.items.map((i) => i.ingredient_id));
    }
  }
  return graph;
}
