"use client";

import { Fragment, useState } from "react";
import type React from "react";
import { Pagination } from "./Pagination";

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
  /** Clave para ordenar. Si no se define, la columna no es ordenable. */
  sortKey?: string;
  /**
   * Valor por el que ordenar, cuando el texto que se ve NO sirve para eso.
   *
   * Sin esto se ordena por la celda ya renderizada, y hay dos casos donde ese
   * texto miente: el dinero (`$1.234` cae antes que `$987`, porque el punto
   * corta el número) y las fechas con mes abreviado (`13 ago` antes que
   * `02 sep`). Devolver acá el número crudo o el ISO lo arregla.
   */
  sortValue?: (row: T) => string | number;
}

interface DataTableProps<T> {
  columns: DataColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  /** Ancho mínimo de la tabla en escritorio, en píxeles. */
  minWidth?: number;
  /** Contenido extra debajo de cada fila (detalle desplegado). */
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
  /** Activar paginación (por defecto true). */
  pagination?: boolean;
  /** Tamaño de página inicial (por defecto 10). */
  pageSize?: number;
  /** Opciones de tamaño de página. */
  pageSizeOptions?: number[];
  /**
   * Muestra un buscador sobre la tabla que filtra las filas EN MEMORIA. Sirve
   * cuando la página ya cargó la lista entera; con paginación del servidor
   * el filtro tendría que viajar a la consulta, no venir acá.
   */
  searchable?: boolean;
  searchPlaceholder?: string;
  /**
   * Texto contra el que se busca en cada fila. Sin esto se usa el texto de las
   * celdas, que deja afuera todo lo que una celda dibuja como JSX.
   */
  getSearchText?: (row: T) => string;
}

/** Minúsculas y sin tildes: "Gómez" tiene que aparecer buscando "gomez". */
const normalizeSearch = (text: string): string =>
  text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim();

/**
 * ¿La fila coincide con lo buscado? Además del texto, compara solo los
 * dígitos: un teléfono guardado como "300 123 4567" tiene que aparecer
 * buscando "3001234567", y un documento "1.020.304" buscando "1020304".
 */
export function matchesSearch(text: string, query: string): boolean {
  const q = normalizeSearch(query);
  if (!q) return true;
  if (normalizeSearch(text).includes(q)) return true;
  const qDigits = q.replace(/\D/g, "");
  // Solo si lo buscado ES un número (con separadores): "ana 3" no tiene que
  // matchear cualquier fila con un 3 en el teléfono.
  if (qDigits.length >= 3 && /^[\d\s().+-]+$/.test(q)) {
    return text.replace(/\D/g, "").includes(qDigits);
  }
  return false;
}

const alignClass = {
  left: "text-left",
  center: "text-center",
  right: "text-right",
} as const;

