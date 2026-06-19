"use client";

import { useEffect, useMemo, useState } from "react";
import {
  IconWallet,
  IconCreditCard,
  IconDollar,
  IconShoppingCart,
  IconTrendingUp,
  IconTrendingDown,
  IconPlus,
} from "@/app/assets/icons/DashboardIcons";
import { useFinanceStore } from "@/stores/finance.store";
import type { NewExpenseInput } from "@/services/finance.service";

const money = (n: number) =>
  n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const axisLabel = (n: number) =>
  n >= 1000 ? `$${Math.round(n / 1000)}k` : `$${Math.round(n)}`;

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString("es-ES", { day: "2-digit", month: "short" });

const today = () => new Date().toISOString().slice(0, 10);

const emptyExpense = (): NewExpenseInput => ({
  description: "",
  category: "",
  amount: "",
  expense_date: today(),
});

export default function FinancePage() {
  const overview = useFinanceStore((s) => s.overview);
  const loading = useFinanceStore((s) => s.loading);
  const error = useFinanceStore((s) => s.error);
  const submitting = useFinanceStore((s) => s.submitting);
  const fetchOverview = useFinanceStore((s) => s.fetchOverview);
  const addExpense = useFinanceStore((s) => s.addExpense);

  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<NewExpenseInput>(emptyExpense);

  useEffect(() => {
    fetchOverview();
  }, [fetchOverview]);

  const chartMax = useMemo(() => {
    const values = (overview?.monthly ?? []).flatMap((m) => [m.income, m.expense]);
    return Math.max(...values, 1);
  }, [overview]);

  const gridLines = useMemo(
    () => [chartMax, chartMax * 0.66, chartMax * 0.33, 0],
    [chartMax],
  );

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const ok = await addExpense(form);
    if (ok) {
      setModalOpen(false);
      setForm(emptyExpense());
    }
  };

  const net = overview?.net ?? 0;

  return (
    <div className="flex flex-col gap-6 w-full animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-on-surface">Resumen Financiero</h1>
          <p className="text-sm text-on-surface-variant mt-1">Ingresos por ventas y gastos registrados.</p>
        </div>
        <button
          onClick={() => setModalOpen(true)}
          className="bg-[#6063ee] hover:bg-[#c0c1ff] text-white hover:text-[#0b0664] text-sm font-semibold py-2.5 px-4 rounded-xl shadow-lg shadow-[#6063ee]/20 transition-colors flex items-center justify-center gap-2"
        >
          <IconPlus className="w-4 h-4" />
          <span>Registrar Gasto</span>
        </button>
      </div>

      {error && (
        <div className="rounded-xl bg-error-container/20 border border-error-container/30 px-4 py-3 text-sm text-error-dim">
          {error}
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
        <KpiCard
          icon={<IconWallet className="w-5 h-5" />}
          tint="primary"
          label="Ingresos Totales"
          value={`$${money(overview?.revenue ?? 0)}`}
        />
        <KpiCard
          icon={<IconCreditCard className="w-5 h-5" />}
          tint="error"
          label="Gastos Totales"
          value={`$${money(overview?.expenses ?? 0)}`}
        />
        <KpiCard
          icon={<IconDollar className="w-5 h-5" />}
          tint={net >= 0 ? "emerald" : "error"}
          label="Beneficio Neto"
          value={`${net < 0 ? "-" : ""}$${money(Math.abs(net))}`}
        />
        <KpiCard
          icon={<IconShoppingCart className="w-5 h-5" />}
          tint="violet"
          label="Ventas"
          value={String(overview?.salesCount ?? 0)}
        />
      </div>

      {/* Gráfico + transacciones */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Gráfico */}
        <div className="lg:col-span-2 bg-surface-container-lowest border border-outline-variant/10 rounded-2xl p-6 shadow-sm flex flex-col">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-lg font-bold text-on-surface">Ingresos vs. Gastos</h2>
            <div className="flex items-center gap-4 text-xs font-semibold text-on-surface-variant">
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-primary"></span> Ingresos
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-error/30"></span> Gastos
              </div>
            </div>
          </div>

          <div className="flex-1 relative min-h-[300px] flex items-end justify-between pt-6 pb-8 border-b border-outline-variant/10 px-2 sm:px-6">
            {/* Líneas guía */}
            <div className="absolute inset-0 flex flex-col justify-between pb-8 z-0 pointer-events-none">
              {gridLines.map((val, i) => (
                <div key={i} className="flex items-center w-full">
                  <span className="w-10 text-[10px] font-semibold text-on-surface-variant/60">{axisLabel(val)}</span>
                  <div className="flex-1 border-b border-outline-variant/5"></div>
                </div>
              ))}
            </div>

            {/* Barras */}
            {(overview?.monthly ?? []).map((data) => (
              <div key={data.key} className="relative z-10 flex flex-col items-center gap-2 group w-10 sm:w-16">
                <div className="flex items-end justify-center gap-1 sm:gap-2 w-full h-[220px]">
                  <div
                    className="w-3 sm:w-5 bg-primary rounded-t-sm transition-all duration-500 hover:opacity-80"
                    style={{ height: `${(data.income / chartMax) * 100}%` }}
                    title={`Ingresos: $${money(data.income)}`}
                  ></div>
                  <div
                    className="w-3 sm:w-5 bg-error/30 rounded-t-sm transition-all duration-500 hover:opacity-80"
                    style={{ height: `${(data.expense / chartMax) * 100}%` }}
                    title={`Gastos: $${money(data.expense)}`}
                  ></div>
                </div>
                <span className="text-xs font-bold text-on-surface-variant mt-2">{data.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Transacciones recientes */}
        <div className="bg-surface-container-lowest border border-outline-variant/10 rounded-2xl p-6 shadow-sm flex flex-col">
          <h2 className="text-lg font-bold text-on-surface mb-6">Transacciones Recientes</h2>
          <div className="flex-1 space-y-3">
            {loading ? (
              <p className="text-sm text-on-surface-variant">Cargando…</p>
            ) : !overview || overview.recent.length === 0 ? (
              <p className="text-sm text-on-surface-variant py-8 text-center">
                Sin movimientos todavía. Registra ventas o gastos.
              </p>
            ) : (
              overview.recent.map((tx) => (
                <div key={`${tx.kind}-${tx.id}`} className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                        tx.kind === "sale"
                          ? "bg-[#10b981]/10 text-[#10b981]"
                          : "bg-error/10 text-error"
                      }`}
                    >
                      {tx.kind === "sale" ? (
                        <IconTrendingUp className="w-4 h-4" />
                      ) : (
                        <IconTrendingDown className="w-4 h-4" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-on-surface truncate">{tx.label}</p>
                      <p className="text-xs text-on-surface-variant">{formatDate(tx.date)}</p>
                    </div>
                  </div>
                  <span
                    className={`text-sm font-bold shrink-0 ${
                      tx.amount >= 0 ? "text-[#10b981]" : "text-error"
                    }`}
                  >
                    {tx.amount >= 0 ? "+" : "-"}${money(Math.abs(tx.amount))}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Modal Registrar Gasto */}
      {modalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
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
                    min="0"
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
                <label className="text-[13px] font-semibold text-on-surface block">Categoría (opcional)</label>
                <input
                  type="text"
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                  className="w-full bg-surface-container-lowest border border-outline-variant/30 rounded-xl py-2.5 px-4 text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
                  placeholder="Ej. Inventario, Servicios, Renta"
                />
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
  tint,
  label,
  value,
}: {
  icon: React.ReactNode;
  tint: "primary" | "error" | "emerald" | "violet";
  label: string;
  value: string;
}) {
  const tints: Record<string, string> = {
    primary: "bg-primary/10 text-primary",
    error: "bg-error/10 text-error",
    emerald: "bg-[#10b981]/10 text-[#10b981]",
    violet: "bg-[#8b5cf6]/10 text-[#8b5cf6]",
  };
  return (
    <div className="bg-surface-container-lowest border border-outline-variant/10 rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-4 ${tints[tint]}`}>{icon}</div>
      <p className="text-sm font-medium text-on-surface-variant mb-1">{label}</p>
      <h3 className="text-2xl font-black text-on-surface">{value}</h3>
    </div>
  );
}
