"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { useFinanceStore } from "@/stores/finance.store";
import { useInventoryStore } from "@/stores/inventory.store";
import { IconTrendingUp, IconTrendingDown, IconDollar, IconShoppingCart, IconBox, IconUsers, IconClock } from "@/app/assets/icons/DashboardIcons";

const money = (n: number) =>
  n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const MONTHS = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

export default function DashboardHomePage() {
  const overview = useFinanceStore((s) => s.overview);
  const loading = useFinanceStore((s) => s.loading);
  const fetchOverview = useFinanceStore((s) => s.fetchOverview);

  const products = useInventoryStore((s) => s.products);
  const invLoading = useInventoryStore((s) => s.loading);
  const fetchInventory = useInventoryStore((s) => s.fetchInventory);

  const [todayStats, setTodayStats] = useState<{
    sales: number;
    revenue: number;
  } | null>(null);

  useEffect(() => {
    fetchOverview();
    fetchInventory();
  }, [fetchOverview, fetchInventory]);

  useEffect(() => {
    const supabase = createClient();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    supabase
      .from("sales")
      .select("total", { count: "exact" })
      .gte("created_at", today.toISOString())
      .eq("status", "completed")
      .then(({ data, count }) => {
        setTodayStats({
          sales: count ?? 0,
          revenue: (data ?? []).reduce((s, r) => s + r.total, 0),
        });
      });
  }, []);

  const lowStock = products.filter((p) => p.stock_level != null && p.stock_level <= (p.minimum_stock ?? 0)).slice(0, 5);

  const overviewBusy = loading || !overview;

  return (
    <div className="flex flex-col gap-6 w-full animate-in fade-in duration-500">
      <div>
        <h1 className="text-2xl font-bold text-on-surface">Dashboard</h1>
        <p className="text-sm text-on-surface-variant mt-1">Resumen general del negocio</p>
      </div>

      {/* KPIs principales */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          icon={<IconDollar className="w-5 h-5" />}
          label="Ventas hoy"
          value={todayStats ? `${todayStats.sales}` : "—"}
          sub={todayStats ? `$${money(todayStats.revenue)}` : ""}
          loading={!todayStats}
          accent="bg-[#6063ee]/10 text-[#6063ee]"
        />
        <KpiCard
          icon={<IconTrendingUp className="w-5 h-5" />}
          label="Ingresos (mes)"
          value={overviewBusy ? "—" : `$${money(overview.revenue)}`}
          sub={`${overviewBusy ? "—" : overview.salesCount} ventas`}
          loading={overviewBusy}
          accent="bg-[#10b981]/10 text-[#10b981]"
        />
        <KpiCard
          icon={<IconTrendingDown className="w-5 h-5" />}
          label="Gastos (mes)"
          value={overviewBusy ? "—" : `$${money(overview.expenses)}`}
          loading={overviewBusy}
          accent="bg-error/10 text-error"
        />
        <KpiCard
          icon={<IconShoppingCart className="w-5 h-5" />}
          label="Neto (mes)"
          value={overviewBusy ? "—" : `$${money(overview.net)}`}
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
            <p className="text-sm text-on-surface-variant text-center py-8">Sin movimientos</p>
          ) : (
            <div className="space-y-3">
              {overview.recent.map((t) => (
                <div key={t.id} className="flex items-center justify-between">
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
                        {new Date(t.date).toLocaleDateString("es-CO", { day: "2-digit", month: "2-digit" })}
                      </p>
                    </div>
                  </div>
                  <span className={`text-xs font-bold shrink-0 ${
                    t.kind === "sale" ? "text-[#10b981]" : "text-error"
                  }`}>
                    {t.kind === "sale" ? "+" : "-"}${money(t.amount)}
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
          <a href="/dashboard/inventory" className="text-xs font-medium text-primary hover:text-primary-dim transition-colors">
            Ver inventario
          </a>
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
      <p className="text-[11px] font-semibold text-on-surface-variant uppercase tracking-wider mb-1">{label}</p>
      <p className="text-2xl font-bold text-on-surface tabular-nums">
        {loading ? (
          <span className="inline-block w-20 h-7 rounded bg-surface-container-high animate-pulse" />
        ) : (
          value
        )}
      </p>
      {sub && (
        <p className="text-xs text-on-surface-variant mt-1">{sub}</p>
      )}
    </div>
  );
}
