"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useFinanceStore } from "@/stores/finance.store";
import { useInventoryStore } from "@/stores/inventory.store";
import { useProfile } from "@/components/ProfileProvider";
import {
  visibleNavItems,
  visibleQuickActions,
  workerNavItems,
  workerQuickActions,
} from "@/config/business";
import { needsRestock } from "@/lib/stock";
import { ExpenseModal } from "@/components/ExpenseModal";
import { ExpensesByCategory } from "@/components/ExpensesByCategory";
import {
  IconAlertTriangle,
  IconBox,
  IconCalendar,
  IconCar,
  IconClock,
  IconCreditCard,
  IconDollar,
  IconFileText,
  IconPlus,
  IconRefreshCw,
  IconScissors,
  IconTrendingDown,
  IconTrendingUp,
  IconUserBadge,
  IconUsers,
  IconWallet,
} from "@/app/assets/icons/DashboardIcons";
import { GettingStarted } from "@/components/onboarding/GettingStarted";
import { formatDateOnly } from "@/lib/date";
import { useCurrency, useFormatMoney } from "@/lib/useMoney";
import {
  HOME_PERIODS,
  changeTone,
  comparePeriods,
  formatChange,
  pendingChecksFor,
  pendingItems,
  rangeLabel,
  type ChangeTone,
  type PendingId,
} from "@/services/finance.service";
import { MonthlyChart } from "@/app/dashboard/reports/MonthlyChart";

type IconType = (props: { className?: string }) => React.ReactNode;

/**
 * Presentación de cada acción rápida (ícono del set, subtítulo y, si la
 * pantalla lo soporta, el deep-link que abre directo el formulario). La lista
 * y el gating viven en config/business.ts: acá no se decide qué se muestra,
 * solo cómo se ve y adónde lleva.
 *
 * Un solo acento (`primary`) para todas: nueve colores distintos competían con
 * los KPIs y no codificaban nada.
 */
const QUICK_ACTION_STYLE: Record<string, { Icon: IconType; hint: string; href?: string }> = {
  "new-sale": { Icon: IconCreditCard, hint: "Cobrar al instante" },
  "new-appointment": { Icon: IconCalendar, hint: "Agenda y turnos" },
  "new-service": { Icon: IconScissors, hint: "Catálogo de servicios" },
  "new-customer": { Icon: IconUsers, hint: "Directorio y visitas" },
  "new-product": { Icon: IconBox, hint: "Alta en inventario" },
  replenish: { Icon: IconRefreshCw, hint: "Reposición a proveedor" },
  "new-staff": { Icon: IconUserBadge, hint: "Equipo y comisiones" },
  "new-vehicle": { Icon: IconCar, hint: "Historial por placa" },
  // Facturación abre el formulario con `?new=1` (ver OpenOnNewParam).
  "new-invoice": { Icon: IconFileText, hint: "Facturas y cotizaciones", href: "/dashboard/billing?new=1" },
};

const DEFAULT_QUICK_STYLE = { Icon: IconPlus as IconType, hint: "Abrir sección" };

const PENDING_ICON: Record<PendingId, IconType> = {
  appointments: IconCalendar,
  credits: IconClock,
  overdueInvoices: IconFileText,
  commissions: IconDollar,
  openShift: IconCreditCard,
  license: IconAlertTriangle,
};

const PENDING_TONE: Record<"info" | "warn" | "danger", string> = {
  info: "bg-primary/10 text-primary",
  warn: "bg-warning/10 text-warning",
  danger: "bg-error/10 text-error",
};

const CHANGE_TONE: Record<ChangeTone, string> = {
  good: "text-success",
  bad: "text-error",
  neutral: "text-on-surface-variant",
};

/**
 * Panel de inicio: qué hay que hacer hoy, cómo va el período elegido contra el
 * anterior, los seis meses de ingresos vs egresos y la alerta de stock bajo.
 *
 * Es también un punto de entrada para registrar un gasto, así que
 * `canAddExpense` llega desde el servidor: solo el dueño escribe gastos, un
 * trabajador con permiso `panel` los ve pero no los crea.
 */
