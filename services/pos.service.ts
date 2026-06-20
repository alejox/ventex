import { createClient } from "@/utils/supabase/client";

// ---- Tipos del dominio del POS ----
/** Un ítem del catálogo: producto (con stock) o servicio (sin stock). */
export interface CatalogItem {
  id: string;
  kind: "product" | "service";
  name: string;
  sku: string | null;
  price: number;
  stock_level: number | null; // null para servicios
  category_name: string | null;
  image_url: string | null;
}

export interface CustomerOption {
  id: string;
  full_name: string;
  tax_exempt: boolean;
}

export interface StaffOption {
  id: string;
  full_name: string;
}

export interface CartLine {
  item: CatalogItem;
  quantity: number;
  discountAmount?: number;
}

export interface SaleTotals {
  subtotal: number;
  taxAmount: number;
  total: number;
}

export type PaymentMethod = "efectivo" | "tarjeta" | "transferencia";

/** Línea de venta: lleva product_id o service_id según el tipo de ítem. */
export interface CheckoutItem {
  product_id?: string;
  service_id?: string;
  quantity: number;
}

export interface CheckoutInput {
  customerId: string | null;
  staffId: string | null;
  paymentMethod: PaymentMethod;
  discount: number;
  items: CheckoutItem[];
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
  taxExempt: boolean
): SaleTotals {
  const subtotal = round2(lines.reduce((s, l) => s + l.item.price * l.quantity, 0));
  const totalDiscount = round2(lines.reduce((s, l) => s + (l.discountAmount || 0), 0));
  const taxable = Math.max(subtotal - totalDiscount, 0);
  const taxAmount = round2(taxable * (taxExempt ? 0 : taxRate));
  const total = round2(taxable + taxAmount);
  return { subtotal, taxAmount, total };
}

/** Catálogo del POS: productos (con stock) + servicios activos (sin stock). */
export async function fetchCatalog(): Promise<CatalogItem[]> {
  const supabase = createClient();
  const [productsRes, servicesRes] = await Promise.all([
    supabase
      .from("products")
      .select("id, name, sku, price, stock_level, image_url, categories(name)")
      .order("name"),
    supabase
      .from("services")
      .select("id, name, price")
      .eq("status", "active")
      .order("name"),
  ]);
  if (productsRes.error) throw productsRes.error;
  if (servicesRes.error) throw servicesRes.error;

  const products: CatalogItem[] = (productsRes.data ?? []).map((p) => {
    // Supabase tipa el embed como array; en una relación to-one llega un objeto.
    const cat = p.categories as unknown as { name: string } | { name: string }[] | null;
    const category_name = Array.isArray(cat) ? (cat[0]?.name ?? null) : (cat?.name ?? null);
    return {
      id: p.id,
      kind: "product" as const,
      name: p.name,
      sku: p.sku,
      price: p.price,
      stock_level: p.stock_level,
      category_name,
      image_url: p.image_url ?? null,
    };
  });

  const services: CatalogItem[] = (servicesRes.data ?? []).map((s) => ({
    id: s.id,
    kind: "service" as const,
    name: s.name,
    sku: null,
    price: s.price,
    stock_level: null,
    category_name: "Servicios",
    image_url: null,
  }));

  return [...products, ...services];
}

/** Miembros del equipo activos, para atribuir la venta (comisiones). */
export async function fetchStaff(): Promise<StaffOption[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("staff")
    .select("id, full_name")
    .eq("status", "active")
    .order("full_name");
  if (error) throw error;
  return (data ?? []) as StaffOption[];
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
    // El tipo generado no refleja que el parámetro acepta null (venta a cliente "De Paso").
    p_customer_id: input.customerId as string,
    p_payment_method: input.paymentMethod,
    p_discount_amount: input.discount,
    // El parámetro jsonb acepta líneas con product_id o service_id.
    p_items: input.items as unknown as never,
    p_staff_id: input.staffId ?? undefined,
  });
  if (error) throw error;
  return data as string;
}

export async function createCustomer(name: string): Promise<CustomerOption> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("customers")
    .insert({ full_name: name, tax_exempt: false })
    .select("id, full_name, tax_exempt")
    .single();
  if (error) throw error;
  return data as CustomerOption;
}