const stringify = (node: React.ReactNode): string => {
  if (node == null) return "";
  if (typeof node === "string") return node;
  if (typeof node === "number") return String(node);
  return "";
};

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
  pagination = true,
  pageSize = 10,
  pageSizeOptions = [10, 25, 50, 100],
  searchable = false,
  searchPlaceholder = "Buscar…",
  getSearchText,
}: DataTableProps<T>) {
  // Qué tarjetas tienen el detalle abierto. Se guarda por clave de fila para
  // que abrir una no reordene ni cierre las demás.
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSizeState, setPageSizeState] = useState(pageSize);
  const [query, setQuery] = useState("");

  const toggleSort = (key: string) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
      setCurrentPage(1);
    } else {
      setSortKey(key);
      setSortDir("asc");
      setCurrentPage(1);
    }
  };

  const rowSearchText = (row: T): string =>
    getSearchText
      ? getSearchText(row)
      : columns.map((c) => stringify(c.cell(row))).join(" ");
  const filteredRows =
    searchable && query.trim()
      ? rows.filter((row) => matchesSearch(rowSearchText(row), query))
      : rows;

  const sortedRows = [...filteredRows].sort((a, b) => {
    if (!sortKey) return 0;
    const col = columns.find((c) => c.sortKey === sortKey);
    if (!col) return 0;

    // Con `sortValue` se ordena por el dato; sin él, por el texto renderizado,
    // que es como se comportaban todas las tablas antes de que existiera.
    if (col.sortValue) {
      const va = col.sortValue(a);
      const vb = col.sortValue(b);
      const cmp =
        typeof va === "number" && typeof vb === "number"
          ? va - vb
          : String(va).localeCompare(String(vb), "es", { numeric: true, sensitivity: "base" });
      return sortDir === "asc" ? cmp : -cmp;
    }

    const va = stringify(col.cell(a));
    const vb = stringify(col.cell(b));
    const cmp = va.localeCompare(vb, "es", { numeric: true, sensitivity: "base" });
    return sortDir === "asc" ? cmp : -cmp;
  });

  const effectivePageSize = pagination ? pageSizeState : sortedRows.length;
  const totalPages = Math.ceil(sortedRows.length / (effectivePageSize || 1)) || 1;
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const displayRows = pagination
    ? sortedRows.slice((safeCurrentPage - 1) * effectivePageSize, safeCurrentPage * effectivePageSize)
    : sortedRows;

  const renderSortIcon = (key: string) => {
    if (sortKey !== key) return null;
    return (
      <span className="inline-block ml-1 transition-transform">
        {sortDir === "asc" ? "▲" : "▼"}
      </span>
    );
  };
  const role = (c: DataColumn<T>): MobileRole => c.mobile ?? "field";

  /**
   * La fila accionable también tiene que responder al teclado, no solo al click.
   *
   * Cuando hay detalle desplegable, tocar la fila lo ABRE Y LO CIERRA, además
   * de avisarle a `onRowClick`. Sin el toggle, el detalle que se abre no se
   * puede cerrar: la única forma de sacarlo de la pantalla sería recargarla.
   */
  const rowInteraction = (row: T) => {
    if (!onRowClick && !renderExpanded) return null;
    const key = rowKey(row);
    const activate = () => {
      if (renderExpanded) setExpanded((prev) => ({ ...prev, [key]: !prev[key] }));
      onRowClick?.(row);
    };
    return {
      onClick: activate,
      onKeyDown: (e: React.KeyboardEvent) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          activate();
        }
      },
      role: "button" as const,
      tabIndex: 0,
      className: "cursor-pointer",
    };
  };

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
      {searchable && (
        <div className="p-4 border-b border-outline-variant/10">
          <div className="relative w-full sm:max-w-sm">
            <input
              type="search"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                // Lo encontrado puede no llegar a la página en la que estabas.
                setCurrentPage(1);
              }}
              placeholder={searchPlaceholder}
              aria-label={searchPlaceholder}
              className="w-full bg-surface-container-lowest border border-outline-variant/20 rounded-xl py-2.5 pl-9 pr-3 text-base lg:text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all placeholder:text-on-surface-variant/40"
            />
            <svg
              aria-hidden="true"
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-variant/60"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              viewBox="0 0 24 24"
            >
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.35-4.35" />
            </svg>
          </div>
        </div>
      )}

      {searchable && query.trim() && sortedRows.length === 0 && (
        <p role="status" className="px-4 py-10 text-center text-sm text-on-surface-variant">
          No hay resultados para «{query.trim()}». Revisa lo que escribiste o prueba con otro dato.
        </p>
      )}

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
                  className={`p-4 ${alignClass[c.align ?? "left"]} ${c.headerClassName ?? ""} ${c.sortKey ? "cursor-pointer select-none hover:text-on-surface transition-colors" : ""}`}
                  onClick={c.sortKey ? () => toggleSort(c.sortKey!) : undefined}
                >
                  <span className="inline-flex items-center">
                    {c.header}
                    {renderSortIcon(c.sortKey ?? "")}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-outline-variant/5 text-sm">
            {displayRows.map((row) => {
              const interaction = rowInteraction(row);
              const key = rowKey(row);
              const isOpen = renderExpanded != null && (expanded[key] ?? false);
              return (
              // El Fragment lleva la key porque la fila y su detalle son DOS
              // elementos hermanos salidos del mismo `map`.
              <Fragment key={key}>
              <tr
                {...interaction}
                aria-expanded={renderExpanded ? isOpen : undefined}
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
              {/* El detalle vive DENTRO de la tabla, en su propia fila. Antes se
                  dibujaba después de `</table>`, para TODAS las filas a la vez
                  y sin mirar si estaban abiertas: el desplegable nunca se
                  desplegó en escritorio, y encima quedaba fuera de la grilla,
                  desalineado de las columnas que explica. */}
              {isOpen && (
                <tr className="bg-surface-container-lowest/50">
                  <td colSpan={columns.length} className="p-0 border-t border-outline-variant/10">
                    {renderExpanded!(row)}
                  </td>
                </tr>
              )}
              </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Móvil */}
      <ul className="lg:hidden divide-y divide-outline-variant/20">
        {displayRows.map((row) => {
          const interaction = rowInteraction(row);
          const key = rowKey(row);
          const isOpen = expanded[key] ?? false;
          return (
          <li
            key={key}
            {...interaction}
            className={`px-4 py-3.5 even:bg-on-surface/[0.05] ${interaction ? "active:bg-on-surface/10 cursor-pointer" : ""}`}
          >
            {/* Encabezado */}
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

            {(hiddenFieldCols.length > 0 || renderExpanded) && (
              <>
                {isOpen && hiddenFieldCols.length > 0 && (
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
                    e.stopPropagation();
                    setExpanded((prev) => ({ ...prev, [key]: !prev[key] }));
                  }}
                  className="mt-1.5 -mx-2 px-2 h-9 w-[calc(100%+1rem)] flex items-center gap-1 text-xs font-semibold text-primary rounded-lg hover:bg-primary/5 transition-colors"
                >
                  {/* Con detalle desplegable el botón no puede prometer un
                      número de datos: lo que se abre es una sección entera, no
                      N pares etiqueta/valor. */}
                  {isOpen
                    ? "Ocultar detalle"
                    : hiddenFieldCols.length > 0
                      ? `Ver ${hiddenFieldCols.length} datos más`
                      : "Ver detalle"}
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
                {isOpen && renderExpanded && <div className="-mx-2">{renderExpanded(row)}</div>}
              </>
            )}

            {actionCols.length > 0 && (
              <div className="flex items-center justify-end gap-1 mt-1">
                {actionCols.map((c) => (
                  <div key={c.header}>{c.cell(row)}</div>
                ))}
              </div>
            )}
          </li>
          );
        })}
      </ul>

      {pagination && (
        <Pagination
          currentPage={safeCurrentPage}
          totalPages={totalPages}
          totalItems={sortedRows.length}
          pageSize={pageSizeState}
          onPageChange={setCurrentPage}
          onPageSizeChange={(newSize) => {
            setPageSizeState(newSize);
            setCurrentPage(1);
          }}
          pageSizeOptions={pageSizeOptions}
        />
      )}
    </>
  );
}
