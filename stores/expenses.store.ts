import { create } from "zustand";
import { toMessage } from "@/lib/errors";
import * as service from "@/services/expenses.service";
import type { ExpenseCategory, ExpenseInput, ExpenseOrigin, ExpensePeriod, ExpenseRecord } from "@/services/expenses.service";

interface ExpensesState {
  expenses: ExpenseRecord[];
  categories: ExpenseCategory[];
  loading: boolean;
  saving: boolean;
  error: string | null;
  period: ExpensePeriod;
  /** Días "YYYY-MM-DD" del período personalizado (el `to` es el último incluido). */
  customFrom: string;
  customTo: string;
  search: string;
  categoryId: string;
  origin: ExpenseOrigin;
  fetch: () => Promise<void>;
  fetchCategories: () => Promise<void>;
  setPeriod: (period: ExpensePeriod) => Promise<void>;
  setCustomRange: (from: string, to: string) => Promise<void>;
  setSearch: (search: string) => Promise<void>;
  setCategoryId: (id: string) => Promise<void>;
  setOrigin: (origin: ExpenseOrigin) => Promise<void>;
  create: (input: ExpenseInput) => Promise<boolean>;
  update: (id: string, input: ExpenseInput, options?: { descriptionAndCategoryOnly?: boolean }) => Promise<boolean>;
  remove: (id: string) => Promise<boolean>;
  addCategory: (input: Pick<ExpenseCategory, "name" | "description" | "color">) => Promise<ExpenseCategory | null>;
  updateCategory: (id: string, input: Pick<ExpenseCategory, "name" | "description" | "color">) => Promise<boolean>;
  deactivateCategory: (id: string) => Promise<boolean>;
}

export const useExpensesStore = create<ExpensesState>((set, get) => ({
  expenses: [], categories: [], loading: true, saving: false, error: null,
  period: "month", customFrom: "", customTo: "", search: "", categoryId: "", origin: "",
  fetch: async () => {
    set({ loading: true, error: null });
    const { period, search, categoryId, origin, customFrom, customTo } = get();
    try { set({ expenses: await service.listExpenses(period, search, categoryId, origin, customFrom, customTo), loading: false }); }
    catch (e) { set({ error: toMessage(e), loading: false }); }
  },
  fetchCategories: async () => {
    try { set({ categories: await service.listExpenseCategories() }); }
    catch (e) { set({ error: toMessage(e) }); }
  },
  setPeriod: async (period) => {
    set({ period });
    // "Personalizado" espera a que haya al menos una fecha cargada.
    if (period === "custom" && !get().customFrom && !get().customTo) return;
    await get().fetch();
  },
  setCustomRange: async (customFrom, customTo) => {
    set({ customFrom, customTo, period: "custom" });
    if (!customFrom && !customTo) return;
    await get().fetch();
  },
  setSearch: async (search) => { set({ search }); await get().fetch(); },
  setCategoryId: async (categoryId) => { set({ categoryId }); await get().fetch(); },
  setOrigin: async (origin) => { set({ origin }); await get().fetch(); },
  create: async (input) => { set({ saving: true, error: null }); try { await service.createExpenseRecord(input); await get().fetch(); set({ saving: false }); return true; } catch (e) { set({ error: toMessage(e), saving: false }); return false; } },
  update: async (id, input, options) => { set({ saving: true, error: null }); try { await service.updateExpense(id, input, options); await get().fetch(); set({ saving: false }); return true; } catch (e) { set({ error: toMessage(e), saving: false }); return false; } },
  remove: async (id) => { try { await service.deleteExpense(id); await get().fetch(); return true; } catch (e) { set({ error: toMessage(e) }); return false; } },
  addCategory: async (input) => { try { const category = await service.createExpenseCategory(input); set((s) => ({ categories: [...s.categories, category].sort((a, b) => a.name.localeCompare(b.name)) })); return category; } catch (e) { set({ error: toMessage(e) }); return null; } },
  updateCategory: async (id, input) => { try { const category = await service.updateExpenseCategory(id, input); set((s) => ({ categories: s.categories.map((item) => item.id === id ? category : item) })); return true; } catch (e) { set({ error: toMessage(e) }); return false; } },
  deactivateCategory: async (id) => { try { await service.deactivateExpenseCategory(id); set((s) => ({ categories: s.categories.filter((item) => item.id !== id) })); return true; } catch (e) { set({ error: toMessage(e) }); return false; } },
}));
