import { createClient } from "@/utils/supabase/client";
import { purchaseTotalsOf } from "@/lib/purchase-totals";
import { isUnknownSignatureError } from "@/lib/sale-discounts";

export interface PurchaseInvoice {
  id: string;
  invoice_number: number;
  supplier_invoice_number: string | null;
  distributor_id: string | null;
  type: string;
  status: string;
  issue_date: string;
  due_date: string | null;
  subtotal: number;
  discount_amount: number;
  tax_rate: number;
  tax_amount: number;
  total: number;
  notes: string | null;
  created_at: string;
  distributors: { business_name: string } | null;
  /** Quién la cargó. Null en compras históricas, previas a esta columna. */
  created_by: string | null;
  /** Nombre del responsable. Llega null si la RLS de profiles no deja verlo. */
  creator: { full_name: string | null } | null;
  invoice_items?: PurchaseInvoiceItem[];
}

export interface PurchaseInvoiceItem {
  id: string;
  invoice_id: string;
  product_id: string | null;
  description: string;
  /** TOTAL en unidades sueltas: cajas × unidades por caja + sueltas. */
  quantity: number;
  /** Cajas tipeadas. Las sueltas se derivan con `looseUnitsOf`. */
  package_quantity: number;
  /** Costo de UNA unidad suelta. */
  unit_price: number;
  /** Costo de UNA caja. Independiente de `unit_price`. */
  package_price: number;
  line_total: number;
  /** Unidades por caja congeladas al comprar. */
  units_per_package: number;
  products?: { name: string; sku: string } | null;
}

/**
 * Una línea tal como se carga en el formulario: cajas y sueltas por separado.
 *
 * El servicio deriva de acá el `quantity` canónico; quien llama no tiene que
 * saber la cuenta.
 */
interface PurchaseLineInput {
  product_id: string;
  description: string;
  /** Cajas recibidas. 0 si el producto no viene por caja. */
  package_quantity: number;
  /** Unidades sueltas recibidas, además de las cajas. */
  loose_quantity: number;
  /** Costo de UNA unidad suelta. */
  unit_price: number;
  /** Costo de UNA caja. */
  package_price: number;
  units_per_package: number;
}

const perPackage = (units: number) => Math.max(units || 1, 1);

/**
 * Unidades sueltas que mueve una línea del formulario.
 *
 * Es la ÚNICA cuenta que puede tocar el stock: `increment_stock` suma su
 * argumento tal cual —no multiplica, a diferencia de
 * `register_manual_movement`—, así que pasarle las cajas sumaría 3 en vez de 40.
 */
export function totalUnitsOf(line: {
  package_quantity: number;
  loose_quantity: number;
  units_per_package: number;
}): number {
  return line.package_quantity * perPackage(line.units_per_package) + line.loose_quantity;
}

/** Las sueltas de una línea YA guardada, que solo persiste el total y las cajas. */
export function looseUnitsOf(item: {
  quantity: number;
  package_quantity: number;
  units_per_package: number;
}): number {
  return item.quantity - item.package_quantity * perPackage(item.units_per_package);
}

/**
 * Plata de la línea: cada cantidad con SU precio.
 *
 * No se deriva uno del otro. El proveedor cobra la caja a un precio y la unidad
 * suelta a otro —suelto sale más caro—, así que multiplicar o dividir por
 * `units_per_package` inventaría un número que nadie facturó.
 */
export function lineTotalOf(line: {
  package_quantity: number;
  loose_quantity: number;
  unit_price: number;
  package_price: number;
}): number {
  const total = line.package_quantity * line.package_price + line.loose_quantity * line.unit_price;
  return Math.round(total * 100) / 100;
}

export interface PurchaseInvoiceParams {
  distributor_id: string;
  issue_date: string;
  supplier_invoice_number: string;
  status: string;
  items: PurchaseLineInput[];
  tax_rate?: number;
  discount_amount?: number;
  due_date?: string;
  notes?: string;
}

const INVOICE_SELECT = `
  id, invoice_number, supplier_invoice_number, distributor_id, type, status, issue_date, due_date,
  subtotal, discount_amount, tax_rate, tax_amount, total, notes, created_at, created_by,
  distributors(business_name),
  creator:profiles!created_by(full_name)
`;

const ITEM_SELECT = `
  id, invoice_id, product_id, description, quantity, package_quantity,
  unit_price, package_price, line_total, units_per_package,
  products(name, sku)
`;

