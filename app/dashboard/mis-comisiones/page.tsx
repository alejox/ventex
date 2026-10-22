"use client";

import { useEffect, useState } from "react";
import { useMyCommissionsStore, type MyPeriodChoice } from "@/stores/my-commissions.store";
import { commissionChip, myCommissionCards, settlementStatusLabel } from "@/lib/my-commissions";
import { CollectionEmpty, CollectionError, CollectionLoading } from "@/components/CollectionState";
import { Button } from "@/components/ui/Button";
import { IconDollar } from "@/app/assets/icons/DashboardIcons";
import { useFormatMoney } from "@/lib/useMoney";

const PAYMENT_LABELS: Record<string, string> = {
  efectivo: "Efectivo",
  transferencia: "Transferencia",
  tarjeta: "Datáfono",
};

const PERIOD_CHIPS: { value: MyPeriodChoice; label: string }[] = [
  { value: "this-month", label: "Este mes" },
  { value: "last-month", label: "Mes anterior" },
  { value: "custom", label: "Elegir fechas" },
];

const shortDate = (day: string) =>
  new Date(`${day}T00:00:00`).toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" });

const shortInstant = (iso: string) =>
  new Date(iso).toLocaleDateString("es-CO", { day: "2-digit", month: "short" });

const CARD = "bg-surface-container rounded-2xl p-5 border border-outline-variant/10 shadow-sm";
const PANEL = "bg-surface-container rounded-3xl border border-outline-variant/10 shadow-sm overflow-hidden";
const DATE_INPUT =
  "rounded-xl border border-outline-variant/20 bg-surface-container-lowest px-3 py-2 text-sm text-on-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-ink";

