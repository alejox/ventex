import { createClient } from "@/utils/supabase/client";

// ---- Tipos del dominio de facturación ----
export type InvoiceType = "factura" | "cotizacion";
export type InvoiceStatus = "pending" | "paid" | "cancelled";

export interface Invoice {
  id: string;
  invoice_number: number;
  customer_id: string | null;
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
  customers: { full_name: string } | null;
}

export interface InvoiceItem {
  id: string;
  description: string;
  quantity: number;
  unit_price: number;
  line_total: number;
  service_id: string | null;
}

/** Línea del formulario (campos en string tal como llegan del form). */
export interface InvoiceLineInput {
  service_id: string | null;
  description: string;
  quantity: string;
  unit_price: string;
}

export interface NewInvoiceInput {
  type: InvoiceType;
  customer_id: string | null;
  issue_date: string;
  due_date: string;
  discount_amount: string;
  tax_rate: string; // porcentaje, p.ej. "16"
  notes: string;
  items: InvoiceLineInput[];
}

const SELECT =
  "id, invoice_number, customer_id, type, status, issue_date, due_date, subtotal, discount_amount, tax_rate, tax_amount, total, notes, created_at, customers(full_name)";

const one = <T>(embed: unknown): T | null =>
  Array.isArray(embed) ? ((embed[0] as T) ?? null) : ((embed as T) ?? null);

const round2 = (n: number) => Math.round(n * 100) / 100;

export async function fetchInvoices(): Promise<Invoice[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("invoices")
    .select(SELECT)
    .neq("type", "compra")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((i) => ({
    ...i,
    customers: one<{ full_name: string }>(i.customers),
  })) as Invoice[];
}

export async function fetchInvoiceItems(invoiceId: string): Promise<InvoiceItem[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("invoice_items")
    .select("id, description, quantity, unit_price, line_total, service_id")
    .eq("invoice_id", invoiceId)
    .order("created_at");
  if (error) throw error;
  return (data ?? []) as InvoiceItem[];
}

/**
 * Crea una factura/cotización con sus líneas. Calcula los totales en el
 * servicio (no confía en el cliente). El user_id lo fija el trigger/DEFAULT.
 */
export async function createInvoice(input: NewInvoiceInput): Promise<Invoice> {
  const supabase = createClient();

  const lines = input.items
    .filter((l) => l.description.trim() !== "")
    .map((l) => {
      const quantity = parseFloat(l.quantity) || 0;
      const unit_price = parseFloat(l.unit_price) || 0;
      return {
        service_id: l.service_id || null,
        description: l.description.trim(),
        quantity,
        unit_price,
        line_total: round2(quantity * unit_price),
      };
    });
  if (lines.length === 0) throw new Error("Añade al menos una línea con descripción");

  const subtotal = round2(lines.reduce((acc, l) => acc + l.line_total, 0));
  const discount_amount = round2(parseFloat(input.discount_amount) || 0);
  const tax_rate = (parseFloat(input.tax_rate) || 0) / 100;
  const taxable = Math.max(subtotal - discount_amount, 0);
  const tax_amount = round2(taxable * tax_rate);
  const total = round2(taxable + tax_amount);

  const { data: invoice, error } = await supabase
    .from("invoices")
    .insert({
      type: input.type,
      customer_id: input.customer_id || null,
      issue_date: input.issue_date,
      due_date: input.due_date || null,
      subtotal,
      discount_amount,
      tax_rate,
      tax_amount,
      total,
      notes: input.notes || null,
    })
    .select(SELECT)
    .single();
  if (error) throw error;

  const inv = invoice as unknown as Invoice & { id: string };
  const { error: itemsError } = await supabase
    .from("invoice_items")
    .insert(lines.map((l) => ({ ...l, invoice_id: inv.id })));
  if (itemsError) throw itemsError;

  return { ...inv, customers: one<{ full_name: string }>((invoice as { customers: unknown }).customers) } as Invoice;
}

export async function updateInvoiceStatus(id: string, status: InvoiceStatus): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("invoices").update({ status }).eq("id", id);
  if (error) throw error;
}
