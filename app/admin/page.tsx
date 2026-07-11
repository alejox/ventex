"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useAdminStore } from "@/stores/admin.store";
import { formatMoney, planAccent } from "@/config/plans";

export default function AdminOverviewPage() {
  const stats = useAdminStore((s) => s.stats);
  const plans = useAdminStore((s) => s.plans);
  const loading = useAdminStore((s) => s.loading);
  const error = useAdminStore((s) => s.error);
  const fetchOverview = useAdminStore((s) => s.fetchOverview);

  useEffect(() => {
    fetchOverview();
  }, [fetchOverview]);

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
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard label="Empresas" value={String(stats.companies)} />
            <StatCard label="Colaboradores" value={String(stats.staff_total)} />
            <StatCard label="Ventas del mes" value={formatMoney(stats.monthly_sales)} />
            <StatCard label="Ventas totales" value={formatMoney(stats.total_sales)} />
          </div>

          <div className="bg-surface-container-lowest border border-outline-variant/10 rounded-3xl p-6 md:p-8 shadow-sm mt-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-bold text-on-surface">Distribución por plan</h2>
              <Link href="/admin/companies" className="text-sm font-semibold text-primary hover:underline">
                Ver empresas →
              </Link>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-surface-container-lowest border border-outline-variant/10 rounded-3xl p-5 shadow-sm">
      <p className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider">{label}</p>
      <p className="text-2xl font-bold text-on-surface mt-2 tabular-nums break-words">{value}</p>
    </div>
  );
}
