"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useFinanceStore } from "@/stores/finance.store";
import { useInventoryStore } from "@/stores/inventory.store";
import { useProfile } from "@/components/ProfileProvider";
import { visibleQuickActions, workerQuickActions } from "@/config/business";
import { needsRestock } from "@/lib/stock";
import { backdropProps } from "@/components/modal";
import type { NewExpenseInput } from "@/services/finance.service";
import { IconTrendingUp, IconTrendingDown, IconDollar, IconShoppingCart, IconPlus } from "@/app/assets/icons/DashboardIcons";
import { todayISO } from "@/lib/date";
import { formatDateOnly } from "@/lib/date";
import { useExpensesStore } from "@/stores/expenses.store";

const money = (n: number) =>
  n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// `expense_date` es una columna DATE: el día es el del mostrador, no el de UTC.
const today = todayISO;

/**
 * Presentación de cada acción rápida (icono, subtítulo y color), por id. La
 * lista y el gating viven en config/business.ts: acá no se decide qué se
 * muestra, solo cómo se ve.
 */
const QUICK_ACTION_STYLE: Record<
  string,
  { emoji: string; hint: string; accent: string; hover: string }
> = {
  "new-sale": {
    emoji: "⚡",
    hint: "Cobrar al instante",
    accent: "bg-emerald-500/10 text-emerald-500",
    hover: "hover:border-emerald-500/40 hover:bg-emerald-500/5",
  },
  "new-appointment": {
    emoji: "📅",
    hint: "Agenda y turnos",
    accent: "bg-primary/10 text-primary",
    hover: "hover:border-primary/40 hover:bg-primary/5",
  },
  "new-service": {
    emoji: "✂️",
    hint: "Catálogo de servicios",
    accent: "bg-amber-500/10 text-amber-500",
    hover: "hover:border-amber-500/40 hover:bg-amber-500/5",
  },
  "new-customer": {
    emoji: "👤",
    hint: "Directorio y visitas",
    accent: "bg-purple-500/10 text-purple-600",
    hover: "hover:border-purple-500/40 hover:bg-purple-500/5",
  },
  "new-product": {
    emoji: "📦",
    hint: "Alta en inventario",
    accent: "bg-sky-500/10 text-sky-500",
    hover: "hover:border-sky-500/40 hover:bg-sky-500/5",
  },
  replenish: {
    emoji: "🛒",
    hint: "Reposición a proveedor",
    accent: "bg-orange-500/10 text-orange-500",
    hover: "hover:border-orange-500/40 hover:bg-orange-500/5",
  },
  "new-staff": {
    emoji: "👥",
    hint: "Equipo y comisiones",
    accent: "bg-teal-500/10 text-teal-500",
    hover: "hover:border-teal-500/40 hover:bg-teal-500/5",
  },
  "new-vehicle": {
    emoji: "🚗",
    hint: "Historial por placa",
    accent: "bg-cyan-500/10 text-cyan-500",
    hover: "hover:border-cyan-500/40 hover:bg-cyan-500/5",
  },
  "new-invoice": {
    emoji: "🧾",
    hint: "Facturas y cotizaciones",
    accent: "bg-rose-500/10 text-rose-500",
    hover: "hover:border-rose-500/40 hover:bg-rose-500/5",
  },
};

const DEFAULT_QUICK_STYLE = {
  emoji: "➕",
  hint: "Abrir sección",
  accent: "bg-primary/10 text-primary",
  hover: "hover:border-primary/40 hover:bg-primary/5",
};

const emptyExpense = (): NewExpenseInput => ({
  description: "",
  category: "",
  amount: "",
  expense_date: today(),
});

/**
 * Panel de inicio: resumen financiero del negocio (KPIs, ingresos vs gastos,
 * movimientos) más la alerta de stock bajo.
 *
 * Es también el único punto de entrada para registrar un gasto, así que
 * `canAddExpense` llega desde el servidor: solo el dueño escribe gastos, un
 * trabajador con permiso `panel` los ve pero no los crea.
 */
