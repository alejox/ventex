import test from "node:test";
import assert from "node:assert/strict";
import { shiftCloseReport, shiftCloseReportHtml, shiftMethodLabel } from "../lib/pos-shift-close";

const fmt = (n: number | null | undefined) => `$${Math.round(n ?? 0)}`;

const input = {
  businessName: "Barbería <Uno>",
  cashier: "Ana",
  openedAt: "2026-10-06T13:00:00Z",
  closedAt: "2026-10-06T22:00:00Z",
  openingCash: 100000,
  closingCash: 345000,
  expectedCash: 350000,
  difference: -5000,
  salesCount: 12,
  salesTotal: 420000,
  withdrawals: 20000,
  byMethod: { efectivo: 270000, credito: 50000, tarjeta: 100000 },
  notes: "Domicilio pagado en efectivo",
  denominations: [
    { label: "Billete $100000", count: 3, subtotal: 300000 },
    { label: "Billete $50000", count: 0, subtotal: 0 },
  ],
};

test("crédito / fiado tiene nombre propio", () => {
  assert.equal(shiftMethodLabel("credito"), "Crédito / Fiado");
  assert.equal(shiftMethodLabel("otro"), "otro");
});

test("el cierre trae ventas por medio, arqueo con diferencia y solo las denominaciones contadas", () => {
  const r = shiftCloseReport(input, fmt);
  assert.equal(r.title, "Cierre de turno");
  assert.ok(r.header.includes("Cajero: Ana"));
  const ventas = r.sections.find((s) => s.title === "Ventas")!;
  assert.deepEqual(ventas.rows.map((x) => x.label), ["Ventas del turno", "Efectivo", "Crédito / Fiado", "Datáfono"]);
  const arqueo = r.sections.find((s) => s.title === "Arqueo")!;
  assert.deepEqual(arqueo.rows.find((x) => x.label.startsWith("Diferencia")), {
    label: "Diferencia (faltante)",
    value: "$-5000",
    strong: true,
  });
  assert.ok(arqueo.rows.some((x) => x.label === "Retiros de caja"));
  const conteo = r.sections.find((s) => s.title === "Conteo por denominación")!;
  assert.deepEqual(conteo.rows, [{ label: "Billete $100000 × 3", value: "$300000" }]);
  assert.ok(r.footer[0].includes("Domicilio pagado en efectivo"));
});

test("sin contador ni retiros, esas filas no aparecen; caja cuadrada lo dice", () => {
  const r = shiftCloseReport({ ...input, withdrawals: 0, difference: 0, denominations: undefined, notes: null }, fmt);
  assert.equal(r.sections.length, 2);
  assert.ok(!r.sections[1].rows.some((x) => x.label === "Retiros de caja"));
  assert.ok(r.sections[1].rows.some((x) => x.label === "Diferencia (cuadra)"));
});

test("el HTML es de 80 mm y escapa lo que escribe el negocio", () => {
  const html = shiftCloseReportHtml(shiftCloseReport(input, fmt));
  assert.match(html, /size:80mm/);
  assert.ok(html.includes("Barbería &lt;Uno&gt;"));
  assert.ok(!html.includes("<Uno>"));
});
