import { createClient } from "@/utils/supabase/client";
import {
  browserTimeZone,
  fetchAllRows,
  fetchOverview,
  todayIn,
  type ExpenseSlice,
  type FinanceOverview,
} from "@/services/finance.service";
import { MONEY_NUM_FMT, type ExportColumn } from "@/lib/export";
import { toISODate } from "@/lib/date";
import { addMoney, sumMoney } from "@/lib/money-sum";
import { isValidTimeZone, zonedMidnight } from "@/lib/tz";

/**
 * Reportes (F10): estado de resultados por mes, medios de pago y gastos por
 * categoría, sobre un período elegido.
 *
 * Los totales salen del MISMO RPC que el Panel (`finance_overview`): los dos
 * números tienen que coincidir siempre, y la forma de garantizarlo es que no
 * existan dos cuentas. Lo único que se agrega acá es el desglose por medio de
 * pago, que el RPC no trae (ver el SQL propuesto en el informe de la tarea).
 *
 * La lógica pura (rangos de meses, filas de la tabla, reparto por medio de
 * pago) está testeada en `tests/reports.test.ts`.
 */

export type ReportPeriodId = "last6" | "last12" | "thisYear" | "lastYear" | "custom";

export const REPORT_PERIODS: { id: ReportPeriodId; label: string }[] = [
  { id: "last6", label: "Últimos 6 meses" },
  { id: "last12", label: "Últimos 12 meses" },
  { id: "thisYear", label: "Este año" },
  { id: "lastYear", label: "Año pasado" },
  { id: "custom", label: "Personalizado" },
];

/** Meses "YYYY-MM", ambos INCLUIDOS. */
export interface MonthSpan {
  fromMonth: string;
  toMonth: string;
}

const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
const monthStart = (key: string) => {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, 1);
};

/**
 * Meses del período elegido. "Personalizado" sin las dos puntas devuelve null.
 * `tz` (zona del negocio) decide en qué mes estamos; sin ella, el dispositivo.
 */
export function reportMonths(
  id: ReportPeriodId,
  nowArg: Date = new Date(),
  customFrom = "",
  customTo = "",
  tz?: string,
): MonthSpan | null {
  const now = todayIn(nowArg, tz);
  const y = now.getFullYear();
  const m = now.getMonth();
  switch (id) {
    case "last6":
      return { fromMonth: monthKey(new Date(y, m - 5, 1)), toMonth: monthKey(now) };
    case "last12":
      return { fromMonth: monthKey(new Date(y, m - 11, 1)), toMonth: monthKey(now) };
    case "thisYear":
      return { fromMonth: `${y}-01`, toMonth: monthKey(now) };
    case "lastYear":
      return { fromMonth: `${y - 1}-01`, toMonth: `${y - 1}-12` };
    case "custom": {
      if (!customFrom || !customTo) return null;
      const [a, b] = customFrom <= customTo ? [customFrom, customTo] : [customTo, customFrom];
      // El futuro no tiene movimientos: se corta en el mes en curso.
      const cap = monthKey(now);
      const to = b > cap ? cap : b;
      return { fromMonth: a > to ? to : a, toMonth: to };
    }
  }
}

/** Todos los meses del tramo, en orden. */
export function monthsIn(span: MonthSpan): string[] {
  const out: string[] = [];
  for (let d = monthStart(span.fromMonth); monthKey(d) <= span.toMonth; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) {
    out.push(monthKey(d));
    if (out.length > 240) break; // 20 años: tope de cordura
  }
  return out;
}

/**
 * Cuántos meses hacia atrás tiene que mirar el RPC para cubrir `fromMonth`.
 * `finance_overview` arma sus meses contando desde HOY (`p_months`), no desde
 * una fecha, así que "Año pasado" en octubre necesita 22.
 */
export function monthsBackTo(fromMonth: string, nowArg: Date = new Date(), tz?: string): number {
  const now = todayIn(nowArg, tz);
  const from = monthStart(fromMonth);
  return Math.max(1, (now.getFullYear() - from.getFullYear()) * 12 + (now.getMonth() - from.getMonth()) + 1);
}

/**
 * Tramo de meses → rango ISO (`to` exclusivo). Con `tz`, medianoches del
 * NEGOCIO; sin ella, del dispositivo.
 */
