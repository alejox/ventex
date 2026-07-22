import { createClient } from "@/utils/supabase/client";

export interface InventoryMovement {
  id: string;
  product_id: string;
  type: "in" | "out" | "adjust";
  quantity: number;
  reference_type: string | null;
  reference_id: string | null;
  notes: string | null;
  created_at: string;
  products?: { name: string; sku: string } | null;
}

export interface ManualMovementInput {
  product_id: string;
  type: "in" | "out" | "adjust";
  quantity: number;
  notes?: string;
}

const MOVEMENT_SELECT = `
  id, product_id, type, quantity, reference_type, reference_id, notes, created_at,
  products(name, sku)
`;

export async function fetchMovements(productId?: string): Promise<InventoryMovement[]> {
  const supabase = createClient();
  let query = supabase
    .from("inventory_movements" as never)
    .select(MOVEMENT_SELECT)
    .order("created_at", { ascending: false });

  if (productId) {
    query = query.eq("product_id", productId);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as unknown as InventoryMovement[];
}

export async function createManualMovement(input: ManualMovementInput): Promise<void> {
  const supabase = createClient();

  const { error: movErr } = await supabase.from("inventory_movements" as never).insert({
    product_id: input.product_id,
    type: input.type,
    quantity: input.quantity,
    reference_type: "manual",
    notes: input.notes || null,
  } as never);
  if (movErr) throw movErr;

  // `adjust` fija el stock absoluto; `in`/`out` son deltas sobre el actual.
  if (input.type === "adjust") {
    const { error } = await supabase
      .from("products")
      .update({ stock_level: input.quantity } as never)
      .eq("id", input.product_id);
    if (error) throw error;
  } else {
    const { error } = await supabase.rpc("increment_stock" as never, {
      p_product_id: input.product_id,
      p_quantity: input.type === "in" ? input.quantity : -input.quantity,
    } as never);
    if (error) throw error;
  }
}
