import { createClient } from "@/utils/supabase/client";
import { MONEY_NUM_FMT, type ExportColumn } from "@/lib/export";
import { toISODate } from "@/lib/date";
import { fetchAllRows } from "@/services/finance.service";

export type ExpensePeriod = "today" | "yesterday" | "last7" | "month" | "lastMonth" | "all" | "custom";

export const EXPENSE_PERIODS: { id: ExpensePeriod; label: string }[] = [
  { id: "today", label: "Hoy" },
  { id: "yesterday", label: "Ayer" },
  { id: "last7", label: "Últimos 7 días" },
  { id: "month", label: "Este mes" },
  { id: "lastMonth", label: "Mes pasado" },
  { id: "all", label: "Todo" },
  { id: "custom", label: "Personalizado" },
];

export interface ExpenseCategory {
  id: string;
  name: string;
  description: string | null;
  color: string;
  is_default: boolean;
  is_active: boolean;
}

export interface ExpenseRecord {
  id: string;
  description: string;
  category: ExpenseCategory | null;
  amount: number;
  expense_date: string;
  /**
   * Retiro de caja que lo originó, si nació en el mostrador. Null = lo cargó
   * el dueño a mano. Es el discriminador de origen, y también el motivo por el
   * que un gasto puede no ser borrable (hay un trigger que lo impide).
   */
  cash_movement_id: string | null;
  /**
   * Liquidación de comisiones que lo originó, si nació de pagarle al personal.
   * Igual que `cash_movement_id`, es a la vez discriminador de origen y el
   * motivo por el que el gasto no se puede editar ni borrar a mano: su monto lo
   * fija el comprobante, y hay un trigger que lo sostiene.
   */
  commission_settlement_id: string | null;
  /** De dónde salió. Se deriva, no es una columna. */
  origin: Exclude<ExpenseOrigin, "">;
  /** Solo en las filas de compra: su factura, para poder ir a verla. */
  invoice_id?: string;
}

/** De dónde salió el gasto. "" = sin filtrar. */
export type ExpenseOrigin = "" | "manual" | "caja" | "compra" | "comision";

/**
 * Categoría sintética de las compras a proveedor.
 *
 * No existe en `expense_categories` y no se puede editar: una compra no se
 * clasifica con el catálogo de gastos operativos, se clasifica sola. El color
 * es el mismo que usa el desglose del Panel, para que la misma cosa se vea
 * igual en las dos pantallas.
 */
const PURCHASES_CATEGORY: ExpenseCategory = {
  id: "compras",
  name: "Compras",
  description: "Facturas de compra a proveedores",
  color: "#6366f1",
  is_default: false,
  is_active: true,
};

export interface ExpenseInput {
  description: string;
  amount: number;
  expense_date: string;
  category_id?: string;
}

const startOfDay = (date: Date) => {
  const out = new Date(date);
  out.setHours(0, 0, 0, 0);
  return out;
};