export default function MyCommissionsPage() {
  const choice = useMyCommissionsStore((s) => s.choice);
  const period = useMyCommissionsStore((s) => s.period);
  const lines = useMyCommissionsStore((s) => s.lines);
  const summary = useMyCommissionsStore((s) => s.summary);
  const totals = useMyCommissionsStore((s) => s.totals);
  const loading = useMyCommissionsStore((s) => s.loading);
  const error = useMyCommissionsStore((s) => s.error);
  const noStaff = useMyCommissionsStore((s) => s.noStaff);
  const fetchData = useMyCommissionsStore((s) => s.fetch);
  const setPreset = useMyCommissionsStore((s) => s.setPreset);
  const setCustomRange = useMyCommissionsStore((s) => s.setCustomRange);
  const fmtMoney = useFormatMoney();

  // Fechas del formulario "Elegir fechas": estado de UI hasta que se aplican.
  const [customOpen, setCustomOpen] = useState(choice === "custom");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  // Las tarjetas salen de los totales que calcula la base, nunca de sumar las
  // líneas cargadas (ver `myCommissionCards`).
  const cards = myCommissionCards(summary, loading ? null : totals);
  const money = (v: number | null) => (v === null ? "—" : fmtMoney(v));

  const selectChip = (value: MyPeriodChoice) => {
    if (value === "custom") {
      setCustomOpen(true);
      setFrom((f) => f || period?.from || "");
      setTo((t) => t || period?.to || "");
      return;
    }
    setCustomOpen(false);
    void setPreset(value);
  };

  if (noStaff) {
    return (
      <div className="flex flex-col gap-6 w-full animate-in fade-in duration-500">
        <h1 className="text-2xl font-bold text-on-surface">Mis comisiones</h1>
        <CollectionEmpty
          icon={<IconDollar className="w-7 h-7" />}
          title="No tienes una ficha de personal"
          description="Esta pantalla muestra las comisiones de quien trabaja en el negocio. Si crees que deberías verlas, pídele al dueño que revise tu acceso en Personal."
        />
      </div>
    );
  }

  const activeChip: MyPeriodChoice = customOpen ? "custom" : choice;

  return (
    <div className="flex flex-col gap-6 w-full animate-in fade-in duration-500">
      <div>
        <h1 className="text-2xl font-bold text-on-surface">Mis comisiones</h1>
        <p className="text-sm text-on-surface-variant mt-1">
          Lo que te deben por tus ventas y lo que ya te pagaron. Solo tú ves estos números.
        </p>
      </div>

      {error && <CollectionError message={error} onRetry={() => void fetchData()} />}

      <div className="flex flex-col gap-3">
        <div role="group" aria-label="Período de las comisiones" className="flex flex-wrap gap-2">
          {PERIOD_CHIPS.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => selectChip(o.value)}
              aria-pressed={activeChip === o.value}
              className={`rounded-xl px-4 py-2 text-sm font-semibold transition-colors ${
                activeChip === o.value
                  ? "bg-primary/10 text-primary"
                  : "border border-outline-variant/20 text-on-surface hover:bg-surface-container-high"
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
        {customOpen && (
          <form
            className="flex flex-wrap items-end gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              void setCustomRange(from, to);
            }}
          >
            <label className="flex flex-col gap-1 text-xs font-medium text-on-surface-variant">
              Desde
              <input type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} className={DATE_INPUT} required />
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-on-surface-variant">
              Hasta
              <input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} className={DATE_INPUT} required />
            </label>
            <Button type="submit" size="sm" disabled={!from || !to}>
              Ver
            </Button>
          </form>
        )}
        {period && (
          <p className="text-xs text-on-surface-variant">
            Del {shortDate(period.from)} al {shortDate(period.to)}
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className={CARD}>
          <p className="text-on-surface-variant text-sm font-medium mb-1">Por cobrar</p>
          <h3 className="text-3xl font-bold text-on-surface tracking-tight tabular-nums">
            {money(cards.porCobrar)}
          </h3>
          <p className="text-xs text-on-surface-variant mt-1">Todo lo pendiente, de cualquier fecha.</p>
        </div>
        <div className={CARD}>
          <p className="text-on-surface-variant text-sm font-medium mb-1">Pagado en el período</p>
          <h3 className="text-3xl font-bold text-primary tracking-tight tabular-nums">
            {money(cards.pagadoEnPeriodo)}
          </h3>
          <p className="text-xs text-on-surface-variant mt-1">
            Generaste {money(cards.generadoEnPeriodo)} en estas fechas.
          </p>
        </div>
      </div>

      <section className={PANEL} aria-labelledby="my-lines-title">
        <div className="px-6 py-4 border-b border-outline-variant/10 bg-surface-container-low">
          <h2 id="my-lines-title" className="text-sm font-bold text-on-surface">Tus ventas del período</h2>
          <p className="text-xs text-on-surface-variant mt-0.5">
            La comisión es la que quedó fija al vender. Las ventas anuladas no cuentan.
          </p>
        </div>
        {loading ? (
          <CollectionLoading label="Cargando tus comisiones…" />
        ) : lines.length === 0 ? (
          <p className="px-6 py-10 text-center text-sm text-on-surface-variant">
            No tienes ventas con comisión en estas fechas.
          </p>
        ) : (
          <ul className="divide-y divide-outline-variant/10">
            {lines.map((l) => {
              const chip = commissionChip(l);
              return (
                <li key={l.id} className="flex items-center gap-3 px-4 sm:px-6 py-3.5">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-on-surface truncate">{l.itemName}</span>
                      <span
                        className={`inline-flex px-2 py-0.5 rounded-md text-[11px] font-bold ${
                          chip.tone === "paid"
                            ? "bg-primary/10 text-primary"
                            : "bg-warning/15 text-warning border border-warning/30"
                        }`}
                      >
                        {chip.label}
                      </span>
                    </div>
                    <p className="text-xs text-on-surface-variant mt-0.5 truncate">
                      {shortInstant(l.soldAt)}
                      {l.saleNumber !== null && ` · Venta #${l.saleNumber}`}
                      {l.quantity !== 1 && ` · ${l.quantity} u.`}
                      {` · Vendido ${fmtMoney(l.lineNet)}`}
                      {l.paidOn && ` · Pagada el ${shortDate(l.paidOn)}`}
                    </p>
                  </div>
                  <span className="shrink-0 text-sm font-bold tabular-nums text-on-surface">{fmtMoney(l.commission)}</span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className={PANEL} aria-labelledby="my-settlements-title">
        <div className="px-6 py-4 border-b border-outline-variant/10 bg-surface-container-low">
          <h2 id="my-settlements-title" className="text-sm font-bold text-on-surface">Pagos recibidos</h2>
          <p className="text-xs text-on-surface-variant mt-0.5">Tus últimas liquidaciones.</p>
        </div>
        {!summary ? (
          loading ? <CollectionLoading label="Cargando…" /> : null
        ) : summary.settlements.length === 0 ? (
          <p className="px-6 py-10 text-center text-sm text-on-surface-variant">
            Todavía no te han liquidado comisiones.
          </p>
        ) : (
          <ul className="divide-y divide-outline-variant/10">
            {summary.settlements.map((s) => {
              const isVoid = s.status === "void";
              return (
                <li key={s.id} className="flex items-center gap-3 px-4 sm:px-6 py-3.5">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-sm font-semibold ${isVoid ? "text-on-surface-variant line-through" : "text-on-surface"}`}>
                        {shortDate(s.paidOn)}
                      </span>
                      {isVoid && (
                        <span className="inline-flex px-2 py-0.5 rounded-md text-[11px] font-bold bg-surface-variant text-on-surface-variant">
                          {settlementStatusLabel(s.status)}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-on-surface-variant mt-0.5 truncate">
                      {shortDate(s.periodFrom)} al {shortDate(s.periodTo)} · {s.itemsCount} línea
                      {s.itemsCount !== 1 ? "s" : ""} · {PAYMENT_LABELS[s.paymentMethod] ?? s.paymentMethod}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 text-sm font-bold tabular-nums ${
                      isVoid ? "text-on-surface-variant/50 line-through" : "text-on-surface"
                    }`}
                  >
                    {fmtMoney(s.totalAmount)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
