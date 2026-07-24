import { createClient } from "@/utils/supabase/client";

// ---- Tipos del dominio de ventas (lectura / historial) ----
export interface SaleListItem {
  id: string;
  sale_number: number;
  created_at: string;
  customer_name: string | null;
  payment_method: string;
  transfer_method: string | null;
  /** Datáfono/pasarela usado, solo en ventas con tarjeta. */
  card_method: string | null;
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
  /** "package" = se vendió la caja. Congelado al momento de la venta. */
  unit_kind: "unit" | "package";
  /** Unidades sueltas que representaba cada ítem vendido. */
  units_per_item: number;
}

export interface SaleDetail extends Omit<SaleListItem, "item_count"> {
  tax_rate: number;
  items: SaleLine[];
}

// ---- Períodos del historial ----

export type SalesPeriodId =
  | "today"
  | "yesterday"
  | "last7"
  | "month"
  | "lastMonth"
  | "all"
  | "custom";

/** Rango en ISO. `to` es EXCLUSIVO, igual que el RPC `sales_summary`. */
export interface DateRange {
  from: string | null;
  to: string | null;
}

export const SALES_PERIODS: { id: SalesPeriodId; label: string }[] = [
  { id: "today", label: "Hoy" },
  { id: "yesterday", label: "Ayer" },
  { id: "last7", label: "Últimos 7 días" },
  { id: "month", label: "Este mes" },
  { id: "lastMonth", label: "Mes pasado" },
  { id: "all", label: "Todo" },
  { id: "custom", label: "Personalizado" },
];

const startOfDay = (d: Date) => {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  return out;
};

const addDays = (d: Date, days: number) => {
  const out = new Date(d);
  out.setDate(out.getDate() + days);
  return out;
};

/**
 * Traduce un preset a un rango concreto. Los cortes se calculan con la hora
 * LOCAL del navegador y se mandan en ISO: el día de un negocio termina a su
 * medianoche, no a la de UTC.
 *
 * En "custom", `to` recibe un día suelto ("YYYY-MM-DD") y se corre al día
 * siguiente para que el rango incluya ese día completo.
 */
export function resolvePeriod(
  id: SalesPeriodId,
  customFrom?: string,
  customTo?: string,
): DateRange {
  const today = startOfDay(new Date());

  switch (id) {
    case "today":
      return { from: today.toISOString(), to: addDays(today, 1).toISOString() };
    case "yesterday":
      return { from: addDays(today, -1).toISOString(), to: today.toISOString() };
    case "last7":
      return { from: addDays(today, -6).toISOString(), to: addDays(today, 1).toISOString() };
    case "month": {
      const first = new Date(today.getFullYear(), today.getMonth(), 1);
      const next = new Date(today.getFullYear(), today.getMonth() + 1, 1);
      return { from: first.toISOString(), to: next.toISOString() };
    }
    case "lastMonth": {
      const first = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const next = new Date(today.getFullYear(), today.getMonth(), 1);
      return { from: first.toISOString(), to: next.toISOString() };
    }
    case "custom":
      return {
        from: customFrom ? startOfDay(new Date(`${customFrom}T00:00:00`)).toISOString() : null,
        to: customTo ? addDays(startOfDay(new Date(`${customTo}T00:00:00`)), 1).toISOString() : null,
      };
    case "all":
    default:
      return { from: null, to: null };
  }
}

/** Totales del período, agregados en el servidor. */
export interface SalesSummary {
  sales_count: number;
  completed_count: number;
  revenue: number;
  avg_ticket: number;
}

/**
 * KPIs del período completo vía RPC. Va aparte del listado a propósito: la
 * tabla se pagina, así que sumar en el cliente daría totales del tramo cargado
 * y no del período.
 */
export async function fetchSalesSummary(
  range: DateRange,
  customerQuery = "",
  paymentMethod = "",
  transferMethod = "",
): Promise<SalesSummary> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("sales_summary", {
    p_from: range.from ?? undefined,
    p_to: range.to ?? undefined,
    // Los totales tienen que responder al mismo filtro que la tabla, si no las
    // tarjetas y las filas muestran números distintos.
    p_customer: customerQuery.trim() || undefined,
    p_payment_method: paymentMethod || undefined,
    p_transfer_method: transferMethod || undefined,
  });
  if (error) throw error;
  const raw = (data ?? {}) as Partial<SalesSummary>;
  return {
    sales_count: Number(raw.sales_count ?? 0),
    completed_count: Number(raw.completed_count ?? 0),
    revenue: Number(raw.revenue ?? 0),
    avg_ticket: Number(raw.avg_ticket ?? 0),
  };
}

