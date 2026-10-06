/**
 * Exportación de tablas a CSV y Excel (F11).
 *
 * Todo lo que arma el ARCHIVO es puro y está testeado (`tests/export.test.ts`):
 * columnas → texto CSV, columnas → filas de una hoja, nombre del archivo. Lo
 * único que toca el DOM es `downloadBlob`, y lo único que carga `exceljs` es
 * `xlsxBuffer`, con import dinámico: la librería pesa cientos de KB y solo la
 * paga quien de verdad descarga un Excel.
 *
 * Los montos viajan como NÚMERO crudo, nunca con el formato de pantalla
 * (`$ 45.000`): un CSV con el símbolo y los puntos de miles no se puede sumar
 * en Excel, que es justamente para lo que se exporta.
 */

import { toISODate } from "@/lib/date";

/** Valor de una celda. `null`/`undefined` salen como celda vacía. */
export type ExportValue = string | number | boolean | null | undefined;

export interface ExportColumn<T> {
  header: string;
  value: (row: T) => ExportValue;
  /** Ancho sugerido en Excel (caracteres). */
  width?: number;
  /** Formato numérico de Excel, p. ej. `"#,##0"` para montos. */
  numFmt?: string;
}

export interface CsvOptions {
  /**
   * Separador de campos. Por defecto `;`: el Excel en español (es-CO) usa la
   * coma como separador DECIMAL, y abre un CSV separado por comas con todo
   * apretado en la columna A.
   */
  delimiter?: string;
  /** Separador decimal de los números. Por defecto `,`, por el mismo motivo. */
  decimal?: string;
}

/**
 * Un texto que empieza con `=`, `+`, `-` o `@` Excel lo ejecuta como fórmula
 * (inyección de CSV): una descripción de gasto "=HYPERLINK(...)" escrita por
 * cualquiera terminaría corriendo en la máquina del contador. Se neutraliza
 * con un apóstrofo, que Excel no muestra. Los NÚMEROS negativos no pasan por
 * acá: son números, no texto.
 */
function neutralizeFormula(text: string): string {
  return /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
}

function csvCell(value: ExportValue, { delimiter, decimal }: Required<CsvOptions>): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return "";
    // Sin agrupar miles y sin notación científica; solo cambia el decimal.
    const raw = String(Math.round(value * 100) / 100);
    return decimal === "." ? raw : raw.replace(".", decimal);
  }
  if (typeof value === "boolean") return value ? "Sí" : "No";
  const text = neutralizeFormula(value);
  const needsQuotes =
    text.includes(delimiter) || text.includes('"') || text.includes("\n") || text.includes("\r");
  return needsQuotes ? `"${text.replace(/"/g, '""')}"` : text;
}

/**
 * Filas → CSV. Lleva BOM UTF-8 al principio: sin él, Excel abre "Categoría"
 * como "CategorÃ­a". Fin de línea CRLF, el que espera Excel en Windows.
 */
export function toCsv<T>(columns: ExportColumn<T>[], rows: T[], options: CsvOptions = {}): string {
  const opts: Required<CsvOptions> = { delimiter: options.delimiter ?? ";", decimal: options.decimal ?? "," };
  const lines = [
    columns.map((c) => csvCell(c.header, opts)).join(opts.delimiter),
    ...rows.map((row) => columns.map((c) => csvCell(c.value(row), opts)).join(opts.delimiter)),
  ];
  return `﻿${lines.join("\r\n")}\r\n`;
}

/** Una hoja del libro de Excel. */
export interface SheetSpec<T = unknown> {
  name: string;
  columns: ExportColumn<T>[];
  rows: T[];
  /** Fila final de totales (se pone en negrita). */
  totals?: ExportValue[];
}

/**
 * Las celdas de una hoja, ya resueltas: encabezado + filas (+ totales). Es lo
 * que `xlsxBuffer` vuelca en `exceljs`; separado para poder testearlo sin
 * generar el binario.
 */
export function sheetMatrix<T>(sheet: SheetSpec<T>): ExportValue[][] {
  const out: ExportValue[][] = [
    sheet.columns.map((c) => c.header),
    ...sheet.rows.map((row) =>
      sheet.columns.map((c) => {
        const v = c.value(row);
        return typeof v === "string" ? neutralizeFormula(v) : v;
      }),
    ),
  ];
  if (sheet.totals) out.push(sheet.totals);
  return out;
}

/**
 * Excel no admite en el nombre de una hoja `: \ / ? * [ ]` ni más de 31
 * caracteres, y `exceljs` revienta si se los pasa.
 */