export function DashboardHome({ canAddExpense = false }: { canAddExpense?: boolean }) {
  const fmtMoney = useFormatMoney();
  const currency = useCurrency();
  const profile = useProfile();
  const overview = useFinanceStore((s) => s.overview);
  const previous = useFinanceStore((s) => s.previous);
  const chart = useFinanceStore((s) => s.chart);
  const loading = useFinanceStore((s) => s.loading);
  const error = useFinanceStore((s) => s.error);
  const fetchOverview = useFinanceStore((s) => s.fetchOverview);
  const period = useFinanceStore((s) => s.period);
  const customFrom = useFinanceStore((s) => s.customFrom);
  const customTo = useFinanceStore((s) => s.customTo);
  const previousRange = useFinanceStore((s) => s.previousRange);
  const setPeriod = useFinanceStore((s) => s.setPeriod);
  const setCustomRange = useFinanceStore((s) => s.setCustomRange);
  const pending = useFinanceStore((s) => s.pending);
  const fetchPending = useFinanceStore((s) => s.fetchPending);

  const todaySales = useFinanceStore((s) => s.todaySales);
  const fetchTodaySales = useFinanceStore((s) => s.fetchTodaySales);

  const products = useInventoryStore((s) => s.products);
  const invLoading = useInventoryStore((s) => s.loading);
  const fetchInventory = useInventoryStore((s) => s.fetchInventory);

  const [modalOpen, setModalOpen] = useState(false);

  const isOwner = Boolean(profile && !profile.isWorker);

  // Qué pantallas existen para esta persona: la MISMA cuenta que arma el menú
  // (config/business.ts). Los pendientes y el bloque de stock se cuelgan de
  // ahí en vez de repetir reglas por tipo de negocio.
  const navIds = useMemo(() => {
    if (!profile) return [] as string[];
    const items = profile.isWorker
      ? workerNavItems(profile.workerPermissions ?? {}, profile.modules ?? null)
      : visibleNavItems(profile.businessType ?? null, profile.modules ?? null);
    return items.map((i) => i.id);
  }, [profile]);

  const checks = useMemo(() => pendingChecksFor(navIds, isOwner), [navIds, isOwner]);
  const checksKey = checks.join(",");

  // F9: stock bajo solo donde hay mercadería. "pedidos" es el ítem que exige
  // el módulo `inventory` (o ser tienda); a un trabajador lo habilita su permiso.
  const showStock = isOwner
    ? navIds.includes("pedidos")
    : Boolean(profile?.workerPermissions?.inventory || profile?.workerPermissions?.catalogo);

  useEffect(() => {
    fetchOverview();
    fetchTodaySales();
  }, [fetchOverview, fetchTodaySales]);

  useEffect(() => {
    if (showStock) fetchInventory();
  }, [showStock, fetchInventory]);

  useEffect(() => {
    if (!checksKey) return;
    fetchPending(checksKey.split(",") as PendingId[]);
  }, [checksKey, fetchPending]);

  // Misma definición que el KPI y el filtro de Inventario.
  const lowStock = products.filter(needsRestock).slice(0, 5);

  // Una tienda no tiene citas ni servicios: el menú ya lo respetaba, el panel no.
  const quickActions = profile?.isWorker
    ? workerQuickActions(profile.workerPermissions ?? {})
    : visibleQuickActions(profile?.businessType ?? null, profile?.modules ?? null);

  const pendingList = pending
    ? pendingItems(checks, pending, isOwner ? "/dashboard/staff" : "/dashboard/pos")
    : [];

  const overviewBusy = loading || !overview;
  const comparison = overview && previous ? comparePeriods(overview, previous) : null;
  const vsLabel = previousRange ? `vs ${rangeLabel(previousRange)}` : "";

  const changeOf = (pct: number | null | undefined, higherIsBetter: boolean) => {
    if (!comparison || overviewBusy) return undefined;
    if (pct === null || pct === undefined) {
      const text = previousRange ? `Sin datos en ${rangeLabel(previousRange)} para comparar` : "Sin datos para comparar";
      return { text, tone: "neutral" as ChangeTone };
    }
    return { text: `${formatChange(pct)} ${vsLabel}`.trim(), tone: changeTone(pct, higherIsBetter) };
  };

  const ticket = todaySales && todaySales.count > 0 ? todaySales.revenue / todaySales.count : 0;
  const periodLabel = HOME_PERIODS.find((p) => p.id === period)?.label ?? "";

  return (
    <div className="flex flex-col gap-6 w-full animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-on-surface">Panel de control</h1>
          <p className="text-sm text-on-surface-variant mt-1">Qué hay para hoy y cómo va el negocio</p>
        </div>
        {canAddExpense && (
          <button
            onClick={() => setModalOpen(true)}
            className="bg-primary hover:bg-primary-dim text-on-primary text-sm font-semibold py-2.5 px-4 rounded-xl shadow-lg shadow-primary/20 transition-colors flex items-center justify-center gap-2"
          >
            <IconPlus className="w-4 h-4" />
            <span>Registrar gasto</span>
          </button>
        )}
      </div>

      {error && (
        <div className="rounded-xl bg-error-container/20 border border-error-container/30 px-4 py-3 text-sm text-error-dim">
          {error}
        </div>
      )}

      {/* Primeros pasos: solo mientras falten y no se haya ocultado. */}
      <GettingStarted />

      {/* F6: pendientes de hoy. Solo lo que aplica a esta persona y solo lo que
          no está en cero: si no hay nada, el bloque dice que está al día. */}
      {checks.length > 0 && (
        <section aria-labelledby="pendientes-hoy" className="bg-surface-container-lowest border border-outline-variant/10 rounded-2xl p-4 sm:p-5 shadow-sm">
          <h2 id="pendientes-hoy" className="text-sm font-bold text-on-surface mb-3">Pendientes de hoy</h2>
          {pending === null ? (
            <div className="flex gap-3" aria-hidden="true">
              <span className="h-12 w-40 rounded-xl bg-surface-container-high animate-pulse" />
              <span className="h-12 w-40 rounded-xl bg-surface-container-high animate-pulse" />
            </div>
          ) : pendingList.length === 0 ? (
            <p className="text-sm text-on-surface-variant">Todo al día: no hay nada pendiente.</p>
          ) : (
            <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
              {pendingList.map((item) => {
                const Icon = PENDING_ICON[item.id];
                return (
                  <li key={item.id}>
                    <Link
                      href={item.href}
                      className="flex items-center gap-3 p-3 rounded-xl border border-outline-variant/15 hover:border-primary/40 hover:bg-primary/5 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                    >
                      <span className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${PENDING_TONE[item.tone]}`}>
                        <Icon className="w-4 h-4" />
                      </span>
                      <span className="text-sm font-medium text-on-surface min-w-0 flex-1">{item.label}</span>
                      <span aria-hidden="true" className="text-on-surface-variant text-sm">→</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}

      {/* Acciones rápidas: qué se muestra lo decide config/business.ts según el
          tipo de negocio (o los permisos, si es trabajador). */}
      {quickActions.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {quickActions.map((action) => {
            const style = QUICK_ACTION_STYLE[action.id] ?? DEFAULT_QUICK_STYLE;
            const Icon = style.Icon;
            return (
              <Link
                key={action.id}
                href={("href" in style && style.href) || action.href}
                className="flex items-center gap-3 p-3.5 rounded-2xl bg-surface-container-lowest border border-outline-variant/10 hover:border-primary/40 hover:bg-primary/5 transition-colors group shadow-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              >
                <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 bg-primary/10 text-primary group-hover:scale-105 transition-transform">
                  <Icon className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <span className="text-sm font-semibold text-on-surface block truncate">{action.title}</span>
                  <span className="text-xs text-on-surface-variant truncate block">{style.hint}</span>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {/* F2: período de los KPIs. "Este mes" por defecto; la comparación es
          contra el tramo anterior equivalente (ver `previousPeriod`). */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Período de los indicadores">
          {HOME_PERIODS.map((p) => (
            <button
              key={p.id}
              type="button"
              aria-pressed={period === p.id}
              onClick={() => setPeriod(p.id)}
              className={`px-3.5 py-2 rounded-xl text-xs font-semibold border transition-colors ${
                period === p.id
                  ? "bg-primary/10 border-primary/40 text-primary"
                  : "bg-surface-container border-outline-variant/10 text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
        {period === "custom" && (
          <div className="flex flex-wrap items-end gap-3 bg-surface-container rounded-2xl border border-outline-variant/10 p-4">
            <label className="text-xs font-semibold text-on-surface-variant space-y-1.5">
              <span className="block">Desde</span>
              <input
                type="date"
                value={customFrom}
                max={customTo || undefined}
                onChange={(e) => setCustomRange(e.target.value, customTo)}
                className="px-3 py-2 bg-surface-container-low border border-outline-variant/20 rounded-xl text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </label>
            <label className="text-xs font-semibold text-on-surface-variant space-y-1.5">
              <span className="block">Hasta</span>
              <input
                type="date"
                value={customTo}
                min={customFrom || undefined}
                onChange={(e) => setCustomRange(customFrom, e.target.value)}
                className="px-3 py-2 bg-surface-container-low border border-outline-variant/20 rounded-xl text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </label>
            {(!customFrom || !customTo) && (
              <p className="text-xs text-on-surface-variant pb-2.5">Elige las dos fechas.</p>
            )}
          </div>
        )}
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* F8: el monto manda; la cantidad y el ticket van de subtítulo. Es el
            pulso del día, independiente del período elegido. */}
        <KpiCard
          icon={<IconDollar className="w-5 h-5" />}
          label="Ventas de hoy"
          value={todaySales ? fmtMoney(todaySales.revenue) : "—"}
          sub={
            todaySales
              ? todaySales.count === 0
                ? "Sin ventas todavía"
                : `${todaySales.count} ${todaySales.count === 1 ? "venta" : "ventas"} · ticket promedio ${fmtMoney(ticket)}`
              : ""
          }
          loading={!todaySales}
        />
        <KpiCard
          icon={<IconTrendingUp className="w-5 h-5" />}
          label={`Ingresos · ${periodLabel}`}
          value={overviewBusy ? "—" : fmtMoney(overview.revenue)}
          sub={overviewBusy ? "" : `${overview.salesCount} ${overview.salesCount === 1 ? "venta" : "ventas"} + facturas cobradas`}
          change={changeOf(comparison?.revenue, true)}
          loading={overviewBusy}
        />
        <KpiCard
          icon={<IconTrendingDown className="w-5 h-5" />}
          label={`Egresos · ${periodLabel}`}
          value={overviewBusy ? "—" : fmtMoney(overview.expenses)}
          // Sin esta línea, este número y el de la pantalla de Gastos parecen
          // dos cifras distintas para la misma pregunta.
          sub="Gastos + compras a proveedores"
          change={changeOf(comparison?.expenses, false)}
          loading={overviewBusy}
        />
        {/* Flujo de caja, no utilidad: resta las compras de mercadería sin
            descontar el costo de lo vendido. */}
        <KpiCard
          icon={<IconWallet className="w-5 h-5" />}
          label={`Flujo de caja · ${periodLabel}`}
          value={overviewBusy ? "—" : `${overview.net < 0 ? "−" : ""}${fmtMoney(Math.abs(overview.net))}`}
          valueTone={!overviewBusy && overview.net < 0 ? "bad" : undefined}
          sub="Ingresos − egresos"
          change={changeOf(comparison?.net, true)}
          loading={overviewBusy}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* F4: seis meses, siempre; no depende del período elegido. */}
        <section className="lg:col-span-2 bg-surface-container-lowest border border-outline-variant/10 rounded-2xl p-5 sm:p-6 shadow-sm min-w-0">
          <div className="flex items-center justify-between gap-4 mb-5">
            <h2 className="text-sm font-bold text-on-surface">Ingresos vs egresos (últimos 6 meses)</h2>
            {isOwner && (
              <Link href="/dashboard/reports" className="text-xs font-medium text-primary hover:text-primary-dim shrink-0">
                Ver reportes →
              </Link>
            )}
          </div>
          <MonthlyChart months={chart?.monthly ?? []} fmtMoney={fmtMoney} currency={currency} loading={!chart} />
        </section>

        {/* Movimientos del período */}
        <section className="bg-surface-container-lowest border border-outline-variant/10 rounded-2xl p-5 sm:p-6 shadow-sm min-w-0">
          <h2 className="text-sm font-bold text-on-surface mb-4">Movimientos recientes</h2>
          {overviewBusy ? (
            <p className="text-sm text-on-surface-variant text-center py-8">Cargando…</p>
          ) : overview.recent.length === 0 ? (
            <p className="text-sm text-on-surface-variant text-center py-8">
              Sin movimientos en este período. Registra ventas o gastos.
            </p>
          ) : (
            <ul className="space-y-3">
              {overview.recent.map((t) => (
                <li key={`${t.kind}-${t.id}`} className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${t.kind === "sale" ? "bg-success/10" : "bg-error/10"}`}>
                      {t.kind === "sale" ? (
                        <IconTrendingUp className="w-4 h-4 text-success" />
                      ) : (
                        <IconTrendingDown className="w-4 h-4 text-error" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-on-surface truncate">{t.label}</p>
                      <p className="text-xs text-on-surface-variant">
                        {formatDateOnly(t.day, { day: "2-digit", month: "short" })}
                      </p>
                    </div>
                  </div>
                  <span className={`text-xs font-bold shrink-0 tabular-nums ${t.amount >= 0 ? "text-success" : "text-error"}`}>
                    {t.amount >= 0 ? "+" : "−"}
                    {fmtMoney(Math.abs(t.amount))}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* Gastos por categoría del período */}
      <section className="bg-surface-container-lowest border border-outline-variant/10 rounded-2xl p-5 sm:p-6 shadow-sm">
        <div className="flex items-center justify-between gap-4 mb-5">
          <div className="min-w-0">
            <h2 className="text-sm font-bold text-on-surface">Egresos por categoría</h2>
            <p className="text-xs text-on-surface-variant mt-0.5">
              {periodLabel}, de mayor a menor. Incluye las compras a proveedores.
            </p>
          </div>
          <Link href="/dashboard/expenses" className="text-xs font-medium text-primary hover:text-primary-dim transition-colors shrink-0">
            Ver gastos →
          </Link>
        </div>
        {overviewBusy ? (
          <p className="text-sm text-on-surface-variant text-center py-10">Cargando…</p>
        ) : (
          <ExpensesByCategory slices={overview.expensesByCategory} total={overview.expenses} emptyLabel="Sin egresos en este período." />
        )}
      </section>

      {/* Alerta de stock bajo: solo donde hay inventario (F9). */}
      {showStock && (
        <section className="bg-surface-container-lowest border border-outline-variant/10 rounded-2xl p-5 sm:p-6 shadow-sm">
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
                    <p className="text-xs text-on-surface-variant">SKU: {p.sku}</p>
                  </div>
                  <div className="text-right shrink-0 ml-3">
                    <p className={`text-xs font-bold ${(p.stock_level ?? 0) <= 0 ? "text-error" : "text-warning"}`}>
                      {p.stock_level} uds.
                    </p>
                    <p className="text-xs text-on-surface-variant">Mín: {p.minimum_stock}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {modalOpen && (
        <ExpenseModal
          onClose={() => setModalOpen(false)}
          // El gasto nuevo cambia los KPIs y el gráfico que se están viendo.
          onSaved={fetchOverview}
        />
      )}
    </div>
  );
}

function KpiCard({
  icon,
  label,
  value,
  sub,
  change,
  loading,
  valueTone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  change?: { text: string; tone: ChangeTone };
  loading?: boolean;
  valueTone?: "bad";
}) {
  return (
    <div className="bg-surface-container-lowest border border-outline-variant/10 rounded-2xl p-4 sm:p-5 shadow-sm">
      <div className="flex items-center gap-2 mb-3 text-on-surface-variant">
        <span className="w-8 h-8 rounded-lg flex items-center justify-center bg-primary/10 text-primary shrink-0">{icon}</span>
        <p className="text-[11px] font-semibold uppercase tracking-wider truncate">{label}</p>
      </div>
      {/* Cifra larga: en móvil baja de tamaño en vez de desbordar la tarjeta. */}
      <p className={`text-lg sm:text-xl lg:text-2xl font-bold tabular-nums tracking-tight break-words ${valueTone === "bad" ? "text-error" : "text-on-surface"}`}>
        {loading ? <span className="inline-block w-20 h-7 rounded bg-surface-container-high animate-pulse" /> : value}
      </p>
      {change && !loading && (
        <p className={`text-xs font-semibold mt-1 ${CHANGE_TONE[change.tone]}`}>{change.text}</p>
      )}
      {sub && <p className="text-xs text-on-surface-variant mt-1">{sub}</p>}
    </div>
  );
}
