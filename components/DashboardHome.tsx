"use client";

import { useEffect, useMemo } from "react";
import Link from "next/link";
import {
  IconCreditCard,
  IconDollar,
  IconBox,
  IconUsers,
  IconPlus,
  IconShoppingCart,
  IconTrendingUp,
  IconTrendingDown,
  IconCalendar,
  IconScissors,
  IconUserBadge,
  IconCar,
} from "@/app/assets/icons/DashboardIcons";
import { useDashboardStore } from "@/stores/dashboard.store";
import { useProfile } from "@/components/ProfileProvider";
import { visibleQuickActions } from "@/config/business";

const money = (n: number) =>
  n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const axisLabel = (n: number) =>
  n >= 1000 ? `$${Math.round(n / 1000)}k` : `$${Math.round(n)}`;

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString("es-ES", { day: "2-digit", month: "short" });

type IconType = typeof IconShoppingCart;

// Mapa id de acción rápida -> icono (el modelo lógico vive en config/business.ts).
const QUICK_ACTION_ICONS: Record<string, IconType> = {
  "new-sale": IconShoppingCart,
  "new-product": IconPlus,
  "new-customer": IconUsers,
  "view-finance": IconTrendingUp,
  "new-appointment": IconCalendar,
  "new-service": IconScissors,
  "new-staff": IconUserBadge,
  "new-vehicle": IconCar,
};