const dateOnly = (date: Date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

/**
 * Rango de días ("YYYY-MM-DD", `to` EXCLUSIVO) de un período de Gastos. Las
 * columnas son `date`, así que se cortan días de calendario locales y no
 * instantes.
 *
 * En "custom", `customTo` es el último día INCLUIDO: se corre al siguiente.
 * Una punta vacía deja ese lado abierto; las fechas al revés se ordenan.
 */
export function resolveExpenseRange(
  period: ExpensePeriod,
  customFrom = "",
  customTo = "",
  now: Date = new Date(),
): { from: string | null; to: string | null } {
  const today = startOfDay(now);
  if (period === "custom") {
    const [a, b] = customFrom && customTo && customFrom > customTo ? [customTo, customFrom] : [customFrom, customTo];
    const next = (day: string) => {
      const [y, m, d] = day.split("-").map(Number);
      return dateOnly(new Date(y, m - 1, d + 1));
    };
    return { from: a || null, to: b ? next(b) : null };
  }
  const add = (days: number) => {
    const d = new Date(today);
    d.setDate(d.getDate() + days);
    return dateOnly(d);
  };
  if (period === "today") return { from: add(0), to: add(1) };
  if (period === "yesterday") return { from: add(-1), to: add(0) };
  if (period === "last7") return { from: add(-6), to: add(1) };
  if (period === "month") return { from: dateOnly(new Date(today.getFullYear(), today.getMonth(), 1)), to: dateOnly(new Date(today.getFullYear(), today.getMonth() + 1, 1)) };
  if (period === "lastMonth") return { from: dateOnly(new Date(today.getFullYear(), today.getMonth() - 1, 1)), to: dateOnly(new Date(today.getFullYear(), today.getMonth(), 1)) };
  return { from: null, to: null };
}

/**
 * Día de calendario LOCAL ("YYYY-MM-DD") → instante ISO de su medianoche
 * local. Las compras se fechan por `invoices.paid_at` (un instante): el rango de
 * días de Gastos se traduce a instantes para no correr el corte del día a UTC.
 */
export function localDayStartIso(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1).toISOString();
}

export async function listExpenseCategories(includeInactive = false): Promise<ExpenseCategory[]> {
  const supabase = createClient();
  const query = supabase.from("expense_categories").select("id, name, description, color, is_default, is_active").order("name");
  const { data, error } = includeInactive ? await query : await query.eq("is_active", true);
  if (error) throw error;
  if (!includeInactive && (data ?? []).length === 0) {
    const { data: created, error: createError } = await supabase.from("expense_categories").insert({ name: "Otros", description: "Gastos todavía no clasificados", color: "#64748b", is_default: true }).select("id, name, description, color, is_default, is_active").single();
    if (!createError && created) return [created as ExpenseCategory];
  }
  return (data ?? []) as ExpenseCategory[];
}

export async function createExpenseCategory(input: Pick<ExpenseCategory, "name" | "description" | "color">): Promise<ExpenseCategory> {
  const supabase = createClient();
  const { data, error } = await supabase.from("expense_categories").insert({
    name: input.name.trim(), description: input.description?.trim() || null, color: input.color,
  }).select("id, name, description, color, is_default, is_active").single();
  if (error) throw error;
  return data as ExpenseCategory;
}

export async function updateExpenseCategory(id: string, input: Pick<ExpenseCategory, "name" | "description" | "color">): Promise<ExpenseCategory> {
  const supabase = createClient();
  const { data, error } = await supabase.from("expense_categories").update({
    name: input.name.trim(), description: input.description?.trim() || null, color: input.color,
  }).eq("id", id).select("id, name, description, color, is_default, is_active").single();
  if (error) throw error;
  return data as ExpenseCategory;
}

export async function deactivateExpenseCategory(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("expense_categories").update({ is_active: false }).eq("id", id).eq("is_default", false);
  if (error) throw error;
}

/**
 * Todo lo que sale de la caja del negocio, en una sola lista.
 *
 * Junta dos fuentes que viven en tablas distintas:
 *  - `expenses`: gastos operativos, cargados a mano o nacidos de un retiro.
 *  - `invoices` con `type = 'compra'` y pagadas: la mercadería.
 *
 * Van juntas porque el KPI "Gastos totales" del Panel ya las suma a las dos, y
 * tenerlas separadas obligaba a mirar dos pantallas y sacar la cuenta a mano.
 * Las compras vienen de solo lectura: se editan en su propia factura.
 */