export function safeSheetName(name: string): string {
  const clean = name.replace(/[:\\/?*[\]]/g, " ").trim().slice(0, 31);
  return clean || "Hoja";
}

/**
 * Hoja ya resuelta a celdas, sin el tipo de sus filas: así un libro puede
 * mezclar hojas de cosas distintas (ventas, gastos) sin pelear con la varianza
 * de los genéricos. Se arma con `sheet(...)`.
 */
export interface ResolvedSheet {
  name: string;
  columns: { header: string; width?: number; numFmt?: string }[];
  matrix: ExportValue[][];
  hasTotals: boolean;
}

export function sheet<T>(spec: SheetSpec<T>): ResolvedSheet {
  return {
    name: spec.name,
    columns: spec.columns.map(({ header, width, numFmt }) => ({ header, width, numFmt })),
    matrix: sheetMatrix(spec),
    hasTotals: Boolean(spec.totals),
  };
}

/** Libro `.xlsx` con una hoja por cada `ResolvedSheet`, como ArrayBuffer. */
export async function xlsxBuffer(sheets: ResolvedSheet[]): Promise<ArrayBuffer> {
  const { default: ExcelJS } = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Ventex";
  workbook.created = new Date();

  const used = new Set<string>();
  for (const spec of sheets) {
    let name = safeSheetName(spec.name);
    // Dos hojas con el mismo nombre también hacen fallar a exceljs.
    for (let i = 2; used.has(name); i++) name = safeSheetName(`${spec.name} ${i}`);
    used.add(name);

    const ws = workbook.addWorksheet(name);
    spec.matrix.forEach((cells, index) => {
      const row = ws.addRow(cells.map((c) => (c === undefined ? null : c)));
      const isHeader = index === 0;
      const isTotals = spec.hasTotals && index === spec.matrix.length - 1;
      if (isHeader || isTotals) row.font = { bold: true };
    });
    spec.columns.forEach((col, i) => {
      const column = ws.getColumn(i + 1);
      column.width = col.width ?? Math.max(12, col.header.length + 2);
      if (col.numFmt) column.numFmt = col.numFmt;
    });
    ws.views = [{ state: "frozen", ySplit: 1 }];
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return buffer as ArrayBuffer;
}

/** Formato de montos para las columnas de Excel: miles agrupados, sin decimales. */
export const MONEY_NUM_FMT = "#,##0";

/**
 * Nombre del archivo: `ventas_2026-10-01_a_2026-10-31.csv`. Sin rango (todo el
 * histórico) queda `ventas_completo_2026-10-06.csv`, con la fecha de hoy para
 * que dos descargas del mismo día no se pisen con las de otro.
 */
export function exportFilename(
  base: string,
  ext: "csv" | "xlsx",
  range: { from?: string | null; to?: string | null } = {},
  today: string = toISODate(),
): string {
  const slug =
    base
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "export";
  const from = range.from?.slice(0, 10);
  const to = range.to?.slice(0, 10);
  const span = from && to ? `${from}_a_${to}` : from ? `desde_${from}` : to ? `hasta_${to}` : `completo_${today}`;
  return `${slug}_${span}.${ext}`;
}

/** Dispara la descarga en el navegador. Único punto con DOM de este módulo. */
export function downloadBlob(filename: string, data: BlobPart, type: string): void {
  const blob = new Blob([data], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Diferido: revocar en el mismo tick cancela la descarga en algunos navegadores.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const CSV_MIME = "text/csv;charset=utf-8";
export const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/** Atajo: columnas + filas → descarga CSV. */
export function downloadCsv<T>(filename: string, columns: ExportColumn<T>[], rows: T[]): void {
  downloadBlob(filename, toCsv(columns, rows), CSV_MIME);
}

/** Atajo: hojas → descarga XLSX. */
export async function downloadXlsx(filename: string, sheets: ResolvedSheet[]): Promise<void> {
  const buffer = await xlsxBuffer(sheets);
  downloadBlob(filename, buffer, XLSX_MIME);
}

/**
 * Las fechas de rango de la app tienen `to` EXCLUSIVO (medianoche del día
 * siguiente). Para el nombre del archivo y para el encabezado lo que importa es
 * el último día INCLUIDO.
 */
export function inclusiveEnd(toExclusiveDay: string | null | undefined): string | null {
  if (!toExclusiveDay) return null;
  const [y, m, d] = toExclusiveDay.slice(0, 10).split("-").map(Number);
  const date = new Date(y, m - 1, d - 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
