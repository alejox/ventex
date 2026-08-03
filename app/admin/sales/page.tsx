"use client";

import { useEffect, useMemo, useState } from "react";
import { useAdminStore } from "@/stores/admin.store";
import type { AdminBillingSale } from "@/services/admin.service";
import { formatMoney, planAccent, paymentMethodLabel } from "@/config/plans";
import { DataTable, type DataColumn } from "@/components/DataTable";

/**
 * Ventas de la plataforma: las cuentas que se vendieron por la pasarela.
 *
 * NO son las ventas del POS de los inquilinos — eso es el GMV que se ve en
 * Empresas. Acá "vender" es cobrarle a alguien un plan de Ventex.
 *
 * Tampoco entran las recargas que hace un revendedor con créditos: ésas no
 * pasan por la pasarela y viven en Créditos. La pantalla lo dice en pantalla,
 * porque un total que promete ser "todo lo vendido" y no lo es engaña.
 */

const STATUS_META: Record<string, { label: string; cls: string }> = {
  paid: { label: "Cobrada", cls: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" },
  pending: { label: "Pendiente", cls: "bg-amber-500/10 text-amber-600 border-amber-500/20" },
  failed: { label: "Rechazada", cls: "bg-error-container/20 text-error-dim border-error-container/30" },
  cancelled: { label: "Cancelada", cls: "bg-surface-container-high text-on-surface-variant border-outline-variant/30" },
};

type StatusFilter = "paid" | "pending" | "problem" | "all";

const FILTERS: { id: StatusFilter; label: string }[] = [
  { id: "paid", label: "Cobradas" },
  { id: "pending", label: "Pendientes" },
  { id: "problem", label: "Rechazadas" },
  { id: "all", label: "Todas" },
];

function matchesFilter(sale: AdminBillingSale, filter: StatusFilter): boolean {
  if (filter === "all") return true;
  if (filter === "problem") return sale.status === "failed" || sale.status === "cancelled";
  return sale.status === filter;
}

function formatDateTime(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("es-CO", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function AdminSalesPage() {
  const sales = useAdminStore((s) => s.sales);
  const stats = useAdminStore((s) => s.salesStats);
  const plans = useAdminStore((s) => s.plans);
  const loading = useAdminStore((s) => s.loading);
  const error = useAdminStore((s) => s.error);
  const fetchSalesPanel = useAdminStore((s) => s.fetchSalesPanel);

  const [filter, setFilter] = useState<StatusFilter>("paid");
  const [query, setQuery] = useState("");

  useEffect(() => {
    fetchSalesPanel();
  }, [fetchSalesPanel]);

  const planName = (id: string) => plans.find((p) => p.id === id)?.name ?? id;

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return sales.filter((sale) => {
      if (!matchesFilter(sale, filter)) return false;
      if (!needle) return true;
      return [sale.company_name, sale.contact_email, sale.payer_name, sale.order_id]
        .some((field) => field?.toLowerCase().includes(needle));
    });
  }, [sales, filter, query]);

  /** Suma de lo que se está mirando: el filtro tiene que mover un número. */
  const visibleGross = useMemo(
    () => visible.reduce((total, sale) => total + Number(sale.amount), 0),
    [visible],
  );

  const monthDelta = stats ? stats.gross_month - stats.gross_prev_month : 0;

  const columns: DataColumn<AdminBillingSale>[] = [
    {
      header: "Fecha",
      mobile: "subtitle",
      className: "pl-6 text-on-surface-variant whitespace-nowrap",
      headerClassName: "pl-6",
      cell: (sale) => formatDateTime(sale.paid_at ?? sale.created_at),
    },
    {
      header: "Cuenta",
      mobile: "title",
      className: "text-on-surface",
      cell: (sale) => (
        <span className="block min-w-0">
          <span className="block font-medium truncate">
            {sale.company_name || sale.payer_name || "Sin nombre"}
            {sale.is_guest && (
              <span className="ml-2 text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-600 align-middle">
                INVITADO
              </span>
            )}
          </span>
          <span className="block text-xs text-on-surface-variant truncate">
            {sale.contact_email ?? "—"}
          </span>
          {/* El id de la orden va acá y no en su propia columna: hace falta para
              cruzar con dLocal, pero una columna más obliga a scrollear. */}
          <span className="block text-[11px] font-mono text-on-surface-variant/70 truncate">
            {sale.order_id}
          </span>
        </span>
      ),
    },
    {
      header: "Plan",
      mobile: "field",
      cell: (sale) => {
        const accent = planAccent(sale.plan_id);
        return (
          <span className="inline-flex items-center gap-2">
            <span
              className={`text-xs font-bold px-2 py-0.5 rounded-full ring-1 ${accent.bg} ${accent.text} ${accent.ring}`}
            >
              {planName(sale.plan_id)}
            </span>
            <span className="text-xs text-on-surface-variant whitespace-nowrap">
              {sale.period_name}
            </span>
          </span>
        );
      },
    },
    {
      header: "Medio",
      mobile: "field",
      className: "text-on-surface-variant whitespace-nowrap",
      cell: (sale) => paymentMethodLabel(sale.payment_method_type),
    },
    {
      header: "Estado",
      align: "center",
      mobile: "badge",
      cell: (sale) => {
        const meta = STATUS_META[sale.status] ?? STATUS_META.pending;
        return (
          <span className="inline-block">
            <span
              className={`inline-block text-xs font-semibold px-2.5 py-1 rounded-full border ${meta.cls}`}
            >
              {meta.label}
            </span>
            {/* El motivo del rechazo vive con el estado: es lo único que explica
                por qué esa venta no entró. */}
            {sale.error ? (
              <span className="block text-[11px] text-error-dim mt-1 max-w-[16ch] truncate" title={sale.error}>
                {sale.error}
              </span>
            ) : null}
          </span>
        );
      },
    },
    {
      header: "Monto",
      align: "right",
      mobile: "trailing",
      className: "pr-6 font-bold text-on-surface tabular-nums whitespace-nowrap",
      headerClassName: "pr-6",
      cell: (sale) => formatMoney(Number(sale.amount), sale.currency),
    },
  ];

  return (
    <div className="w-full max-w-6xl mx-auto animate-in fade-in duration-300">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-on-surface">Ventas</h1>
        <p className="text-sm text-on-surface-variant mt-1">
          Cuentas vendidas por la pasarela de pagos. No incluye las recargas que hacen
          los revendedores con créditos.
        </p>
      </div>

      {error && (
        <div className="rounded-xl bg-error-container/20 border border-error-container/30 px-4 py-3 text-sm text-error-dim mb-6">
          {error}
        </div>
      )}

      {loading && !stats ? (
        <p className="text-sm text-on-surface-variant py-12 text-center">Cargando ventas…</p>
      ) : stats ? (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              label="Cobrado este mes"
              value={formatMoney(stats.gross_month)}
              hint={
                stats.gross_prev_month > 0
                  ? `${monthDelta >= 0 ? "+" : "−"}${formatMoney(Math.abs(monthDelta))} vs. mes pasado`
                  : "Sin mes anterior para comparar"
              }
              tone={stats.gross_prev_month > 0 ? (monthDelta >= 0 ? "up" : "down") : "neutral"}
            />
            <StatCard
              label="Cuentas del mes"
              value={String(stats.sold_month)}
              hint={`${stats.sold_total} en total`}
            />
            <StatCard label="Cobrado histórico" value={formatMoney(stats.gross_total)} />
            <StatCard
              label="Sin cobrar"
              value={String(stats.pending)}
              hint={`${stats.failed_30d} rechazada${stats.failed_30d === 1 ? "" : "s"} · 30 días`}
              tone={stats.pending > 0 ? "warn" : "neutral"}
            />
          </div>

          {/* Un cobro sin cuenta detrás es plata que entró y no activó nada:
              es lo único de esta pantalla que pide una acción. */}
          {stats.unclaimed > 0 && (
            <div className="mt-4 rounded-2xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-sm text-amber-600">
              Hay {stats.unclaimed} pago{stats.unclaimed === 1 ? "" : "s"} de invitado cobrado
              {stats.unclaimed === 1 ? "" : "s"} que todavía no reclamó ninguna cuenta. Se activan
              solos cuando la persona se registra con el mismo correo.
            </div>
          )}

          {Object.keys(stats.by_plan).length > 0 && (
            <div className="mt-6 bg-surface-container-lowest border border-outline-variant/10 rounded-3xl p-6 shadow-sm">
              <h2 className="text-lg font-bold text-on-surface mb-4">Qué se vendió</h2>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {Object.entries(stats.by_plan)
                  .sort((a, b) => b[1].gross - a[1].gross)
                  .map(([planId, row]) => {
                    const accent = planAccent(planId);
                    return (
                      <div key={planId} className={`rounded-2xl p-5 ring-1 ${accent.bg} ${accent.ring}`}>
                        <p className={`text-sm font-semibold ${accent.text}`}>{planName(planId)}</p>
                        <p className="text-2xl font-bold text-on-surface mt-2 tabular-nums break-words">
                          {formatMoney(row.gross)}
                        </p>
                        <p className="text-xs text-on-surface-variant mt-1">
                          {row.sold} cuenta{row.sold === 1 ? "" : "s"}
                        </p>
                      </div>
                    );
                  })}
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 mt-8 mb-4">
            <div className="flex flex-wrap gap-2">
              {FILTERS.map((option) => (
                <button
                  key={option.id}
                  onClick={() => setFilter(option.id)}
                  className={`px-4 py-2 rounded-full text-sm font-semibold transition-colors ${
                    filter === option.id
                      ? "bg-[#6063ee] text-white"
                      : "bg-surface-container-lowest border border-outline-variant/20 text-on-surface-variant hover:text-on-surface"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar por cuenta, correo u orden…"
              className="min-w-0 flex-1 sm:flex-none sm:w-72 rounded-full bg-surface-container-lowest border border-outline-variant/20 px-4 py-2 text-sm text-on-surface outline-none focus:border-primary"
            />
          </div>

          <p className="text-sm text-on-surface-variant mb-4">
            {visible.length} orden{visible.length === 1 ? "" : "es"} ·{" "}
            <span className="font-semibold text-on-surface tabular-nums">
              {formatMoney(visibleGross)}
            </span>
          </p>

          {visible.length === 0 ? (
            <div className="bg-surface-container-lowest border border-outline-variant/10 rounded-3xl p-8 text-center text-sm text-on-surface-variant">
              {sales.length === 0
                ? "Todavía no hay ventas por la pasarela."
                : "Ninguna orden coincide con este filtro."}
            </div>
          ) : (
            <div className="bg-surface-container-lowest border border-outline-variant/10 rounded-3xl shadow-sm overflow-hidden">
              <DataTable
                rows={visible}
                rowKey={(sale) => sale.id}
                minWidth={720}
                caption="Ventas de la plataforma"
                columns={columns}
              />
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}

function StatCard({
  label,
  value,
  hint,
  tone = "neutral",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "neutral" | "up" | "down" | "warn";
}) {
  const hintColor = {
    neutral: "text-on-surface-variant",
    up: "text-emerald-600",
    down: "text-error-dim",
    warn: "text-amber-600",
  }[tone];

  return (
    <div className="bg-surface-container-lowest border border-outline-variant/10 rounded-3xl p-5 shadow-sm">
      <p className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider">
        {label}
      </p>
      {/* En móvil la tarjeta es media pantalla: un monto largo se parte al medio. */}
      <p className="text-lg sm:text-2xl font-bold text-on-surface mt-2 tabular-nums break-words">
        {value}
      </p>
      {hint ? <p className={`text-xs mt-1 ${hintColor}`}>{hint}</p> : null}
    </div>
  );
}
