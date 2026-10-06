"use client";

import { Fragment, useState } from "react";
import type React from "react";
import { Pagination } from "./Pagination";
import { Select } from "./ui/Select";
import { DEFAULT_TABLE_STATE, type SortDir, type TableState } from "@/lib/useUrlState";

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
  /**
   * La celda ya trae su propio enlace o botón. Si es la celda título de una
   * fila accionable, `DataTable` NO la envuelve en otro botón (un interactivo
   * dentro de otro es inválido y el lector de pantalla no sabe cuál anunciar).
   */
  interactive?: boolean;
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
  /** Hace la fila accionable (abrir el detalle, por ejemplo). */
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
  /**
   * Estado controlado (búsqueda, orden, página). Con `useTableUrlState()` vive
   * en la URL y volver de editar deja la lista donde estaba. Sin esto, la
   * tabla lo maneja sola en memoria, como siempre.
   */
  state?: TableState;
  onStateChange?: (patch: Partial<TableState>) => void;
  /** Controles extra junto al buscador (chips de filtro, por ejemplo). */
  toolbar?: React.ReactNode;
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

/**
 * Qué pasa al tocar el encabezado `key`: la misma columna invierte el sentido;
 * otra columna arranca ascendente. Pura, para testearla.
 */
export function nextSort(
  current: { sort: string | null; dir: SortDir },
  key: string,
): { sort: string; dir: SortDir } {
  if (current.sort === key) return { sort: key, dir: current.dir === "asc" ? "desc" : "asc" };
  return { sort: key, dir: "asc" };
}

/** Valor de `aria-sort` de un encabezado. Undefined si la columna no se ordena. */
export function ariaSortOf(
  sortKey: string | undefined,
  current: { sort: string | null; dir: SortDir },
): "ascending" | "descending" | "none" | undefined {
  if (!sortKey) return undefined;
  if (current.sort !== sortKey) return "none";
  return current.dir === "asc" ? "ascending" : "descending";
}

const alignClass = {
  left: "text-left",
  center: "text-center",
  right: "text-right",
} as const;

const justifyClass = {
  left: "justify-start",
  center: "justify-center",
  right: "justify-end",
} as const;

const stringify = (node: React.ReactNode): string => {
  if (node == null) return "";
  if (typeof node === "string") return node;
  if (typeof node === "number") return String(node);
  return "";
};

/**
 * El clic de la fila es un ATAJO de mouse; la acción accesible es el botón de
 * la celda título. Si el clic cayó sobre otro interactivo de la fila (un botón
 * de acción, un enlace), ese interactivo es el que manda.
 */
const INTERACTIVE = "a,button,input,select,textarea,label,[role='button'],[role='switch'],[role='checkbox']";
function clickedInsideInteractive(e: React.MouseEvent): boolean {
  const target = e.target as HTMLElement | null;
  const hit = target?.closest?.(INTERACTIVE);
  return Boolean(hit && hit !== e.currentTarget && (e.currentTarget as HTMLElement).contains(hit));
}

