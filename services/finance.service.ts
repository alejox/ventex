import { createClient } from "@/utils/supabase/client";
import { parseDateOnly, toISODate } from "@/lib/date";
import { addMoney, sumMoney } from "@/lib/money-sum";
import { calendarDayIn, isValidTimeZone, monthKeyIn, zonedMidnight } from "@/lib/tz";

// ---- Tipos del dominio de finanzas ----
interface MonthlyPoint {
  key: string; // "YYYY-MM"
  label: string;
  income: number;
  expense: number;
}

interface FinanceTransaction {
  id: string;
  kind: "sale" | "expense";
  label: string;
  amount: number; // positivo = ingreso, negativo = gasto
  /** Instante o fecha cruda. Sirve para ORDENAR, no para mostrar. */
  date: string;
  /**
   * Día de calendario "YYYY-MM-DD" ya resuelto en hora local. Es lo único que
   * se debe mostrar.
   *
   * Existe separado de `date` porque acá conviven dos cosas distintas: las
   * ventas traen un `timestamptz` (un instante) y los gastos, facturas y
   * compras traen columnas `date` (un día, sin hora). Formatear las dos con
   * `new Date(...)` corría el día en una dirección; formatearlas todas con
   * `parseDateOnly` lo corría en la otra, porque quedarse con los 10 primeros
   * caracteres de un instante UTC devuelve el día de Greenwich y una venta de
   * las 8 de la noche en UTC-5 ya es del día siguiente allá.
   */
  day: string;
}

/** Una porción del desglose de gastos por categoría. */
export interface ExpenseSlice {
  id: string;
  label: string;
  color: string;
  amount: number;
}

export interface FinanceOverview {
  revenue: number;
  expenses: number;
  /**
   * FLUJO DE CAJA: ingresos − egresos, compras de mercadería incluidas. NO es
   * utilidad: un mes que repone inventario sale en rojo aunque haya ganado.
   * Un margen real necesita el costo congelado por línea, que `sale_items`
   * todavía no guarda.
   */
  net: number;
  /** Ventas completadas del período, TODAS (también las de total 0). */
  salesCount: number;
  /**
   * Divisor del ticket promedio: ventas completadas con total > 0. Una venta
   * pagada entera con un premio existe (se atendió a alguien) pero no es un
   * ticket: contarla tiraba el promedio para abajo sin que entrara un peso.
   */
  ticketCount: number;
  /**
   * Las tres partes de `revenue` (CAJA, no facturación):
   * - `salesIncome`: lo cobrado AL VENDER — `sale_payments` sin 'credito'; las
   *   ventas viejas sin filas de pago cuentan su total salvo que sean fiadas.
   * - `abonosIncome`: abonos de fiado cobrados en el período.
   * - `invoicesIncome`: facturas de venta pagadas, por `paid_at`.
   */
  salesIncome: number;
  abonosIncome: number;
  invoicesIncome: number;
  /** Lo facturado en el POS (suma de totales): contexto, no caja. */
  salesBilled: number;
  /** Lo que se fió en el período (facturado − cobrado al vender). */
  creditIssued: number;
  monthly: MonthlyPoint[];
  recent: FinanceTransaction[];
  /**
   * En qué se va la plata, ordenado de mayor a menor.
   *
   * Incluye las COMPRAS a proveedor como una porción más. Sin ellas el desglose
   * no sumaría lo mismo que el KPI "Gastos totales" —que sí las cuenta— y el
   * dueño vería dos números distintos para la misma pregunta en la misma
   * pantalla. De paso, es la forma visual de mostrar que Compras también es
   * gasto, que era un pendiente del informe de UX.
   */
  expensesByCategory: ExpenseSlice[];
}

/** Color de la porción de compras. No es una categoría editable: la elegimos
 *  nosotros y está validada contra las sembradas en claro y en oscuro. */
const PURCHASES_SLICE_COLOR = "#6366f1";

/** Corte del día en curso para el KPI "Ventas hoy" del panel. */
export interface TodaySales {
  count: number;
  /** Ventas con total > 0: el divisor del ticket promedio (ver `ticketCount`). */
  ticketCount: number;
  revenue: number;
}

/** Ticket promedio: facturado ÷ ventas con total > 0. Cero si no hubo ninguna. */
export function averageTicket(billed: number, ticketCount: number): number {
  return ticketCount > 0 ? Math.round((billed / ticketCount) * 100) / 100 : 0;
}

export interface Expense {
  id: string;
  description: string;
  category: string | null;
  amount: number;
  expense_date: string;
}

export interface NewExpenseInput {
  description: string;
  category: string;
  category_id?: string;
  amount: string;
  expense_date: string;
}

const MONTHS = 6;

/**
 * Hoy como "contenedor" local: un `Date` en la medianoche LOCAL cuyo año, mes
 * y día son los del calendario del negocio (`tz`) o, sin zona, los del
 * dispositivo. Los rangos del panel se arman con estos contenedores y se
 * traducen a instantes recién en `toIsoRange`, con la zona.
 */
export function todayIn(now: Date = new Date(), tz?: string): Date {
  if (tz && isValidTimeZone(tz)) return parseDateOnly(calendarDayIn(tz, now));
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

/** Últimos N meses (incluido el actual) como claves "YYYY-MM" con etiqueta corta. */
export function lastMonths(n: number, nowArg: Date = new Date(), tz?: string): { key: string; label: string }[] {
  const out: { key: string; label: string }[] = [];
  const now = todayIn(nowArg, tz);
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const label = d.toLocaleDateString("es-CO", { month: "short" }).replace(".", "");
    out.push({ key, label: label.charAt(0).toUpperCase() + label.slice(1) });
  }
  return out;
}

/**
 * Mes "YYYY-MM" de una columna `date` (`expense_date`, `issue_date`): es un
 * día de calendario, así que basta con cortar el texto.
 */
const monthKeyOfDate = (value: string) => value.slice(0, 7);

