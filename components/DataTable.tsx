"use client";

import { useState } from "react";
import type React from "react";

/**
 * Papel que juega la columna cuando la fila se dibuja como tarjeta en móvil.
 *
 * - `title`    → primera línea, en negrita
 * - `subtitle` → segunda línea, atenuada
 * - `trailing` → a la derecha del título (totales, importes)
 * - `badge`    → chip bajo el encabezado (estados)
 * - `field`    → par etiqueta/valor en el cuerpo (valor por defecto)
 * - `detail`   → siempre dentro del desplegable, por secundario
 * - `actions`  → fila de acciones al pie
 * - `hidden`   → no se muestra en móvil
 */
export type MobileRole =
  | "title"
  | "subtitle"
  | "trailing"
  | "badge"
  | "field"
  | "detail"
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
  /**
   * Cuántos pares etiqueta/valor quedan a la vista en la tarjeta antes de que
   * el resto pase al desplegable. Una tarjeta con diez filas de datos es un
   * muro de texto: se lee peor que la tabla que vino a reemplazar.
   */
  collapseAfter?: number;
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
  collapseAfter = 3,
}: DataTableProps<T>) {
  // Qué tarjetas tienen el detalle abierto. Se guarda por clave de fila para
  // que abrir una no reordene ni cierre las demás.
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
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
  const actionCols = columns.filter((c) => role(c) === "actions");

  // Divulgación progresiva: los primeros `collapseAfter` campos quedan a la
  // vista y el resto —más lo marcado como `detail`— entra al desplegable.
  const allFieldCols = columns.filter((c) => role(c) === "field");
  const visibleFieldCols = allFieldCols.slice(0, collapseAfter);
  const hiddenFieldCols = [
    ...allFieldCols.slice(collapseAfter),
    ...columns.filter((c) => role(c) === "detail"),
  ];

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

      {/* Móvil.
          Bandeado: cada ficha ocupa tres líneas, así que una divisoria de 1px
          al 10% no alcanza para que el ojo separe una de otra —en tema claro
          directamente desaparece—. El fondo alterno agrupa cada registro sin
          gastar un píxel de alto, que en el teléfono es lo que escasea.
          Es un tinte del color de TEXTO, no un color fijo: en tema claro
          oscurece y en oscuro aclara, con una sola clase. Alternar entre dos
          tokens de superficie no servía: se llevan un 2% de diferencia. */}
      <ul className="lg:hidden divide-y divide-outline-variant/20">
        {rows.map((row) => {
          const interaction = rowInteraction(row);
          const key = rowKey(row);
          const isOpen = expanded[key] ?? false;
          return (
          <li
            key={key}
            {...interaction}
            className={`px-4 py-3.5 even:bg-on-surface/[0.05] ${interaction ? "active:bg-on-surface/10 cursor-pointer" : ""}`}
          >
            {/* Encabezado: lo que se lee de un vistazo. El valor de la derecha
                pesa más que el título porque es el dato que se busca. */}
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                {titleCol && (
                  <div className="text-[15px] leading-snug font-semibold text-on-surface break-words">
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
                <div className="text-base font-bold text-on-surface shrink-0 tabular-nums text-right">
                  {trailingCol.cell(row)}
                </div>
              )}
            </div>

            {badgeCols.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 mt-2.5">
                {badgeCols.map((c) => (
                  <div key={c.header}>{c.cell(row)}</div>
                ))}
              </div>
            )}

            {visibleFieldCols.length > 0 && (
              <dl className="mt-2.5 space-y-1">
                {visibleFieldCols.map((c) => (
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

            {hiddenFieldCols.length > 0 && (
              <>
                {isOpen && (
                  <dl className="mt-1 space-y-1">
                    {hiddenFieldCols.map((c) => (
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
                <button
                  type="button"
                  aria-expanded={isOpen}
                  onClick={(e) => {
                    // La fila entera puede ser accionable: el desplegable no
                    // debe disparar también la navegación al detalle.
                    e.stopPropagation();
                    setExpanded((prev) => ({ ...prev, [key]: !prev[key] }));
                  }}
                  className="mt-1.5 -mx-2 px-2 h-9 w-[calc(100%+1rem)] flex items-center gap-1 text-xs font-semibold text-primary rounded-lg hover:bg-primary/5 transition-colors"
                >
                  {isOpen ? "Ocultar detalle" : `Ver ${hiddenFieldCols.length} datos más`}
                  <svg
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    viewBox="0 0 24 24"
                    className={`w-3.5 h-3.5 transition-transform ${isOpen ? "rotate-180" : ""}`}
                  >
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </button>
              </>
            )}

            {actionCols.length > 0 && (
              <div className="flex items-center justify-end gap-1 mt-1">
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
