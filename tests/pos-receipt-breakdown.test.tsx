import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { buildReceiptFromCart } from "../lib/receipt";
import { PosReceipt } from "../components/PosReceipt";
import { linePrice, computeTotals } from "../services/pos.service";
import type { CartLine, CatalogItem } from "../services/pos.service";
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

const cart: CartLine[] = [
  { item, quantity: 2, discountAmount: 1000, offerId: "o1", offerName: "2x1 gaseosa" },
  { item, unitKind: "package", quantity: 1, discountAmount: 3000, manualDiscount: 3000 },
];

const input = {
  cart,
  totals: computeTotals(cart, 0.19, false, false),
  customer: null,
  paymentMethod: "efectivo" as const,
  transferMethod: null,
  cardMethod: null,
  splits: [],
  tendered: null,
  change: 0,
  cashier: null,
  seller: null,
  business: { businessName: "Tienda Uno" },
  includeTax: false,
  date: new Date("2026-10-06T15:00:00Z"),
  saleId: "sale-1",
  saleNumber: null,
  queued: false,
  priceOf: linePrice,
};

test("el recibo trae el desglose del descuento por origen (C12) y lo imprime", () => {
  const r = buildReceiptFromCart({
    ...input,
    discountBreakdown: [
      { label: "Ofertas: 2x1 gaseosa", amount: 1000 },
      { label: "Descuento manual", amount: 3000 },
      { label: "Puntos", amount: 0 },
    ],
  });
  assert.deepEqual(r.discountBreakdown, [
    { label: "Ofertas: 2x1 gaseosa", amount: 1000 },
    { label: "Descuento manual", amount: 3000 },
  ]);
  const html = renderToStaticMarkup(React.createElement(PosReceipt, { data: r }));
  assert.ok(html.includes("Ofertas: 2x1 gaseosa"));
  assert.ok(html.includes("Descuento manual"));
});

test("sin desglose el recibo queda como siempre (campo ausente)", () => {
  const r = buildReceiptFromCart(input);
  assert.equal("discountBreakdown" in r, false);
});
