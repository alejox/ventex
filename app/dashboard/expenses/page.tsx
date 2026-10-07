"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { IconPlus, IconSearch, IconWallet } from "@/app/assets/icons/DashboardIcons";
import { useExpensesStore } from "@/stores/expenses.store";
import {
  EXPENSE_EXPORT_COLUMNS,
  EXPENSE_PERIODS,
  expenseOriginLabel,
  resolveExpenseRange,
  type ExpenseCategory,
  type ExpenseInput,
  type ExpenseOrigin,
  type ExpenseRecord,
} from "@/services/expenses.service";
import type { ExpenseSlice } from "@/services/finance.service";
import { ExpensesByCategory } from "@/components/ExpensesByCategory";
import { MoneyInput } from "@/components/ui/MoneyInput";
import { downloadCsv, downloadXlsx, exportFilename, inclusiveEnd, sheet } from "@/lib/export";
import { ExportButtons } from "@/components/ui/ExportButtons";
import { OpenOnNewParam } from "@/components/ui/OpenOnNewParam";
import { formatDateOnly, todayISO } from "@/lib/date";
import { notifySuccess } from "@/lib/notifications";
import { DataTable, type DataColumn } from "@/components/DataTable";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import Link from "next/link";
import { useFormatMoney } from "@/lib/useMoney";
import { Modal } from "@/components/ui/Modal";
/**
 * El formulario guarda el monto como TEXTO crudo (lo que entrega `MoneyInput`)
 * y se convierte a número recién al guardar: con un número, el punto decimal
 * recién tecleado ("12.") se perdía en cada tecla.
 */
type ExpenseForm = Omit<ExpenseInput, "amount"> & { amount: string };
const blank = (categoryId = ""): ExpenseForm => ({ description: "", amount: "", expense_date: todayISO(), category_id: categoryId });
const toInput = (form: ExpenseForm): ExpenseInput => ({ ...form, amount: Number(form.amount) || 0 });


