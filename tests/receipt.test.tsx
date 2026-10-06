import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { buildReceiptFromCart, buildReceiptFromSale, paymentLabelFor } from "../lib/receipt";
import { PosReceipt } from "../components/PosReceipt";
import { linePrice, computeTotals } from "../services/pos.service";
import type { CartLine, CatalogItem } from "../services/pos.service";
import type { SaleDetail, SaleReceiptExtras } from "../services/sales.service";
Object.assign(globalThis, { React });

const item: CatalogItem = {
  id: "p1",
  kind: "product",
  name: "Gaseosa",
  sku: "GAS-1",
  barcode: null,
  price: 3000,
  package_price: 30000,
  units_per_package: 12,
  stock_level: 50,
  open_price: false,
  allows_fractions: false,
  category_name: null,
  category_id: null,
  image_url: null,
  has_commission: false,
  commission_type: null,
  commission_value: null,
};

const base = {
  customer: null,
  transferMethod: null,
  cardMethod: null,
  business: { businessName: "Tienda Uno" },
  includeTax: false,
  date: new Date("2026-10-06T15:00:00Z"),
  saleId: "sale-1",
  saleNumber: null,
  queued: false,
  priceOf: linePrice,
};

test("el total de cada ítem lleva su descuento aplicado (antes salía precio × cantidad)", () => {
  const cart: CartLine[] = [
    { item, quantity: 2, discountAmount: 1000, offerId: "o1", offerName: "2x1 gaseosa" },
    { item, unitKind: "package", quantity: 1 },
  ];
  const r = buildReceiptFromCart({
    ...base,
    cart,
    totals: computeTotals(cart, 0.19, false, false),
    paymentMethod: "efectivo",
    splits: [],
    tendered: 50000,
    change: 15000,
    cashier: "Ana",
    seller: "Luis",
  });
  assert.equal(r.items[0].gross, 6000);
  assert.equal(r.items[0].discount, 1000);
  assert.equal(r.items[0].total, 5000);
  assert.equal(r.items[0].discountLabel, "2x1 gaseosa");
  assert.equal(r.items[1].total, 30000);
  assert.equal(r.items[1].packageLabel, "Caja x12 u.");
  // Los ítems suman exactamente el total cobrado.
  assert.equal(r.items.reduce((s, i) => s + i.total, 0), r.totals.total);
  assert.equal(r.tendered, 50000);
  assert.equal(r.change, 15000);
  assert.equal(r.cashier, "Ana");
  assert.equal(r.seller, "Luis");
  assert.equal(r.paymentLabel, "Efectivo");
});