export default function DashboardHome() {
  const data = useDashboardStore((s) => s.data);
  const loading = useDashboardStore((s) => s.loading);
  const error = useDashboardStore((s) => s.error);
  const fetchDashboard = useDashboardStore((s) => s.fetchDashboard);
  const profile = useProfile();

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  const quickActions = visibleQuickActions(profile?.businessType ?? null, profile?.modules ?? null);

  const chartMax = useMemo(() => {
    const values = (data?.monthly ?? []).flatMap((m) => [m.income, m.expense]);
    return Math.max(...values, 1);
  }, [data]);

  const net = data?.net ?? 0;

  const stats = [
    { title: "Ventas Totales", value: `$${money(data?.revenue ?? 0)}`, icon: IconCreditCard, bar: "bg-primary", tint: "group-hover:text-primary" },
    { title: "Flujo de Caja", value: `${net < 0 ? "-" : "+"}$${money(Math.abs(net))}`, icon: IconDollar, bar: net >= 0 ? "bg-[#10b981]" : "bg-error", tint: net >= 0 ? "group-hover:text-[#10b981]" : "group-hover:text-error" },
    { title: "Inventario Bajo", value: String(data?.lowStockCount ?? 0), icon: IconBox, bar: "bg-[#8b5cf6]", tint: "group-hover:text-[#8b5cf6]" },
    { title: "Clientes", value: String(data?.customerCount ?? 0), icon: IconUsers, bar: "bg-[#f59e0b]", tint: "group-hover:text-[#f59e0b]" },
  ];

  return (
    <div className="space-y-8">
      {error && (
        <div className="rounded-xl bg-error-container/20 border border-error-container/30 px-4 py-3 text-sm text-error-dim">
          {error}
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat) => (
          <div key={stat.title} className="bg-surface-container rounded-2xl p-5 border border-outline-variant/10 shadow-sm relative overflow-hidden group">
            <div className={`absolute top-0 left-0 w-1 h-full ${stat.bar} opacity-50 group-hover:opacity-100 transition-opacity`}></div>
            <div className="flex justify-between items-start mb-4">
              <div className={`w-10 h-10 rounded-xl bg-surface-container-high flex items-center justify-center text-on-surface-variant ${stat.tint} transition-colors`}>
                <stat.icon className="w-5 h-5" />
              </div>
            </div>
            <p className="text-on-surface-variant text-sm font-medium mb-1">{stat.title}</p>
            <h3 className="text-2xl font-bold text-on-surface">{loading && !data ? "…" : stat.value}</h3>
          </div>
        ))}
      </div>

      {/* Gráfico + acciones rápidas */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Gráfico */}
        <div className="lg:col-span-2 bg-surface-container rounded-3xl p-6 border border-outline-variant/10 shadow-sm flex flex-col">
          <div className="flex justify-between items-center mb-6">
            <h3 className="font-semibold text-on-surface">Ingresos vs. Gastos</h3>
            <span className="text-xs text-on-surface-variant">Últimos 6 meses</span>
          </div>
          <div className="flex-1 min-h-[240px] flex items-end justify-between relative pt-8 pb-4 px-2">
            <div className="absolute inset-0 flex flex-col justify-between pointer-events-none pb-10">
              {[chartMax, chartMax * 0.5, 0].map((val, i) => (
                <div key={i} className="flex items-center w-full">
                  <span className="w-9 text-[10px] font-semibold text-on-surface-variant/60">{axisLabel(val)}</span>
                  <div className="flex-1 border-t border-outline-variant/5"></div>
                </div>
              ))}
            </div>
            {(data?.monthly ?? []).map((m) => (
              <div key={m.key} className="relative z-10 flex flex-col items-center gap-2 w-8 sm:w-12">
                <div className="flex items-end justify-center gap-1 w-full h-[200px]">
                  <div
                    className="w-3 sm:w-4 bg-primary rounded-t-sm transition-all duration-500 hover:opacity-80"
                    style={{ height: `${(m.income / chartMax) * 100}%` }}
                    title={`Ingresos: $${money(m.income)}`}
                  ></div>
                  <div
                    className="w-3 sm:w-4 bg-surface-variant rounded-t-sm transition-all duration-500 hover:opacity-80"
                    style={{ height: `${(m.expense / chartMax) * 100}%` }}
                    title={`Gastos: $${money(m.expense)}`}
                  ></div>
                </div>
                <span className="text-xs font-medium text-on-surface-variant">{m.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Acciones rápidas */}
        <div className="bg-surface-container rounded-3xl p-6 border border-outline-variant/10 shadow-sm flex flex-col">
          <h3 className="font-semibold text-on-surface mb-6">Acciones Rápidas</h3>
          <div className="grid grid-cols-2 gap-4 flex-1">
            {quickActions.map((action) => {
              const Icon = QUICK_ACTION_ICONS[action.id];
              return (
                <Link
                  key={action.id}
                  href={action.href}
                  className="flex flex-col items-center justify-center gap-3 bg-surface-container-lowest hover:bg-surface-container-high border border-outline-variant/10 hover:border-primary/30 rounded-2xl p-4 transition-all group shadow-sm hover:shadow-md hover:shadow-primary/5"
                >
                  <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center group-hover:scale-110 transition-transform">
                    {Icon && <Icon className="w-5 h-5" />}
                  </div>
                  <span className="text-xs font-medium text-on-surface-variant group-hover:text-on-surface text-center">
                    {action.title}
                  </span>
                </Link>
              );
            })}
          </div>
        </div>
      </div>

      {/* Actividad reciente */}
      <div className="bg-surface-container rounded-3xl p-6 border border-outline-variant/10 shadow-sm">
        <div className="flex justify-between items-center mb-6">
          <h3 className="font-semibold text-on-surface">Actividad Reciente</h3>
          <Link href="/dashboard/sales" className="text-xs font-medium text-primary hover:text-primary-dim transition-colors">
            Ver Todo
          </Link>
        </div>

        <div className="space-y-3">
          {loading && !data ? (
            <p className="text-sm text-on-surface-variant py-6 text-center">Cargando…</p>
          ) : !data || data.recent.length === 0 ? (
            <p className="text-sm text-on-surface-variant py-6 text-center">
              Sin actividad todavía. Registra una venta o un gasto.
            </p>
          ) : (
            data.recent.map((tx) => (
              <div
                key={`${tx.kind}-${tx.id}`}
                className="flex items-center justify-between p-4 rounded-2xl bg-surface-container-lowest border border-outline-variant/5 hover:border-outline-variant/20 transition-colors gap-4"
              >
                <div className="flex items-center gap-4 min-w-0">
                  <div
                    className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
                      tx.kind === "sale" ? "bg-[#10b981]/10 text-[#10b981]" : "bg-error/10 text-error"
                    }`}
                  >
                    {tx.kind === "sale" ? <IconShoppingCart className="w-5 h-5" /> : <IconTrendingDown className="w-5 h-5" />}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-on-surface truncate">{tx.label}</p>
                    <p className="text-xs text-on-surface-variant mt-0.5">{formatDate(tx.date)}</p>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className={`text-sm font-bold ${tx.amount >= 0 ? "text-[#10b981]" : "text-error"}`}>
                    {tx.amount >= 0 ? "+" : "-"}${money(Math.abs(tx.amount))}
                  </p>
                  <p className="text-[11px] font-medium text-on-surface-variant mt-0.5 px-2 py-0.5 rounded-md bg-surface-variant inline-block">
                    {tx.kind === "sale" ? "Venta" : "Gasto"}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
