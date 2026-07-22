import { createClient } from "@/utils/supabase/client";

// ---- Tipos del dominio de finanzas ----
export interface MonthlyPoint {
  key: string; // "YYYY-MM"
  label: string;
  income: number;
  expense: number;
}

export interface FinanceTransaction {
  id: string;
  kind: "sale" | "expense";
  label: string;
  amount: number; // positivo = ingreso, negativo = gasto
  date: string;
}

export interface FinanceOverview {
  revenue: number;
  expenses: number;
  net: number;
  salesCount: number;
  monthly: MonthlyPoint[];
  recent: FinanceTransaction[];
}

/** Corte del día en curso para el KPI "Ventas hoy" del panel. */
export interface TodaySales {
  count: number;
  revenue: number;
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
  amount: string;
  expense_date: string;
}

const MONTHS = 6;

/** Últimos N meses (incluido el actual) como claves "YYYY-MM" con etiqueta corta. */
function lastMonths(n: number): { key: string; label: string }[] {
  const out: { key: string; label: string }[] = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const label = d.toLocaleDateString("es-ES", { month: "short" }).replace(".", "");
    out.push({ key, label: label.charAt(0).toUpperCase() + label.slice(1) });
  }
  return out;
}

// created_at (ISO) y expense_date ("YYYY-MM-DD") comparten los primeros 7 chars.
const monthKeyOf = (value: string) => value.slice(0, 7);

/**
 * Ventas completadas desde la medianoche local. La medianoche se calcula en el
 * navegador y se manda en ISO: el corte del día es el del negocio, no UTC.
 */
export async function fetchTodaySales(): Promise<TodaySales> {
  const supabase = createClient();
  const midnight = new Date();
  midnight.setHours(0, 0, 0, 0);

  const { data, count, error } = await supabase
    .from("sales")
    .select("total", { count: "exact" })
    .gte("created_at", midnight.toISOString())
    .eq("status", "completed");
  if (error) throw error;

  return {
    count: count ?? 0,
    revenue: (data ?? []).reduce((s, r) => s + (r.total ?? 0), 0),
  };
}

export async function fetchOverview(): Promise<FinanceOverview> {
  const supabase = createClient();
  const [salesRes, expRes, invRes] = await Promise.all([
    supabase
      .from("sales")
      .select("id, sale_number, total, status, created_at")
      .order("created_at", { ascending: false }),
    supabase
      .from("expenses")
      .select("id, description, category, amount, expense_date")
      .order("expense_date", { ascending: false }),
    supabase
      .from("invoices")
      .select("id, invoice_number, total, status, issue_date")
      .eq("status", "paid")
      .order("issue_date", { ascending: false }),
  ]);
  if (salesRes.error) throw salesRes.error;
  if (expRes.error) throw expRes.error;
  if (invRes.error) throw invRes.error;

  const sales = salesRes.data ?? [];
  const expenses = expRes.data ?? [];
  // Facturas pagadas cuentan como ingreso (las cotizaciones/pendientes no).
  const invoices = invRes.data ?? [];

  const completed = sales.filter((s) => s.status === "completed");
  const revenue =
    completed.reduce((sum, s) => sum + s.total, 0) +
    invoices.reduce((sum, i) => sum + i.total, 0);
  const totalExpenses = expenses.reduce((sum, e) => sum + e.amount, 0);

  const months = lastMonths(MONTHS);
  const buckets = new Map(months.map((m) => [m.key, { ...m, income: 0, expense: 0 }]));
  for (const s of completed) {
    const b = buckets.get(monthKeyOf(s.created_at));
    if (b) b.income += s.total;
  }
  for (const i of invoices) {
    const b = buckets.get(monthKeyOf(i.issue_date));
    if (b) b.income += i.total;
  }
  for (const e of expenses) {
    const b = buckets.get(monthKeyOf(e.expense_date));
    if (b) b.expense += e.amount;
  }

  const recent: FinanceTransaction[] = [
    ...completed.slice(0, 8).map((s) => ({
      id: s.id,
      kind: "sale" as const,
      label: `Venta #${s.sale_number}`,
      amount: s.total,
      date: s.created_at,
    })),
    ...invoices.slice(0, 8).map((i) => ({
      id: i.id,
      kind: "sale" as const,
      label: `Factura #${i.invoice_number}`,
      amount: i.total,
      date: i.issue_date,
    })),
    ...expenses.slice(0, 8).map((e) => ({
      id: e.id,
      kind: "expense" as const,
      label: e.description,
      amount: -e.amount,
      date: e.expense_date,
    })),
  ]
    .sort((a, b) => +new Date(b.date) - +new Date(a.date))
    .slice(0, 8);

  return {
    revenue,
    expenses: totalExpenses,
    net: revenue - totalExpenses,
    salesCount: completed.length,
    monthly: months.map((m) => buckets.get(m.key)!),
    recent,
  };
}

export async function createExpense(input: NewExpenseInput): Promise<Expense> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("expenses")
    .insert({
      description: input.description,
      category: input.category || null,
      amount: parseFloat(input.amount),
      expense_date: input.expense_date,
    })
    .select("id, description, category, amount, expense_date")
    .single();
  if (error) throw error;
  return data as Expense;
}