export default function ExpensesPage() {
  const fmtMoney = useFormatMoney();
  const { confirm, dialog } = useConfirm();
  const expenses = useExpensesStore((s) => s.expenses);
  const categories = useExpensesStore((s) => s.categories);
  const loading = useExpensesStore((s) => s.loading);
  const error = useExpensesStore((s) => s.error);
  const period = useExpensesStore((s) => s.period);
  const customFrom = useExpensesStore((s) => s.customFrom);
  const customTo = useExpensesStore((s) => s.customTo);
  const setCustomRange = useExpensesStore((s) => s.setCustomRange);
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
  const [form, setForm] = useState<ExpenseForm | null>(null);
  const [exporting, setExporting] = useState(false);
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
      amount: String(item.amount),
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
            {expenseOriginLabel(item.origin)}
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
            -{fmtMoney(item.amount)}
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
                  const ok = await confirm({
                    title: "¿Eliminar este gasto?",
                    description: "Esta acción no se puede deshacer.",
                    confirmLabel: "Eliminar",
                    tone: "danger",
                  });
                  if (ok) await remove(item.id);
                }}
              >
                Eliminar
              </button>
            )}
          </div>
        ),
      },
    ],
    // `startEdit`, `remove` y `confirm` son estables entre renders (setState,
    // acción del store y useCallback), así que las columnas no se rearman en
    // cada tecla del buscador.
    [remove, confirm, fmtMoney],
  );

  const total = useMemo(() => expenses.reduce((sum, item) => sum + item.amount, 0), [expenses]);
  // Las porciones del desglose, en la MISMA forma que usa el Panel: una sola
  // implementación del gráfico (`ExpensesByCategory`) para las dos pantallas.
  const slices = useMemo<ExpenseSlice[]>(() => {
    const map = new Map<string, ExpenseSlice>();
    for (const expense of expenses) {
      const category = expense.category ?? categories.find((item) => item.is_default);
      const id = category?.id ?? "sin-categoria";
      const current = map.get(id) ?? {
        id,
        label: category?.name ?? "Sin categoría",
        color: category?.color ?? "#94a3b8",
        amount: 0,
      };
      current.amount += expense.amount;
      map.set(id, current);
    }
    return [...map.values()].sort((a, b) => b.amount - a.amount);
  }, [expenses, categories]);
  const top = slices[0];
  const average = expenses.length ? total / expenses.length : 0;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); if (!form) return;
    const input = toInput(form);
    // Un gasto de retiro de caja solo cambia texto y categoría: monto y fecha
    // son los del retiro, que ya está en el arqueo de un turno.
    const ok = editing ? await update(editing.id, input, { descriptionAndCategoryOnly: !!editing.cash_movement_id }) : await create(input);
    if (ok) { notifySuccess(editing ? "Gasto actualizado" : "Gasto registrado", "El movimiento quedó guardado correctamente."); setForm(null); setEditing(null); }
  };
  const defaultCategoryId = categories.find((c) => c.is_default)?.id;
  const openNew = useCallback(() => {
    setEditing(null);
    setForm(blank(defaultCategoryId));
  }, [defaultCategoryId]);

  /**
   * Exporta EXACTAMENTE lo que muestra la tabla: mismo período, búsqueda,
   * categoría y origen (la lista del store ya viene filtrada desde la base).
   */
  const exportAs = async (kind: "csv" | "xlsx") => {
    const range = resolveExpenseRange(period, customFrom, customTo);
    const name = exportFilename("gastos", kind, { from: range.from, to: inclusiveEnd(range.to) }, todayISO());
    if (kind === "csv") {
      downloadCsv(name, EXPENSE_EXPORT_COLUMNS, expenses);
      return;
    }
    setExporting(true);
    try {
      await downloadXlsx(name, [
        sheet({ name: "Gastos", columns: EXPENSE_EXPORT_COLUMNS, rows: expenses, totals: ["Total", null, null, null, total] }),
      ]);
    } finally {
      setExporting(false);
    }
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
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4"><div><h1 className="text-2xl font-bold text-on-surface">Gastos</h1><p className="text-sm text-on-surface-variant mt-1">Controla los gastos operativos de tu negocio.</p></div><div className="flex flex-wrap items-center gap-2"><ExportButtons disabled={loading || expenses.length === 0} busy={exporting} onExport={exportAs} /><button onClick={openNew} className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-on-primary text-sm font-semibold"><IconPlus className="w-4 h-4" />Registrar gasto</button></div></div>
    <Suspense fallback={null}><OpenOnNewParam onOpen={openNew} /></Suspense>
    {error && <div className="rounded-xl border border-error/20 bg-error/10 px-4 py-3 text-sm text-error">{error}</div>}
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4"><Kpi label="Gasto total" value={fmtMoney(total)} note="Incluye compras a proveedores" /><Kpi label="N.º de gastos" value={String(expenses.length)} /><Kpi label="Mayor categoría" value={top?.label ?? "—"} /><Kpi label="Gasto promedio" value={fmtMoney(average)} /></div>
    <div className="flex flex-wrap gap-2" role="group" aria-label="Período">{EXPENSE_PERIODS.map((item) => <button key={item.id} aria-pressed={period === item.id} onClick={() => setPeriod(item.id)} className={`px-3 py-2 rounded-xl text-xs font-semibold border ${period === item.id ? "border-primary/40 bg-primary/10 text-primary" : "border-outline-variant/10 bg-surface-container text-on-surface-variant"}`}>{item.label}</button>)}</div>
    {period === "custom" && (
      <div className="flex flex-wrap items-end gap-3 bg-surface-container rounded-2xl border border-outline-variant/10 p-4 -mt-2">
        <label className="text-xs font-semibold text-on-surface-variant space-y-1.5">
          <span className="block">Desde</span>
          <input type="date" value={customFrom} max={customTo || undefined} onChange={(e) => setCustomRange(e.target.value, customTo)} className="px-3 py-2 bg-surface-container-low border border-outline-variant/20 rounded-xl text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/50" />
        </label>
        <label className="text-xs font-semibold text-on-surface-variant space-y-1.5">
          <span className="block">Hasta</span>
          <input type="date" value={customTo} min={customFrom || undefined} onChange={(e) => setCustomRange(customFrom, e.target.value)} className="px-3 py-2 bg-surface-container-low border border-outline-variant/20 rounded-xl text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/50" />
        </label>
        {!customFrom && !customTo && <p className="text-xs text-on-surface-variant pb-2.5">Elige al menos una fecha.</p>}
      </div>
    )}
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
      <section className="bg-surface-container-lowest border border-outline-variant/10 rounded-2xl p-5 shadow-sm min-w-0">
        <h2 className="text-sm font-bold text-on-surface mb-5">Gastos por categoría</h2>
        {/* La misma pieza que el Panel. `stacked`: en esta columna angosta la
            fila de tres columnas no entra ni en escritorio. */}
        <ExpensesByCategory slices={slices} total={total} stacked emptyLabel="Sin gastos en este período." />
      </section>
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
                  <span className="ml-2 text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">
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
                    const confirmed = await confirm({
                      title: `¿Desactivar "${c.name}"?`,
                      description: "Deja de ofrecerse al registrar gastos, pero los gastos que ya la usan la conservan.",
                      confirmLabel: "Desactivar",
                      tone: "danger",
                    });
                    if (!confirmed) return;
                    const ok = await deactivateCategory(c.id);
                    if (ok) notifySuccess("Categoría desactivada");
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
    {(form || newCategory) && <FormModal title={newCategory ? (editingCategory ? "Editar categoría de gasto" : "Nueva categoría de gasto") : editing ? "Editar gasto" : "Registrar gasto"} onClose={closeModals}>{newCategory ? <form onSubmit={submitCategory} className="space-y-4"><Field label="Nombre"><input required className={inputClass} value={categoryForm.name} onChange={(e) => setCategoryForm({ ...categoryForm, name: e.target.value })} /></Field><Field label="Descripción"><input className={inputClass} value={categoryForm.description} onChange={(e) => setCategoryForm({ ...categoryForm, description: e.target.value })} /></Field><Field label="Color"><input type="color" className="h-11 w-full cursor-pointer rounded-xl border border-outline-variant/30 bg-surface-container-lowest p-1" value={categoryForm.color} onChange={(e) => setCategoryForm({ ...categoryForm, color: e.target.value })} /></Field><Submit /></form> : <form onSubmit={submit} className="space-y-4"><Field label="Descripción"><input required className={inputClass} value={form?.description ?? ""} onChange={(e) => setForm({ ...form!, description: e.target.value })} /></Field>{editing?.cash_movement_id ? <div className="space-y-1.5"><div className="grid grid-cols-2 gap-3"><Field label="Monto"><input readOnly aria-readonly="true" className={`${inputClass} opacity-70 cursor-not-allowed`} value={fmtMoney(editing.amount)} /></Field><Field label="Fecha"><input readOnly aria-readonly="true" type="date" className={`${inputClass} opacity-70 cursor-not-allowed`} value={editing.expense_date} /></Field></div><p className="text-xs text-on-surface-variant">Viene de un retiro de caja: el monto y la fecha no se pueden cambiar.</p></div> : <div className="grid grid-cols-2 gap-3"><Field label="Monto"><MoneyInput required aria-label="Monto" value={form?.amount ?? ""} onChange={(raw) => setForm({ ...form!, amount: raw })} className="py-2.5" /></Field><Field label="Fecha"><input required type="date" className={inputClass} value={form?.expense_date ?? todayISO()} onChange={(e) => setForm({ ...form!, expense_date: e.target.value })} /></Field></div>}<Field label="Categoría"><select className={inputClass} value={form?.category_id ?? ""} onChange={(e) => setForm({ ...form!, category_id: e.target.value })}><option value="">Otros</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field><button type="button" onClick={() => openCategory()} className="text-xs font-semibold text-primary">+ Crear categoría</button><Submit /></form>}</FormModal>}
    {dialog}
  </div>;
}

function Kpi({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="bg-surface-container-lowest border border-outline-variant/10 rounded-2xl p-5">
      <div className="flex items-center gap-2 text-on-surface-variant mb-3">
        <IconWallet className="w-4 h-4" />
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
function FormModal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) { return <Modal open onClose={onClose} title={title} className="max-w-md!">{children}</Modal>; }