type RawInvoice = Record<string, unknown>;
type RawDistributorsEmbed = { business_name: string } | { business_name: string }[];
type RawCreatorEmbed = { full_name: string | null } | { full_name: string | null }[];

const one = <T,>(embed: unknown): T | null => {
  if (Array.isArray(embed)) return (embed[0] as T) ?? null;
  return (embed as T) ?? null;
};

const toInvoice = (r: RawInvoice): PurchaseInvoice => ({
  id: r.id as string,
  invoice_number: r.invoice_number as number,
  supplier_invoice_number: r.supplier_invoice_number as string | null,
  distributor_id: r.distributor_id as string | null,
  type: r.type as string,
  status: r.status as string,
  issue_date: r.issue_date as string,
  due_date: (r.due_date as string | null) ?? null,
  subtotal: r.subtotal as number,
  discount_amount: r.discount_amount as number,
  tax_rate: r.tax_rate as number,
  tax_amount: r.tax_amount as number,
  total: r.total as number,
  notes: r.notes as string | null,
  created_at: r.created_at as string,
  distributors: one<{ business_name: string }>(r.distributors as RawDistributorsEmbed | null),
  created_by: (r.created_by as string | null) ?? null,
  creator: one<{ full_name: string | null }>(r.creator as RawCreatorEmbed | null),
});

export async function fetchPurchaseInvoices(): Promise<PurchaseInvoice[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("invoices")
    .select(INVOICE_SELECT)
    .eq("type", "compra")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(toInvoice);
}

/**
 * Una factura sola, para la pantalla de edición.
 *
 * El listado vive en el store, pero entrar por URL directa a
 * `/dashboard/purchases/<id>/edit` (o recargar) no pasa por el listado, así que
 * la pantalla tiene que poder resolverse sola.
 */
export async function fetchPurchaseInvoice(id: string): Promise<PurchaseInvoice | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("invoices")
    .select(INVOICE_SELECT)
    .eq("id", id)
    .eq("type", "compra")
    .maybeSingle();
  if (error) throw error;
  return data ? toInvoice(data as unknown as RawInvoice) : null;
}

export async function fetchPurchaseInvoiceItems(invoiceId: string): Promise<PurchaseInvoiceItem[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("invoice_items")
    .select(ITEM_SELECT)
    .eq("invoice_id", invoiceId)
    .order("created_at");
  if (error) throw error;
  return (data ?? []) as unknown as PurchaseInvoiceItem[];
}

/**
 * Exige y normaliza el N° de factura del proveedor: obligatorio, sin espacios
 * al borde y en MAYÚSCULAS.
 *
 * Es lo único que ata la compra al papel que emitió el proveedor: sin él, dos
 * compras al mismo proveedor por el mismo monto son indistinguibles y no se
 * puede detectar que se cargó dos veces. El `invoice_number` no cubre eso: lo
 * genera Ventex, no el proveedor.
 *
 * La mayúscula va acá y no solo en el formulario porque este es el único punto
 * por el que pasan las dos escrituras (alta y edición) y también los pedidos
 * convertidos en compra. Normalizando solo en la UI, la base termina con
 * "a-123" y "A-123" conviviendo: dos filas que para cualquier comparación
 * —hoy a ojo, mañana un índice único— son números distintos, cuando para el
 * proveedor son el mismo papel. Hoy NO hay chequeo automático de duplicados ni
 * índice único sobre esta columna; esto deja el dato listo para cuando lo haya.
 *
 * `toUpperCase()` y no `toLocaleUpperCase()`: un N° de factura es alfanumérico,
 * no texto de un idioma, y así el resultado no depende de la configuración
 * regional de quien lo carga.
 */
function requireSupplierNumber(value: string): string {
  const trimmed = value.trim().toUpperCase();
  if (!trimmed) throw new Error("Ingresa el N° de factura del proveedor.");
  return trimmed;
}

/** Las líneas tal como las recibe la base: `quantity` es el TOTAL en sueltas. */
function toRpcItems(items: PurchaseLineInput[]) {
  return items.map((i) => ({
    product_id: i.product_id,
    description: i.description,
    // `quantity` es el TOTAL en unidades sueltas; las cajas quedan aparte para
    // poder reabrir la compra tal cual se cargó.
    quantity: totalUnitsOf(i),
    package_quantity: i.package_quantity,
    unit_price: i.unit_price,
    package_price: i.package_price,
    // La base lo recalcula; se manda igual para la RPC vieja (fallback).
    line_total: lineTotalOf(i),
    units_per_package: i.units_per_package,
  }));
}

