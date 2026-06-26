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

export async function createPurchaseInvoice(params: {
  distributor_id: string;
  issue_date: string;
  supplier_invoice_number: string;
  status: string;
  items: PurchaseLineInput[];
}): Promise<PurchaseInvoice> {
  const supabase = createClient();

  const subtotal = params.items.reduce((s, i) => s + i.quantity * i.unit_price, 0);

  const { data: invoice, error: invErr } = await supabase
    .from("invoices")
    .insert({
      distributor_id: params.distributor_id,
      supplier_invoice_number: params.supplier_invoice_number || null,
      type: "compra",
      status: params.status,
      issue_date: params.issue_date,
      subtotal,
      discount_amount: 0,
      tax_rate: 0,
      tax_amount: 0,
      total: subtotal,
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

  return toInvoice(raw);
}

export async function updateInvoiceStatus(id: string, status: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("invoices").update({ status }).eq("id", id);
  if (error) throw error;
}

export async function updatePurchaseInvoice(
  id: string,
  params: {
    distributor_id: string;
    issue_date: string;
    supplier_invoice_number: string;
    status: string;
    items: PurchaseLineInput[];
  }
): Promise<PurchaseInvoice> {
  const supabase = createClient();

  const subtotal = params.items.reduce((s, i) => s + i.quantity * i.unit_price, 0);

  const { data: invoice, error: invErr } = await supabase
    .from("invoices")
    .update({
      distributor_id: params.distributor_id,
      supplier_invoice_number: params.supplier_invoice_number || null,
      issue_date: params.issue_date,
      status: params.status,
      subtotal,
      discount_amount: 0,
      tax_rate: 0,
      tax_amount: 0,
      total: subtotal,
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
