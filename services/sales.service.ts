import { createClient } from "@/utils/supabase/client";

// ---- Tipos del dominio de ventas (lectura / historial) ----
export interface SaleListItem {
  id: string;
  sale_number: number;
  created_at: string;
  customer_name: string | null;
  payment_method: string;
  status: string;
  subtotal: number;
  discount_amount: number;
  tax_amount: number;
  total: number;
  item_count: number;
}

export interface SaleLine {
  id: string;
  product_name: string;
  sku: string | null;
  unit_price: number;
  quantity: number;
  line_total: number;
}

export interface SaleDetail extends Omit<SaleListItem, "item_count"> {
  tax_rate: number;
  items: SaleLine[];
}

// Supabase tipa los embeds como array; en relaciones to-one llega un objeto.
const one = <T,>(embed: unknown): T | null => {
  if (Array.isArray(embed)) return (embed[0] as T) ?? null;
  return (embed as T) ?? null;
};

const LIST_SELECT =
  "id, sale_number, created_at, payment_method, status, subtotal, discount_amount, tax_amount, total, customers(full_name), sale_items(count)";

const DETAIL_SELECT =
  "id, sale_number, created_at, payment_method, status, subtotal, discount_amount, tax_rate, tax_amount, total, customers(full_name), sale_items(id, product_name, sku, unit_price, quantity, line_total)";

export async function fetchSales(): Promise<SaleListItem[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("sales")
    .select(LIST_SELECT)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((s) => {
    const customer = one<{ full_name: string }>(s.customers);
    const count = one<{ count: number }>(s.sale_items);
    return {
      id: s.id,
      sale_number: s.sale_number,
      created_at: s.created_at,
      customer_name: customer?.full_name ?? null,
      payment_method: s.payment_method,
      status: s.status,
      subtotal: s.subtotal,
      discount_amount: s.discount_amount,
      tax_amount: s.tax_amount,
      total: s.total,
      item_count: count?.count ?? 0,
    };
  });
}

export async function fetchSaleDetail(saleId: string): Promise<SaleDetail> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("sales")
    .select(DETAIL_SELECT)
    .eq("id", saleId)
    .single();
  if (error) throw error;
  const customer = one<{ full_name: string }>(data.customers);
  const items = (Array.isArray(data.sale_items) ? data.sale_items : []) as SaleLine[];
  return {
    id: data.id,
    sale_number: data.sale_number,
    created_at: data.created_at,
    customer_name: customer?.full_name ?? null,
    payment_method: data.payment_method,
    status: data.status,
    subtotal: data.subtotal,
    discount_amount: data.discount_amount,
    tax_rate: data.tax_rate,
    tax_amount: data.tax_amount,
    total: data.total,
    items,
  };
}
