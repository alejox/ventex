import { createClient } from "@/utils/supabase/client";
import { createPurchaseInvoice } from "@/services/purchases.service";
import { todayISO } from "@/lib/date";
import { isUnknownSignatureError } from "@/lib/sale-discounts";
import { orderLineBreakdown } from "@/lib/purchase-order-lines";

/**
 * Órdenes de compra (pedidos de reposición a proveedor).
 *
 * Ciclo: `draft` → `issued` → `received` | `completed`. Al RECIBIR se genera la
 * factura de compra, que es lo que suma stock y costo — lo hace la RPC
 * `receive_purchase_order`, que reusa `save_purchase_invoice` en la base.
 *
 * `completed` es el cierre SIN efectos: ni factura ni stock. Sirve para el
 * pedido que ya se resolvió por fuera (se registró la compra a mano, el
 * proveedor entregó parcial y se da por cerrado, etc.).
 *
 * Los dos estados ABIERTOS son `draft` e `issued` (ver `isOpenStatus`): son los
 * que retienen a sus productos fuera de las sugerencias de reposición.
 */
export type PurchaseOrderStatus =
  | "draft"
  | "issued"
  | "received"
  | "completed"
  | "cancelled";

/**
 * Un pedido abierto es el que todavía espera mercadería. Mientras lo esté, sus
 * productos NO se vuelven a sugerir: es lo único que evita pedir dos veces lo
 * mismo. Recibido, completado y cancelado los liberan.
 */
export function isOpenStatus(status: PurchaseOrderStatus): boolean {
  return status === "draft" || status === "issued";
}

/**
 * Productos retenidos por un pedido abierto, para que no se vuelvan a sugerir.
 *
 * Se ignoran las líneas sin `product_id`: son productos escritos a mano que no
 * existen en el catálogo, así que no hay nada que excluir de las sugerencias
 * —que salen del catálogo— y meterlas rompería nada más que el tipo.
 */
export function productIdsInOpenOrders(
  orders: readonly PurchaseOrder[],
): Set<string> {
  const ids = new Set<string>();
  for (const order of orders) {
    if (!isOpenStatus(order.status)) continue;
    for (const item of order.items) {
      if (item.product_id) ids.add(item.product_id);
    }
  }
  return ids;
}

interface PurchaseOrderItem {
  id: string;
  product_id: string | null;
  product_name: string;
  sku: string | null;
  /** En UNIDADES, aunque el producto se compre por caja. */
  quantity: number;
  /** `purchase_price` del producto: costo de la CAJA si `units_per_package > 1`. */
  unit_price: number;
  /**
   * Del producto, por el embed (1 si no tiene producto o no se ve). Es el mismo
   * dato con el que `receive_purchase_order` arma cajas + sueltas, así que el
   * valor que muestra Pedidos (`orderLineTotal`) es el que queda en la compra.
   */
  units_per_package: number;
}

export interface PurchaseOrder {
  id: string;
  order_number: number;
  distributor_id: string | null;
  status: PurchaseOrderStatus;
  notes: string | null;
  issued_at: string | null;
  received_at: string | null;
  completed_at: string | null;
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
  completed_at, invoice_id, created_at, updated_at,
  distributors(business_name),
  purchase_order_items(id, product_id, product_name, sku, quantity, unit_price, products(units_per_package))
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
  completed_at: string | null;
  invoice_id: string | null;
  created_at: string;
  updated_at: string;
  distributors: { business_name: string | null } | null;
  purchase_order_items: OrderItemRow[] | null;
}

interface OrderItemRow {
  id: string;
  product_id: string | null;
  product_name: string;
  sku: string | null;
  quantity: number;
  unit_price: number;
  products: { units_per_package: number | null } | null;
}