/**
 * Mes "YYYY-MM" de un instante (`sales.created_at`) en hora LOCAL. Cortar el
 * ISO daría el mes en UTC: la venta de las 20:00 del 31 en Colombia caía en el
 * mes siguiente.
 */
export const monthKeyOfInstant = (iso: string, tz?: string) =>
  tz && isValidTimeZone(tz) ? monthKeyIn(tz, iso) : toISODate(new Date(iso)).slice(0, 7);

/** Día "YYYY-MM-DD" de un instante en la zona del negocio (o la del dispositivo). */
const dayOfInstant = (iso: string, tz?: string) =>
  tz && isValidTimeZone(tz) ? calendarDayIn(tz, new Date(iso)) : toISODate(new Date(iso));

/** Tope de filas por respuesta de PostgREST (max-rows por defecto de Supabase). */
export const PAGE_SIZE = 1000;

type PageResult<T> = PromiseLike<{ data: T[] | null; error: unknown }>;

/**
 * Trae TODAS las filas de una consulta, de a `PAGE_SIZE`.
 *
 * PostgREST corta cada respuesta en 1.000 filas sin avisar: un negocio con más
 * ventas que eso veía totales por debajo de lo real. `page(from, to)` tiene que
 * armar la consulta con un orden ESTABLE (con desempate por id), o las páginas
 * se pisan o se saltean filas. Se detiene en la primera página incompleta.
 */
export async function fetchAllRows<T>(
  page: (from: number, to: number) => PageResult<T>,
  pageSize: number = PAGE_SIZE,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await page(from, from + pageSize - 1);
    if (error) throw error;
    const chunk = data ?? [];
    rows.push(...chunk);
    if (chunk.length < pageSize) return rows;
  }
}

/**
 * Zona horaria del negocio: `business_sites.timezone` (la misma con la que la
 * base fecha el gasto de un retiro de caja), o la del dispositivo si el negocio
 * no tiene fila o trae un valor que `Intl` no conoce. Se pide una vez por
 * sesión: no cambia mientras se mira el panel.
 */
let businessTzPromise: Promise<string> | null = null;

export function fetchBusinessTimeZone(): Promise<string> {
  if (!businessTzPromise) {
    businessTzPromise = (async () => {
      try {
        const supabase = createClient();
        const { data, error } = await supabase
          .from("business_sites")
          .select("timezone")
          .limit(1)
          .maybeSingle();
        const tz = (data as { timezone?: string | null } | null)?.timezone;
        if (!error && isValidTimeZone(tz)) return tz;
      } catch {
        // Sin conexión o sin permiso: la zona del dispositivo es un buen respaldo.
      }
      return browserTimeZone();
    })();
  }
  return businessTzPromise;
}

/**
 * Ventas completadas desde la medianoche del negocio. La medianoche se calcula
 * en el navegador con la zona del negocio y se manda en ISO: el corte del día
 * es el del mostrador, no UTC ni el del dispositivo.
 */
export async function fetchTodaySales(tz?: string): Promise<TodaySales> {
  const supabase = createClient();
  const midnight =
    tz && isValidTimeZone(tz) ? zonedMidnight(calendarDayIn(tz), tz) : todayIn(new Date());

  const rows = await fetchAllRows((from, to) =>
    supabase
      .from("sales")
      .select("id, total")
      .gte("created_at", midnight.toISOString())
      .eq("status", "completed")
      .order("id")
      .range(from, to),
  );

  return {
    count: rows.length,
    ticketCount: rows.filter((r) => Number(r.total) > 0).length,
    revenue: sumMoney(rows.map((r) => r.total)),
  };
}

/**
 * Qué es cada documento de `invoices` para las finanzas.
 *
 * - `factura` cobrada: INGRESO.
 * - `compra` pagada: GASTO (lo que se le compra a un proveedor).
 * - `cotizacion`: NADA. Es una oferta, no un cobro; aunque alguien la haya
 *   marcado "Pagada" (Facturación ya no lo permite, pero hay filas viejas), lo
 *   que se cobra es la factura que sale de ella. Contarla inflaba los ingresos.
 */
export function invoiceRole(type: string): "income" | "expense" | null {
  if (type === "factura") return "income";
  if (type === "compra") return "expense";
  return null;
}

// ---- RPC `finance_overview` (agregación en la base) ----

/** Forma cruda que devuelve el RPC. Ver el SQL propuesto en el informe F1. */
export interface FinanceOverviewRpc {
  revenue?: number | string | null;
  expenses?: number | string | null;
  sales_count?: number | string | null;
  /** Desde 20261007150100: ventas con total > 0. Un RPC viejo no lo manda. */
  ticket_count?: number | string | null;
  /** Desde 20261007110300. Un RPC viejo no los manda. */
  sales_income?: number | string | null;
  abonos_income?: number | string | null;
  invoices_income?: number | string | null;
  sales_billed?: number | string | null;
  credit_issued?: number | string | null;
  monthly?: { key: string; income: number | string; expense: number | string }[] | null;
  by_category?: { id: string; label: string; color: string; amount: number | string }[] | null;
  recent?: {
    id: string;
    kind: "sale" | "expense";
    label: string;
    amount: number | string;
    date: string;
    day: string;
  }[] | null;
}

/**
 * Traduce la respuesta del RPC al mismo `FinanceOverview` que arma la ruta
 * paginada. Los meses salen de `lastMonths` (los del navegador) y se llenan
 * con lo que mande la base: un mes sin movimientos no viene en la respuesta y
 * tiene que aparecer igual, en cero.
 */
