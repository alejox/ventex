import test from "node:test";
import assert from "node:assert/strict";
import { saleTaxTotals, taxSummaryRows, saleTaxLabel, formatTaxRate } from "../lib/sale-tax";
import { computeTotals } from "../services/pos.service";
import type { CartLine, CatalogItem } from "../services/pos.service";
import { productPriceMultipliers, effectiveProductTaxRate, productTaxLabel } from "../lib/product-tax";

// Espejo de `create_sale` (20261024200000_sale_line_tax_rate.sql). Los números
// del caso real son los mismos que verifica
// supabase/manual-tests/20261024200000_sale_line_tax_rate.rollback.sql.

const item = (id: string, price: number, tax_rate: number | null, kind: "product" | "service" = "product"): CatalogItem => ({
  id,
  kind,
  name: id,
  sku: null,
  barcode: null,
  price,
  package_price: null,
  units_per_package: 1,
  stock_level: null,
  open_price: false,
  allows_fractions: false,
  category_name: null,
  category_id: null,
  image_url: null,
  has_commission: false,
  commission_type: null,
  commission_value: null,
  tax_rate,
});

const line = (it: CatalogItem, quantity: number, discountAmount = 0): CartLine => ({ item: it, quantity, discountAmount });

const ping = item("ping", 2338, null); // hereda 19 % del negocio
const pan = item("pan", 5667, 0); // exento
const tost = item("tost", 3083, 0); // exento
const realCart = [line(ping, 3), line(pan, 3), line(tost, 4)];

test("caso real: IVA solo sobre los Pingüinos", () => {
  const t = computeTotals(realCart, 0.19, false, true);
  assert.equal(t.gross, 36347);
  assert.equal(t.total, 36347);
  assert.equal(t.taxAmount, 1119.88); // 7014 − round(7014/1,19, 2) = 7014 − 5894.12
  assert.equal(t.subtotal, 35227.12);
  assert.deepEqual(t.taxBreakdown, [
    { rate: 0.19, base: 5894.12, tax: 1119.88 },
    { rate: 0, base: 29333, tax: 0 },
  ]);
});

test("cliente exento: solo se le quita el IVA que cada línea tenía", () => {
  const t = computeTotals(realCart, 0.19, true, true);
  assert.equal(t.total, 35227.12); // 29333 + 5894.12
  assert.equal(t.taxAmount, 0);
  assert.equal(t.exemptionDiscount, 1119.88);
  // Antes: round(36347/1,19) = 30543.70 → se le descontaba un 19 % al pan.
  assert.notEqual(t.total, Math.round((36347 / 1.19) * 100) / 100);
});

test("negocio sin IVA: igual que siempre", () => {
  const t = computeTotals(realCart, 0.19, true, false);
  assert.equal(t.total, 36347);
  assert.equal(t.taxAmount, 0);
  assert.equal(t.exemptionDiscount, 0);
  assert.deepEqual(t.taxBreakdown, []);
});

test("una sola tasa: exactamente la cuenta vieja sobre el neto", () => {
  // Precios y descuentos que dan fracciones de centavo por línea: redondear por
  // línea movería centavos; por grupo, no.
  const a = item("a", 1999.99, null);
  const b = item("b", 3333.33, 0.19); // tasa propia = la del negocio: mismo grupo
  const svc = item("svc", 25000, null, "service");
  for (const [cart, disc] of [
    [[line(a, 3), line(b, 2)], 0],
    [[line(a, 1, 111.11), line(b, 1, 222.22), line(svc, 1, 0.01)], 333.34],
    [[line(a, 7), line(svc, 2, 1000)], 1000],
  ] as [CartLine[], number][]) {
    const t = computeTotals(cart, 0.19, false, true);
    const neto = Math.round((t.gross - disc) * 100) / 100;
    assert.equal(t.total, neto);
    assert.equal(t.subtotal, Math.round((neto / 1.19) * 100) / 100);
    const exempt = computeTotals(cart, 0.19, true, true);
    assert.equal(exempt.total, Math.round((neto / 1.19) * 100) / 100);
  }
});

test("todo exento: sin IVA y el cliente exento paga lo mismo", () => {
  const cart = [line(pan, 2), line(tost, 1)];
  assert.equal(computeTotals(cart, 0.19, false, true).taxAmount, 0);
  assert.equal(computeTotals(cart, 0.19, true, true).total, 2 * 5667 + 3083);
});