test("un pago dividido lista cada medio y no imprime recibido/cambio", () => {
  const cart: CartLine[] = [{ item, quantity: 1 }];
  const r = buildReceiptFromCart({
    ...base,
    cart,
    totals: computeTotals(cart, 0.19, false, false),
    paymentMethod: "efectivo",
    splits: [
      { payment_method: "efectivo", amount: 1000 },
      { payment_method: "transferencia", amount: 2000, transfer_method: "nequi" },
    ],
    tendered: 5000,
    change: 4000,
    cashier: null,
    seller: null,
  });
  assert.equal(r.paymentLabel, "Pago dividido");
  assert.deepEqual(
    r.payments.map((p) => p.amount),
    [1000, 2000],
  );
  assert.match(r.payments[1].label, /^Transferencia \(/);
  assert.equal(r.tendered, null);
  assert.equal(r.change, 0);
});

test("el vendedor no se repite si es quien cobró", () => {
  const cart: CartLine[] = [{ item, quantity: 1 }];
  const r = buildReceiptFromCart({
    ...base,
    cart,
    totals: computeTotals(cart, 0.19, false, false),
    paymentMethod: "tarjeta",
    splits: [],
    tendered: null,
    change: 0,
    cashier: "Ana Pérez",
    seller: "ana pérez",
  });
  assert.equal(r.seller, null);
});

test("paymentLabelFor traduce el método y el canal", () => {
  assert.equal(paymentLabelFor("efectivo"), "Efectivo");
  assert.equal(paymentLabelFor("credito"), "Crédito / Fiado");
  assert.equal(paymentLabelFor("tarjeta", null, null), "Datáfono");
});

const sale: SaleDetail = {
  id: "sale-9",
  sale_number: 42,
  created_at: "2026-10-06T15:00:00Z",
  customer_name: "Marta",
  staff_name: "Luis",
  payment_method: "efectivo",
  transfer_method: null,
  card_method: null,
  status: "completed",
  subtotal: 8403.36,
  discount_amount: 2000,
  tax_rate: 0.19,
  tax_amount: 1596.64,
  total: 10000,
  items: [
    {
      id: "l1",
      product_name: "Gaseosa",
      sku: "GAS-1",
      unit_price: 3000,
      quantity: 4,
      line_total: 12000,
      unit_kind: "unit",
      units_per_item: 1,
      staff_name: null,
      commission_amount: 0,
      commission_settlement_id: null,
    },
  ],
};

test("la reimpresión de una venta guardada trae número, cliente con documento y pagos", () => {
  const extras: SaleReceiptExtras = {
    saleNumber: 42,
    customer: { full_name: "Marta", doc_type: "CC", identification: "123" },
    payments: [
      { payment_method: "efectivo", amount: 4000, transfer_method: null, card_method: null },
      { payment_method: "tarjeta", amount: 6000, transfer_method: null, card_method: null },
    ],
  };
  const r = buildReceiptFromSale({ sale, extras, business: {}, includeTax: false });
  assert.equal(r.saleNumber, 42);
  assert.equal(r.customer?.identification, "123");
  assert.equal(r.payments.length, 2);
  assert.equal(r.totals.gross, 12000);
  assert.equal(r.totals.discount, 2000);
  assert.equal(r.totals.total, 10000);
  // Con IVA cobrado se desglosa aunque el negocio hoy no lo tenga encendido.
  assert.equal(r.includeTax, true);
  assert.equal(r.totals.exemptionDiscount, 0);
  assert.equal(r.seller, "Luis");
  // Lo que la base no guarda no se inventa.
  assert.equal(r.tendered, null);
});

test("un solo pago no se lista como dividido", () => {
  const extras: SaleReceiptExtras = {
    saleNumber: 42,
    customer: null,
    payments: [{ payment_method: "efectivo", amount: 10000, transfer_method: null, card_method: null }],
  };
  const r = buildReceiptFromSale({ sale, extras, business: {}, includeTax: true });
  assert.equal(r.payments.length, 0);
  assert.equal(r.paymentLabel, "Efectivo");
  // Sin documento en los extras, cae al nombre que trae el detalle.
  assert.equal(r.customer?.full_name, "Marta");
});

test("el recibo impreso muestra número de venta, cajero, recibido y cambio", () => {
  const cart: CartLine[] = [{ item, quantity: 2, discountAmount: 500 }];
  const data = buildReceiptFromCart({
    ...base,
    saleNumber: 77,
    cart,
    totals: computeTotals(cart, 0.19, false, false),
    paymentMethod: "efectivo",
    splits: [],
    tendered: 10000,
    change: 4500,
    cashier: "Ana",
    seller: null,
  });
  const html = renderToStaticMarkup(<PosReceipt data={data} />);
  assert.match(html, /Venta N\.º 77/);
  assert.match(html, /Cajero:/);
  assert.match(html, /Recibido:/);
  assert.match(html, /Cambio:/);
  assert.match(html, /4\.500/);
});

test("una venta encolada sin conexión no inventa número", () => {
  const cart: CartLine[] = [{ item, quantity: 1 }];
  const data = buildReceiptFromCart({
    ...base,
    saleId: null,
    queued: true,
    cart,
    totals: computeTotals(cart, 0.19, false, false),
    paymentMethod: "efectivo",
    splits: [],
    tendered: null,
    change: 0,
    cashier: null,
    seller: null,
  });
  const html = renderToStaticMarkup(<PosReceipt data={data} />);
  assert.doesNotMatch(html, /Venta N\.º/);
  assert.match(html, /Pendiente de env/);
});