/** Totales con la misma cuenta que la base (IVA sobre subtotal − descuento). */
function totalsFor(params: PurchaseInvoiceParams) {
  const subtotal = params.items.reduce((s, i) => s + lineTotalOf(i), 0);
  return purchaseTotalsOf(subtotal, params.discount_amount ?? 0, params.tax_rate ?? 0);
}

/**
 * Alta (`id` null) o edición de una compra en UNA transacción:
 * `save_purchase_invoice` escribe cabecera, líneas, stock, historial, totales
 * (calculados en la base desde las líneas) y el último costo de cada producto.
 *
 * Antes eran dos llamadas HTTP —cabecera y líneas— con totales calculados en
 * el navegador: un fallo entre ambas dejaba la factura describiendo líneas que
 * no tenía. Si la base todavía no tiene la RPC (PGRST202, no se ejecutó nada)
 * cae al camino viejo, que sigue funcionando.
 */
export async function savePurchaseInvoice(
  id: string | null,
  params: PurchaseInvoiceParams,
): Promise<PurchaseInvoice> {
  const supabase = createClient();
  const supplierNumber = requireSupplierNumber(params.supplier_invoice_number);

  const { data, error } = await supabase.rpc("save_purchase_invoice", {
    // null = alta; los tipos generados no marcan args nulables.
    p_invoice_id: id as string,
    p_header: {
      distributor_id: params.distributor_id,
      supplier_invoice_number: supplierNumber,
      status: params.status,
      issue_date: params.issue_date,
      due_date: params.due_date || null,
      notes: params.notes || null,
      discount_amount: params.discount_amount ?? 0,
      tax_rate: params.tax_rate ?? 0,
    },
    p_items: toRpcItems(params.items),
  });

  if (error) {
    if (!isUnknownSignatureError(error)) throw error;
    return id ? legacyUpdatePurchaseInvoice(id, params) : legacyCreatePurchaseInvoice(params);
  }

  const saved = await fetchPurchaseInvoice(data as string);
  if (!saved) throw new Error("La compra se guardó, pero no pudimos volver a leerla. Recarga la página.");
  return saved;
}

export const createPurchaseInvoice = (params: PurchaseInvoiceParams) => savePurchaseInvoice(null, params);

export const updatePurchaseInvoice = (id: string, params: PurchaseInvoiceParams) =>
  savePurchaseInvoice(id, params);

/** Camino viejo del alta: solo si la base no tiene `save_purchase_invoice`. */
async function legacyCreatePurchaseInvoice(params: PurchaseInvoiceParams): Promise<PurchaseInvoice> {
  const supabase = createClient();

  const supplierNumber = requireSupplierNumber(params.supplier_invoice_number);
  const { subtotal, taxAmount, total } = totalsFor(params);

  const { data: invoice, error: invErr } = await supabase
    .from("invoices")
    .insert({
      distributor_id: params.distributor_id,
      supplier_invoice_number: supplierNumber,
      type: "compra",
      status: params.status,
      issue_date: params.issue_date,
      due_date: params.due_date || null,
      notes: params.notes || null,
      subtotal,
      discount_amount: params.discount_amount ?? 0,
      tax_rate: params.tax_rate ?? 0,
      tax_amount: taxAmount,
      total,
    })
    .select(INVOICE_SELECT)
    .single();

  if (invErr) throw invErr;

  const raw = invoice as unknown as RawInvoice;
  const invoiceId = raw.id as string;

  const { error: itemsErr } = await supabase.rpc("replace_purchase_invoice_items", {
    p_invoice_id: invoiceId,
    p_items: toRpcItems(params.items),
  });

  // La cabecera se insertó en una llamada aparte, así que hay que compensarla a
  // mano: sin esto la factura sobrevive sin líneas.
  if (itemsErr) {
    await supabase.from("invoices").delete().eq("id", invoiceId);
    throw itemsErr;
  }

  return toInvoice(raw);
}

/**
 * Cambia el estado de una compra entre los estados que NO mueven inventario.
 *
 * "Anulada" queda fuera a propósito: es la única transición que además devuelve
 * el stock, y por acá pasaba como un `update` de la columna nada más — la
 * factura quedaba anulada con el stock todavía sumado. Para eso está
 * `cancelPurchaseInvoice`, y es un camino de ida.
 */
