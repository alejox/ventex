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
  /**
   * Cuánto de esta venta fue del ítem filtrado. En cero sin filtro activo.
   *
   * Existen porque `total` NO contesta "cuánto vendí de esto": una gaseosa de
   * $3.000 puede viajar dentro de una compra de $1.060.726 (caso real de esta
   * base, venta #8). Mostrar el total de la venta como si fuera del producto es
   * el error que esta columna evita.
   */
  item_units: number;
  item_total: number;
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
  /**
   * Quién se lleva la comisión de ESTA línea. Por defecto es el "Atendido por"
   * de la venta, pero el carrito deja pisarlo ítem por ítem, así que puede
   * diferir del vendedor de la cabecera.
   */
  staff_name: string | null;
  /** Comisión congelada al momento de la venta (no se recalcula nunca). */
  commission_amount: number;
  /**
   * Liquidación que ya pagó esta comisión. null = todavía se le debe.
   *
   * Importa acá y no solo en Personal: al anular una venta, esto es lo que dice
   * si además de deshacer la venta hay plata que ya salió por ella.
   */
  commission_settlement_id: string | null;
}

// El detalle NO hereda las métricas del ítem filtrado: son propiedades de la
// LISTA (cuánto aportó el producto por el que se está filtrando), y adentro de
// una venta abierta esa pregunta no existe — ahí se ven todas sus líneas.
export interface SaleDetail extends Omit<SaleListItem, "item_count" | "item_units" | "item_total"> {
  tax_rate: number;
  /** El "Atendido por" de la venta. */
  staff_name: string | null;
  items: SaleLine[];
}

/**
 * Por qué ítem del catálogo se está filtrando.
 *
 * `productId` y `serviceId` van separados y no en un solo campo porque un
 * servicio NO es una fila de `products` (ver el catálogo: viven en tablas
 * distintas y `sale_items` los referencia con dos FK distintas). La categoría
 * SÍ es compartida: `products.category_id` y `services.category_id` apuntan a
 * la misma tabla, así que un solo selector cubre las dos mitades.
 *
 * Nota conocida: una línea cuyo producto se borró queda con `product_id` nulo y
 * NO entra en ningún filtro. Sigue en el historial sin filtrar (su nombre está
 * congelado en `product_name`), pero no hay a qué producto atribuirla.
 */
export interface ItemFilter {
  productId: string;
  serviceId: string;
  categoryId: string;
}

export const NO_ITEM_FILTER: ItemFilter = { productId: "", serviceId: "", categoryId: "" };

export const hasItemFilter = (f: ItemFilter): boolean =>
  Boolean(f.productId || f.serviceId || f.categoryId);

/**
 * El valor con el que un ítem viaja en el `<select>`.
 *
 * Lleva el tipo adelante porque el uuid solo no alcanza: un producto y un
 * servicio son filas de tablas distintas, y `sale_items` los referencia con dos
 * FK distintas. Mandando el id pelado, la base no sabría en cuál de las dos
 * buscarlo.
 */
export const itemOptionValue = (kind: "product" | "service", id: string): string =>
  `${kind === "product" ? "p" : "s"}:${id}`;

/**
 * Traduce la opción elegida a un filtro.
 *
 * Falla CERRADO: lo que no se entiende no filtra por nada. Un valor corrupto
 * convertido en filtro parcial devolvería ventas que no corresponden, y en una
 * pantalla de plata eso se lee como un dato, no como un error.
 */
export function itemFilterFromOption(option: string): ItemFilter {
  const [kind, ...resto] = option.split(":");
  const id = resto.join(":");
  if (!id) return NO_ITEM_FILTER;
  if (kind === "p") return { productId: id, serviceId: "", categoryId: "" };
  if (kind === "s") return { productId: "", serviceId: id, categoryId: "" };
  return NO_ITEM_FILTER;
}

/** Una opción del selector de ítem, ya lista para dibujar. */
export interface ItemOption {
  value: string;
  label: string;
  categoryId: string | null;
}

export interface ItemFilterOptions {
  items: ItemOption[];
  categories: { id: string; name: string }[];
}

