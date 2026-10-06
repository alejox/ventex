"use client";

import { useState } from "react";
import { chartScale, compactMoney } from "@/services/finance.service";
import type { MoneyFormatter } from "@/lib/money";

export interface ChartMonth {
  key: string;
  label: string;
  income: number;
  expense: number;
}

/**
 * Ingresos vs egresos por mes (F4), compartido por el Panel y Reportes.
 *
 * Decisiones, contra lo que había:
 *  - Barras AGRUPADAS lado a lado sobre un mismo eje en cero. Antes eran dos
 *    barras apiladas en columna, cada una escalada al 100 % por separado: el
 *    ojo comparaba alturas que no estaban en la misma escala.
 *  - Eje con líneas guía en números redondos (`chartScale`), y el monto de cada
 *    barra escrito encima desde `sm` (en un teléfono seis pares de etiquetas no
 *    entran; ahí manda el detalle de abajo).
 *  - Un mes sin movimientos NO dibuja nada. El piso de 1 % de antes pintaba
 *    barras fantasma que se leían como "vendí poquito".
 *  - El detalle no vive en un `title` (que no existe en táctil ni para un
 *    lector de pantalla): cada mes es un botón; tocarlo, pasarle el mouse o
 *    llegar con Tab muestra ingresos, egresos y flujo en el panel de abajo,
 *    que se anuncia (`aria-live`).
 *  - Colores por token: ingresos `primary`, egresos `error`; se ven igual en
 *    claro y oscuro, y además la leyenda y el detalle los nombran.
 */
export function MonthlyChart({
  months,
  fmtMoney,
  currency,
  loading = false,
}: {
  months: ChartMonth[];
  fmtMoney: MoneyFormatter;
  currency: string;
  loading?: boolean;
}) {
  // Por defecto, el mes en curso (el último): es el que se viene a mirar.
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  if (loading) {
    return (
      <div className="h-56 flex items-center justify-center">
        <p className="text-sm text-on-surface-variant">Cargando…</p>
      </div>
    );
  }

  const hasData = months.some((m) => m.income > 0 || m.expense > 0);
  if (!hasData) {
    return (
      <div className="h-56 flex items-center justify-center">
        <p className="text-sm text-on-surface-variant">Sin movimientos en estos meses.</p>
      </div>
    );
  }

  const { max, ticks } = chartScale(months.flatMap((m) => [m.income, m.expense]));
  const selected = months.find((m) => m.key === selectedKey) ?? months[months.length - 1];
  const pct = (v: number) => (v / max) * 100;
  // Una barra con valor nunca queda en cero píxeles; una sin valor no existe.
  const barHeight = (v: number) => (v > 0 ? `max(${pct(v)}%, 2px)` : "0");
  const net = selected.income - selected.expense;

  return (
    <div>
      <div className="flex gap-2">
        {/* Eje Y: etiquetas abreviadas, alineadas con las líneas guía. */}
        <div aria-hidden="true" className="relative w-14 shrink-0 h-48 text-[11px] text-on-surface-variant tabular-nums">
          {ticks.map((t) => (
            <span key={t} className="absolute right-0 translate-y-1/2 leading-none" style={{ bottom: `${pct(t)}%` }}>
              {t === 0 ? "0" : compactMoney(t, currency)}
            </span>
          ))}
        </div>

        <div className="relative flex-1 min-w-0">
          {/* Líneas guía, recesivas: la información está en las barras. */}
          <div aria-hidden="true" className="absolute inset-x-0 top-0 h-48 pointer-events-none">
            {ticks.map((t) => (
              <div
                key={t}
                className={`absolute inset-x-0 border-t ${t === 0 ? "border-outline-variant/60" : "border-outline-variant/20 border-dashed"}`}
                style={{ bottom: `${pct(t)}%` }}
              />
            ))}
          </div>

          <div className="relative flex items-stretch gap-1 sm:gap-2" role="group" aria-label="Ingresos y egresos por mes">
            {months.map((m) => {
              const isSelected = m.key === selected.key;
              const empty = m.income === 0 && m.expense === 0;
              return (
                <button
                  key={m.key}
                  type="button"
                  aria-pressed={isSelected}
                  aria-label={`${m.label}: ingresos ${fmtMoney(m.income)}, egresos ${fmtMoney(m.expense)}, flujo ${fmtMoney(m.income - m.expense)}`}
                  onClick={() => setSelectedKey(m.key)}
                  onFocus={() => setSelectedKey(m.key)}
                  onMouseEnter={() => setSelectedKey(m.key)}
                  className={`group flex-1 min-w-0 flex flex-col items-stretch rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                    isSelected ? "bg-surface-container-high/60" : "hover:bg-surface-container-high/40"
                  }`}
                >
                  <span className="relative h-48 flex items-end justify-center gap-0.5 sm:gap-1 px-0.5">
                    {(["income", "expense"] as const).map((kind) => {
                      const v = m[kind];
                      return (
                        <span key={kind} className="relative flex-1 max-w-6 h-full flex items-end">
                          {v > 0 && (
                            <span
                              aria-hidden="true"
                              className="hidden sm:block absolute inset-x-[-1rem] text-center text-[11px] font-semibold text-on-surface-variant tabular-nums whitespace-nowrap"
                              style={{ bottom: `calc(${pct(v)}% + 2px)` }}
                            >
                              {compactMoney(v, currency)}
                            </span>
                          )}
                          <span
                            aria-hidden="true"
                            className={`w-full rounded-t ${kind === "income" ? "bg-primary" : "bg-error/75"}`}
                            style={{ height: barHeight(v) }}
                          />
                        </span>
                      );
                    })}
                  </span>
                  <span
                    className={`mt-1.5 mb-1 text-xs text-center truncate ${
                      isSelected ? "font-bold text-on-surface" : empty ? "text-on-surface-variant/60" : "font-medium text-on-surface-variant"
                    }`}
                  >
                    {m.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Detalle del mes elegido: los montos completos, siempre visibles. */}
      <div
        aria-live="polite"
        className="mt-4 pt-4 border-t border-outline-variant/10 flex flex-wrap items-baseline gap-x-5 gap-y-2 text-xs"
      >
        <span className="font-bold text-on-surface">{selected.label}</span>
        <span className="flex items-center gap-1.5 text-on-surface-variant">
          <span aria-hidden="true" className="w-2.5 h-2.5 rounded-sm bg-primary" />
          Ingresos <strong className="text-on-surface tabular-nums">{fmtMoney(selected.income)}</strong>
        </span>
        <span className="flex items-center gap-1.5 text-on-surface-variant">
          <span aria-hidden="true" className="w-2.5 h-2.5 rounded-sm bg-error/75" />
          Egresos <strong className="text-on-surface tabular-nums">{fmtMoney(selected.expense)}</strong>
        </span>
        <span className="text-on-surface-variant">
          Flujo{" "}
          <strong className={`tabular-nums ${net < 0 ? "text-error" : "text-success"}`}>
            {net < 0 ? "−" : ""}
            {fmtMoney(Math.abs(net))}
          </strong>
        </span>
      </div>
    </div>
  );
}