function toItem(row: OrderItemRow): PurchaseOrderItem {
  return {
    id: row.id,
    product_id: row.product_id,
    product_name: row.product_name,
    sku: row.sku,
    quantity: Number(row.quantity),
    unit_price: Number(row.unit_price),
    units_per_package: Math.max(Number(row.products?.units_per_package) || 1, 1),
  };
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
    completed_at: row.completed_at,
    invoice_id: row.invoice_id,
    created_at: row.created_at,
    updated_at: row.updated_at,
    distributor_name: row.distributors?.business_name ?? null,
    items: (row.purchase_order_items ?? [])
      .map(toItem)
      .sort((a, b) => a.product_name.localeCompare(b.product_name)),
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

export type SavablePurchaseOrderStatus = Extract<PurchaseOrderStatus, "draft" | "issued">;

/** Payload de `save_purchase_order`. Puro: lo usan la RPC y los tests. */
export function purchaseOrderPayload(
  input: SavePurchaseOrderInput,
  status: SavablePurchaseOrderStatus,
) {
  return {
    header: {
      distributor_id: input.distributor_id,
      notes: input.notes ?? null,
      status,
    },
    items: input.items.map((item) => ({
      product_id: item.product_id,
      product_name: item.product_name,
      sku: item.sku,
      quantity: item.quantity,
      unit_price: item.unit_price,
    })),
  };
}

/**
 * Crea un pedido (sin `id`) o reemplaza un BORRADOR (con `id`), con cabecera y
 * líneas en UNA transacción: la RPC `save_purchase_order`. Con
 * `status = "issued"` además lo emite (exige proveedor).
 *
 * Antes eran tres llamadas sueltas (cabecera, borrar líneas, insertar líneas):
 * si fallaba la última, el borrador quedaba sin productos. Y nada impedía
 * reescribir un pedido ya emitido; ahora la base lo rechaza
 * (`PEDIDO_NO_EDITABLE`).
 *
 * Si la base todavía no tiene la RPC (PGRST202: no se ejecutó nada), cae al
 * camino viejo.
 */
export async function savePurchaseOrder(
  id: string | null,
  input: SavePurchaseOrderInput,
  status: SavablePurchaseOrderStatus,
): Promise<PurchaseOrder> {
  const supabase = createClient();
  const { header, items } = purchaseOrderPayload(input, status);
  const { data, error } = await supabase.rpc("save_purchase_order", {
    // null = alta; los tipos generados no marcan args nulables.
    p_order_id: id as string,
    p_header: header,
    p_items: items,
  });

  if (error) {
    if (!isUnknownSignatureError(error)) throw error;
    return id ? legacyUpdatePurchaseOrder(id, input, status) : legacyCreatePurchaseOrder(input, status);
  }

  return fetchPurchaseOrder(data as unknown as string);
}

/** Camino viejo: solo si la base no tiene `save_purchase_order`. */
async function legacyCreatePurchaseOrder(
  input: SavePurchaseOrderInput,
  status: SavablePurchaseOrderStatus,
): Promise<PurchaseOrder> {
  const supabase = createClient();

  // Se crea en borrador y se emite al final: las líneas solo se escriben
  // mientras el pedido es borrador.
  const { data: order, error } = await supabase
    .from("purchase_orders")
    .insert({
      distributor_id: input.distributor_id,
      notes: input.notes ?? null,
      status: "draft",
    })
    .select("id")
    .single();
  if (error) throw error;

  const { error: itemsError } = await supabase.from("purchase_order_items").insert(
    purchaseOrderPayload(input, status).items.map((item) => ({
      ...item,
      purchase_order_id: order.id,
    })),
  );
  if (itemsError) {
    await supabase.from("purchase_orders").delete().eq("id", order.id);
    throw itemsError;
  }

  if (status === "issued") await issuePurchaseOrder(order.id);
  return fetchPurchaseOrder(order.id);
}

async function fetchPurchaseOrder(id: string): Promise<PurchaseOrder> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("purchase_orders")
    .select(ORDER_SELECT)
    .eq("id", id)
    .single();
  if (error) throw error;
  return toOrder(data as unknown as OrderRow);
}