export async function listExpenses(
  period: ExpensePeriod,
  search = "",
  categoryId = "",
  origin: ExpenseOrigin = "",
  customFrom = "",
  customTo = "",
): Promise<ExpenseRecord[]> {
  const supabase = createClient();
  const range = resolveExpenseRange(period, customFrom, customTo);
  const term = search.trim();

  // Filtrar por una categoría real deja fuera a las compras: no tienen una.
  const skipPurchases =
    origin === "manual" || origin === "caja" || origin === "comision" || Boolean(categoryId);
  const skipExpenses = origin === "compra";

  // Las dos consultas se paginan (fetchAllRows): PostgREST corta en 1.000
  // filas sin avisar. El `id` desempata el orden para que ninguna fila caiga
  // entre dos páginas.
  const expensesPage = (from: number, to: number) => {
    let query = supabase
      .from("expenses")
      .select("id, description, amount, expense_date, category_id, cash_movement_id, commission_settlement_id, expense_categories(id, name, description, color, is_default, is_active)");
    if (range.from) query = query.gte("expense_date", range.from);
    if (range.to) query = query.lt("expense_date", range.to);
    if (categoryId) query = query.eq("category_id", categoryId);
    // El origen se deduce de los dos vínculos, sin columna extra.
    if (origin === "caja") query = query.not("cash_movement_id", "is", null);
    if (origin === "comision") query = query.not("commission_settlement_id", "is", null);
    if (origin === "manual") {
      query = query.is("cash_movement_id", null).is("commission_settlement_id", null);
    }
    if (term) query = query.ilike("description", `%${term}%`);
    return query.order("expense_date", { ascending: false }).order("id").range(from, to);
  };

  // Una compra es egreso el día que se PAGÓ (`paid_at`), no el que se emitió:
  // mismo criterio que el flujo de caja del Panel.
  const purchasesPage = (from: number, to: number) => {
    let purchasesQuery = supabase
      .from("invoices")
      .select("id, total, paid_at, distributors(business_name)")
      .eq("type", "compra")
      .eq("status", "paid")
      .not("paid_at", "is", null);
    if (range.from) purchasesQuery = purchasesQuery.gte("paid_at", localDayStartIso(range.from));
    if (range.to) purchasesQuery = purchasesQuery.lt("paid_at", localDayStartIso(range.to));
    return purchasesQuery.order("paid_at", { ascending: false }).order("id").range(from, to);
  };

  const [expenseRows, purchaseRows] = await Promise.all([
    skipExpenses ? Promise.resolve([]) : fetchAllRows<unknown>(expensesPage),
    skipPurchases ? Promise.resolve([]) : fetchAllRows<unknown>(purchasesPage),
  ]);

  const operativos: ExpenseRecord[] = (expenseRows as Record<string, unknown>[]).map((row) => {
    const embedded = row.expense_categories;
    const category = (Array.isArray(embedded) ? embedded[0] ?? null : embedded ?? null) as ExpenseCategory | null;
    const settlementId = (row.commission_settlement_id as string | null) ?? null;
    return {
      id: row.id as string,
      description: row.description as string,
      amount: row.amount as number,
      expense_date: row.expense_date as string,
      cash_movement_id: (row.cash_movement_id as string | null) ?? null,
      commission_settlement_id: settlementId,
      category,
      origin: settlementId ? "comision" : row.cash_movement_id ? "caja" : "manual",
    };
  });

  const compras: ExpenseRecord[] = (purchaseRows as Record<string, unknown>[])
    .map((row) => {
      const proveedor = (row.distributors as { business_name?: string } | null)?.business_name ?? "Proveedor sin nombre";
      return {
        id: `compra-${row.id as string}`,
        description: proveedor,
        amount: row.total as number,
        // Día LOCAL del pago: cortar el ISO daría el día en UTC.
        expense_date: toISODate(new Date(row.paid_at as string)),
        cash_movement_id: null,
        commission_settlement_id: null,
        category: PURCHASES_CATEGORY,
        origin: "compra" as const,
        invoice_id: row.id as string,
      };
    })
    // El buscador es por descripción, y en una compra la descripción es el proveedor.
    .filter((row) => !term || row.description.toLowerCase().includes(term.toLowerCase()));

  return [...operativos, ...compras].sort((a, b) => b.expense_date.localeCompare(a.expense_date));
}