export function overviewFromRpc(raw: FinanceOverviewRpc, months = lastMonths(MONTHS)): FinanceOverview {
  const n = (v: unknown) => Number(v ?? 0) || 0;
  const byKey = new Map((raw.monthly ?? []).map((m) => [m.key, m]));
  const revenue = n(raw.revenue);
  const expenses = n(raw.expenses);
  // Un RPC anterior a 20261007110300 no trae el desglose: todo su `revenue`
  // era "ventas" (facturado del POS + facturas).
  const hasSplit = raw.sales_income != null;
  return {
    revenue,
    expenses,
    net: revenue - expenses,
    salesCount: n(raw.sales_count),
    // Un RPC anterior a 20261007150100 no lo trae: el conteo crudo es lo mejor
    // que hay.
    ticketCount: raw.ticket_count != null ? n(raw.ticket_count) : n(raw.sales_count),
    salesIncome: hasSplit ? n(raw.sales_income) : revenue,
    abonosIncome: hasSplit ? n(raw.abonos_income) : 0,
    invoicesIncome: hasSplit ? n(raw.invoices_income) : 0,
    salesBilled: hasSplit ? n(raw.sales_billed) : revenue,
    creditIssued: hasSplit ? n(raw.credit_issued) : 0,
    monthly: months.map((m) => ({
      ...m,
      income: n(byKey.get(m.key)?.income),
      expense: n(byKey.get(m.key)?.expense),
    })),
    recent: (raw.recent ?? []).map((r) => ({
      id: r.id,
      kind: r.kind,
      label: r.label,
      amount: n(r.amount),
      date: r.date,
      day: r.day,
    })),
    expensesByCategory: (raw.by_category ?? [])
      .map((c) => ({ id: c.id, label: c.label, color: c.color, amount: n(c.amount) }))
      .filter((c) => c.amount > 0)
      .sort((a, b) => b.amount - a.amount),
  };
}

/**
 * Si la base todavía no tiene el RPC (migración sin aplicar), se recuerda por
 * sesión para no pagar un 404 en cada visita al panel.
 */
let financeRpcMissing = false;

const isMissingRpc = (error: { code?: string; message?: string }) =>
  error.code === "PGRST202" || error.code === "42883" || /finance_overview/.test(error.message ?? "");

/**
 * Resumen del panel.
 *
 * Primero intenta `finance_overview`, que agrega en SQL y devuelve unos pocos
 * cientos de bytes sin importar cuántas ventas tenga el negocio. Si la base no
 * lo tiene todavía, cae a la ruta paginada de siempre (`fetchOverviewPaged`),
 * que es correcta pero descarga TODO el historial.
 */
export async function fetchOverview(
  range: IsoRange = ALL_TIME,
  months: number = MONTHS,
  tz: string = browserTimeZone(),
): Promise<FinanceOverview> {
  if (!financeRpcMissing) {
    const supabase = createClient();
    const rpc = supabase.rpc as unknown as (
      fn: string,
      args: Record<string, unknown>,
    ) => PromiseLike<{ data: unknown; error: { code?: string; message?: string } | null }>;
    const { data, error } = await rpc.call(supabase, "finance_overview", {
      // El mes y el día se cortan en la zona del NEGOCIO
      // (`fetchBusinessTimeZone`), la misma que fecha los retiros de caja.
      p_tz: tz,
      p_months: months,
      // `to` es EXCLUSIVO, igual que en el RPC.
      p_from: range.from ?? null,
      p_to: range.to ?? null,
    });
    if (!error) return overviewFromRpc((data ?? {}) as FinanceOverviewRpc, lastMonths(months, new Date(), tz));
    if (!isMissingRpc(error)) throw error;
    financeRpcMissing = true;
  }
  return fetchOverviewPaged(range, months, tz);
}

/** Una venta con sus filas de pago, tal como la trae PostgREST. */
export interface SaleCashRow {
  total: number | string;
  payment_method: string;
  sale_payments?: { payment_method: string; amount: number | string }[] | null;
}

/**
 * Plata que ENTRÓ al vender (caja, no facturación). Con filas en
 * `sale_payments` es la suma de las que no son 'credito' (un pago dividido
 * efectivo + fiado solo suma el efectivo); una venta vieja sin filas cuenta su
 * total, salvo que se haya fiado entera. Mismo criterio que `finance_overview`.
 */
export function saleCashReceived(sale: SaleCashRow): number {
  const payments = sale.sale_payments ?? [];
  if (payments.length > 0) {
    return sumMoney(payments.filter((p) => p.payment_method !== "credito").map((p) => p.amount));
  }
  return sale.payment_method === "credito" ? 0 : Number(sale.total) || 0;
}

export interface OverviewSaleRow extends SaleCashRow {
  id: string;
  sale_number: number;
  created_at: string;
}

export interface OverviewAbonoRow {
  id: string;
  amount: number | string;
  created_at: string;
  customer_name: string | null;
}

export interface OverviewDocRow {
  id: string;
  invoice_number: number;
  type: string;
  total: number | string;
  /** Instante en que se pagó (`invoices.paid_at`). */
  paid_at: string;
}

export interface OverviewExpenseRow {
  id: string;
  description: string;
  amount: number | string;
  expense_date: string;
  category?: { id: string; name: string; color: string } | null;
}

/** Los `n` más recientes según `at` (instante o fecha ISO). */
function newest<T>(list: T[], at: (x: T) => string, n = 8): T[] {
  return [...list].sort((a, b) => +new Date(at(b)) - +new Date(at(a))).slice(0, n);
}

/**
 * Agrega el panel desde filas YA filtradas por período (ventas completadas,
 * abonos y facturas/compras pagadas por instante; gastos por día). Pura: la
 * usa la ruta de respaldo y la prueban los tests con los mismos casos que el
 * RPC `finance_overview`, que tiene que dar lo mismo.
 */
