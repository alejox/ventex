import test from "node:test";
import assert from "node:assert/strict";
import { parseCsv, detectDelimiter, toCsv, csvCell } from "../lib/import/csv";
import { parseNumberCO, parseYesNo, parsePhone, parseEmail, documentKey, normalizeHeader } from "../lib/import/values";
import { buildPreview, mapHeaders, runInBatches, errorMessage } from "../lib/import/core";
import { PRODUCT_IMPORT, existingProductKeys, annotateProductPreview, parseUnit } from "../lib/import/products";
import { CUSTOMER_IMPORT, existingCustomerKeys } from "../lib/import/customers";
import { DISTRIBUTOR_IMPORT, splitNit } from "../lib/import/distributors";
import { parseDocType, docTypeOptionsFor } from "../lib/import/doc-types";
import { customersExportRows, exportFileName } from "../lib/import/export";

/* ---------------------------------- CSV ---------------------------------- */

test("detecta punto y coma (Excel es-CO) y coma", () => {
  assert.equal(detectDelimiter("Nombre;Precio\nA;1"), ";");
  assert.equal(detectDelimiter("Nombre,Precio\nA,1"), ",");
  // Las comas dentro de comillas no cuentan.
  assert.equal(detectDelimiter('"Pérez, Ana";Teléfono\n'), ";");
});

test("parseCsv: comillas, comillas escapadas, saltos dentro de campo, BOM y CRLF", () => {
  const text = '﻿Nombre;Nota\r\n"Pérez; Ana";"dijo ""hola"""\r\n"Línea\nnueva";x\r\n\r\n';
  assert.deepEqual(parseCsv(text), [
    ["Nombre", "Nota"],
    ["Pérez; Ana", 'dijo "hola"'],
    ["Línea\nnueva", "x"],
  ]);
});

test("toCsv → parseCsv es ida y vuelta", () => {
  const rows = [["Nombre", "Precio"], ["Ana; \"la\" buena", 3500.5], ["", null]];
  const back = parseCsv(toCsv(rows));
  assert.deepEqual(back[0], ["Nombre", "Precio"]);
  assert.deepEqual(back[1], ['Ana; "la" buena', "3500.5"]);
});

test("csvCell neutraliza fórmulas (inyección de CSV) pero no números negativos", () => {
  assert.equal(csvCell("=HYPERLINK(1)"), "'=HYPERLINK(1)");
  assert.equal(csvCell(-5), "-5");
});

/* -------------------------------- valores -------------------------------- */

test("parseNumberCO entiende miles y decimales de las dos escrituras", () => {
  const n = (s: string) => {
    const r = parseNumberCO(s);
    return r.ok ? r.value : `ERR`;
  };
  assert.equal(n("3500"), 3500);
  assert.equal(n("3.500"), 3500);
  assert.equal(n("1.250.000"), 1250000);
  assert.equal(n("1,250,000"), 1250000);
  assert.equal(n("12,5"), 12.5);
  assert.equal(n("12.5"), 12.5);
  assert.equal(n("0.500"), 0.5);
  assert.equal(n("1.250.000,50"), 1250000.5);
  assert.equal(n("1,250,000.50"), 1250000.5);
  assert.equal(n("$ 12.500"), 12500);
  assert.equal(n(""), null);
  assert.equal(n("doce"), "ERR");
  assert.equal(n("1.2.3"), "ERR");
});

test("Sí/No, correo y teléfono", () => {
  assert.deepEqual(parseYesNo("Sí"), { ok: true, value: true });
  assert.deepEqual(parseYesNo("no"), { ok: true, value: false });
  assert.deepEqual(parseYesNo(""), { ok: true, value: null });
  assert.equal(parseYesNo("tal vez").ok, false);
  assert.equal(parseEmail("ana@x.co").ok, true);
  assert.equal(parseEmail("ana@").ok, false);
  assert.deepEqual(parsePhone("+57 300 123 4567"), { ok: true, value: "+57 300 123 4567" });
  assert.equal(parsePhone("3,00E+09").ok, false);
  assert.equal(parsePhone("123").ok, false);
});

test("documentKey ignora puntos, guiones y espacios", () => {
  assert.equal(documentKey("1.020.304"), documentKey("1020304"));
  assert.equal(documentKey(" 900.123.456-7 "), "9001234567");
});

test("normalizeHeader quita *, paréntesis y tildes", () => {
  assert.equal(normalizeHeader("Precio de venta (IVA incluido) *"), "precio de venta");
  assert.equal(normalizeHeader("CATEGORÍA"), "categoria");
});