/**
 * Lo que puebla los dos selectores del historial.
 *
 * Pide SOLO id, nombre y categoría de cada cosa: la pantalla de ventas no
 * necesita stock, costos ni imágenes, y traer el catálogo entero para llenar un
 * desplegable es pagar por datos que nadie va a mirar.
 *
 * Los servicios entran junto con los productos porque el catálogo de esta app
 * son las dos mitades y el POS vende las dos: un filtro que solo viera
 * productos dejaría a un salón sin poder analizar nada de lo que factura.
 */
export async function fetchItemFilterOptions(): Promise<ItemFilterOptions> {
  const supabase = createClient();

  const [productos, servicios, categorias] = await Promise.all([
    supabase.from("products").select("id, name, category_id").order("name"),
    supabase.from("services").select("id, name, category_id").order("name"),
    supabase.from("categories").select("id, name").order("name"),
  ]);

  if (productos.error) throw productos.error;
  if (servicios.error) throw servicios.error;
  if (categorias.error) throw categorias.error;

  const items: ItemOption[] = [
    ...(productos.data ?? []).map((p) => ({
      value: itemOptionValue("product", p.id),
      label: p.name,
      categoryId: p.category_id ?? null,
    })),
    ...(servicios.data ?? []).map((sv) => ({
      // El sufijo distingue en la lista a un servicio de un producto que se
      // llame igual, que en un salón pasa seguido ("Tintura" el frasco y
      // "Tintura" el trabajo).
      value: itemOptionValue("service", sv.id),
      label: `${sv.name} (servicio)`,
      categoryId: sv.category_id ?? null,
    })),
  ].sort((a, b) => a.label.localeCompare(b.label, "es"));

  return { items, categories: categorias.data ?? [] };
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
  /**
   * Los mismos KPIs, pero medidos sobre las LÍNEAS del ítem filtrado.
   *
   * Son otra familia de números, no una variante: `revenue` es lo que gastó
   * quien compró el producto y `item_revenue` es lo que se vendió DEL producto.
   * Con la gaseosa de esta base son $1.117.726 contra $12.000 — un factor de 93.
   * La pantalla muestra unos u otros según haya filtro, nunca los dos mezclados.
   *
   * Sin filtro llegan en cero: la base ni siquiera recorre `sale_items`.
   */
  item_units: number;
  item_revenue: number;
  item_avg_price: number;
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
  item: ItemFilter = NO_ITEM_FILTER,
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
    p_product_id: item.productId || undefined,
    p_service_id: item.serviceId || undefined,
    p_category_id: item.categoryId || undefined,
  });
  if (error) throw error;
  const raw = (data ?? {}) as Record<string, unknown>;
  return {
    sales_count: Number(raw.sales_count ?? 0),
    completed_count: Number(raw.completed_count ?? 0),
    revenue: Number(raw.revenue ?? 0),
    avg_ticket: Number(raw.avg_ticket ?? 0),
    item_units: Number(raw.item_units ?? 0),
    item_revenue: Number(raw.item_revenue ?? 0),
    item_avg_price: Number(raw.item_avg_price ?? 0),
  };
}

// Supabase tipa los embeds como array; en relaciones to-one llega un objeto.
const one = <T,>(embed: unknown): T | null => {
  if (Array.isArray(embed)) return (embed[0] as T) ?? null;
  return (embed as T) ?? null;
};

// Los embeds de `staff` van con el nombre del FK explícito: desde `sales` se
// llega a la tabla por dos caminos (la cabecera y cada línea) y PostgREST no
// tiene por qué adivinar cuál es cuál.
const DETAIL_SELECT =
  "id, sale_number, created_at, payment_method, transfer_method, card_method, status, subtotal, discount_amount, tax_rate, tax_amount, total, customers(full_name), staff!sales_staff_id_fkey(full_name), sale_items(id, product_name, sku, unit_price, quantity, line_total, unit_kind, units_per_item, commission_amount, commission_settlement_id, staff!sale_items_staff_id_fkey(full_name))";

