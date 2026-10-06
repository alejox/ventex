"use client";

import type { ExpenseSlice } from "@/services/finance.service";
import { useFormatMoney } from "@/lib/useMoney";

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
export function ExpensesByCategory({
  slices,
  total,
  stacked = false,
  emptyLabel = "Todavía no hay gastos registrados.",
}: {
  slices: ExpenseSlice[];
  total: number;
  /**
   * Siempre en dos renglones (nombre y monto arriba, barra abajo). Para
   * columnas angostas, donde la fila de tres columnas no entra ni en escritorio.
   */
  stacked?: boolean;
  emptyLabel?: string;
}) {
  const fmtMoney = useFormatMoney();
  if (slices.length === 0 || total <= 0) {
    return <p className="py-8 text-center text-sm text-on-surface-variant">{emptyLabel}</p>;
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

  // En móvil (o `stacked`) cada fila son dos renglones: nombre + cifras arriba
  // y la barra abajo a todo el ancho. En tres columnas, a 360 px el nombre
  // quedaba en dos letras y el monto empujaba la barra a cero.
  const grid = stacked
    ? "grid-cols-[minmax(0,1fr)_auto]"
    : "grid-cols-[minmax(0,1fr)_auto] sm:grid-cols-[minmax(0,11rem)_1fr_auto]";
  const barPlace = stacked
    ? "col-span-2 row-start-2"
    : "col-span-2 row-start-2 sm:col-span-1 sm:col-start-2 sm:row-start-1";
  const figuresPlace = stacked ? "col-start-2 row-start-1" : "col-start-2 row-start-1 sm:col-start-3";

  return (
    <ul className="max-w-3xl space-y-3" aria-label="Gastos por categoría">
      {rows.map((row) => {
        const share = row.amount / total;
        // Piso de 2%: una categoría chica tiene que verse, no desaparecer.
        const width = Math.max((row.amount / max) * 100, 2);
        const pct = share >= 0.01 ? `${Math.round(share * 100)} %` : "<1 %";

        return (
          <li
            key={row.id}
            className={`grid ${grid} items-center gap-x-3 gap-y-1.5`}
            aria-label={`${row.label}: ${fmtMoney(row.amount)}, ${pct} del total`}
          >
            <div className="col-start-1 row-start-1 flex items-center gap-2 min-w-0">
              <span
                aria-hidden="true"
                className="w-2.5 h-2.5 rounded-sm shrink-0"
                style={{ backgroundColor: row.color }}
              />
              <span className="text-xs text-on-surface truncate">{row.label}</span>
            </div>

            {/* Marca fina sobre una pista recesiva, con el extremo redondeado. */}
            <div aria-hidden="true" className={`${barPlace} h-2.5 rounded-full bg-surface-container-high overflow-hidden`}>
              <div
                className="h-full rounded-full transition-all duration-300"
                style={{ width: `${width}%`, backgroundColor: row.color }}
              />
            </div>

            <div aria-hidden="true" className={`${figuresPlace} flex items-baseline justify-end gap-3 tabular-nums`}>
              <span className="text-[11px] text-on-surface-variant text-right">{pct}</span>
              <span className="text-xs font-semibold text-on-surface text-right whitespace-nowrap">
                {fmtMoney(row.amount)}
              </span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