export function aggregateOverview(
  rows: {
    sales: OverviewSaleRow[];
    abonos: OverviewAbonoRow[];
    docs: OverviewDocRow[];
    expenses: OverviewExpenseRow[];
  },
  months: { key: string; label: string }[],
  tz?: string,
): FinanceOverview {
  const num = (v: unknown) => Number(v ?? 0) || 0;
  const sales = rows.sales.map((s) => ({ ...s, received: saleCashReceived(s), billed: num(s.total) }));
  const salesInvoices = rows.docs.filter((i) => invoiceRole(i.type) === "income");
  const purchases = rows.docs.filter((i) => invoiceRole(i.type) === "expense");

  // Todas las sumas van en centavos enteros (`sumMoney`): sumando floats, un
  // período con cientos de ventas con centavos mostraba ±$0,01 de diferencia
  // contra el mismo total del RPC.
  const salesIncome = sumMoney(sales.map((s) => s.received));
  const salesBilled = sumMoney(sales.map((s) => s.billed));
  const abonosIncome = sumMoney(rows.abonos.map((a) => a.amount));
  const invoicesIncome = sumMoney(salesInvoices.map((i) => i.total));
  const revenue = sumMoney([salesIncome, abonosIncome, invoicesIncome]);
  const purchasesTotal = sumMoney(purchases.map((i) => i.total));
  const totalExpenses = sumMoney([...rows.expenses.map((e) => e.amount), purchasesTotal]);

  const buckets = new Map(months.map((m) => [m.key, { ...m, income: 0, expense: 0 }]));
  const addTo = (key: string, field: "income" | "expense", amount: number) => {
    const b = buckets.get(key);
    if (b) b[field] = addMoney(b[field], amount);
  };
  for (const s of sales) addTo(monthKeyOfInstant(s.created_at, tz), "income", s.received);
  for (const a of rows.abonos) addTo(monthKeyOfInstant(a.created_at, tz), "income", num(a.amount));
  for (const i of salesInvoices) addTo(monthKeyOfInstant(i.paid_at, tz), "income", num(i.total));
  for (const e of rows.expenses) addTo(monthKeyOfDate(e.expense_date), "expense", num(e.amount));
  // Las compras van a la barra de gastos del mes en que se PAGARON.
  for (const i of purchases) addTo(monthKeyOfInstant(i.paid_at, tz), "expense", num(i.total));

  const recent: FinanceTransaction[] = [
    ...newest(
      sales.filter((s) => s.received > 0),
      (s) => s.created_at,
    ).map((s) => ({
      id: s.id,
      kind: "sale" as const,
      label: `Venta #${s.sale_number}`,
      amount: s.received,
      date: s.created_at,
      // Instante → día del mostrador. Una venta de las 8 de la noche en UTC-5
      // es del día siguiente en UTC, y así se mostraba corrida.
      day: dayOfInstant(s.created_at, tz),
    })),
    ...newest(rows.abonos, (a) => a.created_at).map((a) => ({
      id: a.id,
      kind: "sale" as const,
      label: `Abono de ${a.customer_name ?? "cliente"}`,
      amount: num(a.amount),
      date: a.created_at,
      day: dayOfInstant(a.created_at, tz),
    })),
    ...newest(salesInvoices, (i) => i.paid_at).map((i) => ({
      id: i.id,
      kind: "sale" as const,
      label: `Factura #${i.invoice_number}`,
      amount: num(i.total),
      date: i.paid_at,
      day: dayOfInstant(i.paid_at, tz),
    })),
    // El signo negativo es lo que la fila usa para pintarse en rojo con una
    // flecha hacia abajo: una compra tiene que LEERSE como plata que sale.
    ...newest(purchases, (i) => i.paid_at).map((i) => ({
      id: i.id,
      kind: "expense" as const,
      label: `Compra #${i.invoice_number}`,
      amount: -num(i.total),
      date: i.paid_at,
      day: dayOfInstant(i.paid_at, tz),
    })),
    ...newest(rows.expenses, (e) => e.expense_date).map((e) => ({
      id: e.id,
      kind: "expense" as const,
      label: e.description,
      amount: -num(e.amount),
      date: e.expense_date,
      day: e.expense_date,
    })),
  ]
    .sort((a, b) => +new Date(b.date) - +new Date(a.date))
    .slice(0, 8);

  // Desglose por categoría. Las compras entran como una porción propia para que
  // el total del gráfico coincida con el KPI de Gastos totales.
  const slices = new Map<string, ExpenseSlice>();
  for (const e of rows.expenses) {
    const category = e.category;
    const id = category?.id ?? "sin-categoria";
    const current = slices.get(id) ?? {
      id,
      label: category?.name ?? "Sin categoría",
      color: category?.color ?? "#94a3b8",
      amount: 0,
    };
    current.amount = addMoney(current.amount, e.amount);
    slices.set(id, current);
  }
  if (purchasesTotal > 0) {
    slices.set("compras", {
      id: "compras",
      label: "Compras a proveedores",
      color: PURCHASES_SLICE_COLOR,
      amount: purchasesTotal,
    });
  }

  return {
    revenue,
    expenses: totalExpenses,
    net: sumMoney([revenue, -totalExpenses]),
    salesCount: sales.length,
    ticketCount: sales.filter((s) => s.billed > 0).length,
    salesIncome,
    abonosIncome,
    invoicesIncome,
    salesBilled,
    creditIssued: sumMoney([salesBilled, -salesIncome]),
    monthly: months.map((m) => buckets.get(m.key)!),
    recent,
    expensesByCategory: [...slices.values()].sort((a, b) => b.amount - a.amount),
  };
}

type PagedQuery<T> = PromiseLike<{ data: T[] | null; error: unknown }>;

interface AbonoQueryRow {
  id: string;
  amount: number;
  created_at: string;
  customers: { full_name: string } | null;
}

interface ExpenseQueryRow {
  id: string;
  description: string;
  amount: number;
  expense_date: string;
  expense_categories: { id: string; name: string; color: string } | null;
}