export const SALES_PAGE_SIZE = 50;

export interface SalesPage {
  items: SaleListItem[];
  /** Total de filas del período (no de la página), para paginar. */
  total: number;
}

/**
 * Una página del historial, acotada al período y a los filtros.
 *
 * Se resuelve con el RPC `sales_page` y no con PostgREST, por dos razones.
 *
 * La primera es el filtro por producto: la condición vive en `sale_items`, una
 * tabla hija. Descartarlas desde el cliente pasaría DESPUÉS del corte de la
 * paginación, así que las páginas saldrían con agujeros.
 *
 * La segunda es que había DOS variantes literales del `select` —con y sin
 * embed de cliente— que había que mantener en espejo a mano, porque
 * supabase-js infiere el tipo del string literal y no admite interpolarlo.
 * Cada columna nueva se escribía dos veces. Ahora la forma la decide la base.
 *
 * `sales_page` es `stable` y NO `security definer`: las policies de `sales` y
 * `sale_items` siguen aplicando igual que antes.
 */
export async function fetchSales(
  range: DateRange,
  page = 0,
  pageSize = SALES_PAGE_SIZE,
  customerQuery = "",
  paymentMethod = "",
  transferMethod = "",
  item: ItemFilter = NO_ITEM_FILTER,
): Promise<SalesPage> {
  const supabase = createClient();

  const { data, error } = await supabase.rpc("sales_page", {
    p_from: range.from ?? undefined,
    p_to: range.to ?? undefined,
    p_customer: customerQuery.trim() || undefined,
    p_payment_method: paymentMethod || undefined,
    p_transfer_method: transferMethod || undefined,
    p_product_id: item.productId || undefined,
    p_service_id: item.serviceId || undefined,
    p_category_id: item.categoryId || undefined,
    p_limit: pageSize,
    p_offset: page * pageSize,
  });
  if (error) throw error;

  const raw = (data ?? {}) as { total?: number; items?: unknown[] };
  const items: SaleListItem[] = (raw.items ?? []).map((row) => {
    const r = row as Record<string, unknown>;
    return {
      id: r.id as string,
      sale_number: Number(r.sale_number ?? 0),
      created_at: r.created_at as string,
      customer_name: (r.customer_name as string) ?? null,
      payment_method: r.payment_method as string,
      transfer_method: (r.transfer_method as string) ?? null,
      card_method: (r.card_method as string) ?? null,
      status: r.status as string,
      subtotal: Number(r.subtotal ?? 0),
      discount_amount: Number(r.discount_amount ?? 0),
      tax_amount: Number(r.tax_amount ?? 0),
      total: Number(r.total ?? 0),
      item_count: Number(r.item_count ?? 0),
      item_units: Number(r.item_units ?? 0),
      item_total: Number(r.item_total ?? 0),
    };
  });

  return { items, total: Number(raw.total ?? items.length) };
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
  const raw = data as Record<string, unknown>;
  const rawItems = (Array.isArray(data.sale_items) ? data.sale_items : []) as Record<string, unknown>[];
  const items: SaleLine[] = rawItems.map((it) => ({
    id: it.id as string,
    product_name: it.product_name as string,
    sku: (it.sku as string) ?? null,
    unit_price: it.unit_price as number,
    quantity: it.quantity as number,
    line_total: it.line_total as number,
    unit_kind: (it.unit_kind as "unit" | "package") ?? "unit",
    units_per_item: (it.units_per_item as number) ?? 1,
    staff_name: one<{ full_name: string }>(it.staff)?.full_name ?? null,
    commission_amount: (it.commission_amount as number) ?? 0,
    commission_settlement_id: (it.commission_settlement_id as string | null) ?? null,
  }));
  return {
    id: data.id,
    sale_number: data.sale_number,
    created_at: data.created_at,
    customer_name: customer?.full_name ?? null,
    staff_name: one<{ full_name: string }>(raw.staff)?.full_name ?? null,
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

export async function voidSale(saleId: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.rpc("void_sale", { p_sale_id: saleId });
  if (error) throw error;
}
