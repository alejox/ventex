import { createClient } from "@/utils/supabase/client";
import { toISODate } from "@/lib/date";

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
  net: number;
  salesCount: number;
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
  category_id?: string;
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
      // La categoría viene embebida para el desglose del panel: sin ella habría
      // que pedir la tabla de gastos dos veces.
      .select("id, description, category, amount, expense_date, expense_categories(id, name, color)")
      .order("expense_date", { ascending: false }),
    // `type` es OBLIGATORIO en este select: la tabla `invoices` guarda las dos
    // puntas del negocio. `type = 'compra'` es lo que se le compra a un
    // proveedor (un GASTO); 'factura' y 'cotizacion' son lo que se le cobra a
    // un cliente (un INGRESO). Los otros dos servicios que leen esta tabla ya
    // discriminan —`purchases.service.ts` con .eq("type","compra") y
    // `billing.service.ts` con .neq("type","compra")—; este era el único que
    // no, y por eso sumaba las compras como ingreso.
    supabase
      .from("invoices")
      .select("id, invoice_number, type, total, status, issue_date")
      .eq("status", "paid")
      .order("issue_date", { ascending: false }),
  ]);
  if (salesRes.error) throw salesRes.error;
  if (expRes.error) throw expRes.error;
  if (invRes.error) throw invRes.error;

  const sales = salesRes.data ?? [];
  const expenses = expRes.data ?? [];
  const paidInvoices = invRes.data ?? [];

  // Facturas de VENTA pagadas: ingreso. Las pendientes y las cotizaciones sin
  // pagar ya quedaron afuera por el filtro de status.
  const salesInvoices = paidInvoices.filter((i) => i.type !== "compra");
  // Compras pagadas: gasto. Se cuentan las pagadas y no todas, por coherencia
  // con el lado del ingreso: una compra a crédito todavía no salió de la caja.
  const purchases = paidInvoices.filter((i) => i.type === "compra");

  const completed = sales.filter((s) => s.status === "completed");
  const revenue =
    completed.reduce((sum, s) => sum + s.total, 0) +
    salesInvoices.reduce((sum, i) => sum + i.total, 0);
  const totalExpenses =
    expenses.reduce((sum, e) => sum + e.amount, 0) +
    purchases.reduce((sum, i) => sum + i.total, 0);

  const months = lastMonths(MONTHS);
  const buckets = new Map(months.map((m) => [m.key, { ...m, income: 0, expense: 0 }]));
  for (const s of completed) {
    const b = buckets.get(monthKeyOf(s.created_at));
    if (b) b.income += s.total;
  }
  for (const i of salesInvoices) {
    const b = buckets.get(monthKeyOf(i.issue_date));
    if (b) b.income += i.total;
  }
  for (const e of expenses) {
    const b = buckets.get(monthKeyOf(e.expense_date));
    if (b) b.expense += e.amount;
  }
  // Las compras van a la barra de gastos del mes. Sin esto el gráfico mostraba
  // seis meses sin una sola barra roja aunque el negocio comprara mercadería.
  for (const i of purchases) {
    const b = buckets.get(monthKeyOf(i.issue_date));
    if (b) b.expense += i.total;
  }

  const recent: FinanceTransaction[] = [
    ...completed.slice(0, 8).map((s) => ({
      id: s.id,
      kind: "sale" as const,
      label: `Venta #${s.sale_number}`,
      amount: s.total,
      date: s.created_at,
      // Instante → día del mostrador. Una venta de las 8 de la noche en UTC-5
      // es del día siguiente en UTC, y así se mostraba corrida.
      day: toISODate(new Date(s.created_at)),
    })),
    ...salesInvoices.slice(0, 8).map((i) => ({
      id: i.id,
      kind: "sale" as const,
      label: `Factura #${i.invoice_number}`,
      amount: i.total,
      date: i.issue_date,
      day: i.issue_date,
    })),
    // El signo negativo es lo que la fila usa para pintarse en rojo con una
    // flecha hacia abajo: una compra tiene que LEERSE como plata que sale.
    ...purchases.slice(0, 8).map((i) => ({
      id: i.id,
      kind: "expense" as const,
      label: `Compra #${i.invoice_number}`,
      amount: -i.total,
      date: i.issue_date,
      day: i.issue_date,
    })),
    ...expenses.slice(0, 8).map((e) => ({
      id: e.id,
      kind: "expense" as const,
      label: e.description,
      amount: -e.amount,
      date: e.expense_date,
      day: e.expense_date,
    })),
  ]
    .sort((a, b) => +new Date(b.date) - +new Date(a.date))
    .slice(0, 8);

  // Desglose por categoría. Las compras entran como una porción propia para que
  // el total del gráfico coincida con el KPI de Gastos totales.
  const slices = new Map<string, ExpenseSlice>();
  for (const e of expenses) {
    const category = (e as { expense_categories?: { id: string; name: string; color: string } | null })
      .expense_categories;
    const id = category?.id ?? "sin-categoria";
    const current = slices.get(id) ?? {
      id,
      label: category?.name ?? "Sin categoría",
      color: category?.color ?? "#94a3b8",
      amount: 0,
    };
    current.amount += e.amount;
    slices.set(id, current);
  }

  const purchasesTotal = purchases.reduce((sum, i) => sum + i.total, 0);
  if (purchasesTotal > 0) {
    slices.set("compras", {
      id: "compras",
      label: "Compras a proveedores",
      color: PURCHASES_SLICE_COLOR,
      amount: purchasesTotal,
    });
  }

  const expensesByCategory = [...slices.values()].sort((a, b) => b.amount - a.amount);

  return {
    revenue,
    expenses: totalExpenses,
    net: revenue - totalExpenses,
    salesCount: completed.length,
    monthly: months.map((m) => buckets.get(m.key)!),
    recent,
    expensesByCategory,
  };
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
