import { createClient } from "@/utils/supabase/client";
import { createPurchaseInvoice } from "@/services/purchases.service";

/**
 * Órdenes de compra (pedidos de reposición a proveedor).
 *
 * Ciclo: `draft` → `issued` → `received`. Al recibir se genera la factura de
 * compra, que es lo que suma stock y costo — este módulo no toca inventario
 * por su cuenta: reusa `createPurchaseInvoice`.
 */
export type PurchaseOrderStatus = "draft" | "issued" | "received" | "cancelled";

export interface PurchaseOrderItem {
  id: string;
  product_id: string | null;
  product_name: string;
  sku: string | null;
  quantity: number;
  unit_price: number;
}

export interface PurchaseOrder {
  id: string;
  order_number: number;
  distributor_id: string | null;
  status: PurchaseOrderStatus;
  notes: string | null;
  issued_at: string | null;
  received_at: string | null;
  invoice_id: string | null;
  created_at: string;
  updated_at: string;
  /** Nombre del proveedor, por el embed. null si el pedido no tiene uno. */
  distributor_name: string | null;
  items: PurchaseOrderItem[];
}

/** Línea tal como la arma la pantalla de Pedidos. */
export interface PurchaseOrderLineInput {
  product_id: string | null;
  product_name: string;
  sku: string | null;
  quantity: number;
  unit_price: number;
}

export interface SavePurchaseOrderInput {
  distributor_id: string | null;
  notes?: string | null;
  items: PurchaseOrderLineInput[];
}

const ORDER_SELECT = `
  id, order_number, distributor_id, status, notes, issued_at, received_at,
  invoice_id, created_at, updated_at,
  distributors(business_name),
  purchase_order_items(id, product_id, product_name, sku, quantity, unit_price)
`;

/** El embed de PostgREST no queda bien tipado por el generador. */
interface OrderRow {
  id: string;
  order_number: number;
  distributor_id: string | null;
  status: string;
  notes: string | null;
  issued_at: string | null;
  received_at: string | null;
  invoice_id: string | null;
  created_at: string;
  updated_at: string;
  distributors: { business_name: string | null } | null;
  purchase_order_items: PurchaseOrderItem[] | null;
}

function toOrder(row: OrderRow): PurchaseOrder {
  return {
    id: row.id,
    order_number: row.order_number,
    distributor_id: row.distributor_id,
    status: row.status as PurchaseOrderStatus,
    notes: row.notes,
    issued_at: row.issued_at,
    received_at: row.received_at,
    invoice_id: row.invoice_id,
    created_at: row.created_at,
    updated_at: row.updated_at,
    distributor_name: row.distributors?.business_name ?? null,
    items: (row.purchase_order_items ?? []).slice().sort((a, b) =>
      a.product_name.localeCompare(b.product_name),
    ),
  };
}

export async function fetchPurchaseOrders(): Promise<PurchaseOrder[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("purchase_orders")
    .select(ORDER_SELECT)
    .neq("status", "cancelled")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return ((data ?? []) as unknown as OrderRow[]).map(toOrder);
}

/**
 * Crea el pedido con sus líneas.
 *
 * Las líneas se insertan después del encabezado porque necesitan su id. Si ese
 * segundo insert falla, se borra el encabezado: un pedido sin productos no le
 * sirve a nadie y ensuciaría la lista.
 */
export async function createPurchaseOrder(
  input: SavePurchaseOrderInput,
  status: Extract<PurchaseOrderStatus, "draft" | "issued">,
): Promise<PurchaseOrder> {
  const supabase = createClient();

  const { data: order, error } = await supabase
    .from("purchase_orders")
    .insert({
      distributor_id: input.distributor_id,
      notes: input.notes ?? null,
      status,
      issued_at: status === "issued" ? new Date().toISOString() : null,
    })
    .select("id")
    .single();
  if (error) throw error;

  const { error: itemsError } = await supabase.from("purchase_order_items").insert(
    input.items.map((item) => ({
      purchase_order_id: order.id,
      product_id: item.product_id,
      product_name: item.product_name,
      sku: item.sku,
      quantity: item.quantity,
      unit_price: item.unit_price,
    })),
  );
  if (itemsError) {
    await supabase.from("purchase_orders").delete().eq("id", order.id);
    throw itemsError;
  }

  return fetchPurchaseOrder(order.id);
}

