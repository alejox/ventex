"use client";

import type { ExpenseSlice } from "@/services/finance.service";

const money = (n: number) =>
  n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * Tope de filas. Pasado esto deja de ser un vistazo y es una tabla; el resto se
 * pliega en "Otras".
 */
const MAX_ROWS = 6;

/** Gris del residual: "Otras" no es una identidad, es el resto. */
const REST_COLOR = "#94a3b8";

/**
 * En qué se va la plata, ordenado de mayor a menor.
 *
 * Son BARRAS y no una dona porque la pregunta que responde es "cuál es la
 * categoría de mayor gasto", o sea comparar magnitudes y rankear. Una dona
 * sirve para parte-todo de un vistazo; para ordenar de mayor a menor, la barra
 * gana siempre — y con datos torcidos (una categoría al 98%) la dona directamente
 * no se puede leer: los gajos chicos quedan en un pelo de ancho.
 *
 * Las barras se escalan contra el MÁXIMO, no contra el total: lo que se compara
 * es una categoría contra la más grande. El porcentaje sobre el total va al
 * lado, en número, que es donde se lee sin error.
 *
 * El color es el que el dueño le puso a cada categoría, para que se vea igual
 * acá, en el badge de la tabla y en el filtro. La identidad NO depende de él:
 * cada fila está nombrada y numerada.
 */
export function ExpensesByCategory({ slices, total }: { slices: ExpenseSlice[]; total: number }) {
  if (slices.length === 0 || total <= 0) {
    return (
      <p className="py-8 text-center text-sm text-on-surface-variant">
        Todavía no hay gastos registrados.
      </p>
    );
  }

  const shown = slices.slice(0, MAX_ROWS - 1);
  const rest = slices.slice(MAX_ROWS - 1);
  const rows =
    rest.length > 0
      ? [
          ...shown,
          {
            id: "otras",
            label: `Otras (${rest.length})`,
            color: REST_COLOR,
            amount: rest.reduce((sum, s) => sum + s.amount, 0),
          },
        ]
      : slices;

  const max = Math.max(...rows.map((r) => r.amount), 1);

  return (
    <div className="max-w-3xl space-y-3">
      {rows.map((row) => {
        const share = row.amount / total;
        // Piso de 2%: una categoría chica tiene que verse, no desaparecer.
        const width = Math.max((row.amount / max) * 100, 2);

        return (
          <div key={row.id} className="grid grid-cols-[minmax(0,11rem)_1fr_auto] items-center gap-x-3 gap-y-1">
            <div className="flex items-center gap-2 min-w-0">
              <span
                className="w-2.5 h-2.5 rounded-sm shrink-0"
                style={{ backgroundColor: row.color }}
              />
              <span className="text-xs text-on-surface truncate">{row.label}</span>
            </div>

            {/* Marca fina sobre una pista recesiva, con el extremo redondeado. */}
            <div className="h-2.5 rounded-full bg-surface-container-high overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-300"
                style={{ width: `${width}%`, backgroundColor: row.color }}
              />
            </div>

            <div className="flex items-baseline gap-3 shrink-0 tabular-nums">
              <span className="text-[11px] text-on-surface-variant w-8 text-right">
                {share >= 0.01 ? `${Math.round(share * 100)}%` : "<1%"}
              </span>
              <span className="text-xs font-semibold text-on-surface w-28 text-right">
                ${money(row.amount)}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
