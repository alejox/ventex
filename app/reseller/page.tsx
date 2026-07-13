"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useResellerStore } from "@/stores/reseller.store";

const REASON_LABELS: Record<string, string> = {
  grant: "Créditos otorgados",
  consume: "Consumo de licencia",
  adjust: "Ajuste",
};

export default function ResellerOverviewPage() {
  const stats = useResellerStore((s) => s.stats);
  const history = useResellerStore((s) => s.history);
  const plans = useResellerStore((s) => s.plans);
  const loading = useResellerStore((s) => s.loading);
  const error = useResellerStore((s) => s.error);
  const fetchOverview = useResellerStore((s) => s.fetchOverview);

  useEffect(() => {
    fetchOverview();
  }, [fetchOverview]);

  const creditPlans = plans.filter((p) => p.is_active && p.id !== "gratis");
  const planName = (id: string) => plans.find((p) => p.id === id)?.name ?? id;
  const totalBalance = creditPlans.reduce(
    (sum, p) => sum + (stats?.balances?.[p.id] ?? 0),
    0,
  );

  return (
    <div className="w-full max-w-5xl mx-auto animate-in fade-in duration-300">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-on-surface">Resumen</h1>
        <p className="text-sm text-on-surface-variant mt-1">
          Tus créditos y el estado de tus clientes. 1 crédito = 1 mes de licencia.
        </p>
      </div>

      {error && (
        <div className="rounded-xl bg-error-container/20 border border-error-container/30 px-4 py-3 text-sm text-error-dim mb-6">
          {error}
        </div>
      )}

      {loading && !stats ? (
        <p className="text-sm text-on-surface-variant py-12 text-center">Cargando…</p>
      ) : stats ? (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {creditPlans.map((p) => (
              <StatCard
                key={p.id}
                label={`Créditos ${p.name}`}
                value={String(stats.balances?.[p.id] ?? 0)}
                highlight
              />
            ))}
            <StatCard label="Clientes" value={String(stats.clients_total)} />
            <StatCard label="Licencias activas" value={String(stats.clients_active)} />
            <StatCard label="Consumidos este mes" value={String(stats.consumed_this_month)} />
          </div>

          {totalBalance === 0 && (
            <div className="rounded-xl bg-amber-500/10 border border-amber-500/30 px-4 py-3 text-sm text-amber-600 dark:text-amber-400 mt-6">
              No tienes créditos disponibles. Tus clientes no podrán activar ni renovar su
              licencia hasta que el administrador te otorgue más créditos.
            </div>
          )}

          <div className="bg-surface-container-lowest border border-outline-variant/10 rounded-3xl p-6 md:p-8 shadow-sm mt-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-bold text-on-surface">Movimientos de créditos</h2>
              <Link href="/reseller/clients" className="text-sm font-semibold text-primary hover:underline">
                Ver clientes →
              </Link>
            </div>
            {history.length === 0 ? (
              <p className="text-sm text-on-surface-variant py-6 text-center">
                Aún no hay movimientos.
              </p>
            ) : (
              <ul className="divide-y divide-outline-variant/5">
                {history.map((m) => (
                  <li key={m.id} className="flex items-center justify-between py-3">
                    <div>
                      <p className="text-sm font-medium text-on-surface">
                        {REASON_LABELS[m.reason] ?? m.reason}
                        <span className="text-xs font-semibold text-on-surface-variant ml-2">
                          · {planName(m.plan_id)}
                        </span>
                      </p>
                      <p className="text-xs text-on-surface-variant">
                        {m.note ? `${m.note} · ` : ""}
                        {new Date(m.created_at).toLocaleDateString("es-CO", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </p>
                    </div>
                    <span
                      className={`text-sm font-bold tabular-nums ${
                        m.delta > 0 ? "text-primary" : "text-on-surface-variant"
                      }`}
                    >
                      {m.delta > 0 ? `+${m.delta}` : m.delta}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}

function StatCard({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`border rounded-3xl p-5 shadow-sm ${
        highlight
          ? "bg-primary/10 border-primary/20"
          : "bg-surface-container-lowest border-outline-variant/10"
      }`}
    >
      <p className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider">{label}</p>
      <p
        className={`text-2xl font-bold mt-2 tabular-nums break-words ${
          highlight ? "text-primary" : "text-on-surface"
        }`}
      >
        {value}
      </p>
    </div>
  );
}
