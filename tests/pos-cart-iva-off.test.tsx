import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PosCartPanel } from "../app/dashboard/pos/components/PosCartPanel";
Object.assign(globalThis, { React });

const noop = () => {};
const exemptCustomer = {
  id: "c1", full_name: "Marta", doc_type: "CC", identification: "123", tax_exempt: true,
} as React.ComponentProps<typeof PosCartPanel>["customers"][number];

const props: React.ComponentProps<typeof PosCartPanel> = {
  cart: [{ item: { id: "service", name: "Corte", kind: "service", price: 100, stock_level: null, sku: null, barcode: null, package_price: null, units_per_package: 1, open_price: false, allows_fractions: false, category_name: null, category_id: null, image_url: null, has_commission: false, commission_type: null, commission_value: null }, quantity: 1 }],
  totals: { total: 100, gross: 100, subtotal: 100, taxAmount: 0, discount: 0, exemptionDiscount: 0 },
  customers: [exemptCustomer], staff: [], paymentMethod: "efectivo", paymentOptions: [],
  customerId: "c1", staffId: null, taxRate: 0.19, includeTax: false,
  submitting: false, isTaxExempt: true, cartUnits: 1, isCartOpen: true,
  salesBlocked: false, allowOversell: true, transferMethod: null, cardMethod: null,
  transferMethodsEnabled: [], cardMethodsEnabled: [], asksCardMethod: false, asksTransferMethod: false,
  splitsCount: 0, isDelivery: false, requireShift: (action) => action(),
  setPaymentMethod: noop, setCustomer: noop, setStaff: noop, setTransferMethod: noop,
  setCardMethod: noop, setIsCartOpen: noop, setLineKind: noop, setLineStaff: noop,
  setLinePrice: noop, increment: noop, decrement: noop, setQuantity: noop,
  removeFromCart: noop, removeOffer: noop, clearCart: noop, onCheckout: noop,
  onOpenDiscountModal: noop, onOpenSaleConfigModal: noop, onOpenRecentSalesModal: noop,
  onOpenCustomerModal: noop, setDelivery: noop,
};

test("sin IVA el carrito no marca al cliente como exento ni habla de IVA", () => {
  const html = renderToStaticMarkup(<PosCartPanel {...props} />);
  assert.doesNotMatch(html, /exento/i);
  assert.doesNotMatch(html, /IVA/);
});

test("con IVA el cliente exento se sigue marcando", () => {
  const html = renderToStaticMarkup(<PosCartPanel {...props} includeTax />);
  assert.match(html, /\(exento\)/);
});