/** Camino viejo (no atómico): solo si la base no tiene `save_purchase_order`. */
async function legacyUpdatePurchaseOrder(
  id: string,
  input: SavePurchaseOrderInput,
  status: SavablePurchaseOrderStatus,
): Promise<PurchaseOrder> {
  const supabase = createClient();

  const { data: updated, error } = await supabase
    .from("purchase_orders")
    .update({
      distributor_id: input.distributor_id,
      notes: input.notes ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("status", "draft")
    .select("id");
  if (error) throw error;
  if (!updated || updated.length === 0) {
    throw new Error("PEDIDO_NO_EDITABLE: solo se edita un pedido en borrador");
  }

  const { error: deleteError } = await supabase
    .from("purchase_order_items")
    .delete()
    .eq("purchase_order_id", id);
  if (deleteError) throw deleteError;

  const { error: itemsError } = await supabase.from("purchase_order_items").insert(
    purchaseOrderPayload(input, status).items.map((item) => ({
      ...item,
      purchase_order_id: id,
    })),
  );
  if (itemsError) throw itemsError;

  if (status === "issued") await issuePurchaseOrder(id);
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

/**
 * Cierra el pedido SIN efectos: no crea factura de compra ni mueve stock. Eso
 * lo hace `receivePurchaseOrder`, que es una acción distinta a propósito.
 *
 * Sirve para el pedido que se resolvió por fuera: la compra se cargó a mano en
 * Compras, el proveedor entregó parcial y se da por cerrado, etc. Lo que sí
 * hace es LIBERAR sus productos: al dejar de estar abierto, vuelven a
 * sugerirse como faltantes si el stock sigue bajo.
 *
 * El `.eq("status", "issued")` es la guarda: solo se completa lo que está
 * pendiente. Un pedido ya recibido no se puede "completar" encima, y un
 * borrador tampoco — ese se emite o se descarta.
 */
export async function completePurchaseOrder(id: string): Promise<void> {
  const supabase = createClient();
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("purchase_orders")
    .update({ status: "completed", completed_at: now, updated_at: now })
    .eq("id", id)
    .eq("status", "issued")
    .select("id");
  if (error) throw error;
  // 0 filas = otra pestaña ya lo recibió, completó o canceló.
  if (!data || data.length === 0) {
    throw new Error("PEDIDO_NO_EMITIDO: el pedido ya no está pendiente");
  }
}

export async function cancelPurchaseOrder(id: string): Promise<void> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("purchase_orders")
    .update({ status: "cancelled", updated_at: new Date().toISOString() })
    .eq("id", id)
    .in("status", ["draft", "issued"])
    .select("id");
  if (error) throw error;
  if (!data || data.length === 0) {
    throw new Error("PEDIDO_CERRADO: el pedido ya no está abierto");
  }
}

export interface ReceivePurchaseOrderResult {
  invoiceId: string;
  /** El pedido ya estaba recibido (doble clic, otra pestaña, reintento). */
  alreadyReceived: boolean;
}

export type ReceivedPurchaseStatus = "paid" | "pending";

export interface ReceivePurchaseOrderOptions {
  /** Estado de la compra que se registra. Por defecto, pagada. */
  status?: ReceivedPurchaseStatus;
  /** Tasa de IVA (0.19 = 19 %). Por defecto, 0. */
  taxRate?: number;
}

/**
 * Argumentos de `receive_purchase_order`. Los parámetros nuevos (estado e IVA)
 * solo viajan si se apartan del default: así la llamada por defecto también
 * resuelve contra la firma vieja `(uuid, date)`.
 */
export function receiveOrderArgs(
  orderId: string,
  issueDate: string,
  options: ReceivePurchaseOrderOptions = {},
): { p_order_id: string; p_issue_date: string; p_status?: ReceivedPurchaseStatus; p_tax_rate?: number } {
  const args: ReturnType<typeof receiveOrderArgs> = { p_order_id: orderId, p_issue_date: issueDate };
  if (options.status && options.status !== "paid") args.p_status = options.status;
  if (options.taxRate && options.taxRate > 0) args.p_tax_rate = options.taxRate;
  return args;
}

/**
 * Recibe el pedido: crea su factura de compra (stock, costo, totales) y lo marca
 * recibido, TODO en la RPC `receive_purchase_order`, en una transacción con el
 * pedido bloqueado.
 *
 * Antes eran dos llamadas desde el navegador —crear la compra y después marcar
 * el pedido— y la segunda no miraba cuántas filas cambiaba: doble clic, dos
 * pestañas o un reintento creaban dos compras (stock y gasto duplicados). Ahora
 * la segunda llamada devuelve la compra que ya existe (`alreadyReceived`).
 *
 * `options` elige el estado (pagada/pendiente) y el IVA de la compra; antes
 * siempre quedaba pagada y sin IVA.
 *
 * Si la base no conoce la firma (PGRST202: no se ejecutó nada) cae al camino
 * viejo, que SÍ respeta estado e IVA. No se reintenta con la firma vieja de la
 * RPC sin las opciones: eso registraría en silencio una compra pagada sin IVA.
 * Sin opciones, la llamada ya coincide con la firma vieja `(uuid, date)`.
 */
export async function receivePurchaseOrder(
  order: PurchaseOrder,
  options: ReceivePurchaseOrderOptions = {},
): Promise<ReceivePurchaseOrderResult> {
  if (!order.distributor_id) {
    throw new Error("Asigna un proveedor al pedido antes de recibirlo.");
  }

  const supabase = createClient();
  // Día local: la base corre en UTC y fecharía la recepción de la tarde en el
  // día siguiente.
  const args = receiveOrderArgs(order.id, todayISO(), options);
  const { data, error } = await supabase.rpc("receive_purchase_order", args);

  if (error) {
    if (!isUnknownSignatureError(error)) throw error;
    return { invoiceId: await legacyReceivePurchaseOrder(order, options), alreadyReceived: false };
  }

  const result = (data ?? {}) as { invoice_id?: string; already_received?: boolean };
  if (!result.invoice_id) throw new Error("No se pudo registrar la compra del pedido.");
  return { invoiceId: result.invoice_id, alreadyReceived: result.already_received === true };
}

/** Camino viejo (dos llamadas): solo si la base no tiene `receive_purchase_order`. */
async function legacyReceivePurchaseOrder(
  order: PurchaseOrder,
  options: ReceivePurchaseOrderOptions,
): Promise<string> {
  const invoice = await createPurchaseInvoice({
    distributor_id: order.distributor_id as string,
    issue_date: todayISO(),
    supplier_invoice_number: `PED-${order.order_number}`,
    status: options.status ?? "paid",
    tax_rate: options.taxRate ?? 0,
    items: order.items
      .filter((item) => item.product_id !== null)
      .map((item) => {
        // Cajas + sueltas, igual que la RPC: `unit_price` es costo de CAJA.
        const b = orderLineBreakdown(item);
        return {
          product_id: item.product_id as string,
          description: item.product_name,
          package_quantity: b.packages,
          loose_quantity: b.looseUnits,
          unit_price: b.looseUnitPrice,
          package_price: b.packagePrice,
          units_per_package: b.unitsPerPackage,
        };
      }),
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
