"use client";

import { useEffect, useMemo, useState } from "react";
import { IconPlus, IconSearch, IconTrendingDown } from "@/app/assets/icons/DashboardIcons";
import { useExpensesStore } from "@/stores/expenses.store";
import type { ExpenseCategory, ExpenseInput, ExpenseOrigin, ExpenseRecord } from "@/services/expenses.service";
import { formatDateOnly, todayISO } from "@/lib/date";
import { notifySuccess } from "@/lib/notifications";
import { DataTable, type DataColumn } from "@/components/DataTable";
import Link from "next/link";

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
  const origin = useExpensesStore((s) => s.origin);
  const setOrigin = useExpensesStore((s) => s.setOrigin);
  const create = useExpensesStore((s) => s.create);
  const update = useExpensesStore((s) => s.update);
  const remove = useExpensesStore((s) => s.remove);
  const addCategory = useExpensesStore((s) => s.addCategory);
  const updateCategory = useExpensesStore((s) => s.updateCategory);
  const deactivateCategory = useExpensesStore((s) => s.deactivateCategory);
  const [form, setForm] = useState<ExpenseInput | null>(null);
  const [editing, setEditing] = useState<ExpenseRecord | null>(null);
  const [searchInput, setSearchInput] = useState(search);
  const [newCategory, setNewCategory] = useState(false);
  /** Categoría que se está editando. null mientras se crea una nueva. */
  const [editingCategory, setEditingCategory] = useState<ExpenseCategory | null>(null);
  const [categoryForm, setCategoryForm] = useState({ name: "", description: "", color: "#6366f1" });

  useEffect(() => { fetchCategories(); fetch(); }, [fetch, fetchCategories]);
  useEffect(() => { const timer = setTimeout(() => { if (searchInput !== search) setSearch(searchInput); }, 300); return () => clearTimeout(timer); }, [searchInput, search, setSearch]);

  const startEdit = (item: ExpenseRecord) => {
    setEditing(item);
    setForm({
      description: item.description,
      amount: item.amount,
      expense_date: item.expense_date,
      category_id: item.category?.id,
    });
  };

  const columns: DataColumn<ExpenseRecord>[] = useMemo(
    () => [
      {
        header: "Descripción",
        mobile: "title",
        sortKey: "descripcion",
        cell: (item) => <span className="font-medium text-on-surface">{item.description}</span>,
      },
      {
        header: "Categoría",
        mobile: "badge",
        sortKey: "categoria",
        // Se ordena por el nombre, no por el badge de color.
        sortValue: (item) => item.category?.name ?? "Otros",
        cell: (item) =>
          item.category ? (
            <span
              className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold whitespace-nowrap"
              style={{ backgroundColor: `${item.category.color}22`, color: item.category.color }}
            >
              <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: item.category.color }} />
              {item.category.name}
            </span>
          ) : (
            <span className="text-on-surface-variant">Otros</span>
          ),
      },
      {
        header: "Fecha",
        mobile: "subtitle",
        sortKey: "fecha",
        // El ISO crudo ordena bien; "14 ago 2026" no.
        sortValue: (item) => item.expense_date,
        cell: (item) => (
          <span className="text-on-surface-variant whitespace-nowrap">
            {formatDateOnly(item.expense_date, { day: "2-digit", month: "short", year: "numeric" })}
          </span>
        ),
      },
      {
        header: "Origen",
        mobile: "detail",
        sortKey: "origen",
        sortValue: (item) => item.origin,
        cell: (item) => (
          <span className="text-[11px] text-on-surface-variant whitespace-nowrap">
            {item.origin === "compra"
              ? "Compra"
              : item.origin === "caja"
                ? "Retiro de caja"
                : item.origin === "comision"
                  ? "Liquidación de comisión"
                  : "A mano"}
          </span>
        ),
      },
      {
        header: "Monto",
        align: "right",
        mobile: "trailing",
        sortKey: "monto",
        // El número, no el texto: "$1.234" cae antes que "$987" al comparar.
        sortValue: (item) => item.amount,
        cell: (item) => (
          <span className="font-bold text-error tabular-nums whitespace-nowrap">
            -${money(item.amount)}
          </span>
        ),
      },
      {
        header: "Acciones",
        align: "right",
        mobile: "actions",
        cell: (item) => (
          <div className="flex items-center justify-end gap-3 whitespace-nowrap">
            {/* Una compra es una factura, no un gasto suelto: se edita donde
                vive, con sus ítems y su impuesto. Acá solo se la mira. */}
            {/* Una compra es una factura, no un gasto suelto: se edita donde
                vive, con sus ítems y su impuesto. Acá solo se la mira. */}
            {item.origin === "compra" ? (
              <Link href="/dashboard/purchases" className="text-primary text-xs font-semibold">
                Ver compra
              </Link>
            ) : item.origin === "comision" ? (
              /* Su monto lo fija el comprobante de la liquidación: si acá se
                 pudiera cambiar, el papel que se le entregó al colaborador y la
                 contabilidad dirían cosas distintas. Se anula la liquidación
                 —que reversa el gasto— o no se toca. */
              <Link href="/dashboard/staff" className="text-primary text-xs font-semibold">
                Ver liquidación
              </Link>
            ) : (
              <button className="text-primary text-xs font-semibold" onClick={() => startEdit(item)}>
                Editar
              </button>
            )}
            {/* Un gasto nacido de un retiro no se borra: es la contracara de
                plata que salió del cajón contra un turno. La base lo impide con
                un trigger; acá se oculta el botón para no ofrecer una acción
                que va a fallar. Lo mismo el de una liquidación. */}
            {item.origin === "compra" ? null : item.origin === "comision" ? (
              <span
                className="text-xs text-on-surface-variant"
                title="Viene de una liquidación de comisiones: se corrige anulándola en Personal"
              >
                Desde Personal
              </span>
            ) : item.cash_movement_id ? (
              <span
                className="text-xs text-on-surface-variant"
                title="Viene de un retiro de caja: se corrige desde el turno"
              >
                Desde caja
              </span>
            ) : (
              <button
                className="text-error text-xs font-semibold"
                onClick={async () => {
                  if (window.confirm("¿Eliminar este gasto? Esta acción no se puede deshacer.")) {
                    await remove(item.id);
                  }
                }}
              >
                Eliminar
              </button>
            )}
          </div>
        ),
      },
    ],
    // `startEdit` y `remove` son estables entre renders (setState y acción del
    // store), así que las columnas no se rearman en cada tecla del buscador.
    [remove],
  );

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
  /** Abre el formulario de categoría: vacío para crear, poblado para editar. */
  const openCategory = (category?: ExpenseCategory) => {
    setEditingCategory(category ?? null);
    setCategoryForm({
      name: category?.name ?? "",
      description: category?.description ?? "",
      color: category?.color ?? "#6366f1",
    });
    setNewCategory(true);
  };

  const closeModals = () => {
    setForm(null);
    setEditing(null);
    setNewCategory(false);
    setEditingCategory(null);
  };

  const submitCategory = async (event: React.FormEvent) => {
    event.preventDefault();

    if (editingCategory) {
      const ok = await updateCategory(editingCategory.id, categoryForm);
      if (!ok) return;
      notifySuccess("Categoría actualizada");
    } else {
      const created = await addCategory(categoryForm);
      if (!created) return;
      notifySuccess("Categoría creada");
      // Si se estaba registrando un gasto, la nueva categoría queda elegida:
      // se la creó justamente para ese gasto.
      setForm((current) => (current ? { ...current, category_id: created.id } : current));
    }

    setCategoryForm({ name: "", description: "", color: "#6366f1" });
    setNewCategory(false);
    setEditingCategory(null);
  };

  return <div className="space-y-6">
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4"><div><h1 className="text-2xl font-bold text-on-surface">Gastos</h1><p className="text-sm text-on-surface-variant mt-1">Controlá los gastos operativos de tu negocio.</p></div><button onClick={() => setForm(blank(categories.find((c) => c.is_default)?.id))} className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-on-primary text-sm font-semibold"><IconPlus className="w-4 h-4" />Registrar Gasto</button></div>
    {error && <div className="rounded-xl border border-error/20 bg-error/10 px-4 py-3 text-sm text-error">{error}</div>}
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4"><Kpi label="Gasto total" value={`$${money(total)}`} note="Incluye compras a proveedores" /><Kpi label="N.º de gastos" value={String(expenses.length)} /><Kpi label="Mayor categoría" value={top?.category.name ?? "—"} /><Kpi label="Ticket promedio" value={`$${money(average)}`} /></div>
    <div className="flex flex-wrap gap-2">{PERIODS.map((item) => <button key={item.id} onClick={() => setPeriod(item.id)} className={`px-3 py-2 rounded-xl text-xs font-semibold border ${period === item.id ? "border-primary/40 bg-primary/10 text-primary" : "border-outline-variant/10 bg-surface-container text-on-surface-variant"}`}>{item.label}</button>)}</div>
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <section className="lg:col-span-2 bg-surface-container-lowest border border-outline-variant/10 rounded-2xl p-5 shadow-sm"><div className="flex flex-col sm:flex-row gap-3 mb-4"><div className="relative flex-1"><IconSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-variant" /><input value={searchInput} onChange={(e) => setSearchInput(e.target.value)} placeholder="Buscar por descripción…" className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-surface-container border border-outline-variant/20 text-sm text-on-surface" /></div><select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className="rounded-xl bg-surface-container border border-outline-variant/20 px-3 py-2.5 text-sm text-on-surface"><option value="">Todas las categorías</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select><select value={origin} onChange={(e) => setOrigin(e.target.value as ExpenseOrigin)} className="rounded-xl bg-surface-container border border-outline-variant/20 px-3 py-2.5 text-sm text-on-surface" aria-label="Filtrar por origen"><option value="">Todo origen</option><option value="manual">Cargado a mano</option><option value="caja">Retiro de caja</option><option value="comision">Liquidación de comisión</option><option value="compra">Compra a proveedor</option></select></div>
        {loading ? (
          <p className="py-12 text-center text-sm text-on-surface-variant">Cargando gastos…</p>
        ) : expenses.length === 0 ? (
          <p className="py-12 text-center text-sm text-on-surface-variant">
            Aún no hay gastos registrados en este período.
          </p>
        ) : (
          <DataTable
            columns={columns}
            rows={expenses}
            rowKey={(item) => item.id}
            caption="Gastos del período"
            minWidth={720}
          />
        )}
      </section>
      <section className="bg-surface-container-lowest border border-outline-variant/10 rounded-2xl p-5 shadow-sm"><h2 className="text-sm font-bold text-on-surface mb-5">Gastos por categoría</h2>{categoryTotals.length === 0 ? <p className="py-12 text-center text-sm text-on-surface-variant">Sin datos para graficar.</p> : <div className="space-y-4">{categoryTotals.map((item) => <div key={item.category.id}><div className="flex justify-between text-xs mb-1.5"><span className="font-semibold text-on-surface">{item.category.name}</span><span className="text-on-surface-variant">${money(item.amount)}</span></div><div className="h-3 rounded-full bg-surface-container-high overflow-hidden"><div className="h-full rounded-full" style={{ width: `${Math.max(4, (item.amount / total) * 100)}%`, backgroundColor: item.category.color }} /></div></div>)}</div>}</section>
    </div>
    <section className="bg-surface-container-lowest border border-outline-variant/10 rounded-2xl p-5 shadow-sm">
      <div className="flex items-center justify-between gap-4 mb-4">
        <div>
          <h2 className="text-sm font-bold text-on-surface">Categorías de gasto</h2>
          <p className="text-xs text-on-surface-variant mt-1">
            Catálogo propio. No tienen relación con las categorías de producto.
          </p>
        </div>
        <button onClick={() => openCategory()} className="text-xs font-semibold text-primary shrink-0">
          Nueva categoría de gasto
        </button>
      </div>

      <ul className="divide-y divide-outline-variant/10">
        {categories.map((c) => (
          <li key={c.id} className="flex items-center gap-3 py-3">
            <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: c.color }} />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-on-surface truncate">
                {c.name}
                {c.is_default && (
                  <span className="ml-2 text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">
                    Por defecto
                  </span>
                )}
              </p>
              {c.description && (
                <p className="text-xs text-on-surface-variant truncate">{c.description}</p>
              )}
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <button
                onClick={() => openCategory(c)}
                className="text-xs font-semibold text-primary"
              >
                Editar
              </button>
              {/* La categoría por defecto no se desactiva. La base ya lo impide
                  con un trigger; acá se oculta el botón para no ofrecer una
                  acción que va a fallar. */}
              {!c.is_default && (
                <button
                  onClick={async () => {
                    if (
                      window.confirm(
                        `¿Desactivar "${c.name}"? Deja de ofrecerse al registrar gastos, pero los gastos que ya la usan la conservan.`,
                      )
                    ) {
                      const ok = await deactivateCategory(c.id);
                      if (ok) notifySuccess("Categoría desactivada");
                    }
                  }}
                  className="text-xs font-semibold text-on-surface-variant hover:text-error transition-colors"
                >
                  Desactivar
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
    {(form || newCategory) && <Modal title={newCategory ? (editingCategory ? "Editar categoría de gasto" : "Nueva categoría de gasto") : editing ? "Editar gasto" : "Registrar gasto"} onClose={closeModals}>{newCategory ? <form onSubmit={submitCategory} className="space-y-4"><Field label="Nombre"><input required className={inputClass} value={categoryForm.name} onChange={(e) => setCategoryForm({ ...categoryForm, name: e.target.value })} /></Field><Field label="Descripción"><input className={inputClass} value={categoryForm.description} onChange={(e) => setCategoryForm({ ...categoryForm, description: e.target.value })} /></Field><Field label="Color"><input type="color" className="h-11 w-full cursor-pointer rounded-xl border border-outline-variant/30 bg-surface-container-lowest p-1" value={categoryForm.color} onChange={(e) => setCategoryForm({ ...categoryForm, color: e.target.value })} /></Field><Submit /></form> : <form onSubmit={submit} className="space-y-4"><Field label="Descripción"><input required className={inputClass} value={form?.description ?? ""} onChange={(e) => setForm({ ...form!, description: e.target.value })} /></Field><div className="grid grid-cols-2 gap-3"><Field label="Monto"><input required min="0.01" step="0.01" type="number" className={inputClass} value={form?.amount || ""} onChange={(e) => setForm({ ...form!, amount: Number(e.target.value) })} /></Field><Field label="Fecha"><input required type="date" className={inputClass} value={form?.expense_date ?? todayISO()} onChange={(e) => setForm({ ...form!, expense_date: e.target.value })} /></Field></div><Field label="Categoría"><select className={inputClass} value={form?.category_id ?? ""} onChange={(e) => setForm({ ...form!, category_id: e.target.value })}><option value="">Otros</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field><button type="button" onClick={() => openCategory()} className="text-xs font-semibold text-primary">+ Crear categoría</button><Submit /></form>}</Modal>}
  </div>;
}

function Kpi({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="bg-surface-container-lowest border border-outline-variant/10 rounded-2xl p-5">
      <div className="flex items-center gap-2 text-error mb-3">
        <IconTrendingDown className="w-4 h-4" />
        <span className="text-[11px] uppercase tracking-wider font-semibold text-on-surface-variant">{label}</span>
      </div>
      <p className="text-xl font-bold text-on-surface truncate">{value}</p>
      {note && <p className="text-[11px] text-on-surface-variant mt-1 truncate">{note}</p>}
    </div>
  );
}
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block text-sm font-semibold text-on-surface space-y-1.5">{label}{children}</label>; }

/**
 * Estilo de los campos del formulario, igual al del modal de gasto del Panel y
 * al de ProductModal. Estaba faltando por completo: los `<input>` salían con
 * los estilos por defecto del navegador, fuera del sistema de diseño.
 */
const inputClass =
  "w-full bg-surface-container-lowest border border-outline-variant/30 rounded-xl py-2.5 px-3 text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all";
function Submit() { return <div className="flex justify-end pt-3"><button className="px-4 py-2.5 rounded-xl bg-primary text-on-primary text-sm font-semibold" type="submit">Guardar</button></div>; }
function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) { return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"><div className="w-full max-w-md rounded-2xl bg-surface-container p-6 shadow-2xl"><div className="flex justify-between items-center mb-5"><h2 className="text-lg font-bold text-on-surface">{title}</h2><button onClick={onClose} className="text-on-surface-variant" aria-label="Cerrar">×</button></div>{children}</div></div>; }