// Supabase tipa los embeds como array; en relaciones to-one llega un objeto.
const one = <T,>(embed: unknown): T | null => {
  if (Array.isArray(embed)) return (embed[0] as T) ?? null;
  return (embed as T) ?? null;
};

/**
 * Dos variantes del mismo select. Con búsqueda por cliente el embed pasa a
 * `!inner`: sin eso PostgREST no puede filtrar por una columna del cliente, y el
 * efecto buscado es justamente que las ventas sin cliente ("De Paso") queden
 * fuera cuando se busca a alguien concreto.
 *
 * Van escritas enteras y no armadas por interpolación: supabase-js infiere la
 * forma del resultado a partir del string LITERAL del select, así que un
 * template dinámico hace que el tipo colapse a `GenericStringError`.
 */
const LIST_SELECT =
  "id, sale_number, created_at, payment_method, transfer_method, card_method, status, subtotal, discount_amount, tax_amount, total, customers(full_name), sale_items(count)";

const LIST_SELECT_WITH_CUSTOMER =
  "id, sale_number, created_at, payment_method, transfer_method, card_method, status, subtotal, discount_amount, tax_amount, total, customers!inner(full_name), sale_items(count)";

/**
 * Neutraliza los comodines de LIKE. Buscar "50%" tiene que buscar ese texto y no
 * "cualquier cosa que empiece con 50". Espeja lo que hace el RPC.
 */
const likePattern = (raw: string) =>
  `%${raw.trim().replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_")}%`;

const DETAIL_SELECT =
  "id, sale_number, created_at, payment_method, transfer_method, card_method, status, subtotal, discount_amount, tax_rate, tax_amount, total, customers(full_name), sale_items(id, product_name, sku, unit_price, quantity, line_total, unit_kind, units_per_item)";

export const SALES_PAGE_SIZE = 50;

export interface SalesPage {
  items: SaleListItem[];
  /** Total de filas del período (no de la página), para paginar. */
  total: number;
}

/**
 * Una página del historial, acotada al período. Antes traía TODAS las ventas sin
 * límite: PostgREST corta en 1000 filas, así que a partir de ahí la lista (y los
 * totales que se sumaban sobre ella) quedaban incompletos sin avisar.
 */
export async function fetchSales(
  range: DateRange,
  page = 0,
  pageSize = SALES_PAGE_SIZE,
  customerQuery = "",
  paymentMethod = "",
  transferMethod = "",
): Promise<SalesPage> {
  const supabase = createClient();
  const search = customerQuery.trim();

  let query = supabase
    .from("sales")
    .select(search ? LIST_SELECT_WITH_CUSTOMER : LIST_SELECT, { count: "exact" })
    .order("created_at", { ascending: false });

  if (range.from) query = query.gte("created_at", range.from);
  // Exclusivo: `to` es el arranque del día siguiente al último incluido.
  if (range.to) query = query.lt("created_at", range.to);
  if (search) query = query.ilike("customers.full_name", likePattern(search));
  if (paymentMethod) query = query.eq("payment_method", paymentMethod);
  if (transferMethod) query = query.eq("transfer_method", transferMethod);

  const start = page * pageSize;
  const { data, error, count } = await query.range(start, start + pageSize - 1);
  if (error) throw error;

  const items = (data ?? []).map((s) => {
    const customer = one<{ full_name: string }>(s.customers);
    const items = one<{ count: number }>(s.sale_items);
    const raw = s as Record<string, unknown>;
    return {
      id: s.id,
      sale_number: s.sale_number,
      created_at: s.created_at,
      customer_name: customer?.full_name ?? null,
      payment_method: s.payment_method,
      transfer_method: (raw.transfer_method as string) ?? null,
      card_method: (raw.card_method as string) ?? null,
      status: s.status,
      subtotal: s.subtotal,
      discount_amount: s.discount_amount,
      tax_amount: s.tax_amount,
      total: s.total,
      item_count: items?.count ?? 0,
    };
  });

  return { items, total: count ?? items.length };
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
  const raw = data as Record<string, unknown>;
  return {
    id: data.id,
    sale_number: data.sale_number,
    created_at: data.created_at,
    customer_name: customer?.full_name ?? null,
    payment_method: data.payment_method,
    transfer_method: (raw.transfer_method as string) ?? null,
    card_method: (raw.card_method as string) ?? null,
    status: data.status,
    subtotal: data.subtotal,
    discount_amount: data.discount_amount,
    tax_rate: data.tax_rate,
    tax_amount: data.tax_amount,
    total: data.total,
    items,
  };
}