export async function fetchPurchaseOrder(id: string): Promise<PurchaseOrder> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("purchase_orders")
    .select(ORDER_SELECT)
    .eq("id", id)
    .single();
  if (error) throw error;
  return toOrder(data as unknown as OrderRow);
}

/** Reemplaza las líneas de un borrador. Solo tiene sentido en `draft`. */
export async function updatePurchaseOrder(
  id: string,
  input: SavePurchaseOrderInput,
): Promise<PurchaseOrder> {
  const supabase = createClient();

  const { error } = await supabase
    .from("purchase_orders")
    .update({
      distributor_id: input.distributor_id,
      notes: input.notes ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) throw error;

  const { error: deleteError } = await supabase
    .from("purchase_order_items")
    .delete()
    .eq("purchase_order_id", id);
  if (deleteError) throw deleteError;

  const { error: itemsError } = await supabase.from("purchase_order_items").insert(
    input.items.map((item) => ({
      purchase_order_id: id,
      product_id: item.product_id,
      product_name: item.product_name,
      sku: item.sku,
      quantity: item.quantity,
      unit_price: item.unit_price,
    })),
  );
  if (itemsError) throw itemsError;

  return fetchPurchaseOrder(id);
}

export async function issuePurchaseOrder(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("purchase_orders")
    .update({
      status: "issued",
      issued_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("status", "draft");
  if (error) throw error;
}

export async function cancelPurchaseOrder(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("purchase_orders")
    .update({ status: "cancelled", updated_at: new Date().toISOString() })
    .eq("id", id)
    .in("status", ["draft", "issued"]);
  if (error) throw error;
}

/**
 * Marca el pedido como recibido y crea su factura de compra.
 *
 * El stock y el costo los mueve `createPurchaseInvoice`, que ya existe y es la
 * única puerta del módulo de Compras: duplicar ese cálculo acá sería tener dos
 * verdades sobre el inventario.
 *
 * Si la factura se crea pero marcar el pedido falla, la compra ya entró al
 * inventario y el pedido queda en `issued`: se puede reintentar sin duplicar
 * stock porque `receivePurchaseOrder` exige que siga en `issued`.
 */
export async function receivePurchaseOrder(order: PurchaseOrder): Promise<string> {
  if (!order.distributor_id) {
    throw new Error("Asigna un proveedor al pedido antes de recibirlo.");
  }

  const invoice = await createPurchaseInvoice({
    distributor_id: order.distributor_id,
    issue_date: new Date().toISOString().slice(0, 10),
    supplier_invoice_number: `PED-${order.order_number}`,
    status: "paid",
    items: order.items
      .filter((item) => item.product_id !== null)
      .map((item) => ({
        product_id: item.product_id as string,
        description: item.product_name,
        // Un pedido no distingue caja de unidad: sus cantidades siempre fueron
        // unidades sueltas, que es lo que `increment_stock` sumaba tal cual.
        // Marcarlo explícito deja el comportamiento idéntico al de antes.
        package_quantity: 0,
        loose_quantity: item.quantity,
        unit_price: item.unit_price,
        package_price: 0,
        units_per_package: 1,
      })),
  });

  const supabase = createClient();
  const { error } = await supabase
    .from("purchase_orders")
    .update({
      status: "received",
      received_at: new Date().toISOString(),
      invoice_id: invoice.id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", order.id)
    .eq("status", "issued");
  if (error) throw error;

  return invoice.id;
}
