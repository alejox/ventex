import { createClient } from "@/utils/supabase/client";

// ---- Tipos del dominio del POS ----
/** Un ítem del catálogo: producto (con stock) o servicio (sin stock). */
export interface CatalogItem {
  id: string;
  kind: "product" | "service";
  name: string;
  sku: string | null;
  price: number;
  stock_level: number | null;
  category_name: string | null;
  image_url: string | null;
  has_commission: boolean;
  commission_type: "percentage" | "fixed" | null;
  commission_value: number | null;
}

export interface CustomerOption {
  id: string;
  full_name: string;
  tax_exempt: boolean;
  doc_type: string | null;
  identification: string | null;
}

export interface StaffOption {
  id: string;
  full_name: string;
}

export interface CartLine {
  item: CatalogItem;
  quantity: number;
  discountAmount?: number;
  staffId?: string | null;
}

export interface SaleTotals {
  subtotal: number;
  taxAmount: number;
  discount: number;
  total: number;
}

export type PaymentMethod = "efectivo" | "tarjeta" | "transferencia";

/** Línea de venta: lleva product_id o service_id según el tipo de ítem. */
export interface CheckoutItem {
  product_id?: string;
  service_id?: string;
  quantity: number;
  staff_id?: string | null;
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
 * Los precios de los productos se almacenan como PRECIO BASE (sin IVA).
 * 
 * Para clientes NO exentos:
 *   - Subtotal = suma de los precios base
 *   - IVA = subtotal * taxRate
 *   - Total = subtotal + IVA
 * 
 * Para clientes exentos:
 *   - IVA = 0
 *   - Total = subtotal
 */
export function computeTotals(
  lines: CartLine[],
  taxRate: number,
  taxExempt: boolean
): SaleTotals {
  const subtotalBase = round2(lines.reduce((s, l) => s + l.item.price * l.quantity, 0));
  const totalDiscount = round2(lines.reduce((s, l) => s + (l.discountAmount || 0), 0));
  const subtotalNeto = Math.max(subtotalBase - totalDiscount, 0);

  if (taxExempt) {
    return { subtotal: subtotalNeto, taxAmount: 0, discount: totalDiscount, total: subtotalNeto };
  }

  const taxAmount = round2(subtotalNeto * taxRate);
  const total = round2(subtotalNeto + taxAmount);
  return { subtotal: subtotalNeto, taxAmount, discount: totalDiscount, total };
}

/** Catálogo del POS: productos (con stock) + servicios activos (sin stock). */
export async function fetchCatalog(): Promise<CatalogItem[]> {
  const supabase = createClient();
  const [productsRes, servicesRes] = await Promise.all([
    supabase
      .from("products")
      .select("id, name, sku, price, stock_level, image_url, has_commission, commission_type, commission_value, categories(name)")
      .order("name"),
    supabase
      .from("services")
      .select("id, name, price, has_commission, commission_type, commission_value")
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
      has_commission: p.has_commission ?? false,
      commission_type: (p.commission_type ?? null) as "percentage" | "fixed" | null,
      commission_value: p.commission_value ?? null,
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
    has_commission: s.has_commission ?? false,
    commission_type: (s.commission_type ?? null) as "percentage" | "fixed" | null,
    commission_value: s.commission_value ?? null,
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
    .select("id, full_name, tax_exempt, doc_type, identification")
    .order("full_name");
  if (error) throw error;
  return (data ?? []).map((c) => ({
    id: c.id,
    full_name: c.full_name,
    tax_exempt: c.tax_exempt ?? false,
    doc_type: c.doc_type ?? null,
    identification: c.identification ?? null,
  }));
}

/** Tasa de IVA configurada en la cuenta (19% por defecto si no hay ajustes). */
export async function fetchTaxRate(): Promise<number> {
  const supabase = createClient();
  const { data, error } = await supabase.from("settings").select("tax_rate").maybeSingle();
  if (error) throw error;
  return data?.tax_rate ?? 0.19;
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

export async function createCustomer(params: {
  name: string;
  doc_type?: string;
  identification?: string;
}): Promise<CustomerOption> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("customers")
    .insert({
      full_name: params.name,
      doc_type: params.doc_type || null,
      identification: params.identification || null,
      tax_exempt: false,
    })
    .select("id, full_name, tax_exempt, doc_type, identification")
    .single();
  if (error) throw error;
  return data as CustomerOption;
}
