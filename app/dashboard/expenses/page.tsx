"use client";

import { useEffect, useMemo, useState } from "react";
import { IconPlus, IconSearch, IconTrendingDown } from "@/app/assets/icons/DashboardIcons";
import { useExpensesStore } from "@/stores/expenses.store";
import type { ExpenseCategory, ExpenseInput, ExpenseRecord } from "@/services/expenses.service";
import { formatDateOnly, todayISO } from "@/lib/date";
import { notifySuccess } from "@/lib/notifications";

const money = (value: number) => value.toLocaleString("es-CO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const PERIODS = [{ id: "today", label: "Hoy" }, { id: "yesterday", label: "Ayer" }, { id: "last7", label: "Últimos 7 días" }, { id: "month", label: "Este mes" }, { id: "lastMonth", label: "Mes pasado" }, { id: "all", label: "Todo" }] as const;
const blank = (categoryId = ""): ExpenseInput => ({ description: "", amount: 0, expense_date: todayISO(), category_id: categoryId });

export default function ExpensesPage() {
  const expenses = useExpensesStore((s) => s.expenses);
  const categories = useExpensesStore((s) => s.categories);
  const loading = useExpensesStore((s) => s.loading);
  const error = useExpensesStore((s) => s.error);
  const period = useExpensesStore((s) => s.period);
  const search = useExpensesStore((s) => s.search);
  const categoryId = useExpensesStore((s) => s.categoryId);
  const fetch = useExpensesStore((s) => s.fetch);
  const fetchCategories = useExpensesStore((s) => s.fetchCategories);
  const setPeriod = useExpensesStore((s) => s.setPeriod);
  const setSearch = useExpensesStore((s) => s.setSearch);
  const setCategoryId = useExpensesStore((s) => s.setCategoryId);
  const create = useExpensesStore((s) => s.create);
  const update = useExpensesStore((s) => s.update);
  const remove = useExpensesStore((s) => s.remove);
  const addCategory = useExpensesStore((s) => s.addCategory);
  const [form, setForm] = useState<ExpenseInput | null>(null);
  const [editing, setEditing] = useState<ExpenseRecord | null>(null);
  const [searchInput, setSearchInput] = useState(search);
  const [newCategory, setNewCategory] = useState(false);
  const [categoryForm, setCategoryForm] = useState({ name: "", description: "", color: "#6366f1" });

  useEffect(() => { fetchCategories(); fetch(); }, [fetch, fetchCategories]);
  useEffect(() => { const timer = setTimeout(() => { if (searchInput !== search) setSearch(searchInput); }, 300); return () => clearTimeout(timer); }, [searchInput, search, setSearch]);

  const total = useMemo(() => expenses.reduce((sum, item) => sum + item.amount, 0), [expenses]);
  const categoryTotals = useMemo(() => {
    const map = new Map<string, { category: ExpenseCategory; amount: number }>();
    for (const expense of expenses) {
      const category = expense.category ?? categories.find((item) => item.is_default);
      if (!category) continue;
      const current = map.get(category.id) ?? { category, amount: 0 };
      current.amount += expense.amount; map.set(category.id, current);
    }
    return [...map.values()].sort((a, b) => b.amount - a.amount);
  }, [expenses, categories]);
  const top = categoryTotals[0];
  const average = expenses.length ? total / expenses.length : 0;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); if (!form) return;
    const ok = editing ? await update(editing.id, form) : await create(form);
    if (ok) { notifySuccess(editing ? "Gasto actualizado" : "Gasto registrado", "El movimiento quedó guardado correctamente."); setForm(null); setEditing(null); }
  };
  const submitCategory = async (event: React.FormEvent) => {
    event.preventDefault(); const created = await addCategory(categoryForm);
    if (created) { setCategoryForm({ name: "", description: "", color: "#6366f1" }); setNewCategory(false); setForm((current) => current ? { ...current, category_id: created.id } : current); notifySuccess("Categoría creada"); }
  };

  return <div className="space-y-6">
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4"><div><h1 className="text-2xl font-bold text-on-surface">Gastos</h1><p className="text-sm text-on-surface-variant mt-1">Controlá los gastos operativos de tu negocio.</p></div><button onClick={() => setForm(blank(categories.find((c) => c.is_default)?.id))} className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-on-primary text-sm font-semibold"><IconPlus className="w-4 h-4" />Registrar Gasto</button></div>
    {error && <div className="rounded-xl border border-error/20 bg-error/10 px-4 py-3 text-sm text-error">{error}</div>}
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4"><Kpi label="Gasto total" value={`$${money(total)}`} /><Kpi label="N.º de gastos" value={String(expenses.length)} /><Kpi label="Mayor categoría" value={top?.category.name ?? "—"} /><Kpi label="Ticket promedio" value={`$${money(average)}`} /></div>
    <div className="flex flex-wrap gap-2">{PERIODS.map((item) => <button key={item.id} onClick={() => setPeriod(item.id)} className={`px-3 py-2 rounded-xl text-xs font-semibold border ${period === item.id ? "border-primary/40 bg-primary/10 text-primary" : "border-outline-variant/10 bg-surface-container text-on-surface-variant"}`}>{item.label}</button>)}</div>
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <section className="lg:col-span-2 bg-surface-container-lowest border border-outline-variant/10 rounded-2xl p-5 shadow-sm"><div className="flex flex-col sm:flex-row gap-3 mb-4"><div className="relative flex-1"><IconSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-variant" /><input value={searchInput} onChange={(e) => setSearchInput(e.target.value)} placeholder="Buscar por descripción…" className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-surface-container border border-outline-variant/20 text-sm text-on-surface" /></div><select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className="rounded-xl bg-surface-container border border-outline-variant/20 px-3 py-2.5 text-sm text-on-surface"><option value="">Todas las categorías</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
        {loading ? <p className="py-12 text-center text-sm text-on-surface-variant">Cargando gastos…</p> : expenses.length === 0 ? <p className="py-12 text-center text-sm text-on-surface-variant">Aún no hay gastos registrados en este período.</p> : <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b border-outline-variant/10 text-xs text-on-surface-variant"><th className="py-3 pr-3">Descripción</th><th className="py-3 pr-3">Categoría</th><th className="py-3 pr-3">Fecha</th><th className="py-3 text-right">Monto</th><th className="py-3 pl-3 text-right">Acciones</th></tr></thead><tbody>{expenses.map((item) => <tr key={item.id} className="border-b border-outline-variant/5"><td className="py-3 pr-3 font-medium text-on-surface">{item.description}</td><td className="py-3 pr-3">{item.category ? <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold" style={{ backgroundColor: `${item.category.color}22`, color: item.category.color }}><span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: item.category.color }} />{item.category.name}</span> : "Otros"}</td><td className="py-3 pr-3 text-on-surface-variant">{formatDateOnly(item.expense_date, { day: "2-digit", month: "short", year: "numeric" })}</td><td className="py-3 text-right font-bold text-error">-${money(item.amount)}</td><td className="py-3 pl-3 text-right whitespace-nowrap"><button className="text-primary text-xs font-semibold mr-3" onClick={() => { setEditing(item); setForm({ description: item.description, amount: item.amount, expense_date: item.expense_date, category_id: item.category?.id }); }}>Editar</button><button className="text-error text-xs font-semibold" onClick={async () => { if (window.confirm("¿Eliminar este gasto? Esta acción no se puede deshacer.")) await remove(item.id); }}>Eliminar</button></td></tr>)}</tbody></table></div>}
      </section>
      <section className="bg-surface-container-lowest border border-outline-variant/10 rounded-2xl p-5 shadow-sm"><h2 className="text-sm font-bold text-on-surface mb-5">Gastos por categoría</h2>{categoryTotals.length === 0 ? <p className="py-12 text-center text-sm text-on-surface-variant">Sin datos para graficar.</p> : <div className="space-y-4">{categoryTotals.map((item) => <div key={item.category.id}><div className="flex justify-between text-xs mb-1.5"><span className="font-semibold text-on-surface">{item.category.name}</span><span className="text-on-surface-variant">${money(item.amount)}</span></div><div className="h-3 rounded-full bg-surface-container-high overflow-hidden"><div className="h-full rounded-full" style={{ width: `${Math.max(4, (item.amount / total) * 100)}%`, backgroundColor: item.category.color }} /></div></div>)}</div>}</section>
    </div>
    <section className="bg-surface-container-lowest border border-outline-variant/10 rounded-2xl p-5 shadow-sm"><div className="flex items-center justify-between mb-4"><div><h2 className="text-sm font-bold text-on-surface">Categorías de gasto</h2><p className="text-xs text-on-surface-variant mt-1">Catálogo independiente de las categorías de productos.</p></div><button onClick={() => setNewCategory(true)} className="text-xs font-semibold text-primary">Nueva categoría</button></div><div className="flex flex-wrap gap-2">{categories.map((c) => <span key={c.id} className="inline-flex items-center gap-2 rounded-xl border border-outline-variant/10 px-3 py-2 text-xs text-on-surface"><span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: c.color }} />{c.name}</span>)}</div></section>
    {(form || newCategory) && <Modal title={newCategory ? "Nueva categoría de gasto" : editing ? "Editar gasto" : "Registrar gasto"} onClose={() => { setForm(null); setEditing(null); setNewCategory(false); }}>{newCategory ? <form onSubmit={submitCategory} className="space-y-4"><Field label="Nombre"><input required value={categoryForm.name} onChange={(e) => setCategoryForm({ ...categoryForm, name: e.target.value })} /></Field><Field label="Descripción"><input value={categoryForm.description} onChange={(e) => setCategoryForm({ ...categoryForm, description: e.target.value })} /></Field><Field label="Color"><input type="color" value={categoryForm.color} onChange={(e) => setCategoryForm({ ...categoryForm, color: e.target.value })} /></Field><Submit /></form> : <form onSubmit={submit} className="space-y-4"><Field label="Descripción"><input required value={form?.description ?? ""} onChange={(e) => setForm({ ...form!, description: e.target.value })} /></Field><div className="grid grid-cols-2 gap-3"><Field label="Monto"><input required min="0.01" step="0.01" type="number" value={form?.amount || ""} onChange={(e) => setForm({ ...form!, amount: Number(e.target.value) })} /></Field><Field label="Fecha"><input required type="date" value={form?.expense_date ?? todayISO()} onChange={(e) => setForm({ ...form!, expense_date: e.target.value })} /></Field></div><Field label="Categoría"><select value={form?.category_id ?? ""} onChange={(e) => setForm({ ...form!, category_id: e.target.value })}><option value="">Otros</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field><button type="button" onClick={() => setNewCategory(true)} className="text-xs font-semibold text-primary">+ Crear categoría</button><Submit /></form>}</Modal>}
  </div>;
}

function Kpi({ label, value }: { label: string; value: string }) { return <div className="bg-surface-container-lowest border border-outline-variant/10 rounded-2xl p-5"><div className="flex items-center gap-2 text-error mb-3"><IconTrendingDown className="w-4 h-4" /><span className="text-[11px] uppercase tracking-wider font-semibold text-on-surface-variant">{label}</span></div><p className="text-xl font-bold text-on-surface truncate">{value}</p></div>; }
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block text-sm font-semibold text-on-surface space-y-1.5">{label}{children}</label>; }
function Submit() { return <div className="flex justify-end pt-3"><button className="px-4 py-2.5 rounded-xl bg-primary text-on-primary text-sm font-semibold" type="submit">Guardar</button></div>; }
function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) { return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"><div className="w-full max-w-md rounded-2xl bg-surface-container p-6 shadow-2xl"><div className="flex justify-between items-center mb-5"><h2 className="text-lg font-bold text-on-surface">{title}</h2><button onClick={onClose} className="text-on-surface-variant" aria-label="Cerrar">×</button></div>{children}</div></div>; }
