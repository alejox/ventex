"use client";

import type { ImportColumn } from "./core";
import { parseCsv, toCsv } from "./csv";

/**
 * Lado navegador de la importación/exportación: leer el archivo que sube la
 * persona y entregarle archivos para descargar. No toca la base —eso es de los
 * services—; solo convierte entre archivos y matrices de texto.
 *
 * `exceljs` pesa: se carga recién cuando hace falta (al subir un .xlsx o al
 * pedir la plantilla), no con la pantalla.
 */

export const ACCEPTED_IMPORT_TYPES =
  ".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/** Tope razonable: una hoja de 5 MB son decenas de miles de filas. */
export const MAX_IMPORT_BYTES = 5 * 1024 * 1024;

/** Una celda de ExcelJS como texto, sin formatos regionales de por medio. */
function cellText(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "number") return String(value);
  if (typeof value === "boolean") return value ? "Sí" : "No";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "object") {
    const v = value as { result?: unknown; text?: unknown; richText?: { text: string }[]; error?: unknown };
    if (v.richText) return v.richText.map((r) => r.text).join("");
    if (v.text !== undefined) return cellText(v.text);
    if (v.result !== undefined) return cellText(v.result);
    return "";
  }
  return String(value);
}

/**
 * Lee un .csv o .xlsx y devuelve sus filas como texto. De un libro de Excel se
 * lee la PRIMERA hoja (la plantilla trae las instrucciones en la segunda).
 */
export async function readSpreadsheetFile(file: File): Promise<string[][]> {
  if (file.size > MAX_IMPORT_BYTES) {
    throw new Error("El archivo pesa más de 5 MB. Divídelo en partes más chicas.");
  }
  const name = file.name.toLowerCase();
  if (name.endsWith(".csv") || file.type === "text/csv") {
    return parseCsv(await file.text());
  }
  if (name.endsWith(".xls")) {
    throw new Error("El formato .xls (Excel 97-2003) no se puede leer. Guárdalo como .xlsx o .csv.");
  }
  if (!name.endsWith(".xlsx")) {
    throw new Error("Sube un archivo .xlsx o .csv.");
  }
  const ExcelJS = (await import("exceljs")).default;
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await file.arrayBuffer());
  const sheet = workbook.worksheets[0];
  if (!sheet) return [];
  const rows: string[][] = [];
  sheet.eachRow({ includeEmpty: false }, (row) => {
    const cells: string[] = [];
    // `row.values` arranca en el índice 1 (convención de ExcelJS).
    const values = row.values as unknown[];
    for (let i = 1; i < values.length; i++) cells.push(cellText(values[i]).trim());
    if (cells.some((c) => c !== "")) rows.push(cells);
  });
  return rows;
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Descarga una matriz como CSV (separador `;` y BOM, para Excel en español). */
export function downloadCsv(filename: string, rows: unknown[][]): void {
  downloadBlob(new Blob([toCsv(rows)], { type: "text/csv;charset=utf-8" }), filename);
}

/**
 * Plantilla .xlsx: hoja 1 SOLO con los encabezados (los obligatorios con `*`)
 * y hoja 2 con qué va en cada columna y un ejemplo. El ejemplo no va en la hoja
 * de datos: si alguien se olvida de borrarlo, se importaría como un registro. Todas las columnas de
 * datos quedan con formato Texto, para que Excel no convierta un código de
 * barras en `7,70E+12` ni le quite el cero inicial a un documento.
 */
export async function downloadTemplate(
  filename: string,
  columns: ImportColumn[],
  sheetName: string,
): Promise<void> {
  const ExcelJS = (await import("exceljs")).default;
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(sheetName);
  sheet.columns = columns.map((c) => ({
    header: c.required ? `${c.label} *` : c.label,
    key: c.key,
    width: Math.max(14, c.label.length + 6),
    style: { numFmt: "@" },
  }));
  sheet.getRow(1).font = { bold: true };
  sheet.views = [{ state: "frozen", ySplit: 1 }];

  const help = workbook.addWorksheet("Instrucciones");
  help.columns = [
    { header: "Columna", key: "col", width: 24 },
    { header: "Obligatoria", key: "req", width: 12 },
    { header: "Ejemplo", key: "example", width: 24 },
    { header: "Qué va", key: "help", width: 90 },
  ];
  help.getRow(1).font = { bold: true };
  for (const c of columns) {
    help.addRow({ col: c.label, req: c.required ? "Sí" : "No", example: c.example ?? "", help: c.help ?? "" });
  }
  help.addRow({});
  help.addRow({ col: "Importante", help: "Escribe una fila por registro en la primera hoja, debajo de los encabezados. Se lee solo la primera hoja." });

  const buffer = await workbook.xlsx.writeBuffer();
  downloadBlob(
    new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
    filename,
  );
}
