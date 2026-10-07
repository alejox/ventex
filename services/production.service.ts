import { createClient } from "@/utils/supabase/client";

/**
 * Lotes de producción (módulo opt-in "Recetas y producción").
 *
 * Registrar un lote es UN RPC (`register_production_batch`): consume los
 * insumos de la receta de producción, suma el preparado, deja kardex, guarda el
 * lote con su costo y actualiza el costo del preparado. Anular
 * (`void_production_batch`) revierte exactamente lo que el lote movió. Las
 * filas se LEEN directo; los costos, solo por `get_production_batch_costs`
 * (permiso `inventory_costs`), igual que el costo de los productos.
 */

export interface ProductionBatchItem {
  id: string;
  ingredient_id: string | null;
  ingredient_name: string;
  /** Lo que el lote descontó, en la unidad del insumo. */
  quantity: number;
  unit: string;
  /** false = el insumo no controla stock: solo contó para el costo. */
  stock_applied: boolean;
  /** Solo con permiso de costos. */
  unit_cost?: number | null;
  line_cost?: number | null;
}

export interface ProductionBatch {
  id: string;
  batch_number: number;
  product_id: string;
  recipe_id: string | null;
  /** Tandas equivalentes (producido ÷ rendimiento). */
  batches: number | null;
  output_qty: number;
  output_unit: string;
  output_stock_applied: boolean;
  /** Todos los insumos tenían costo: el costo del lote es real (y actualizó el del preparado). */
  cost_complete: boolean;
  status: "completed" | "void";
  notes: string | null;
  created_by: string | null;
  created_at: string;
  voided_at: string | null;
  void_reason: string | null;
  items: ProductionBatchItem[];
  /** Solo con permiso de costos. */
  total_cost?: number | null;
  unit_cost?: number | null;
}

const BATCH_SELECT =
  "id, batch_number, product_id, recipe_id, batches, output_qty, output_unit, output_stock_applied, cost_complete, status, notes, created_by, created_at, voided_at, void_reason, " +
  "production_batch_items(id, ingredient_id, ingredient_name, quantity, unit, stock_applied)";

type BatchRow = Omit<ProductionBatch, "items" | "status" | "batches" | "output_qty"> & {
  status: string;
  batches: number | string | null;
  output_qty: number | string;
  production_batch_items: (Omit<ProductionBatchItem, "quantity"> & { quantity: number | string })[] | null;
};

function toBatch(row: BatchRow): ProductionBatch {
  return {
    ...row,
    status: row.status === "void" ? "void" : "completed",
    batches: row.batches === null ? null : Number(row.batches),
    output_qty: Number(row.output_qty),
    items: (row.production_batch_items ?? []).map((i) => ({ ...i, quantity: Number(i.quantity) })),
  };
}

export interface BatchFilters {
  /** Instantes ISO (rango cerrado-abierto), ya en la zona del negocio. */
  fromIso?: string;
  toIso?: string;
  productId?: string;
  limit?: number;
}

/** Lotes más recientes primero, con sus insumos y —si hay permiso— sus costos. */
export async function fetchBatches(filters: BatchFilters = {}): Promise<ProductionBatch[]> {
  const supabase = createClient();
  let query = supabase
    .from("production_batches")
    .select(BATCH_SELECT)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(filters.limit ?? 200);
  if (filters.fromIso) query = query.gte("created_at", filters.fromIso);
  if (filters.toIso) query = query.lt("created_at", filters.toIso);
  if (filters.productId) query = query.eq("product_id", filters.productId);
  const { data, error } = await query;
  if (error) throw error;
  const batches = ((data ?? []) as unknown as BatchRow[]).map(toBatch);
  return attachBatchCosts(batches);
}

/**
 * Completa los lotes con su costo. Como `attachCosts` de productos: sin
 * `inventory_costs` el RPC devuelve vacío y los lotes quedan sin costo.
 */
