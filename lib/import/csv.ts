/**
 * CSV a mano, sin dependencias: lo justo para lo que exporta Excel, Google
 * Sheets y LibreOffice.
 *
 * El detalle que importa en Colombia: con la configuración regional es-CO, la
 * coma es el separador DECIMAL, así que Excel guarda los CSV con PUNTO Y COMA.
 * Un parser que asume coma lee cada fila como una sola columna. Por eso el
 * separador se detecta mirando la primera línea, y lo que exportamos sale con
 * `;` (y BOM, para que Excel no rompa las tildes).
 */

export type CsvDelimiter = "," | ";" | "\t";

/** Quita el BOM UTF-8 que agregan Excel y nuestro propio exportador. */
export function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/**
 * Separador más probable, contando FUERA de comillas en la primera línea.
 * Ante empate gana `;`: es el de Excel en español.
 */
export function detectDelimiter(text: string): CsvDelimiter {
  const counts: Record<CsvDelimiter, number> = { ",": 0, ";": 0, "\t": 0 };
  let inQuotes = false;
  for (const ch of stripBom(text)) {
    if (ch === '"') inQuotes = !inQuotes;
    else if (!inQuotes && (ch === "\n" || ch === "\r")) break;
    else if (!inQuotes && (ch === "," || ch === ";" || ch === "\t")) counts[ch]++;
  }
  if (counts["\t"] > counts[";"] && counts["\t"] > counts[","]) return "\t";
  return counts[","] > counts[";"] ? "," : ";";
}

/**
 * Parser RFC 4180: comillas dobles, `""` como comilla escapada, saltos de
 * línea dentro de un campo entre comillas, y fin de línea `\n` o `\r\n`.
 * Las filas totalmente vacías se descartan.
 */
export function parseCsv(text: string, delimiter?: CsvDelimiter): string[][] {
  const src = stripBom(text);
  const sep = delimiter ?? detectDelimiter(src);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  const endField = () => {
    row.push(field);
    field = "";
  };
  const endRow = () => {
    endField();
    if (row.some((cell) => cell.trim() !== "")) rows.push(row);
    row = [];
  };

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"' && field === "") inQuotes = true;
    else if (ch === sep) endField();
    else if (ch === "\n") endRow();
    else if (ch === "\r") {
      if (src[i + 1] === "\n") i++;
      endRow();
    } else field += ch;
  }
  if (field !== "" || row.length > 0) endRow();
  return rows;
}

/** Un valor de celda listo para CSV: entre comillas si hace falta. */
export function csvCell(value: unknown, delimiter: CsvDelimiter = ";"): string {
  if (value == null) return "";
  let text = typeof value === "number" ? formatCsvNumber(value) : String(value);
  // Una celda que empieza con = + - @ la ejecuta Excel como fórmula
  // ("inyección de CSV"). Un nombre de cliente no es una fórmula.
  if (/^[=+\-@]/.test(text) && typeof value !== "number") text = `'${text}`;
  const needsQuotes = text.includes(delimiter) || /["\r\n]/.test(text);
  return needsQuotes ? `"${text.replace(/"/g, '""')}"` : text;
}

/**
 * Números SIN separador de miles y con punto decimal: es la única forma que
 * nuestro propio importador (y cualquier hoja) vuelve a leer sin ambigüedad.
 */
function formatCsvNumber(n: number): string {
  if (!Number.isFinite(n)) return "";
  return String(Math.round(n * 100) / 100);
}

/** Arma el CSV completo, con BOM para que Excel respete UTF-8. */
export function toCsv(rows: unknown[][], delimiter: CsvDelimiter = ";"): string {
  const body = rows.map((r) => r.map((v) => csvCell(v, delimiter)).join(delimiter)).join("\r\n");
  return `﻿${body}\r\n`;
}
