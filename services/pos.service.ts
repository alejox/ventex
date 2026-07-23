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
  /** Suma de precios de vitrina (IVA incluido), antes de descuentos. */
  gross: number;
  /** Base gravable: el total sin IVA. */
  subtotal: number;
  taxAmount: number;
  discount: number;
  /** Rebaja por cliente exento de IVA (0 si no aplica). */
  exemptionDiscount: number;
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
  transferMethod?: string | null;
  cardMethod?: string | null;
  discount: number;
  items: CheckoutItem[];
  /** Desglosar IVA en esta venta. Sin esto manda la configuración del negocio. */
  includeTax?: boolean;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Totales de la venta para previsualización. Espejo de la matemática del RPC
 * `create_sale`: si cambia una, tiene que cambiar la otra.
 *
 * Los precios del catálogo son PRECIO FINAL AL PÚBLICO (IVA incluido), así que
 * el IVA se deriva hacia atrás: base = precio / (1 + tasa).
 *
 * El orden de los casos importa y es el mismo que el del RPC:
 *
 * - No responsable (`!includeTax`): no hay impuesto que reportar NI que eximir.
 *   Va primero: sin IVA cobrado, un cliente exento no tiene nada que descontar.
 * - Cliente exento: no paga IVA, así que paga la base. La diferencia contra el
 *   precio de vitrina es el descuento por exención.
 * - Responsable de IVA: el cliente paga el precio de vitrina y el recibo
 *   desglosa base + IVA.
 */
export function computeTotals(
  lines: CartLine[],
  taxRate: number,
  taxExempt: boolean,
  includeTax: boolean
): SaleTotals {
  const gross = round2(lines.reduce((s, l) => s + l.item.price * l.quantity, 0));
  const discount = round2(lines.reduce((s, l) => s + (l.discountAmount || 0), 0));
  const neto = Math.max(round2(gross - discount), 0);

  if (!includeTax) {
    return { gross, subtotal: neto, taxAmount: 0, discount, exemptionDiscount: 0, total: neto };
  }

  if (taxExempt) {
    const total = round2(neto / (1 + taxRate));
    return {
      gross,
      subtotal: total,
      taxAmount: 0,
      discount,
      exemptionDiscount: round2(neto - total),
      total,
    };
  }

  const subtotal = round2(neto / (1 + taxRate));
  return {
    gross,
    subtotal,
    taxAmount: round2(neto - subtotal),
    discount,
    exemptionDiscount: 0,
    total: neto,
  };
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

export interface PosConfig {
  taxRate: number;
  /** Si el negocio desglosa IVA. false = no responsable de IVA. */
  includeTax: boolean;
  /** Si el POS puede cobrar más unidades de las que hay en stock. */
  allowOversell: boolean;
}

/**
 * Ajustes del negocio que condicionan el cobro. Los defaults tienen que
 * coincidir con los del RPC `create_sale` para un negocio sin fila en
 * `settings`: 19%, desglose activo y sobreventa permitida.
 */
export async function fetchPosConfig(): Promise<PosConfig> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("settings")
    .select("tax_rate, include_tax, allow_oversell")
    .maybeSingle();
  if (error) throw error;
  return {
    taxRate: data?.tax_rate ?? 0.19,
    includeTax: data?.include_tax ?? true,
    allowOversell: data?.allow_oversell ?? true,
  };
}

/** Registra la venta de forma transaccional vía RPC y devuelve el id de la venta. */
export async function createSale(input: CheckoutInput): Promise<string> {
  const supabase = createClient();

  const payload: Record<string, unknown> = {
    p_customer_id: input.customerId as string,
    p_payment_method: input.paymentMethod,
    p_discount_amount: input.discount,
    p_items: input.items as unknown as never,
    p_staff_id: (input.staffId ?? null) as string | null,
  };

  if (input.transferMethod) {
    payload.p_transfer_method = input.transferMethod;
  }
  if (input.cardMethod) {
    payload.p_card_method = input.cardMethod;
  }

  // 1. Intentar la llamada con el payload específico
  const primaryCall = await supabase.rpc("create_sale", payload as never);
  if (!primaryCall.error) {
    return primaryCall.data as string;
  }

  // 2. Si falla por falta del parámetro opcional en DB remota no migrada, reintentar con los 5 parámetros base
  const basePayload = {
    p_customer_id: input.customerId as string,
    p_payment_method: input.paymentMethod,
    p_discount_amount: input.discount,
    p_items: input.items as unknown as never,
    p_staff_id: (input.staffId ?? null) as string | null,
  };

  const fallbackCall = await supabase.rpc("create_sale", basePayload as never);
  if (fallbackCall.error) throw fallbackCall.error;
  return fallbackCall.data as string;
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