export function monthSpanToIso(span: MonthSpan, tz?: string): { from: string; to: string } {
  const from = monthStart(span.fromMonth);
  const last = monthStart(span.toMonth);
  const to = new Date(last.getFullYear(), last.getMonth() + 1, 1);
  if (tz && isValidTimeZone(tz)) {
    return {
      from: zonedMidnight(toISODate(from), tz).toISOString(),
      to: zonedMidnight(toISODate(to), tz).toISOString(),
    };
  }
  return { from: from.toISOString(), to: to.toISOString() };
}

export interface MonthlyRow {
  key: string;
  label: string;
  income: number;
  expense: number;
  /** Ingresos − egresos del mes (flujo de caja, compras incluidas). */
  net: number;
  /** Flujo acumulado desde el primer mes del período. */
  cumulative: number;
}

/** "oct 2026" */
export function monthLabel(key: string): string {
  const d = monthStart(key);
  return `${d.toLocaleDateString("es-CO", { month: "short" }).replace(".", "")} ${d.getFullYear()}`;
}

/**
 * Filas de la tabla mensual. Un mes sin movimientos aparece igual, en cero:
 * un hueco en la tabla se lee como "falta el dato", no como "no vendí".
 */
export function monthlyRows(
  monthly: { key: string; income: number; expense: number }[],
  span: MonthSpan,
): MonthlyRow[] {
  const byKey = new Map(monthly.map((m) => [m.key, m]));
  let cumulative = 0;
  return monthsIn(span).map((key) => {
    const income = byKey.get(key)?.income ?? 0;
    const expense = byKey.get(key)?.expense ?? 0;
    // En centavos: el acumulado de doce meses no puede terminar en …,99999.
    const net = sumMoney([income, -expense]);
    cumulative = addMoney(cumulative, net);
    return { key, label: monthLabel(key), income, expense, net, cumulative };
  });
}

export function totalsOf(rows: MonthlyRow[]): { income: number; expense: number; net: number } {
  const income = sumMoney(rows.map((r) => r.income));
  const expense = sumMoney(rows.map((r) => r.expense));
  return { income, expense, net: sumMoney([income, -expense]) };
}

// ---- Medios de pago ----

export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  efectivo: "Efectivo",
  tarjeta: "Datáfono",
  transferencia: "Transferencia",
  credito: "Crédito / Fiado",
  abonos: "Abonos de fiado",
  facturas: "Facturas cobradas",
};

export interface SaleWithPayments {
  total: number | string;
  payment_method: string;
  sale_payments?: { payment_method: string; amount: number | string }[] | null;
}

export interface PaymentSlice {
  method: string;
  label: string;
  amount: number;
  /** Ventas en las que apareció este medio (una venta dividida cuenta en cada uno). */
  count: number;
}

/**
 * Reparte las ventas por medio de pago.
 *
 * Una venta con filas en `sale_payments` se reparte según ellas: un pago
 * dividido de $50.000 en efectivo + $30.000 por Nequi suma en los dos medios,
 * y no los $80.000 a "Pago dividido", que no es un medio. Las ventas viejas
 * sin filas de pago caen enteras en su `payment_method`.
 */
export function paymentBreakdown(sales: SaleWithPayments[]): PaymentSlice[] {
  const map = new Map<string, PaymentSlice>();
  const add = (method: string, amount: number) => {
    const key = method || "otro";
    const slice = map.get(key) ?? { method: key, label: PAYMENT_METHOD_LABELS[key] ?? key, amount: 0, count: 0 };
    slice.amount = addMoney(slice.amount, amount);
    slice.count += 1;
    map.set(key, slice);
  };
  for (const sale of sales) {
    const payments = (sale.sale_payments ?? []).filter((p) => Number(p.amount) > 0);
    if (payments.length > 0) {
      // Un mismo medio repetido dentro de la venta cuenta UNA vez en `count`.
      const perMethod = new Map<string, number>();
      for (const p of payments) perMethod.set(p.payment_method, addMoney(perMethod.get(p.payment_method) ?? 0, p.amount));
      for (const [method, amount] of perMethod) add(method, amount);
    } else if (Number(sale.total) > 0) {
      add(sale.payment_method, Number(sale.total));
    }
  }
  return [...map.values()].sort((a, b) => b.amount - a.amount);
}

/**
 * Suma las facturas cobradas como un "medio" más, para que el desglose sume lo
 * mismo que los ingresos del período. Se deduce por diferencia (ingresos del
 * RPC − ventas del POS) en vez de pedirlas aparte: así cuadra por construcción.
 */
