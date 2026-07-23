import type React from "react";

/**
 * Papel que juega la columna cuando la fila se dibuja como tarjeta en móvil.
 *
 * - `title`    → primera línea, en negrita
 * - `subtitle` → segunda línea, atenuada
 * - `trailing` → a la derecha del título (totales, importes)
 * - `badge`    → chip bajo el encabezado (estados)
 * - `field`    → par etiqueta/valor en el cuerpo (valor por defecto)
 * - `actions`  → fila de acciones al pie
 * - `hidden`   → no se muestra en móvil
 */
export type MobileRole =
  | "title"
  | "subtitle"
  | "trailing"
  | "badge"
  | "field"
  | "actions"
  | "hidden";

export interface DataColumn<T> {
  header: string;
  cell: (row: T) => React.ReactNode;
  align?: "left" | "center" | "right";
  /** Clases aplicadas a la celda de la tabla. */
  className?: string;
  /** Clases del encabezado de la tabla. */
  headerClassName?: string;
  mobile?: MobileRole;
}

interface DataTableProps<T> {
  columns: DataColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  /** Ancho mínimo de la tabla en escritorio, en píxeles. */
  minWidth?: number;
  /** Contenido extra debajo de cada fila (variantes, detalle desplegado). */
  renderExpanded?: (row: T) => React.ReactNode;
  /** Etiqueta accesible de la tabla. */
  caption?: string;
  /** Hace la fila entera accionable (abrir el detalle, por ejemplo). */
  onRowClick?: (row: T) => void;
}

const alignClass = {
  left: "text-left",
  center: "text-center",
  right: "text-right",
} as const;

/**
 * Una lista, dos formas.
 *
 * En escritorio es la tabla de siempre. Por debajo de `lg` la tabla se
 * reemplaza por tarjetas: una tabla de siete columnas dentro de un teléfono
 * obliga a scrollear en horizontal, que es la peor manera de leer datos con el
 * pulgar. Las dos vistas salen de la MISMA definición de columnas, así que no
 * pueden quedar desfasadas.
 */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  minWidth = 700,
  renderExpanded,
  caption,
  onRowClick,
}: DataTableProps<T>) {
  const role = (c: DataColumn<T>): MobileRole => c.mobile ?? "field";

  /** La fila accionable también tiene que responder al teclado, no solo al click. */
  const rowInteraction = (row: T) =>
    onRowClick
      ? {
          onClick: () => onRowClick(row),
          onKeyDown: (e: React.KeyboardEvent) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              onRowClick(row);
            }
          },
          role: "button" as const,
          tabIndex: 0,
          className: "cursor-pointer",
        }
      : null;

  const titleCol = columns.find((c) => role(c) === "title");
  const subtitleCol = columns.find((c) => role(c) === "subtitle");
  const trailingCol = columns.find((c) => role(c) === "trailing");
  const badgeCols = columns.filter((c) => role(c) === "badge");
  const fieldCols = columns.filter((c) => role(c) === "field");
  const actionCols = columns.filter((c) => role(c) === "actions");

  return (
    <>
      {/* Escritorio */}
      <div className="hidden lg:block overflow-x-auto">
        <table className="w-full text-left border-collapse" style={{ minWidth }}>
          {caption && <caption className="sr-only">{caption}</caption>}
          <thead>
            <tr className="bg-surface-container-low border-b border-outline-variant/10 text-[10px] uppercase tracking-wider text-on-surface-variant font-bold">
              {columns.map((c) => (
                <th
                  key={c.header}
                  scope="col"
                  className={`p-4 ${alignClass[c.align ?? "left"]} ${c.headerClassName ?? ""}`}
                >
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-outline-variant/5 text-sm">
            {rows.map((row) => {
              const interaction = rowInteraction(row);
              return (
              <tr
                key={rowKey(row)}
                {...interaction}
                className={`hover:bg-surface-container-lowest transition-colors ${interaction?.className ?? ""}`}
              >
                {columns.map((c) => (
                  <td
                    key={c.header}
                    className={`p-4 ${alignClass[c.align ?? "left"]} ${c.className ?? ""}`}
                  >
                    {c.cell(row)}
                  </td>
                ))}
              </tr>
              );
            })}
          </tbody>
        </table>
        {renderExpanded && rows.map((row) => renderExpanded(row))}
      </div>

      {/* Móvil */}
      <ul className="lg:hidden divide-y divide-outline-variant/10">
        {rows.map((row) => {
          const interaction = rowInteraction(row);
          return (
          <li
            key={rowKey(row)}
            {...interaction}
            className={`p-4 space-y-3 ${interaction ? "active:bg-surface-container-lowest cursor-pointer" : ""}`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                {titleCol && (
                  <div className="text-sm font-semibold text-on-surface break-words">
                    {titleCol.cell(row)}
                  </div>
                )}
                {subtitleCol && (
                  <div className="text-xs text-on-surface-variant mt-0.5 break-words">
                    {subtitleCol.cell(row)}
                  </div>
                )}
              </div>
              {trailingCol && (
                <div className="text-sm font-bold text-on-surface shrink-0 tabular-nums">
                  {trailingCol.cell(row)}
                </div>
              )}
            </div>

            {badgeCols.length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                {badgeCols.map((c) => (
                  <div key={c.header}>{c.cell(row)}</div>
                ))}
              </div>
            )}

            {fieldCols.length > 0 && (
              <dl className="space-y-1.5">
                {fieldCols.map((c) => (
                  <div key={c.header} className="flex items-baseline justify-between gap-3">
                    <dt className="text-[11px] uppercase tracking-wider font-bold text-on-surface-variant/70 shrink-0">
                      {c.header}
                    </dt>
                    <dd className="text-sm text-on-surface-variant text-right min-w-0 break-words">
                      {c.cell(row)}
                    </dd>
                  </div>
                ))}
              </dl>
            )}

            {actionCols.length > 0 && (
              <div className="flex items-center justify-end gap-1 pt-1">
                {actionCols.map((c) => (
                  <div key={c.header}>{c.cell(row)}</div>
                ))}
              </div>
            )}

            {renderExpanded?.(row)}
          </li>
          );
        })}
      </ul>
    </>
  );
}
