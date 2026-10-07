"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useReportsStore } from "@/stores/reports.store";
import {
  CATEGORY_EXPORT_COLUMNS,
  MONTHLY_EXPORT_COLUMNS,
  PAYMENT_EXPORT_COLUMNS,
  REPORT_PERIODS,
  totalsOf,
  type MonthlyRow,
} from "@/services/reports.service";
import type { ExpenseSlice } from "@/services/finance.service";
import { ExpensesByCategory } from "@/components/ExpensesByCategory";
import { CollectionError } from "@/components/CollectionState";
import { useCurrency, useFormatMoney } from "@/lib/useMoney";
import { downloadCsv, downloadXlsx, exportFilename, sheet } from "@/lib/export";
import { todayISO } from "@/lib/date";
import { ExportButtons } from "@/components/ui/ExportButtons";
import { MonthlyChart } from "./MonthlyChart";

/** Color único del desglose por medio de pago: no hay identidad que codificar. */
const PAYMENT_BAR_COLOR = "var(--primary)";

/**
 * Reportes (F10): el estado de resultados que "Finanzas" no tenía. Período,
 * tabla mensual de ingresos/egresos/flujo, desglose por medio de pago y por
 * categoría de gasto, y exportación de todo.
 */
export function ReportsClient() {
  const fmtMoney = useFormatMoney();
  const currency = useCurrency();
  const period = useReportsStore((s) => s.period);
  const customFrom = useReportsStore((s) => s.customFrom);
  const customTo = useReportsStore((s) => s.customTo);
  const data = useReportsStore((s) => s.data);
  const loading = useReportsStore((s) => s.loading);
  const error = useReportsStore((s) => s.error);
  const fetchReport = useReportsStore((s) => s.fetch);
  const setPeriod = useReportsStore((s) => s.setPeriod);
  const setCustomRange = useReportsStore((s) => s.setCustomRange);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  const rows = useMemo(() => data?.rows ?? [], [data]);
  const totals = useMemo(() => totalsOf(rows), [rows]);
  const paymentSlices = useMemo<ExpenseSlice[]>(
    () =>
      (data?.payments ?? []).map((p) => ({ id: p.method, label: p.label, color: PAYMENT_BAR_COLOR, amount: p.amount })),
    [data],
  );
  const paymentsTotal = paymentSlices.reduce((s, p) => s + p.amount, 0);

  const exportAs = async (kind: "csv" | "xlsx") => {
    if (!data) return;
    const name = exportFilename("reporte", kind, { from: data.span.fromMonth, to: data.span.toMonth }, todayISO());
    const totalRow: MonthlyRow = { key: "Total", label: "Total", ...totals, cumulative: totals.net };
    if (kind === "csv") {
      // El CSV es UNA tabla: la mensual con su total. El Excel lleva las tres.
      downloadCsv(name, MONTHLY_EXPORT_COLUMNS, [...rows, totalRow]);
      return;
    }
    setExporting(true);
    try {
      await downloadXlsx(name, [
        sheet({
          name: "Mensual",
          columns: MONTHLY_EXPORT_COLUMNS,
          rows,
          totals: ["Total", totals.income, totals.expense, totals.net, null],
        }),
        sheet({ name: "Medios de pago", columns: PAYMENT_EXPORT_COLUMNS, rows: data.payments }),
        sheet({ name: "Gastos por categoría", columns: CATEGORY_EXPORT_COLUMNS, rows: data.categories }),
      ]);
    } finally {
      setExporting(false);
    }
  };

  const signed = (n: number) => `${n < 0 ? "−" : ""}${fmtMoney(Math.abs(n))}`;

  return (
    <div className="flex flex-col gap-6 w-full animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-on-surface">Reportes</h1>
          <p className="text-sm text-on-surface-variant mt-1">
            Ingresos, egresos y flujo de caja mes a mes.
          </p>
        </div>
        <ExportButtons disabled={loading || !data} busy={exporting} onExport={exportAs} />
      </div>

      <div className="flex flex-wrap gap-2" role="group" aria-label="Período">
        {REPORT_PERIODS.map((p) => (
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
        <div className="flex flex-wrap items-end gap-3 bg-surface-container rounded-2xl border border-outline-variant/10 p-4 -mt-2">
          <label className="text-xs font-semibold text-on-surface-variant space-y-1.5">
            <span className="block">Desde (mes)</span>
            <input
              type="month"
              value={customFrom}
              max={customTo || undefined}
              onChange={(e) => setCustomRange(e.target.value, customTo)}
              className="px-3 py-2 bg-surface-container-low border border-outline-variant/20 rounded-xl text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </label>
          <label className="text-xs font-semibold text-on-surface-variant space-y-1.5">
            <span className="block">Hasta (mes)</span>
            <input
              type="month"
              value={customTo}
              min={customFrom || undefined}
              onChange={(e) => setCustomRange(customFrom, e.target.value)}
              className="px-3 py-2 bg-surface-container-low border border-outline-variant/20 rounded-xl text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </label>
          {(!customFrom || !customTo) && (
            <p className="text-xs text-on-surface-variant pb-2.5">Elige el mes inicial y el final.</p>
          )}
        </div>
      )}

      {error && <CollectionError message={error} onRetry={fetchReport} />}

      {/* Totales del período */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Kpi label="Ingresos" value={data ? fmtMoney(totals.income) : "—"} note="Lo cobrado: ventas, abonos y facturas" loading={loading} />
        <Kpi label="Egresos" value={data ? fmtMoney(totals.expense) : "—"} note="Incluye compras a proveedores" loading={loading} />
        <Kpi
          label="Flujo de caja"
          value={data ? signed(totals.net) : "—"}
          tone={data && totals.net < 0 ? "bad" : "neutral"}
          loading={loading}
        />
        <Kpi label="Ventas" value={data ? String(data.overview.salesCount) : "—"} note="Completadas en el POS" loading={loading} />
      </div>

      <section className="bg-surface-container-lowest border border-outline-variant/10 rounded-2xl p-5 sm:p-6 shadow-sm">
        <h2 className="text-sm font-bold text-on-surface mb-5">Ingresos vs egresos por mes</h2>
        <MonthlyChart months={rows} fmtMoney={fmtMoney} currency={currency} loading={loading && !data} />
      </section>

      {/* Estado de resultados mensual */}
      <section className="bg-surface-container-lowest border border-outline-variant/10 rounded-2xl shadow-sm overflow-hidden">
        <div className="px-5 sm:px-6 pt-5">
          <h2 className="text-sm font-bold text-on-surface">Mes a mes</h2>
          <p className="text-xs text-on-surface-variant mt-1">
            Flujo de caja = ingresos − egresos. Las compras de mercadería cuentan como egreso el mes que se pagan,
            así que un mes de reposición puede salir en rojo aunque haya ganado: es caja, no utilidad.
          </p>
        </div>
        <div className="overflow-x-auto mt-4">
          <table className="w-full min-w-[560px] text-sm">
            <caption className="sr-only">Ingresos, egresos y flujo de caja por mes</caption>
            <thead>
              <tr className="text-[11px] uppercase tracking-wider text-on-surface-variant border-y border-outline-variant/10">
                <th scope="col" className="text-left font-semibold px-5 sm:px-6 py-2.5">Mes</th>
                <th scope="col" className="text-right font-semibold px-3 py-2.5">Ingresos</th>
                <th scope="col" className="text-right font-semibold px-3 py-2.5">Egresos</th>
                <th scope="col" className="text-right font-semibold px-3 py-2.5">Flujo</th>
                <th scope="col" className="text-right font-semibold px-5 sm:px-6 py-2.5">Acumulado</th>
              </tr>
            </thead>
            <tbody>
              {loading && !data ? (
                <tr>
                  <td colSpan={5} className="px-6 py-10 text-center text-on-surface-variant">Cargando…</td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.key} className="border-b border-outline-variant/10 last:border-b-0">
                    <th scope="row" className="text-left font-medium text-on-surface px-5 sm:px-6 py-2.5 capitalize">{r.label}</th>
                    <td className="text-right tabular-nums text-on-surface px-3 py-2.5">{fmtMoney(r.income)}</td>
                    <td className="text-right tabular-nums text-on-surface px-3 py-2.5">{fmtMoney(r.expense)}</td>
                    <td className={`text-right tabular-nums font-semibold px-3 py-2.5 ${r.net < 0 ? "text-error" : "text-on-surface"}`}>{signed(r.net)}</td>
                    <td className={`text-right tabular-nums px-5 sm:px-6 py-2.5 ${r.cumulative < 0 ? "text-error" : "text-on-surface-variant"}`}>{signed(r.cumulative)}</td>
                  </tr>
                ))
              )}
            </tbody>
            {data && rows.length > 0 && (
              <tfoot>
                <tr className="border-t-2 border-outline-variant/30 bg-surface-container/50">
                  <th scope="row" className="text-left font-bold text-on-surface px-5 sm:px-6 py-3">Total</th>
                  <td className="text-right tabular-nums font-bold text-on-surface px-3 py-3">{fmtMoney(totals.income)}</td>
                  <td className="text-right tabular-nums font-bold text-on-surface px-3 py-3">{fmtMoney(totals.expense)}</td>
                  <td className={`text-right tabular-nums font-bold px-3 py-3 ${totals.net < 0 ? "text-error" : "text-on-surface"}`}>{signed(totals.net)}</td>
                  <td className="px-5 sm:px-6 py-3" />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className="bg-surface-container-lowest border border-outline-variant/10 rounded-2xl p-5 sm:p-6 shadow-sm min-w-0">
          <h2 className="text-sm font-bold text-on-surface">Ingresos por medio de pago</h2>
          <p className="text-xs text-on-surface-variant mt-1 mb-5">
            Es la plata que entró. Un pago dividido suma en cada medio, y lo fiado cuenta cuando se abona.
            {data && data.overview.creditIssued > 0 && (
              <> En este período se fiaron {fmtMoney(data.overview.creditIssued)}.</>
            )}
          </p>
          {loading && !data ? (
            <p className="text-sm text-on-surface-variant text-center py-8">Cargando…</p>
          ) : (
            <ExpensesByCategory slices={paymentSlices} total={paymentsTotal} stacked emptyLabel="Sin ventas en este período." />
          )}
        </section>

        <section className="bg-surface-container-lowest border border-outline-variant/10 rounded-2xl p-5 sm:p-6 shadow-sm min-w-0">
          <div className="flex items-start justify-between gap-4 mb-5">
            <div className="min-w-0">
              <h2 className="text-sm font-bold text-on-surface">Egresos por categoría</h2>
              <p className="text-xs text-on-surface-variant mt-1">Incluye las compras a proveedores.</p>
            </div>
            <Link href="/dashboard/expenses" className="text-xs font-medium text-primary hover:text-primary-dim shrink-0">
              Ver gastos →
            </Link>
          </div>
          {loading && !data ? (
            <p className="text-sm text-on-surface-variant text-center py-8">Cargando…</p>
          ) : (
            <ExpensesByCategory
              slices={data?.categories ?? []}
              total={data?.overview.expenses ?? 0}
              stacked
              emptyLabel="Sin egresos en este período."
            />
          )}
        </section>
      </div>
    </div>
  );
}

function Kpi({
  label,
  value,
  note,
  tone = "neutral",
  loading,
}: {
  label: string;
  value: string;
  note?: string;
  tone?: "neutral" | "bad";
  loading?: boolean;
}) {
  return (
    <div className="bg-surface-container-lowest border border-outline-variant/10 rounded-2xl p-5 shadow-sm">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant">{label}</p>
      <p className={`mt-1 text-lg sm:text-xl lg:text-2xl font-bold tabular-nums tracking-tight break-words ${tone === "bad" ? "text-error" : "text-on-surface"}`}>
        {loading ? <span className="inline-block w-20 h-7 rounded bg-surface-container-high animate-pulse" /> : value}
      </p>
      {note && <p className="text-[11px] text-on-surface-variant mt-1">{note}</p>}
    </div>
  );
}
