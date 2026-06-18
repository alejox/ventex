import { createClient } from "@/utils/supabase/client";

// ---- Tipos del dominio del POS ----
export interface CatalogProduct {
  id: string;
  name: string;
  sku: string;
  price: number;
  stock_level: number;
  category_id: string | null;
  category_name: string | null;
}

export interface CustomerOption {
  id: string;
  full_name: string;
  tax_exempt: boolean;
}

export interface CartLine {
  product: CatalogProduct;
  quantity: number;
}

export interface SaleTotals {
  subtotal: number;
  taxAmount: number;
  total: number;
}

export type PaymentMethod = "efectivo" | "tarjeta" | "transferencia";

export interface CheckoutInput {
  customerId: string | null;
  paymentMethod: PaymentMethod;
  discount: number;
  items: { product_id: string; quantity: number }[];
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Calcula los totales en el cliente para previsualización.
 * Refleja la misma lógica que la RPC `create_sale` (la autoridad final es el servidor):
 * impuesto sobre (subtotal - descuento), 0% si el cliente es exento.
 */
export function computeTotals(
  lines: CartLine[],
  taxRate: number,
  taxExempt: boolean,
  discount: number,
): SaleTotals {
  const subtotal = round2(lines.reduce((s, l) => s + l.product.price * l.quantity, 0));
  const taxable = Math.max(subtotal - discount, 0);
  const taxAmount = round2(taxable * (taxExempt ? 0 : taxRate));
  const total = round2(taxable + taxAmount);
  return { subtotal, taxAmount, total };
}

export async function fetchCatalog(): Promise<CatalogProduct[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("products")
    .select("id, name, sku, price, stock_level, category_id, categories(name)")
    .order("name");
  if (error) throw error;
  return (data ?? []).map((p) => {
    // Supabase tipa el embed como array; en una relación to-one llega un objeto.
    const cat = p.categories as unknown as { name: string } | { name: string }[] | null;
    const category_name = Array.isArray(cat) ? (cat[0]?.name ?? null) : (cat?.name ?? null);
    return {
      id: p.id,
      name: p.name,
      sku: p.sku,
      price: p.price,
      stock_level: p.stock_level,
      category_id: p.category_id,
      category_name,
    };
  });
}

export async function fetchCustomers(): Promise<CustomerOption[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("customers")
    .select("id, full_name, tax_exempt")
    .order("full_name");
  if (error) throw error;
  return (data ?? []).map((c) => ({
    id: c.id,
    full_name: c.full_name,
    tax_exempt: c.tax_exempt ?? false,
  }));
}

/** Tasa de IVA configurada en la cuenta (16% por defecto si no hay ajustes). */
export async function fetchTaxRate(): Promise<number> {
  const supabase = createClient();
  const { data, error } = await supabase.from("settings").select("tax_rate").maybeSingle();
  if (error) throw error;
  return data?.tax_rate ?? 0.16;
}

/** Registra la venta de forma transaccional vía RPC y devuelve el id de la venta. */
export async function createSale(input: CheckoutInput): Promise<string> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("create_sale", {
    p_customer_id: input.customerId,
    p_payment_method: input.paymentMethod,
    p_discount_amount: input.discount,
    p_items: input.items,
  });
  if (error) throw error;
  return data as string;
}
