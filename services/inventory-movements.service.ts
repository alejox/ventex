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

/**
 * Ajuste manual de stock.
 *
 * Una sola llamada al RPC `register_manual_movement`, que escribe el movimiento
 * y el conteo dentro de la misma transacción. Antes eran dos llamadas sueltas
 * desde el cliente: si la segunda fallaba quedaba un movimiento registrado que
 * no correspondía a ningún cambio real de inventario.
 *
 * El RPC también es donde vive el permiso `inventory_stock`: es SECURITY
 * DEFINER, así que la RLS no lo cubre.
 */
export async function createManualMovement(input: ManualMovementInput): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.rpc("register_manual_movement" as never, {
    p_product_id: input.product_id,
    p_type: input.type,
    p_quantity: input.quantity,
    p_notes: input.notes || null,
  } as never);
  if (error) throw error;
}