/** Ruta de respaldo: trae las filas y agrega en el navegador. */
async function fetchOverviewPaged(range: IsoRange, monthCount: number, tz?: string): Promise<FinanceOverview> {
  const supabase = createClient();
  const inInstant = instantFilter(range);
  const inDay = dayFilter(range, tz);
  // Todas las consultas se paginan (fetchAllRows): sin eso PostgREST devolvía
  // las primeras 1.000 filas y los KPIs del panel salían por debajo de lo real.
  // El `id` desempata el orden para que ninguna fila caiga entre dos páginas.
  const [allSales, allAbonos, allExpenses, allPaidInvoices] = await Promise.all([
    fetchAllRows<OverviewSaleRow>((from, to) =>
      supabase
        .from("sales")
        // Las filas de pago dicen cuánto entró de verdad (un fiado no es caja).
        .select("id, sale_number, total, payment_method, created_at, sale_payments(payment_method, amount)")
        // Solo se usan las completadas: filtrar acá ahorra páginas.
        .eq("status", "completed")
        .order("created_at", { ascending: false })
        .order("id")
        .range(from, to) as unknown as PagedQuery<OverviewSaleRow>,
    ),
    // Abonos de fiado: plata que entra el día que se cobra, no el día que se fió.
    fetchAllRows<AbonoQueryRow>((from, to) =>
      supabase
        .from("customer_payments")
        .select("id, amount, created_at, customers(full_name)")
        .order("created_at", { ascending: false })
        .order("id")
        .range(from, to) as unknown as PagedQuery<AbonoQueryRow>,
    ),
    fetchAllRows<ExpenseQueryRow>((from, to) =>
      supabase
        .from("expenses")
        // La categoría viene embebida para el desglose del panel: sin ella habría
        // que pedir la tabla de gastos dos veces.
        .select("id, description, amount, expense_date, expense_categories(id, name, color)")
        .order("expense_date", { ascending: false })
        .order("id")
        .range(from, to) as unknown as PagedQuery<ExpenseQueryRow>,
    ),
    // `type` es OBLIGATORIO en este select: la tabla `invoices` guarda las dos
    // puntas del negocio (`compra` es un GASTO; `factura` un INGRESO). Se
    // fechan por `paid_at`: el flujo de caja cuenta cuando la plata se mueve,
    // no cuando se emitió el documento.
    fetchAllRows<OverviewDocRow>((from, to) =>
      supabase
        .from("invoices")
        .select("id, invoice_number, type, total, paid_at")
        .eq("status", "paid")
        // Las cotizaciones no son plata: ni se piden (ver `invoiceRole`).
        .in("type", ["factura", "compra"])
        .not("paid_at", "is", null)
        .order("paid_at", { ascending: false })
        .order("id")
        .range(from, to) as unknown as PagedQuery<OverviewDocRow>,
    ),
  ]);

  // El período se aplica acá y no en la consulta: es la ruta de respaldo (la
  // base sin el RPC) y así las consultas siguen siendo simples.
  return aggregateOverview(
    {
      sales: allSales.filter((s) => inInstant(s.created_at)),
      abonos: allAbonos
        .filter((a) => inInstant(a.created_at))
        .map((a) => ({
          id: a.id,
          amount: a.amount,
          created_at: a.created_at,
          customer_name: a.customers?.full_name ?? null,
        })),
      docs: allPaidInvoices.filter((i) => inInstant(i.paid_at)),
      expenses: allExpenses
        .filter((e) => inDay(e.expense_date))
        .map((e) => ({
          id: e.id,
          description: e.description,
          amount: e.amount,
          expense_date: e.expense_date,
          category: e.expense_categories ?? null,
        })),
    },
    lastMonths(monthCount, new Date(), tz),
    tz,
  );
}

export async function createExpense(input: NewExpenseInput): Promise<Expense> {
  const supabase = createClient();
  const amount = parseFloat(input.amount);
  if (!input.description.trim()) throw new Error("La descripción es obligatoria.");
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("El monto debe ser mayor que cero.");
  let categoryId = input.category_id;
  if (!categoryId) {
    const { data: defaultCategory } = await supabase.from("expense_categories").select("id").eq("is_default", true).eq("is_active", true).maybeSingle();
    categoryId = defaultCategory?.id;
  }
  const { data, error } = await supabase
    .from("expenses")
    .insert({
      description: input.description,
      // New records use the FK; the legacy text column is left empty instead
      // of storing a UUID where old reports expect a human-readable label.
      category: input.category_id ? null : input.category || null,
      category_id: categoryId || null,
      amount,
      expense_date: input.expense_date,
    })
    .select("id, description, category, amount, expense_date")
    .single();
  if (error) throw error;
  return data as Expense;
}

// ---------------------------------------------------------------------------
// Período del panel (F2): selector, rango y comparación contra el anterior.
// Todo lo de esta sección es puro salvo las funciones `fetch*`.
// ---------------------------------------------------------------------------

/** Rango en ISO (instantes). `to` es EXCLUSIVO, igual que en los RPC. */
export interface IsoRange {
  from: string | null;
  to: string | null;
}

export const ALL_TIME: IsoRange = { from: null, to: null };

/**
 * Zona del dispositivo que mira. Es el RESPALDO de `fetchBusinessTimeZone`
 * (negocio sin `business_sites` o con una zona inválida), no la fuente.
 */
export function browserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Bogota";
  } catch {
    return "America/Bogota";
  }
}

/** ¿Este instante cae en el rango? (para `timestamptz`) */
function instantFilter(range: IsoRange) {
  const from = range.from ? new Date(range.from).getTime() : -Infinity;
  const to = range.to ? new Date(range.to).getTime() : Infinity;
  return (iso: string) => {
    const t = new Date(iso).getTime();
    return t >= from && t < to;
  };
}

/** ¿Este día de calendario cae en el rango? (para columnas `date`) */
function dayFilter(range: IsoRange, tz?: string) {
  const from = range.from ? dayOfInstant(range.from, tz) : null;
  const to = range.to ? dayOfInstant(range.to, tz) : null;
  return (day: string) => (!from || day >= from) && (!to || day < to);
}