export function DashboardHome({ canAddExpense = false }: { canAddExpense?: boolean }) {
  const profile = useProfile();
  const overview = useFinanceStore((s) => s.overview);
  const loading = useFinanceStore((s) => s.loading);
  const error = useFinanceStore((s) => s.error);
  const submitting = useFinanceStore((s) => s.submitting);
  const fetchOverview = useFinanceStore((s) => s.fetchOverview);
  const addExpense = useFinanceStore((s) => s.addExpense);
  const expenseCategories = useExpensesStore((s) => s.categories);
  const fetchExpenseCategories = useExpensesStore((s) => s.fetchCategories);

  const todaySales = useFinanceStore((s) => s.todaySales);
  const fetchTodaySales = useFinanceStore((s) => s.fetchTodaySales);

  const products = useInventoryStore((s) => s.products);
  const invLoading = useInventoryStore((s) => s.loading);
  const fetchInventory = useInventoryStore((s) => s.fetchInventory);

  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<NewExpenseInput>(emptyExpense);

  useEffect(() => {
    fetchOverview();
    fetchTodaySales();
    fetchInventory();
    fetchExpenseCategories();
  }, [fetchOverview, fetchTodaySales, fetchInventory, fetchExpenseCategories]);

  // Misma definición que el KPI y el filtro de Inventario. Antes este widget
  // usaba su propia comparación y listaba tres productos mientras el contador
  // de Inventario decía 0.
  const lowStock = products.filter(needsRestock).slice(0, 5);

  // Una tienda no tiene citas ni servicios: el menú ya lo respetaba, el panel no.
  const quickActions = profile?.isWorker
    ? workerQuickActions(profile.workerPermissions ?? {})
    : visibleQuickActions(profile?.businessType ?? null, profile?.modules ?? null);

  const overviewBusy = loading || !overview;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const ok = await addExpense(form);
    if (ok) {
      setModalOpen(false);
      setForm(emptyExpense());
    }
  };

  return (
    <div className="flex flex-col gap-6 w-full animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-on-surface">Dashboard</h1>
          <p className="text-sm text-on-surface-variant mt-1">Resumen general del negocio</p>
        </div>
        {canAddExpense && (
          <button
            onClick={() => setModalOpen(true)}
            className="bg-primary hover:bg-primary-dim text-on-primary text-sm font-semibold py-2.5 px-4 rounded-xl shadow-lg shadow-primary/20 transition-colors flex items-center justify-center gap-2"
          >
            <IconPlus className="w-4 h-4" />
            <span>Registrar Gasto</span>
          </button>
        )}
      </div>

      {error && (
        <div className="rounded-xl bg-error-container/20 border border-error-container/30 px-4 py-3 text-sm text-error-dim">
          {error}
        </div>
      )}

      {/* Acciones Rápidas: qué se muestra lo decide config/business.ts según el
          tipo de negocio (o los permisos, si es trabajador). Acá solo vive la
          presentación de cada id. */}
      {quickActions.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {quickActions.map((action) => {
            const style = QUICK_ACTION_STYLE[action.id] ?? DEFAULT_QUICK_STYLE;
            return (
              <Link
                key={action.id}
                href={action.href}
                className={`flex items-center gap-3 p-3.5 rounded-2xl bg-surface-container-lowest border border-outline-variant/10 transition-all group shadow-sm ${style.hover}`}
              >
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-lg shrink-0 group-hover:scale-105 transition-transform ${style.accent}`}>
                  {style.emoji}
                </div>
                <div className="min-w-0">
                  <span className="text-xs font-bold text-on-surface block truncate">{action.title}</span>
                  <span className="text-[11px] text-on-surface-variant truncate block">{style.hint}</span>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {/* KPIs principales */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          icon={<IconDollar className="w-5 h-5" />}
          label="Ventas hoy"
          value={todaySales ? `${todaySales.count}` : "—"}
          sub={todaySales ? `$${money(todaySales.revenue)}` : ""}
          loading={!todaySales}
          accent="bg-[#6063ee]/10 text-[#6063ee]"
        />
        <KpiCard
          icon={<IconTrendingUp className="w-5 h-5" />}
          label="Ingresos totales"
          value={overviewBusy ? "—" : `$${money(overview.revenue)}`}
          sub={`${overviewBusy ? "—" : overview.salesCount} ventas`}
          loading={overviewBusy}
          accent="bg-[#10b981]/10 text-[#10b981]"
        />
        <KpiCard
          icon={<IconTrendingDown className="w-5 h-5" />}
          label="Gastos totales"
          value={overviewBusy ? "—" : `$${money(overview.expenses)}`}
          loading={overviewBusy}
          accent="bg-error/10 text-error"
        />
        <KpiCard
          icon={<IconShoppingCart className="w-5 h-5" />}
          label="Beneficio neto"
          value={overviewBusy ? "—" : `${overview.net < 0 ? "-" : ""}$${money(Math.abs(overview.net))}`}
          loading={overviewBusy}
          accent={overviewBusy || overview.net >= 0 ? "bg-[#10b981]/10 text-[#10b981]" : "bg-error/10 text-error"}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Gráfico mensual */}
        <div className="lg:col-span-2 bg-surface-container-lowest border border-outline-variant/10 rounded-2xl p-6 shadow-sm">
          <h2 className="text-sm font-bold text-on-surface mb-5">Ingresos vs Gastos (últimos 6 meses)</h2>
          {overviewBusy ? (
            <div className="h-48 flex items-center justify-center">
              <p className="text-sm text-on-surface-variant">Cargando…</p>
            </div>
          ) : (
            <div className="flex items-end gap-3 h-48">
              {overview.monthly.map((m) => {
                const maxVal = Math.max(...overview.monthly.map((x) => Math.max(x.income, x.expense)), 1);
                const incomeH = (m.income / maxVal) * 100;
                const expenseH = (m.expense / maxVal) * 100;
                return (
                  <div key={m.key} className="flex-1 flex flex-col items-center gap-1 h-full justify-end">
                    <div className="w-full flex flex-col items-center gap-0.5 justify-end" style={{ height: "100%" }}>
                      <div
                        className="w-full max-w-[40px] rounded-t-md bg-[#10b981] transition-all"
                        style={{ height: `${Math.max(incomeH, 1)}%` }}
                        title={`Ingresos: $${money(m.income)}`}
                      />
                      <div
                        className="w-full max-w-[40px] rounded-t-md bg-error/70 transition-all"
                        style={{ height: `${Math.max(expenseH, 1)}%` }}
                        title={`Gastos: $${money(m.expense)}`}
                      />
                    </div>
                    <span className="text-[10px] text-on-surface-variant font-medium mt-1">{m.label}</span>
                  </div>
                );
              })}
            </div>
          )}
          <div className="flex gap-4 mt-4 pt-4 border-t border-outline-variant/10">
            <div className="flex items-center gap-2 text-xs text-on-surface-variant">
              <div className="w-3 h-3 rounded bg-[#10b981]" />
              Ingresos
            </div>
            <div className="flex items-center gap-2 text-xs text-on-surface-variant">
              <div className="w-3 h-3 rounded bg-error/70" />
              Gastos
            </div>
          </div>
        </div>

        {/* Transacciones recientes */}
        <div className="bg-surface-container-lowest border border-outline-variant/10 rounded-2xl p-6 shadow-sm">
          <h2 className="text-sm font-bold text-on-surface mb-4">Movimientos recientes</h2>
          {overviewBusy ? (
            <p className="text-sm text-on-surface-variant text-center py-8">Cargando…</p>
          ) : overview.recent.length === 0 ? (
            <p className="text-sm text-on-surface-variant text-center py-8">
              Sin movimientos todavía. Registra ventas o gastos.
            </p>
          ) : (
            <div className="space-y-3">
              {/* La clave lleva el tipo: una venta y un gasto son filas distintas
                  aunque compartieran id. */}
              {overview.recent.map((t) => (
                <div key={`${t.kind}-${t.id}`} className="flex items-center justify-between">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                      t.kind === "sale" ? "bg-[#10b981]/10" : "bg-error/10"
                    }`}>
                      {t.kind === "sale" ? (
                        <IconTrendingUp className="w-4 h-4 text-[#10b981]" />
                      ) : (
                        <IconTrendingDown className="w-4 h-4 text-error" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-on-surface truncate">{t.label}</p>
                      <p className="text-[10px] text-on-surface-variant">
                        {formatDateOnly(t.day, { day: "2-digit", month: "2-digit" })}
                      </p>
                    </div>
                  </div>
                  {/* El monto ya viene negativo para los gastos: el signo se pone
                      aparte y el número siempre en absoluto. */}
                  <span className={`text-xs font-bold shrink-0 ${
                    t.amount >= 0 ? "text-[#10b981]" : "text-error"
                  }`}>
                    {t.amount >= 0 ? "+" : "-"}${money(Math.abs(t.amount))}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Alerta de stock bajo */}
      <div className="bg-surface-container-lowest border border-outline-variant/10 rounded-2xl p-6 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-bold text-on-surface">Productos con stock bajo</h2>
          <Link href="/dashboard/inventory" className="text-xs font-medium text-primary hover:text-primary-dim transition-colors">
            Ver inventario
          </Link>
        </div>
        {invLoading ? (
          <p className="text-sm text-on-surface-variant text-center py-4">Cargando…</p>
        ) : lowStock.length === 0 ? (
          <p className="text-sm text-on-surface-variant text-center py-4">Todos los productos tienen stock suficiente.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {lowStock.map((p) => (
              <div key={p.id} className="flex items-center justify-between p-3 rounded-xl bg-error/5 border border-error/10">
                <div className="min-w-0">
                  <p className="text-xs font-medium text-on-surface truncate">{p.name}</p>
                  <p className="text-[10px] text-on-surface-variant">SKU: {p.sku}</p>
                </div>
                <div className="text-right shrink-0 ml-3">
                  <p className={`text-xs font-bold ${(p.stock_level ?? 0) <= 0 ? "text-error" : "text-amber-500"}`}>
                    {p.stock_level} uds.
                  </p>
                  <p className="text-[9px] text-on-surface-variant">Mín: {p.minimum_stock}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal Registrar Gasto */}
      {modalOpen && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
          {...backdropProps(() => setModalOpen(false))}
        >
          <div className="bg-surface-container rounded-3xl w-full max-w-md border border-outline-variant/10 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-outline-variant/10 flex justify-between items-center bg-surface-container-low">
              <h2 className="text-xl font-bold text-on-surface">Registrar Gasto</h2>
              <button
                onClick={() => setModalOpen(false)}
                className="w-8 h-8 flex items-center justify-center rounded-full text-on-surface-variant hover:bg-surface-container-highest hover:text-on-surface transition-colors"
                aria-label="Cerrar"
              >
                <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" width="20" height="20">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleSave} className="p-6 space-y-5">
              <div className="space-y-1.5">
                <label className="text-[13px] font-semibold text-on-surface block">Descripción</label>
                <input
                  type="text"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className="w-full bg-surface-container-lowest border border-outline-variant/30 rounded-xl py-2.5 px-4 text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
                  placeholder="Ej. Pago a proveedor"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[13px] font-semibold text-on-surface block">Monto ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={form.amount}
                    onChange={(e) => setForm({ ...form, amount: e.target.value })}
                    className="w-full bg-surface-container-lowest border border-outline-variant/30 rounded-xl py-2.5 px-4 text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
                    placeholder="0.00"
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[13px] font-semibold text-on-surface block">Fecha</label>
                  <input
                    type="date"
                    value={form.expense_date}
                    onChange={(e) => setForm({ ...form, expense_date: e.target.value })}
                    className="w-full bg-surface-container-lowest border border-outline-variant/30 rounded-xl py-2.5 px-4 text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
                    required
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[13px] font-semibold text-on-surface block">Categoría</label>
                <select
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value, category_id: e.target.value })}
                  className="w-full bg-surface-container-lowest border border-outline-variant/30 rounded-xl py-2.5 px-4 text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
                >
                  <option value="">Otros</option>
                  {expenseCategories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
                </select>
              </div>

              <div className="pt-4 flex justify-end gap-3 border-t border-outline-variant/10">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-5 py-2.5 rounded-xl text-sm font-semibold text-on-surface-variant hover:text-on-surface hover:bg-surface-container-highest transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2.5 rounded-xl text-sm font-semibold bg-primary hover:bg-primary-dim text-on-primary shadow-[0_0_15px_rgba(96,99,238,0.2)] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {submitting ? "Guardando…" : "Guardar Gasto"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function KpiCard({
  icon,
  label,
  value,
  sub,
  loading,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  loading?: boolean;
  accent: string;
}) {
  return (
    <div className="bg-surface-container-lowest border border-outline-variant/10 rounded-2xl p-5 shadow-sm transition-all hover:shadow-md">
      <div className="flex items-center gap-3 mb-4">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${accent}`}>
          {icon}
        </div>
      </div>
      <p className="text-[11px] font-semibold text-on-surface-variant uppercase tracking-wider mb-1 truncate">{label}</p>
      {/* Cifra larga: en móvil baja de tamaño en vez de desbordar la tarjeta. */}
      <p className="text-lg sm:text-xl lg:text-2xl font-bold text-on-surface tabular-nums tracking-tight truncate">
        {loading ? (
          <span className="inline-block w-20 h-7 rounded bg-surface-container-high animate-pulse" />
        ) : (
          value
        )}
      </p>
      {sub && (
        <p className="text-xs text-on-surface-variant mt-1 truncate">{sub}</p>
      )}
    </div>
  );
}