test("tipos de documento colombianos", () => {
  assert.equal(parseDocType("C.C."), "CC");
  assert.equal(parseDocType("cédula"), "CC");
  assert.equal(parseDocType("nit"), "NIT");
  assert.equal(parseDocType("RFC"), null);
  // Un registro viejo con RFC no pierde su valor al editarlo.
  assert.ok(docTypeOptionsFor("RFC").some((o) => o.value === "RFC"));
  assert.ok(!docTypeOptionsFor("CC").some((o) => o.value === "RFC"));
  assert.equal(docTypeOptionsFor(null)[0].value, "CC");
});

/* --------------------------------- motor --------------------------------- */

test("mapHeaders acepta cualquier orden, alias y reporta lo que falta", () => {
  const { index, missing, unknown } = mapHeaders(["Precio", "Notas", "producto"], PRODUCT_IMPORT.columns);
  assert.equal(index.name, 2);
  assert.equal(index.price, 0);
  assert.deepEqual(missing, []);
  assert.deepEqual(unknown, ["Notas"]);
  assert.deepEqual(mapHeaders(["SKU"], PRODUCT_IMPORT.columns).missing, ["Nombre", "Precio de venta"]);
});

test("vista previa de productos: crear, actualizar, duplicado en archivo y errores", () => {
  const existing = existingProductKeys([
    { id: "p1", sku: "gas-400", barcode: "770", unit: "Unidad" },
    { id: "p2", sku: "OTRO", barcode: "999", unit: "Unidad" },
    // Fila legada de servicio: no cuenta como existente.
    { id: "legacy", sku: "CORTE", barcode: null, unit: "Servicio" },
  ]);
  const matrix = [
    ["Nombre *", "Precio de venta *", "SKU", "Código de barras", "Unidad", "Stock inicial"],
    ["Gaseosa", "3.500", "GAS-400", "", "", "10"], // 2: actualiza p1 (SKU sin importar mayúsculas)
    ["Pan", "1200", "PAN-1", "", "Unidad", "2.5"], // 3: error, decimales en Unidad
    ["Queso", "18.000", "QUE-1", "", "kilo", "2,5"], // 4: crear (kg admite decimales)
    ["Queso 2", "18000", "que-1", "", "", ""], // 5: repetido con línea 4
    ["Mezcla", "100", "OTRO", "770", "", ""], // 6: SKU de p2 y código de p1
    ["", "", "", "", "", ""], // vacía: se ignora
    ["Corte", "20000", "CORTE", "", "Servicio", ""], // 8: servicio → error
    ["Sin precio", "", "", "", "", ""], // 9: error
  ];
  const preview = buildPreview(matrix, PRODUCT_IMPORT, existing, "update");
  const byLine = Object.fromEntries(preview.rows.map((r) => [r.line, r]));
  assert.equal(byLine[2].action, "update");
  assert.equal(byLine[2].existingId, "p1");
  assert.equal(byLine[3].action, "error");
  assert.match(byLine[3].errors[0], /decimales/);
  assert.equal(byLine[4].action, "create");
  assert.equal(byLine[4].record?.unit, "kg");
  assert.equal(byLine[4].record?.stock, 2.5);
  assert.equal(byLine[5].action, "error");
  assert.match(byLine[5].errors[0], /línea 4/);
  assert.equal(byLine[6].action, "error");
  assert.match(byLine[6].errors[0], /2 productos distintos/);
  assert.equal(byLine[7], undefined);
  assert.equal(byLine[8].action, "error");
  assert.match(byLine[8].errors[0], /servicios no se importan/);
  assert.equal(byLine[9].action, "error");
  assert.deepEqual(preview.counts, { create: 1, update: 1, skip: 0, error: 5 });

  const skipping = buildPreview(matrix, PRODUCT_IMPORT, existing, "skip");
  assert.equal(skipping.rows.find((r) => r.line === 2)?.action, "skip");
});

test("una fila de tipo Servicio (catálogo exportado) se rechaza", () => {
  const preview = buildPreview(
    [["Tipo", "Nombre", "Precio de venta"], ["Servicio", "Corte", "20000"], ["Producto", "Gel", "9000"]],
    PRODUCT_IMPORT,
    new Map(),
    "update",
  );
  assert.equal(preview.rows[0].action, "error");
  assert.equal(preview.rows[1].action, "create");
  assert.equal(parseUnit("servicios").isService, true);
});