export function withInvoiceIncome(slices: PaymentSlice[], revenue: number): PaymentSlice[] {
  const pos = sumMoney(slices.map((x) => x.amount));
  const invoices = sumMoney([revenue, -pos]);
  if (invoices <= 0.5) return slices;
  return [...slices, { method: "facturas", label: PAYMENT_METHOD_LABELS.facturas, amount: invoices, count: 0 }].sort(
    (a, b) => b.amount - a.amount,
  );
}

/**
 * Desglose de INGRESOS (caja) por medio, que suma lo mismo que `revenue`:
 * - las ventas por medio, SIN 'credito': lo fiado no entró a la caja;
 * - los abonos de fiado como una porción propia (entran cuando se cobran);
 * - las facturas cobradas, por diferencia (`withInvoiceIncome`).
 */
export function incomeBreakdown(
  sales: SaleWithPayments[],
  overview: Pick<FinanceOverview, "revenue" | "abonosIncome">,
): PaymentSlice[] {
  const slices = paymentBreakdown(sales).filter((s) => s.method !== "credito");
  if (overview.abonosIncome > 0) {
    slices.push({ method: "abonos", label: PAYMENT_METHOD_LABELS.abonos, amount: overview.abonosIncome, count: 0 });
  }
  return withInvoiceIncome(slices, overview.revenue);
}

async function fetchSalesWithPayments(range: { from: string; to: string }): Promise<SaleWithPayments[]> {
  const supabase = createClient();
  return fetchAllRows<SaleWithPayments>((from, to) =>
    supabase
      .from("sales")
      .select("total, payment_method, sale_payments(payment_method, amount)")
      .eq("status", "completed")
      .gte("created_at", range.from)
      .lt("created_at", range.to)
      .order("created_at")
      .order("id")
      .range(from, to) as unknown as PromiseLike<{ data: SaleWithPayments[] | null; error: unknown }>,
  );
}

export interface ReportData {
  span: MonthSpan;
  overview: FinanceOverview;
  rows: MonthlyRow[];
  payments: PaymentSlice[];
  categories: ExpenseSlice[];
}

/**
 * Todo el reporte en paralelo: totales (RPC) y medios de pago. `tz` es la zona
 * del negocio (`fetchBusinessTimeZone`): los meses se cortan ahí.
 */
export async function fetchReport(
  span: MonthSpan,
  now: Date = new Date(),
  tz: string = browserTimeZone(),
): Promise<ReportData> {
  const range = monthSpanToIso(span, tz);
  const [overview, sales] = await Promise.all([
    fetchOverview(range, monthsBackTo(span.fromMonth, now, tz), tz),
    fetchSalesWithPayments(range),
  ]);
  return {
    span,
    overview,
    rows: monthlyRows(overview.monthly, span),
    payments: incomeBreakdown(sales, overview),
    categories: overview.expensesByCategory,
  };
}

// ---- Exportación ----

export const MONTHLY_EXPORT_COLUMNS: ExportColumn<MonthlyRow>[] = [
  { header: "Mes", value: (r) => r.key, width: 10 },
  { header: "Ingresos", value: (r) => r.income, width: 16, numFmt: MONEY_NUM_FMT },
  { header: "Egresos", value: (r) => r.expense, width: 16, numFmt: MONEY_NUM_FMT },
  { header: "Flujo de caja", value: (r) => r.net, width: 16, numFmt: MONEY_NUM_FMT },
  { header: "Flujo acumulado", value: (r) => r.cumulative, width: 16, numFmt: MONEY_NUM_FMT },
];

export const PAYMENT_EXPORT_COLUMNS: ExportColumn<PaymentSlice>[] = [
  { header: "Medio de pago", value: (p) => p.label, width: 22 },
  { header: "Ventas", value: (p) => (p.method === "facturas" || p.method === "abonos" ? null : p.count), width: 10 },
  { header: "Monto", value: (p) => p.amount, width: 16, numFmt: MONEY_NUM_FMT },
];

export const CATEGORY_EXPORT_COLUMNS: ExportColumn<ExpenseSlice>[] = [
  { header: "Categoría", value: (c) => c.label, width: 26 },
  { header: "Monto", value: (c) => c.amount, width: 16, numFmt: MONEY_NUM_FMT },
];