function SortIcon({ state }: { state: "ascending" | "descending" | "none" }) {
  // ↕ en las columnas ordenables que no mandan: sin él no hay forma de saber
  // cuáles encabezados se pueden tocar.
  const glyph = state === "ascending" ? "▲" : state === "descending" ? "▼" : "↕";
  return (
    <span
      aria-hidden="true"
      className={`inline-block text-[10px] leading-none ${state === "none" ? "opacity-50" : "text-primary"}`}
    >
      {glyph}
    </span>
  );
}

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
  state: controlledState,
  onStateChange,
  toolbar,
}: DataTableProps<T>) {
  // Qué tarjetas tienen el detalle abierto. Se guarda por clave de fila para
  // que abrir una no reordene ni cierre las demás.
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [internalState, setInternalState] = useState<TableState>({
    ...DEFAULT_TABLE_STATE,
    size: pageSize,
  });
  const st = controlledState ?? internalState;
  const update = (patch: Partial<TableState>) => {
    onStateChange?.(patch);
    if (!controlledState) setInternalState((prev) => ({ ...prev, ...patch }));
  };

  const sortKey = st.sort;
  const sortDir = st.dir;
  const query = searchable ? st.q : "";

  const toggleSort = (key: string) => update({ ...nextSort(st, key), page: 1 });

  const rowSearchText = (row: T): string =>
    getSearchText
      ? getSearchText(row)
      : columns.map((c) => stringify(c.cell(row))).join(" ");
  const filteredRows =
    searchable && query.trim()
      ? rows.filter((row) => matchesSearch(rowSearchText(row), query))
      : rows;

  const sortCol = sortKey ? columns.find((c) => c.sortKey === sortKey) : undefined;
  const sortedRows = !sortCol
    ? filteredRows
    : [...filteredRows].sort((a, b) => {
        // Con `sortValue` se ordena por el dato; sin él, por el texto
        // renderizado, que es como se comportaban todas las tablas antes.
        if (sortCol.sortValue) {
          const va = sortCol.sortValue(a);
          const vb = sortCol.sortValue(b);
          const cmp =
            typeof va === "number" && typeof vb === "number"
              ? va - vb
              : String(va).localeCompare(String(vb), "es", { numeric: true, sensitivity: "base" });
          return sortDir === "asc" ? cmp : -cmp;
        }
        const va = stringify(sortCol.cell(a));
        const vb = stringify(sortCol.cell(b));
        const cmp = va.localeCompare(vb, "es", { numeric: true, sensitivity: "base" });
        return sortDir === "asc" ? cmp : -cmp;
      });

  const pageSizeState = st.size;
  const effectivePageSize = pagination ? pageSizeState : sortedRows.length;
  const totalPages = Math.ceil(sortedRows.length / (effectivePageSize || 1)) || 1;
  const safeCurrentPage = Math.min(Math.max(st.page, 1), totalPages);
  const displayRows = pagination
    ? sortedRows.slice((safeCurrentPage - 1) * effectivePageSize, safeCurrentPage * effectivePageSize)
    : sortedRows;

  const role = (c: DataColumn<T>): MobileRole => c.mobile ?? "field";
  const sortableCols = columns.filter((c) => c.sortKey);

  const rowIsActionable = Boolean(onRowClick || renderExpanded);
  const activate = (row: T) => {
    const key = rowKey(row);
    if (renderExpanded) setExpanded((prev) => ({ ...prev, [key]: !prev[key] }));
    onRowClick?.(row);
  };

  const titleCol = columns.find((c) => role(c) === "title");
  // La celda que lleva el botón accesible de la fila: la de título, o la
  // primera si ninguna columna se declaró como título.
  const actionCol = titleCol ?? columns[0];
  const subtitleCol = columns.find((c) => role(c) === "subtitle");
  const trailingCol = columns.find((c) => role(c) === "trailing");
  const badgeCols = columns.filter((c) => role(c) === "badge");
  const actionCols = columns.filter((c) => role(c) === "actions");

  /**
   * Contenido de la celda título. En una fila accionable va dentro de un
   * `<button>`: es lo que se alcanza con Tab y se activa con Enter. Antes la
   * fila entera era `role="button"` y contenía otros botones, que es un
   * interactivo dentro de otro y el lector de pantalla no sabe qué anunciar.
   */
  const renderActionCell = (c: DataColumn<T>, row: T, isOpen: boolean) => {
    const content = c.cell(row);
    if (!rowIsActionable || c !== actionCol || c.interactive) return content;
    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          activate(row);
        }}
        aria-expanded={renderExpanded ? isOpen : undefined}
        className="text-left w-full rounded-md hover:underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        {content}
      </button>
    );
  };

  const rowClickProps = (row: T) =>
    rowIsActionable
      ? {
          onClick: (e: React.MouseEvent) => {
            if (clickedInsideInteractive(e)) return;
            activate(row);
          },
        }
      : {};

  // Divulgación progresiva: los primeros `collapseAfter` campos quedan a la
  // vista y el resto —más lo marcado como `detail`— entra al desplegable.
  const allFieldCols = columns.filter((c) => role(c) === "field");
  const visibleFieldCols = allFieldCols.slice(0, collapseAfter);
  const hiddenFieldCols = [
    ...allFieldCols.slice(collapseAfter),
    ...columns.filter((c) => role(c) === "detail"),
  ];

  const showTopBar = searchable || toolbar != null || sortableCols.length > 0;

  return (
    <>
      {showTopBar && (
        <div
          className={`flex flex-col sm:flex-row sm:items-center gap-3 ${
            searchable || toolbar != null ? "p-4 border-b border-outline-variant/10" : "px-4 pt-3 lg:hidden"
          }`}
        >
          {searchable && (
            <div className="relative w-full sm:max-w-sm">
              <input
                type="search"
                value={st.q}
                onChange={(e) => {
                  // Lo encontrado puede no llegar a la página en la que estabas.
                  update({ q: e.target.value, page: 1 });
                }}
                placeholder={searchPlaceholder}
                aria-label={searchPlaceholder}
                className="w-full bg-surface-container-lowest border border-outline-variant/20 rounded-xl py-2.5 pl-9 pr-3 text-base lg:text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all placeholder:text-on-surface-variant/80"
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
          )}
          {toolbar != null && <div className="flex flex-wrap items-center gap-2 min-w-0">{toolbar}</div>}
          {/* En móvil no hay encabezados que tocar: el orden se elige acá. */}
          {sortableCols.length > 0 && (
            <div className="lg:hidden sm:ml-auto w-full sm:w-56">
              <Select
                size="sm"
                aria-label="Ordenar por"
                value={sortKey ? `${sortKey}:${sortDir}` : ""}
                onChange={(e) => {
                  const [key, dir] = e.target.value.split(":");
                  update(key ? { sort: key, dir: dir === "desc" ? "desc" : "asc", page: 1 } : { sort: null, dir: "asc", page: 1 });
                }}
              >
                <option value="">Orden predeterminado</option>
                {sortableCols.flatMap((c) => [
                  <option key={`${c.sortKey}:asc`} value={`${c.sortKey}:asc`}>{`${c.header} ↑`}</option>,
                  <option key={`${c.sortKey}:desc`} value={`${c.sortKey}:desc`}>{`${c.header} ↓`}</option>,
                ])}
              </Select>
            </div>
          )}
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
            <tr className="bg-surface-container-low border-b border-outline-variant/10 text-[11px] uppercase tracking-wider text-on-surface-variant font-bold">
              {columns.map((c) => {
                const ariaSort = ariaSortOf(c.sortKey, st);
                return (
                  <th
                    key={c.header}
                    scope="col"
                    aria-sort={ariaSort}
                    className={`p-4 ${alignClass[c.align ?? "left"]} ${c.headerClassName ?? ""}`}
                  >
                    {c.sortKey ? (
                      <button
                        type="button"
                        onClick={() => toggleSort(c.sortKey!)}
                        className={`inline-flex items-center gap-1.5 uppercase tracking-wider font-bold rounded-md hover:text-on-surface transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${justifyClass[c.align ?? "left"]}`}
                      >
                        {c.header}
                        <SortIcon state={ariaSort ?? "none"} />
                      </button>
                    ) : (
                      c.header
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-outline-variant/5 text-sm">
            {displayRows.map((row) => {
              const key = rowKey(row);
              const isOpen = renderExpanded != null && (expanded[key] ?? false);
              return (
              // El Fragment lleva la key porque la fila y su detalle son DOS
              // elementos hermanos salidos del mismo `map`.
              <Fragment key={key}>
              <tr
                {...rowClickProps(row)}
                className={`hover:bg-surface-container-lowest transition-colors ${rowIsActionable ? "cursor-pointer" : ""}`}
              >
                {columns.map((c) => (
                  <td
                    key={c.header}
                    className={`p-4 ${alignClass[c.align ?? "left"]} ${c.className ?? ""}`}
                  >
                    {renderActionCell(c, row, isOpen)}
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
          const key = rowKey(row);
          const isOpen = expanded[key] ?? false;
          return (
          <li
            key={key}
            {...rowClickProps(row)}
            className={`px-4 py-3.5 even:bg-on-surface/[0.05] ${rowIsActionable ? "active:bg-on-surface/10 cursor-pointer" : ""}`}
          >
            {/* Encabezado */}
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                {titleCol && (
                  <div className="text-[15px] leading-snug font-semibold text-on-surface break-words">
                    {renderActionCell(titleCol, row, isOpen)}
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
                    <dt className="text-[11px] uppercase tracking-wider font-bold text-on-surface-variant shrink-0">
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
                        <dt className="text-[11px] uppercase tracking-wider font-bold text-on-surface-variant shrink-0">
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
          onPageChange={(page) => update({ page })}
          onPageSizeChange={(newSize) => update({ size: newSize, page: 1 })}
          pageSizeOptions={pageSizeOptions}
        />
      )}
    </>
  );
}
