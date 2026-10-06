import { test } from "node:test";
import assert from "node:assert/strict";
import {
  exportFilename,
  inclusiveEnd,
  safeSheetName,
  sheet,
  sheetMatrix,
  toCsv,
  xlsxBuffer,
  type ExportColumn,
} from "@/lib/export";

interface Row {
  name: string;
  amount: number;
  note?: string | null;
}

const COLS: ExportColumn<Row>[] = [
  { header: "Nombre", value: (r) => r.name },
  { header: "Monto", value: (r) => r.amount },
  { header: "Nota", value: (r) => r.note },
];

test("toCsv: BOM, separador ';', CRLF y montos como número crudo", () => {
  const csv = toCsv(COLS, [{ name: "Arriendo", amount: 1500000, note: null }]);
  assert.ok(csv.startsWith("﻿"), "lleva BOM para que Excel lea las tildes");
  assert.equal(csv, "﻿Nombre;Monto;Nota\r\nArriendo;1500000;\r\n");
});

test("toCsv: decimales con coma (Excel es-CO) y sin agrupar miles", () => {
  const csv = toCsv(COLS, [{ name: "x", amount: 1234.5 }]);
  assert.match(csv, /x;1234,5;/);
  const en = toCsv(COLS, [{ name: "x", amount: 1234.5 }], { delimiter: ",", decimal: "." });
  assert.match(en, /x,1234.5,/);
});

test("toCsv: comillas, separadores y saltos de línea se escapan", () => {
  const csv = toCsv(COLS, [{ name: 'Dice "hola"; chao', amount: 1, note: "línea 1\nlínea 2" }]);
  assert.match(csv, /"Dice ""hola""; chao";1;"línea 1\nlínea 2"/);
});

test("toCsv: un texto que parece fórmula se neutraliza; un número negativo no", () => {
  const csv = toCsv(COLS, [{ name: "=HYPERLINK(\"x\")", amount: -500, note: "@SUM(A1)" }]);
  const line = csv.split("\r\n")[1];
  assert.ok(line.startsWith(`"'=HYPERLINK(""x"")"`) || line.startsWith("'=HYPERLINK"), line);
  assert.match(line, /;-500;/);
  assert.match(line, /;'@SUM\(A1\)$/);
});

test("sheetMatrix: encabezado, filas y fila de totales", () => {
  const m = sheetMatrix({ name: "G", columns: COLS, rows: [{ name: "a", amount: 2 }], totals: ["Total", 2, null] });
  assert.deepEqual(m, [
    ["Nombre", "Monto", "Nota"],
    ["a", 2, undefined],
    ["Total", 2, null],
  ]);
});

test("safeSheetName: sin caracteres prohibidos y a lo sumo 31", () => {
  assert.equal(safeSheetName("Gastos: oct/2026"), "Gastos  oct 2026");
  assert.equal(safeSheetName("x".repeat(40)).length, 31);
  assert.equal(safeSheetName("[]"), "Hoja");
});

test("exportFilename: slug sin tildes y rango en el nombre", () => {
  assert.equal(exportFilename("Facturación", "csv", { from: "2026-10-01", to: "2026-10-31" }), "facturacion_2026-10-01_a_2026-10-31.csv");
  assert.equal(exportFilename("ventas", "xlsx", {}, "2026-10-06"), "ventas_completo_2026-10-06.xlsx");
  assert.equal(exportFilename("gastos", "csv", { from: "2026-10-01" }), "gastos_desde_2026-10-01.csv");
});

test("inclusiveEnd: el `to` exclusivo pasa al último día incluido", () => {
  assert.equal(inclusiveEnd("2026-11-01"), "2026-10-31");
  assert.equal(inclusiveEnd("2026-03-01"), "2026-02-28");
  assert.equal(inclusiveEnd(null), null);
});

test("xlsxBuffer: genera un libro legible con una hoja por spec", async () => {
  const buffer = await xlsxBuffer([
    sheet({ name: "Gastos", columns: COLS, rows: [{ name: "Luz", amount: 80000 }], totals: ["Total", 80000, null] }),
    sheet({ name: "Gastos", columns: COLS, rows: [] }),
  ]);
  const { default: ExcelJS } = await import("exceljs");
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  assert.deepEqual(wb.worksheets.map((w) => w.name), ["Gastos", "Gastos 2"]);
  const ws = wb.worksheets[0];
  assert.equal(ws.getCell("A2").value, "Luz");
  assert.equal(ws.getCell("B2").value, 80000);
  assert.equal(ws.getRow(3).font?.bold, true);
});
