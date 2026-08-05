import { createClient } from "@/utils/supabase/client";

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
export interface PurchaseLineInput {
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
  subtotal, discount_amount, tax_rate, tax_amount, total, notes, created_at,
  distributors(business_name)
`;

const ITEM_SELECT = `
  id, invoice_id, product_id, description, quantity, package_quantity,
  unit_price, package_price, line_total, units_per_package,
  products(name, sku)
`;

type RawInvoice = Record<string, unknown>;
type RawDistributorsEmbed = { business_name: string } | { business_name: string }[];

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

export async function createPurchaseInvoice(params: PurchaseInvoiceParams): Promise<PurchaseInvoice> {
  const supabase = createClient();

  const taxRate = params.tax_rate ?? 0;
  const discountAmount = params.discount_amount ?? 0;
  const subtotal = params.items.reduce((s, i) => s + lineTotalOf(i), 0);
  const taxAmount = Math.round(subtotal * taxRate * 100) / 100;
  const total = subtotal + taxAmount - discountAmount;

  const { data: invoice, error: invErr } = await supabase
    .from("invoices")
    .insert({
      distributor_id: params.distributor_id,
      supplier_invoice_number: params.supplier_invoice_number || null,
      type: "compra",
      status: params.status,
      issue_date: params.issue_date,
      due_date: params.due_date || null,
      notes: params.notes || null,
      subtotal,
      discount_amount: discountAmount,
      tax_rate: taxRate,
      tax_amount: taxAmount,
      total,
    })
    .select(INVOICE_SELECT)
    .single();

  if (invErr) throw invErr;

  const raw = invoice as unknown as RawInvoice;
  const invoiceId = raw.id as string;

  const lines = params.items.map((i) => ({
    invoice_id: invoiceId,
    product_id: i.product_id,
    description: i.description,
    // `quantity` es el TOTAL en unidades sueltas; las cajas quedan aparte para
    // poder reabrir la compra tal cual se cargó.
    quantity: totalUnitsOf(i),
    package_quantity: i.package_quantity,
    unit_price: i.unit_price,
    package_price: i.package_price,
    line_total: lineTotalOf(i),
    units_per_package: i.units_per_package,
  }));

  const { error: itemsErr } = await supabase
    .from("invoice_items")
    .insert(lines);

  // Sin esto la factura sobrevive sin líneas: totales cargados y cero productos,
  // que es como se ve una compra rota en el listado.
  if (itemsErr) {
    await supabase.from("invoices").delete().eq("id", invoiceId);
    throw itemsErr;
  }

  for (const item of params.items) {
    await supabase.rpc("increment_stock", {
      p_product_id: item.product_id,
      p_quantity: totalUnitsOf(item),
    });
  }

  const invoiceNumber = raw.invoice_number as number;
  // El movimiento va en unidades sueltas, igual que el delta de stock: guardar
  // cajas acá dejaría el historial diciendo "entraron 3" cuando entraron 40.
  const movements = params.items.map((item) => ({
    product_id: item.product_id,
    type: "in" as const,
    quantity: totalUnitsOf(item),
    reference_type: "purchase",
    reference_id: invoiceId,
    notes: `Compra #${invoiceNumber}`,
  }));
  await supabase.from("inventory_movements").insert(movements);

  return toInvoice(raw);
}

export async function updateInvoiceStatus(id: string, status: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("invoices").update({ status }).eq("id", id);
  if (error) throw error;
}

export async function updatePurchaseInvoice(
  id: string,
  params: PurchaseInvoiceParams
): Promise<PurchaseInvoice> {
  const supabase = createClient();

  const taxRate = params.tax_rate ?? 0;
  const discountAmount = params.discount_amount ?? 0;
  const subtotal = params.items.reduce((s, i) => s + lineTotalOf(i), 0);
  const taxAmount = Math.round(subtotal * taxRate * 100) / 100;
  const total = subtotal + taxAmount - discountAmount;

  const { data: invoice, error: invErr } = await supabase
    .from("invoices")
    .update({
      distributor_id: params.distributor_id,
      supplier_invoice_number: params.supplier_invoice_number || null,
      issue_date: params.issue_date,
      due_date: params.due_date || null,
      notes: params.notes || null,
      status: params.status,
      subtotal,
      discount_amount: discountAmount,
      tax_rate: taxRate,
      tax_amount: taxAmount,
      total,
    })
    .eq("id", id)
    .select(INVOICE_SELECT)
    .single();

  if (invErr) throw invErr;

  const raw = invoice as unknown as RawInvoice;

  // Borrar e insertar por separado desde acá dejaba la factura SIN líneas cuando
  // el insert fallaba: el delete ya se había aplicado y no hay transacción entre
  // dos llamadas. La RPC hace las dos cosas en una sola.
  const { error: itemsErr } = await supabase.rpc("replace_purchase_invoice_items", {
    p_invoice_id: id,
    p_items: params.items.map((i) => ({
      product_id: i.product_id,
      description: i.description,
      quantity: totalUnitsOf(i),
      package_quantity: i.package_quantity,
      unit_price: i.unit_price,
      package_price: i.package_price,
      line_total: lineTotalOf(i),
      units_per_package: i.units_per_package,
    })),
  });
  if (itemsErr) throw itemsErr;

  return toInvoice(raw);
}

/**
 * Anula una compra y devuelve el stock que había sumado.
 *
 * Lee sus propias líneas en vez de recibirlas: la devolución tiene que ser
 * exactamente el `quantity` guardado —que ya está en unidades sueltas—, y dejar
 * que el llamador arme ese arreglo abría la puerta a devolver 3 donde se habían
 * sumado 40.
 */
export async function cancelPurchaseInvoice(id: string): Promise<void> {
  const supabase = createClient();

  const items = await fetchPurchaseInvoiceItems(id);

  const { error } = await supabase.from("invoices").update({ status: "cancelled" }).eq("id", id);
  if (error) throw error;

  for (const item of items) {
    if (!item.product_id) continue;
    await supabase.rpc("increment_stock", {
      p_product_id: item.product_id,
      p_quantity: -item.quantity,
    });
  }

  const movements = items.flatMap((item) =>
    item.product_id
      ? [{
          product_id: item.product_id,
          type: "out" as const,
          quantity: item.quantity,
          reference_type: "cancellation",
          reference_id: id,
          notes: `Anulación de compra #${id.slice(0, 8)}`,
        }]
      : []
  );
  if (movements.length > 0) {
    await supabase.from("inventory_movements").insert(movements);
  }
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