/**
 * Resuelve la categoría de un gasto, cayendo en "Otros" si no se eligió una.
 *
 * El `<select>` manda `""` para la opción "Otros", y `""` no es una categoría:
 * es una cadena vacía camino a una columna `uuid`. `input.category_id ?? null`
 * NO la atrapa —`??` solo cubre `null` y `undefined`—, así que llegaba a
 * Postgres y reventaba con `invalid input syntax for type uuid: ""`. Editar un
 * gasto y elegir "Otros" fallaba por eso; crear no, porque ese camino ya
 * chequeaba por falsy.
 *
 * Vive acá y no en la pantalla porque es el único punto por el que pasan las
 * dos escrituras.
 */
async function resolveCategoryId(raw: string | undefined): Promise<string | null> {
  const chosen = raw?.trim();
  if (chosen) return chosen;
  const categories = await listExpenseCategories();
  return categories.find((category) => category.is_default)?.id ?? null;
}

export async function createExpenseRecord(input: ExpenseInput): Promise<void> {
  if (!input.description.trim()) throw new Error("La descripción es obligatoria.");
  if (!Number.isFinite(input.amount) || input.amount <= 0) throw new Error("El monto debe ser mayor que cero.");
  const supabase = createClient();
  const categoryId = await resolveCategoryId(input.category_id);
  const { error } = await supabase.from("expenses").insert({ description: input.description.trim(), amount: input.amount, expense_date: input.expense_date, category_id: categoryId });
  if (error) throw error;
}

/**
 * `descriptionAndCategoryOnly`: para un gasto nacido de un retiro de caja. Su
 * monto y su fecha los fija el retiro (la base lo exige con
 * `expenses_guard_commission`), así que ni se mandan: reenviar el mismo número
 * pasaría, pero uno redondeado distinto reventaría la edición entera.
 */
export async function updateExpense(
  id: string,
  input: ExpenseInput,
  options?: { descriptionAndCategoryOnly?: boolean },
): Promise<void> {
  const onlyText = options?.descriptionAndCategoryOnly === true;
  if (!input.description.trim() || (!onlyText && input.amount <= 0)) throw new Error("Completa una descripción y un monto mayor que cero.");
  const supabase = createClient();
  const categoryId = await resolveCategoryId(input.category_id);
  const patch = onlyText
    ? { description: input.description.trim(), category_id: categoryId }
    : { description: input.description.trim(), amount: input.amount, expense_date: input.expense_date, category_id: categoryId };
  const { error } = await supabase.from("expenses").update(patch).eq("id", id);
  if (error) throw error;
}

export async function deleteExpense(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("expenses").delete().eq("id", id);
  if (error) throw error;
}

/** Cómo se nombra el origen de un gasto en pantalla y en la exportación. */
export function expenseOriginLabel(origin: ExpenseRecord["origin"]): string {
  if (origin === "compra") return "Compra";
  if (origin === "caja") return "Retiro de caja";
  if (origin === "comision") return "Liquidación de comisión";
  return "A mano";
}

/**
 * Columnas de la exportación de Gastos (F11). El monto va como número crudo y
 * POSITIVO: en la planilla es una columna de gastos, el signo lo da el título.
 */
export const EXPENSE_EXPORT_COLUMNS: ExportColumn<ExpenseRecord>[] = [
  { header: "Fecha", value: (e) => e.expense_date, width: 12 },
  { header: "Descripción", value: (e) => e.description, width: 36 },
  { header: "Categoría", value: (e) => e.category?.name ?? "Otros", width: 20 },
  { header: "Origen", value: (e) => expenseOriginLabel(e.origin), width: 22 },
  { header: "Monto", value: (e) => e.amount, width: 14, numFmt: MONEY_NUM_FMT },
];