test("servicio: siempre la tasa del negocio", () => {
  const svc = item("svc", 11900, 0, "service"); // un tax_rate en un servicio no se usa
  const t = computeTotals([line(svc, 1)], 0.19, false, true);
  assert.equal(t.taxAmount, 1900);
});

test("sin desglose por línea: prorrateo por bruto, igual que la base", () => {
  // Caso D de la prueba rollback: descuento 1000 sin `discount_amount`.
  const r = saleTaxTotals(
    [
      { grossCents: 701400, rate: 0.19 },
      { grossCents: 1700100, rate: 0 },
      { grossCents: 1233200, rate: 0 },
    ],
    null,
    100000,
    0.19,
    false,
    true,
  );
  assert.equal(r.totalCents, 3534700);
  assert.equal(r.subtotalCents, 3425793); // round(6821.03/1,19)=5731.96 + 28525.97
  assert.equal(r.taxCents, 108907);
});

test("residuo de centavos a la línea de mayor neto", () => {
  // 3 líneas de 1,00 con 1,00 de descuento: 0,33 c/u → Σ 2,01 ≠ neto 2,00;
  // el centavo va a la primera de las de mayor neto (empate → la primera).
  const r = saleTaxTotals(
    [
      { grossCents: 100, rate: 0.19 },
      { grossCents: 100, rate: 0 },
      { grossCents: 100, rate: 0 },
    ],
    null,
    100,
    0.19,
    false,
    true,
  );
  assert.equal(r.netCents, 200);
  const g19 = r.groups.find((g) => g.rate === 0.19)!;
  assert.equal(g19.netCents, 66); // 67 − 1
  assert.equal(r.groups.reduce((s, g) => s + g.netCents, 0), 200);
});

test("redondeo mitad hacia arriba como round(numeric)", () => {
  // 119 / 1,19 = 100 exacto; 1,785 → base 1,50 (1,785/1,19 = 1,5)
  const r = saleTaxTotals([{ grossCents: 11900, rate: 0.19 }], [0], 0, 0.19, false, true);
  assert.equal(r.subtotalCents, 10000);
});

test("filas de IVA del resumen", () => {
  assert.deepEqual(taxSummaryRows(undefined, 0.19, 1900), [{ label: "IVA (19 %)", amount: 1900 }]);
  assert.deepEqual(taxSummaryRows([{ rate: 0.05, base: 100, tax: 5 }], 0.19, 5), [{ label: "IVA (5 %)", amount: 5 }]);
  assert.deepEqual(
    taxSummaryRows([{ rate: 0.19, base: 5894.12, tax: 1119.88 }, { rate: 0, base: 29333, tax: 0 }], 0.19, 1119.88),
    [
      { label: "IVA 19 %", amount: 1119.88 },
      { label: "Exento de IVA (base)", amount: 29333 },
    ],
  );
  assert.equal(formatTaxRate(0.165), "16,5 %");
});

test("etiqueta del IVA en el detalle de una venta guardada", () => {
  assert.equal(saleTaxLabel(0.19, [null, null]), "Impuesto (19%)"); // legada
  assert.equal(saleTaxLabel(0.19, [0.19, 0.19]), "Impuesto (19%)");
  assert.equal(saleTaxLabel(0.19, [0.19, 0]), "Impuesto (varias tasas)");
  assert.equal(saleTaxLabel(0.19, [0, 0]), "Impuesto (0%)");
  assert.equal(saleTaxLabel(0, [0, 0]), "Impuesto (0%)"); // cliente exento
});

test("ficha de producto: la calculadora usa el IVA persistido", () => {
  assert.equal(effectiveProductTaxRate(null, 0.19), 0.19);
  assert.equal(effectiveProductTaxRate(0, 0.19), 0);
  assert.deepEqual(productPriceMultipliers({ includeTax: true, businessRate: 0.19, productRate: null }), { purchase: 1.19, selling: 1.19 });
  assert.deepEqual(productPriceMultipliers({ includeTax: true, businessRate: 0.19, productRate: 0 }), { purchase: 1, selling: 1 });
  assert.deepEqual(productPriceMultipliers({ includeTax: true, businessRate: 0.19, productRate: 0.05 }), { purchase: 1.05, selling: 1.05 });
  assert.deepEqual(productPriceMultipliers({ includeTax: false, businessRate: 0.19, productRate: 0.05 }), { purchase: 1, selling: 1 });
  assert.equal(productTaxLabel(0.19), "IVA 19 %");
  assert.equal(productTaxLabel(0), "Exento de IVA");
});
