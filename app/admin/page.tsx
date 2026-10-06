"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAdminStore } from "@/stores/admin.store";
import { formatMoney, planAccent } from "@/config/plans";
import { platformKpis } from "@/app/admin/company-metrics";

export default function AdminOverviewPage() {
  const stats = useAdminStore((s) => s.stats);
  const plans = useAdminStore((s) => s.plans);
  const loading = useAdminStore((s) => s.loading);
  const error = useAdminStore((s) => s.error);
  const fetchOverview = useAdminStore((s) => s.fetchOverview);
  const companies = useAdminStore((s) => s.companies);
  const salesStats = useAdminStore((s) => s.salesStats);
  const fetchSalesPanel = useAdminStore((s) => s.fetchSalesPanel);
  const [now] = useState(() => Date.now());

  useEffect(() => {
    fetchOverview();
    // "Cobrado este mes" sale de las órdenes de ePayco (admin_billing_stats),
    // que es lo que de verdad entra a Ventex. El resumen lo pide con la misma
    // acción que usa /admin/sales en vez de duplicar la consulta.
    fetchSalesPanel();
  }, [fetchOverview, fetchSalesPanel]);

  const kpis = useMemo(() => platformKpis(companies, now), [companies, now]);

  return (
    <div className="w-full max-w-5xl mx-auto animate-in fade-in duration-300">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-on-surface">Resumen de la plataforma</h1>
        <p className="text-sm text-on-surface-variant mt-1">
          Métricas globales de todas las empresas registradas.
        </p>
      </div>

      {error && (
        <div className="rounded-xl bg-error-container/20 border border-error-container/30 px-4 py-3 text-sm text-error-dim mb-6">
          {error}
        </div>
      )}

      {loading && !stats ? (
        <p className="text-sm text-on-surface-variant py-12 text-center">Cargando métricas…</p>
      ) : stats ? (
        <>
          {/* Primero lo que es de Ventex (F16): lo cobrado, lo que hay que
              renovar ya y lo que entra. El GMV —lo que vendieron los
              negocios— va después y con su nombre: no es plata de Ventex. */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              label="Cobrado este mes"
              value={salesStats ? formatMoney(salesStats.gross_month) : "—"}
              href="/admin/sales"
              hint={salesStats ? `Mes anterior: ${formatMoney(salesStats.gross_prev_month)}` : undefined}
            />
            <StatCard
              label="Licencias que vencen en 7 días"
              value={String(kpis.expiringSoon)}
              href="/admin/companies"
              tone={kpis.expiringSoon > 0 ? "warning" : undefined}
            />
            <StatCard label="Altas · 30 días" value={String(kpis.registrations30)} href="/admin/companies" />
            <StatCard label="Empresas" value={String(stats.companies)} hint={`${stats.staff_total} colaboradores`} />
          </div>
          <div className="grid grid-cols-2 gap-4 mt-4">
            <StatCard label="GMV de inquilinos · mes" value={formatMoney(stats.monthly_sales)} />
            <StatCard label="GMV de inquilinos · histórico" value={formatMoney(stats.total_sales)} />
          </div>

          <div className="bg-surface-container-lowest border border-outline-variant/10 rounded-3xl p-6 md:p-8 shadow-sm mt-6">
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 mb-6">
              <h2 className="text-lg font-bold text-on-surface">Distribución por plan</h2>
              <Link href="/admin/companies" className="text-sm font-semibold text-primary-ink hover:underline whitespace-nowrap">
                Ver empresas →
              </Link>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {plans
                .filter((p) => p.is_active)
                .map((p) => {
                  const accent = planAccent(p.id);
                  const count = stats.by_plan?.[p.id] ?? 0;
                  return (
                    <div key={p.id} className={`rounded-2xl p-5 ring-1 ${accent.bg} ${accent.ring}`}>
                      <p className={`text-sm font-semibold ${accent.text}`}>{p.name}</p>
                      <p className="text-3xl font-bold text-on-surface mt-2 tabular-nums">{count}</p>
                      <p className="text-xs text-on-surface-variant mt-1">
                        empresa{count === 1 ? "" : "s"}
                      </p>
                    </div>
                  );
                })}
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}

function StatCard({
  label,
  value,
  hint,
  href,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  href?: string;
  tone?: "warning";
}) {
  const body = (
    <>
      <p className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider">{label}</p>
      {/* En móvil las tarjetas son media pantalla: un monto largo se parte a la mitad. */}
      <p className={`text-lg sm:text-2xl font-bold mt-2 tabular-nums break-words ${tone === "warning" ? "text-warning" : "text-on-surface"}`}>
        {value}
      </p>
      {hint && <p className="text-xs text-on-surface-variant mt-1">{hint}</p>}
    </>
  );
  const box = "block bg-surface-container-lowest border border-outline-variant/40 rounded-3xl p-5 shadow-sm";
  return href ? (
    <Link
      href={href}
      className={`${box} transition-colors hover:bg-surface-container-low focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-ink`}
    >
      {body}
    </Link>
  ) : (
    <div className={box}>{body}</div>
  );
}
