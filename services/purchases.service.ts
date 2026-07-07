import { createClient } from "@/utils/supabase/client";

export interface PurchaseInvoice {
  id: string;
  invoice_number: number;
  supplier_invoice_number: string | null;
  distributor_id: string | null;
  type: string;
  status: string;
  issue_date: string;
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
  quantity: number;
  unit_price: number;
  line_total: number;
  products?: { name: string; sku: string } | null;
}

export interface PurchaseLineInput {
  product_id: string;
  description: string;
  quantity: number;
  unit_price: number;
}

export interface PurchaseInvoiceParams {
  distributor_id: string;
  issue_date: string;
  supplier_invoice_number: string;
  status: string;
  items: PurchaseLineInput[];
  tax_rate?: number;
  discount_amount?: number;
}

const INVOICE_SELECT = `
  id, invoice_number, supplier_invoice_number, distributor_id, type, status, issue_date,
  subtotal, discount_amount, tax_rate, tax_amount, total, notes, created_at,
  distributors(business_name)
`;

const ITEM_SELECT = `
  id, invoice_id, product_id, description, quantity, unit_price, line_total,
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
  const subtotal = params.items.reduce((s, i) => s + i.quantity * i.unit_price, 0);
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
    quantity: i.quantity,
    unit_price: i.unit_price,
    line_total: i.quantity * i.unit_price,
  }));

  const { error: itemsErr } = await supabase
    .from("invoice_items")
    .insert(lines);

  if (itemsErr) throw itemsErr;

  for (const item of params.items) {
    await supabase.rpc("increment_stock", {
      p_product_id: item.product_id,
      p_quantity: item.quantity,
    });
  }

  const invoiceNumber = raw.invoice_number as number;
  const movements = params.items.map((item) => ({
    product_id: item.product_id,
    type: "in" as const,
    quantity: item.quantity,
    reference_type: "purchase",
    reference_id: invoiceId,
    notes: `Compra #${invoiceNumber}`,
  }));
  await supabase.from("inventory_movements" as never).insert(movements as never);

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
  const subtotal = params.items.reduce((s, i) => s + i.quantity * i.unit_price, 0);
  const taxAmount = Math.round(subtotal * taxRate * 100) / 100;
  const total = subtotal + taxAmount - discountAmount;

  const { data: invoice, error: invErr } = await supabase
    .from("invoices")
    .update({
      distributor_id: params.distributor_id,
      supplier_invoice_number: params.supplier_invoice_number || null,
      issue_date: params.issue_date,
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

  const { error: delErr } = await supabase
    .from("invoice_items")
    .delete()
    .eq("invoice_id", id);
  if (delErr) throw delErr;

  if (params.items.length > 0) {
    const lines = params.items.map((i) => ({
      invoice_id: id,
      product_id: i.product_id,
      description: i.description,
      quantity: i.quantity,
      unit_price: i.unit_price,
      line_total: i.quantity * i.unit_price,
    }));

    const { error: itemsErr } = await supabase
      .from("invoice_items")
      .insert(lines);
    if (itemsErr) throw itemsErr;
  }

  return toInvoice(raw);
}

export async function cancelPurchaseInvoice(id: string, items: { product_id: string; quantity: number }[]): Promise<void> {
  const supabase = createClient();

  const { error } = await supabase.from("invoices").update({ status: "cancelled" }).eq("id", id);
  if (error) throw error;

  for (const item of items) {
    await supabase.rpc("increment_stock", {
      p_product_id: item.product_id,
      p_quantity: -item.quantity,
    });
  }

  const movements = items.map((item) => ({
    product_id: item.product_id,
    type: "out" as const,
    quantity: item.quantity,
    reference_type: "cancellation",
    reference_id: id,
    notes: `Anulación de compra #${id.slice(0, 8)}`,
  }));
  await supabase.from("inventory_movements" as never).insert(movements as never);
}

export async function fetchLastPurchaseFromDistributor(distributorId: string): Promise<{ items: { product_id: string; product_name: string; quantity: number; unit_price: number }[] } | null> {
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
    .select(`product_id, description, quantity, unit_price, products(name)`)
    .eq("invoice_id", invoice.id);

  if (itemsErr) throw itemsErr;

  return {
    items: (items ?? []).map((i: Record<string, unknown>) => ({
      product_id: i.product_id as string,
      product_name: ((i.products as Record<string, unknown>)?.["name"] as string) ?? i.description as string,
      quantity: i.quantity as number,
      unit_price: i.unit_price as number,
    })),
  };
}