export async function attachBatchCosts(batches: ProductionBatch[]): Promise<ProductionBatch[]> {
  if (batches.length === 0) return batches;
  const supabase = createClient();
  const { data, error } = await supabase.rpc("get_production_batch_costs", { p_ids: batches.map((b) => b.id) });
  if (error || !data) return batches;
  const byBatch = new Map(data.map((row) => [row.batch_id, row]));
  return batches.map((b) => {
    const cost = byBatch.get(b.id);
    if (!cost) return b;
    const itemCosts = new Map(
      ((cost.items ?? []) as { id: string; unit_cost: number | null; line_cost: number | null }[]).map((i) => [i.id, i]),
    );
    return {
      ...b,
      total_cost: cost.total_cost === null ? null : Number(cost.total_cost),
      unit_cost: cost.unit_cost === null ? null : Number(cost.unit_cost),
      items: b.items.map((i) => {
        const c = itemCosts.get(i.id);
        return c
          ? { ...i, unit_cost: c.unit_cost === null ? null : Number(c.unit_cost), line_cost: c.line_cost === null ? null : Number(c.line_cost) }
          : i;
      }),
    };
  });
}

export interface RegisterBatchInput {
  productId: string;
  /** Uno de los dos: tandas, o cuánto se produjo (en la unidad del producto). */
  batches?: number;
  outputQty?: number;
  notes?: string;
  /**
   * Id del INTENTO: el mismo en cada reintento (doble clic, respuesta perdida)
   * hace que la base devuelva el lote ya registrado sin volver a descontar.
   */
  clientBatchId: string;
}

export interface NegativeInput {
  product_id: string;
  name: string;
  stock: number;
  unit: string;
}

export interface RegisterBatchResult {
  batch_id: string;
  batch_number: number;
  output_qty: number;
  output_unit: string;
  batches: number | null;
  cost_complete: boolean;
  /** El costo del preparado se actualizó con el de este lote. */
  cost_updated: boolean;
  /** Insumos que quedaron en negativo (la sobreventa está permitida en el negocio). */
  negative_inputs: NegativeInput[];
  /** Era un reintento: el lote ya existía y no se movió nada. */
  already_registered: boolean;
  /** Solo con permiso de costos. */
  total_cost: number | null;
}

export function newClientBatchId(): string {
  return crypto.randomUUID();
}

export async function registerBatch(input: RegisterBatchInput): Promise<RegisterBatchResult> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("register_production_batch", {
    p_product_id: input.productId,
    p_batches: input.batches,
    p_output_qty: input.outputQty,
    p_notes: input.notes?.trim() || undefined,
    p_client_batch_id: input.clientBatchId,
  });
  if (error) throw error;
  return parseRegisterBatchResult(data);
}

/** Puro (testeado): normaliza la respuesta jsonb de `register_production_batch`. */
export function parseRegisterBatchResult(raw: unknown): RegisterBatchResult {
  const r = (raw ?? {}) as Record<string, unknown>;
  const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));
  return {
    batch_id: String(r.batch_id ?? ""),
    batch_number: Number(r.batch_number ?? 0),
    output_qty: Number(r.output_qty ?? 0),
    output_unit: String(r.output_unit ?? ""),
    batches: num(r.batches),
    cost_complete: r.cost_complete === true,
    cost_updated: r.cost_updated === true,
    negative_inputs: Array.isArray(r.negative_inputs)
      ? (r.negative_inputs as Record<string, unknown>[]).map((n) => ({
          product_id: String(n.product_id ?? ""),
          name: String(n.name ?? ""),
          stock: Number(n.stock ?? 0),
          unit: String(n.unit ?? ""),
        }))
      : [],
    already_registered: r.already_registered === true,
    total_cost: num(r.total_cost),
  };
}

export interface VoidBatchResult {
  /** El preparado quedó en negativo (ya se había usado parte de lo producido). */
  output_went_negative: boolean;
  output_stock_after: number | null;
}

export async function voidBatch(batchId: string, reason?: string): Promise<VoidBatchResult> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("void_production_batch", {
    p_batch_id: batchId,
    p_reason: reason?.trim() || undefined,
  });
  if (error) throw error;
  const r = (data ?? {}) as Record<string, unknown>;
  return {
    output_went_negative: r.output_went_negative === true,
    output_stock_after: r.output_stock_after === null || r.output_stock_after === undefined ? null : Number(r.output_stock_after),
  };
}