test("el nombre se respeta tal como se escribió (sin MAYÚSCULAS)", () => {
  const preview = buildPreview([["Nombre", "Precio"], ["Gaseosa Postobón", "3500"]], PRODUCT_IMPORT, new Map(), "update");
  assert.equal(preview.rows[0].record?.name, "Gaseosa Postobón");
});

test("annotateProductPreview avisa categoría nueva, proveedor inexistente y stock de existentes", () => {
  const preview = buildPreview(
    [["Nombre", "Precio", "Categoría", "Proveedor", "SKU", "Stock inicial"], ["Gel", "9000", "Cuidado", "Nadie", "G1", "5"]],
    PRODUCT_IMPORT,
    new Map([["sku:G1", "p9"]]),
    "update",
  );
  const [row] = annotateProductPreview(preview.rows, ["BEBIDAS"], ["Distribuidora Sol"]);
  assert.ok(row.warnings.some((w) => w.includes("Categoría nueva")));
  assert.ok(row.warnings.some((w) => w.includes("no existe")));
  assert.ok(row.warnings.some((w) => w.includes("Movimientos")));
});

test("clientes: duplicado por documento normalizado, CC por defecto, cupo", () => {
  const existing = existingCustomerKeys([{ id: "c1", identification: "1.020.304" }]);
  const preview = buildPreview(
    [
      ["Nombre", "Documento", "Teléfono", "Cupo de crédito", "Correo"],
      ["Ana", "1020304", "300 123 4567", "200.000", ""],
      ["Beto", "555", "", "", "beto@"],
      ["Caro", "", "", "", ""],
    ],
    CUSTOMER_IMPORT,
    existing,
    "update",
  );
  assert.equal(preview.rows[0].action, "update");
  assert.equal(preview.rows[0].record?.credit_limit, 200000);
  assert.equal(preview.rows[0].record?.doc_type, "CC");
  assert.equal(preview.rows[1].action, "error");
  assert.equal(preview.rows[2].action, "create");
  assert.equal(preview.rows[2].record?.doc_type, null);
});

test("proveedores: NIT con DV pegado se separa y cuenta como el mismo documento", () => {
  assert.deepEqual(splitNit("900123456-7", null), { nit: "900123456", dv: "7" });
  assert.deepEqual(splitNit("900123456-7", "3"), { nit: "900123456-7", dv: "3" });
  const preview = buildPreview(
    [["Razón social", "NIT", "DV"], ["El Sol", "900.123.456-7", ""], ["Otro", "900123456", ""]],
    DISTRIBUTOR_IMPORT,
    new Map(),
    "update",
  );
  assert.equal(preview.rows[0].record?.dv, "7");
  assert.equal(preview.rows[0].record?.doc_type, "NIT");
  assert.equal(preview.rows[1].action, "error");
});

/* --------------------------------- lotes --------------------------------- */

test("runInBatches reintenta fila por fila el lote que falla y reporta la línea", async () => {
  const items = [1, 2, 3, 4, 5].map((n) => ({ line: n + 1, bad: n === 4 }));
  const batches: number[] = [];
  const res = await runInBatches(
    items,
    2,
    async (batch) => {
      batches.push(batch.length);
      if (batch.some((i) => i.bad)) throw new Error("lote");
    },
    async (item) => {
      if (item.bad) throw { code: "23505" };
    },
  );
  assert.deepEqual(batches, [2, 2, 1]);
  assert.equal(res.ok, 4);
  assert.deepEqual(res.failed.map((f) => f.line), [5]);
  assert.match(res.failed[0].message, /Ya existe/);
  assert.equal(errorMessage({ message: "x" }), "x");
});

/* -------------------------------- export --------------------------------- */

test("el export de clientes usa los encabezados de la plantilla (ida y vuelta)", () => {
  const rows = customersExportRows([
    { full_name: "Ana", doc_type: "CC", identification: "1", phone: null, email: null, credit_limit: 5000, tax_exempt: false, credit_balance: 0 },
  ]);
  const preview = buildPreview(rows.map((r) => r.map((c) => String(c))), CUSTOMER_IMPORT, new Map(), "update");
  assert.equal(preview.unknownColumns.join(), "Saldo por cobrar");
  assert.equal(preview.rows[0].action, "create");
  assert.equal(preview.rows[0].record?.credit_limit, 5000);
  assert.equal(exportFileName("clientes", "csv", new Date(2026, 9, 6)), "clientes-2026-10-06.csv");
});