export async function updateInvoiceStatus(id: string, status: string): Promise<void> {
  if (status === "cancelled") {
    throw new Error("Para anular una compra usa la acción Anular: hay que devolver el stock.");
  }

  const supabase = createClient();
  const { error } = await supabase
    .from("invoices")
    .update({ status })
    .eq("id", id)
    .neq("status", "cancelled");
  if (error) throw error;
}

/** Camino viejo de la edición: solo si la base no tiene `save_purchase_invoice`. */
async function legacyUpdatePurchaseInvoice(
  id: string,
  params: PurchaseInvoiceParams
): Promise<PurchaseInvoice> {
  const supabase = createClient();

  const supplierNumber = requireSupplierNumber(params.supplier_invoice_number);
  const { subtotal, taxAmount, total } = totalsFor(params);

  // Las LÍNEAS van primero: la RPC es la que valida y mueve inventario, así que
  // si rechaza no se tocó nada.
  const { error: itemsErr } = await supabase.rpc("replace_purchase_invoice_items", {
    p_invoice_id: id,
    p_items: toRpcItems(params.items),
  });
  if (itemsErr) throw itemsErr;

  const { data: invoice, error: invErr } = await supabase
    .from("invoices")
    .update({
      distributor_id: params.distributor_id,
      supplier_invoice_number: supplierNumber,
      issue_date: params.issue_date,
      due_date: params.due_date || null,
      notes: params.notes || null,
      status: params.status,
      subtotal,
      discount_amount: params.discount_amount ?? 0,
      tax_rate: params.tax_rate ?? 0,
      tax_amount: taxAmount,
      total,
    })
    .eq("id", id)
    .neq("status", "cancelled")
    .select(INVOICE_SELECT)
    .single();

  if (invErr) throw invErr;

  return toInvoice(invoice as unknown as RawInvoice);
}

/**
 * Anula una compra y devuelve el stock que había sumado.
 *
 * Todo el trabajo vive en la RPC, en una sola transacción: marca la factura,
 * descuenta el stock y escribe el historial. Si algo falla, no pasó nada.
 *
 * Antes eran tres pasos desde el navegador y el del medio —el bucle que devuelve
 * el stock— no miraba el error. Una devolución fallida dejaba igual la factura
 * anulada y el movimiento escrito: el historial afirmaba haber devuelto stock
 * que nunca volvió.
 *
 * La RPC también lee sus propias líneas en vez de recibirlas: la devolución
 * tiene que ser exactamente el `quantity` guardado —que ya está en unidades
 * sueltas—, y dejar que el llamador arme ese arreglo abría la puerta a devolver
 * 3 donde se habían sumado 40.
 */
export async function cancelPurchaseInvoice(id: string): Promise<void> {
  const supabase = createClient();

  const { error } = await supabase.rpc("cancel_purchase_invoice", {
    p_invoice_id: id,
  });
  if (error) throw error;
}

export async function fetchLastPurchaseFromDistributor(distributorId: string): Promise<{
  items: {
    product_id: string;
    product_name: string;
    package_quantity: number;
    loose_quantity: number;
    unit_price: number;
    package_price: number;
    units_per_package: number;
  }[];
} | null> {
  const supabase = createClient();

  const { data: invoices, error } = await supabase
    .from("invoices")
    .select(`id, invoice_number`)
    .eq("distributor_id", distributorId)
    .eq("type", "compra")
    .neq("status", "cancelled")
    .order("created_at", { ascending: false })
    .limit(1);

  if (error) throw error;
  if (!invoices || invoices.length === 0) return null;

  const invoice = invoices[0] as { id: string; invoice_number: number };

  const { data: items, error: itemsErr } = await supabase
    .from("invoice_items")
    .select(`product_id, description, quantity, package_quantity, unit_price, package_price, units_per_package, products(name)`)
    .eq("invoice_id", invoice.id);

  if (itemsErr) throw itemsErr;

  return {
    items: (items ?? []).map((i: Record<string, unknown>) => {
      const stored = {
        quantity: (i.quantity as number) ?? 0,
        package_quantity: (i.package_quantity as number) ?? 0,
        units_per_package: (i.units_per_package as number) ?? 1,
      };
      return {
        product_id: i.product_id as string,
        product_name: ((i.products as Record<string, unknown>)?.["name"] as string) ?? (i.description as string),
        package_quantity: stored.package_quantity,
        loose_quantity: looseUnitsOf(stored),
        unit_price: (i.unit_price as number) ?? 0,
        package_price: (i.package_price as number) ?? 0,
        units_per_package: stored.units_per_package,
      };
    }),
  };
}