export type HomePeriodId = "today" | "last7" | "month" | "lastMonth" | "custom";

export const HOME_PERIODS: { id: HomePeriodId; label: string }[] = [
  { id: "today", label: "Hoy" },
  { id: "last7", label: "7 días" },
  { id: "month", label: "Este mes" },
  { id: "lastMonth", label: "Mes pasado" },
  { id: "custom", label: "Personalizado" },
];

/** Rango de calendario LOCAL: medianoches del negocio, `to` exclusivo. */
export interface LocalRange {
  from: Date;
  to: Date;
}

const midnight = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const plusDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const daysBetween = (a: Date, b: Date) =>
  Math.round((midnight(b).getTime() - midnight(a).getTime()) / 86_400_000);

/** "YYYY-MM-DD" → medianoche local de ese día. */
function localDay(iso: string): Date {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

/**
 * Rango del período elegido.
 *
 * "Este mes" es el mes de calendario COMPLETO (del 1 al 1 del siguiente), el
 * mismo corte que usa Gastos (`resolveExpenseRange`). Antes cortaba en mañana
 * y Gastos en fin de mes: un arriendo cargado con fecha del 30 salía en una
 * pantalla y no en la otra. Ventas y abonos no tienen futuro, así que para
 * ellos da lo mismo; la comparación justa ("los mismos días transcurridos")
 * la arma `previousPeriod` con la fecha de hoy, no con el largo del rango.
 *
 * `tz` es la zona del negocio: decide qué día es "hoy". Sin ella, el del
 * dispositivo.
 *
 * "Personalizado" sin las dos fechas devuelve null: no hay nada que pedir.
 */
export function homePeriodRange(
  id: HomePeriodId,
  now: Date = new Date(),
  customFrom = "",
  customTo = "",
  tz?: string,
): LocalRange | null {
  const today = todayIn(now, tz);
  switch (id) {
    case "today":
      return { from: today, to: plusDays(today, 1) };
    case "last7":
      return { from: plusDays(today, -6), to: plusDays(today, 1) };
    case "month":
      return {
        from: new Date(today.getFullYear(), today.getMonth(), 1),
        to: new Date(today.getFullYear(), today.getMonth() + 1, 1),
      };
    case "lastMonth":
      return {
        from: new Date(today.getFullYear(), today.getMonth() - 1, 1),
        to: new Date(today.getFullYear(), today.getMonth(), 1),
      };
    case "custom": {
      if (!customFrom || !customTo) return null;
      const a = localDay(customFrom);
      const b = localDay(customTo);
      const [from, to] = a <= b ? [a, b] : [b, a];
      return { from, to: plusDays(to, 1) };
    }
  }
}

/**
 * El período contra el que se compara.
 *
 * - Hoy, 7 días y Personalizado: el tramo del MISMO largo inmediatamente antes
 *   (hoy contra ayer, la semana contra la anterior).
 * - Este mes y Mes pasado: el mes anterior, con los MISMOS días transcurridos.
 *   Comparar del 1 al 6 de octubre contra septiembre entero daría "▼ 80 %"
 *   todos los principios de mes, y es mentira.
 */
export function previousPeriod(
  id: HomePeriodId,
  range: LocalRange,
  now: Date = new Date(),
  tz?: string,
): LocalRange {
  const span = daysBetween(range.from, range.to);
  if (id === "lastMonth") {
    // Un mes completo se compara con el mes completo anterior, sea del largo que sea.
    return { from: new Date(range.from.getFullYear(), range.from.getMonth() - 1, 1), to: range.from };
  }
  if (id === "month") {
    // Días TRANSCURRIDOS del mes (hoy incluido), no el largo del rango: el
    // rango llega a fin de mes, pero comparar contra el mes anterior entero
    // sería injusto los primeros días.
    const tomorrow = plusDays(todayIn(now, tz), 1);
    const elapsed = daysBetween(range.from, tomorrow < range.to ? tomorrow : range.to);
    const from = new Date(range.from.getFullYear(), range.from.getMonth() - 1, 1);
    const sameSpan = plusDays(from, elapsed);
    // Un mes más corto (marzo contra febrero) no puede invadir el actual.
    const to = sameSpan < range.from ? sameSpan : range.from;
    return { from, to };
  }
  return { from: plusDays(range.from, -span), to: range.from };
}

/**
 * Rango local → ISO para los RPC. Con `tz`, cada punta es la medianoche de
 * ese día EN LA ZONA DEL NEGOCIO; sin ella, la del dispositivo.
 */
export function toIsoRange(range: LocalRange, tz?: string): IsoRange {
  if (tz && isValidTimeZone(tz)) {
    return {
      from: zonedMidnight(toISODate(range.from), tz).toISOString(),
      to: zonedMidnight(toISODate(range.to), tz).toISOString(),
    };
  }
  return { from: range.from.toISOString(), to: range.to.toISOString() };
}

/** Cómo se nombra un rango: "6 oct", "1–6 sep", "28 sep – 4 oct", "sep 2026". */
export function rangeLabel(range: LocalRange): string {
  const last = plusDays(range.to, -1);
  const span = daysBetween(range.from, range.to);
  const month = (d: Date) => d.toLocaleDateString("es-CO", { month: "short" }).replace(".", "");
  const isWholeMonth =
    range.from.getDate() === 1 &&
    range.to.getDate() === 1 &&
    span >= 28 &&
    span <= 31;
  if (isWholeMonth) return `${month(range.from)} ${range.from.getFullYear()}`;
  if (span === 1) return `${range.from.getDate()} ${month(range.from)}`;
  if (range.from.getMonth() === last.getMonth() && range.from.getFullYear() === last.getFullYear()) {
    return `${range.from.getDate()}–${last.getDate()} ${month(last)}`;
  }
  return `${range.from.getDate()} ${month(range.from)} – ${last.getDate()} ${month(last)}`;
}

/**
 * Variación relativa contra el período anterior. null cuando el anterior es
 * cero: "▲ ∞ %" no informa nada, y "▲ 100 %" sería inventado.
 */
export function pctChange(current: number, previous: number): number | null {
  if (!Number.isFinite(current) || !Number.isFinite(previous) || previous === 0) return null;
  return (current - previous) / Math.abs(previous);
}

/** "▲ 12 %", "▼ 3,5 %", "= 0 %". Una cifra decimal solo debajo de 10 %. */
export function formatChange(pct: number): string {
  const abs = Math.abs(pct * 100);
  const rounded = abs < 10 ? Math.round(abs * 10) / 10 : Math.round(abs);
  if (rounded === 0) return "= 0 %";
  const text = rounded.toLocaleString("es-CO", { maximumFractionDigits: 1 });
  return `${pct > 0 ? "▲" : "▼"} ${text} %`;
}

export type ChangeTone = "good" | "bad" | "neutral";

/** Subir es bueno en ingresos y flujo, y malo en egresos. */
export function changeTone(pct: number | null, higherIsBetter: boolean): ChangeTone {
  if (pct === null || Math.abs(pct) < 0.0005) return "neutral";
  return pct > 0 === higherIsBetter ? "good" : "bad";
}

/** Variaciones de los KPIs del período contra el anterior. */
export interface PeriodComparison {
  revenue: number | null;
  expenses: number | null;
  net: number | null;
  salesCount: number | null;
}

export function comparePeriods(current: FinanceOverview, previous: FinanceOverview): PeriodComparison {
  return {
    revenue: pctChange(current.revenue, previous.revenue),
    expenses: pctChange(current.expenses, previous.expenses),
    net: pctChange(current.net, previous.net),
    salesCount: pctChange(current.salesCount, previous.salesCount),
  };
}

/** Primer día del mes `n - 1` meses atrás: el arranque del gráfico de `n` meses. */
export function chartStart(n: number = MONTHS, now: Date = new Date(), tz?: string): Date {
  const today = todayIn(now, tz);
  return new Date(today.getFullYear(), today.getMonth() - (n - 1), 1);
}

/**
 * Datos del panel: el período, el anterior y los seis meses del gráfico, en
 * paralelo. Son tres llamadas al mismo RPC, que agrega en SQL y devuelve unos
 * cientos de bytes cada una sin importar cuántas ventas tenga el negocio.
 */
export async function fetchHomeOverview(
  current: LocalRange,
  previous: LocalRange,
  tz: string = browserTimeZone(),
): Promise<{ current: FinanceOverview; previous: FinanceOverview; chart: FinanceOverview }> {
  const start = chartStart(MONTHS, new Date(), tz);
  const [cur, prev, chart] = await Promise.all([
    fetchOverview(toIsoRange(current, tz), 1, tz),
    fetchOverview(toIsoRange(previous, tz), 1, tz),
    fetchOverview({ from: toIsoRange({ from: start, to: start }, tz).from, to: null }, MONTHS, tz),
  ]);
  return { current: cur, previous: prev, chart };
}

// ---- Gráfico (F4) ----

/** Paso "redondo" (1, 2, 2,5, 5 × 10^n) para las líneas guía del eje. */
function niceStep(raw: number): number {
  if (raw <= 0) return 1;
  const exp = Math.floor(Math.log10(raw));
  const base = 10 ** exp;
  const f = raw / base;
  const nice = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
  return nice * base;
}

/**
 * Escala del gráfico: tope redondeado y marcas del eje. El tope es el primer
 * múltiplo del paso que cubre el máximo, así las líneas guía caen en números
 * que se leen ("$ 500 mil", no "$ 487.312").
 */
export function chartScale(values: number[], tickCount = 4): { max: number; ticks: number[] } {
  const peak = Math.max(0, ...values.filter((v) => Number.isFinite(v)));
  if (peak === 0) return { max: 1, ticks: [0] };
  // Se prueban tres densidades de marcas y gana la de techo más bajo: con un
  // solo paso, 487.312 terminaba en un eje hasta 600.000.
  let step = niceStep(peak / tickCount);
  let max = Math.ceil(peak / step - 1e-9) * step;
  for (const n of [tickCount - 1, tickCount + 1]) {
    if (n < 2) continue;
    const st = niceStep(peak / n);
    const mx = Math.ceil(peak / st - 1e-9) * st;
    if (mx < max) {
      step = st;
      max = mx;
    }
  }
  const ticks: number[] = [];
  for (let i = 0; i * step <= max + step / 2; i++) ticks.push(Math.round(i * step * 100) / 100);
  return { max, ticks };
}

/** Monto abreviado para etiquetas del gráfico: "$ 1,2 M", "$ 850 mil". */
export function compactMoney(amount: number, currency = "COP"): string {
  try {
    return new Intl.NumberFormat("es-CO", {
      style: "currency",
      currency,
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(amount);
  } catch {
    return String(Math.round(amount));
  }
}

// ---------------------------------------------------------------------------
// Pendientes de hoy (F6)
// ---------------------------------------------------------------------------

export type PendingId =
  | "appointments"
  | "credits"
  | "overdueInvoices"
  | "commissions"
  | "openShift"
  | "license";

/**
 * Qué pendientes aplican a esta persona. NO decide por tipo de negocio ni por
 * módulo: recibe los ids del menú que ya calcularon `visibleNavItems` /
 * `workerNavItems` (config/business.ts) y pregunta "¿existe la pantalla?". Así
 * un pendiente nunca aparece en un negocio que no tiene a dónde llevarlo, y la
 * regla de visibilidad sigue viviendo en un solo lugar.
 */
export function pendingChecksFor(navIds: readonly string[], isOwner: boolean): PendingId[] {
  const has = (id: string) => navIds.includes(id);
  const out: PendingId[] = [];
  if (has("calendar")) out.push("appointments");
  if (has("credits")) out.push("credits");
  if (has("billing")) out.push("overdueInvoices");
  // Liquidar es del dueño (el RPC revalida `is_tenant_owner()`).
  if (isOwner && has("commissions")) out.push("commissions");
  if (has("pos")) out.push("openShift");
  // La licencia la paga el dueño; un trabajador no tiene nada que hacer con ella.
  if (isOwner && has("subscription")) out.push("license");
  return out;
}

/** Lo que devuelven las consultas: conteos, y para la licencia los DÍAS que faltan. */
export type PendingCounts = Partial<Record<PendingId, number>>;

export interface PendingItem {
  id: PendingId;
  count: number;
  label: string;
  href: string;
  tone: "info" | "warn" | "danger";
}

/** Días antes del vencimiento en que se empieza a avisar de la licencia. */
export const LICENSE_WARN_DAYS = 7;

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * Conteos → tarjetas. Lo que está en cero (o no se pudo consultar) no se
 * muestra: "0 facturas vencidas" es ruido en un bloque que se llama
 * "Pendientes". La licencia es distinta: su número son DÍAS, y solo se avisa
 * dentro de la ventana.
 */
export function pendingItems(
  checks: PendingId[],
  counts: PendingCounts,
  shiftHref = "/dashboard/staff",
): PendingItem[] {
  const out: PendingItem[] = [];
  for (const id of checks) {
    const n = counts[id];
    if (n === undefined || !Number.isFinite(n)) continue;
    switch (id) {
      case "appointments":
        if (n > 0) out.push({ id, count: n, label: `${plural(n, "cita", "citas")} para hoy`, href: "/dashboard/calendar", tone: "info" });
        break;
      case "credits":
        if (n > 0) out.push({ id, count: n, label: `${plural(n, "cliente", "clientes")} con fiado por cobrar`, href: "/dashboard/credits", tone: "warn" });
        break;
      case "overdueInvoices":
        if (n > 0) out.push({ id, count: n, label: plural(n, "factura vencida", "facturas vencidas"), href: "/dashboard/billing?filtro=vencidas", tone: "danger" });
        break;
      case "commissions":
        if (n > 0) out.push({ id, count: n, label: `${plural(n, "comisión", "comisiones")} sin liquidar`, href: "/dashboard/staff/comisiones", tone: "warn" });
        break;
      case "openShift":
        if (n > 0) out.push({ id, count: n, label: plural(n, "turno de caja abierto", "turnos de caja abiertos"), href: shiftHref, tone: "info" });
        break;
      case "license":
        if (n <= LICENSE_WARN_DAYS) {
          const label =
            n < 0
              ? `Tu plan venció hace ${plural(-n, "día", "días")}`
              : n === 0
                ? "Tu plan vence hoy"
                : `Tu plan vence en ${plural(n, "día", "días")}`;
          out.push({ id, count: n, label, href: "/dashboard/subscription", tone: n <= 2 ? "danger" : "warn" });
        }
        break;
    }
  }
  return out;
}

/**
 * Días de calendario entre hoy y una fecha (negativo = ya pasó). Acepta una
 * columna `date` ("YYYY-MM-DD", sin correrla por zona) o un instante.
 */
export function daysFromToday(value: string, now: Date = new Date()): number {
  const target = value.length <= 10 ? localDay(value) : midnight(new Date(value));
  return daysBetween(midnight(now), target);
}

type CountResult = PromiseLike<{ count: number | null; error: unknown }>;

/** Un conteo que falla no tumba el bloque: ese pendiente simplemente no se muestra. */
async function safeCount(query: CountResult): Promise<number | undefined> {
  try {
    const { count, error } = await query;
    return error ? undefined : (count ?? 0);
  } catch {
    return undefined;
  }
}

async function licenseDaysLeft(now: Date): Promise<number | undefined> {
  try {
    const supabase = createClient();
    // Una licencia de revendedor manda sobre el cobro en línea (ver AGENTS.md).
    const [lic, sub] = await Promise.all([
      supabase.from("client_licenses").select("period_end").maybeSingle(),
      supabase.from("subscriptions").select("current_period_end").maybeSingle(),
    ]);
    const end =
      (!lic.error && lic.data?.period_end) || (!sub.error && sub.data?.current_period_end) || null;
    return end ? daysFromToday(end, now) : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Conteos de los pendientes pedidos, todos en paralelo. Son `count` con
 * `head: true`: la base cuenta y no devuelve ni una fila. Ninguno lanza.
 */
export async function fetchPendingCounts(checks: PendingId[], now: Date = new Date()): Promise<PendingCounts> {
  const supabase = createClient();
  const today = toISODate(now);
  const head = { count: "exact" as const, head: true };

  const tasks: Record<PendingId, () => Promise<number | undefined>> = {
    appointments: () =>
      safeCount(
        supabase
          .from("appointments")
          .select("id", head)
          .eq("appointment_date", today)
          .in("status", ["pending", "confirmed"]),
      ),
    credits: () => safeCount(supabase.from("customers").select("id", head).gt("credit_balance", 0)),
    overdueInvoices: () =>
      safeCount(
        supabase
          .from("invoices")
          .select("id", head)
          .eq("type", "factura")
          .eq("status", "pending")
          .lt("due_date", today),
      ),
    commissions: () =>
      safeCount(
        supabase
          .from("sale_items")
          .select("id, sales!inner(status)", head)
          .gt("commission_amount", 0)
          .is("commission_settlement_id", null)
          .eq("sales.status", "completed"),
      ),
    openShift: () => safeCount(supabase.from("shifts").select("id", head).eq("status", "open")),
    license: () => licenseDaysLeft(now),
  };

  const values = await Promise.all(checks.map((id) => tasks[id]()));
  const out: PendingCounts = {};
  checks.forEach((id, i) => {
    const v = values[i];
    if (v !== undefined) out[id] = v;
  });
  return out;
}
