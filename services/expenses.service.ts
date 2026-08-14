import { createClient } from "@/utils/supabase/client";

export type ExpensePeriod = "today" | "yesterday" | "last7" | "month" | "lastMonth" | "all";

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
}

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

export function resolveExpenseRange(period: ExpensePeriod): { from: string | null; to: string | null } {
  const today = startOfDay(new Date());
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

export async function listExpenses(period: ExpensePeriod, search = "", categoryId = ""): Promise<ExpenseRecord[]> {
  const supabase = createClient();
  const range = resolveExpenseRange(period);
  let query = supabase.from("expenses").select("id, description, amount, expense_date, category_id, expense_categories(id, name, description, color, is_default, is_active)").order("expense_date", { ascending: false });
  if (range.from) query = query.gte("expense_date", range.from);
  if (range.to) query = query.lt("expense_date", range.to);
  if (categoryId) query = query.eq("category_id", categoryId);
  if (search.trim()) query = query.ilike("description", `%${search.trim()}%`);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map((row) => ({ ...row, category: Array.isArray(row.expense_categories) ? row.expense_categories[0] ?? null : row.expense_categories ?? null })) as unknown as ExpenseRecord[];
}

export async function createExpenseRecord(input: ExpenseInput): Promise<void> {
  if (!input.description.trim()) throw new Error("La descripción es obligatoria.");
  if (!Number.isFinite(input.amount) || input.amount <= 0) throw new Error("El monto debe ser mayor que cero.");
  const supabase = createClient();
  let categoryId = input.category_id;
  if (!categoryId) {
    const categories = await listExpenseCategories();
    categoryId = categories.find((category) => category.is_default)?.id;
  }
  const { error } = await supabase.from("expenses").insert({ description: input.description.trim(), amount: input.amount, expense_date: input.expense_date, category_id: categoryId ?? null });
  if (error) throw error;
}

export async function updateExpense(id: string, input: ExpenseInput): Promise<void> {
  if (!input.description.trim() || input.amount <= 0) throw new Error("Completá una descripción y un monto mayor que cero.");
  const supabase = createClient();
  const { error } = await supabase.from("expenses").update({ description: input.description.trim(), amount: input.amount, expense_date: input.expense_date, category_id: input.category_id ?? null }).eq("id", id);
  if (error) throw error;
}

export async function deleteExpense(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("expenses").delete().eq("id", id);
  if (error) throw error;
}
