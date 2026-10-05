import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PosCartPanel } from "../app/dashboard/pos/components/PosCartPanel";
Object.assign(globalThis, { React });

const noop = () => {};
const props: React.ComponentProps<typeof PosCartPanel> = {
  cart: [{ item: { id: "service", name: "Corte", kind: "service", price: 100, stock_level: null, sku: null, barcode: null, package_price: null, units_per_package: 1, open_price: false, allows_fractions: false, category_name: null, category_id: null, image_url: null, has_commission: false, commission_type: null, commission_value: null }, quantity: 1 }],
  totals: { total: 100, gross: 100, subtotal: 100, taxAmount: 0, discount: 0, exemptionDiscount: 0 },
  customers: [], staff: [], paymentMethod: "efectivo", paymentOptions: [],
  customerId: null, staffId: null, taxRate: 0, includeTax: false,
  submitting: false, isTaxExempt: false, cartUnits: 1, isCartOpen: true,
  salesBlocked: false, allowOversell: true, transferMethod: null, cardMethod: null,
  transferMethodsEnabled: [], cardMethodsEnabled: [], asksCardMethod: false, asksTransferMethod: false,
  splitsCount: 0, isDelivery: false, requireShift: (action) => action(),
  setPaymentMethod: noop,
  setCustomer: noop,
  setStaff: noop,
  setTransferMethod: noop,
  setCardMethod: noop,
  setIsCartOpen: noop,
  setLineKind: noop,
  setLineStaff: noop,
  setLinePrice: noop,
  increment: noop,
  decrement: noop,
  setQuantity: noop,
  removeFromCart: noop,
  removeOffer: noop,
  clearCart: noop,
  onCheckout: noop,
  onOpenDiscountModal: noop,
  onOpenSaleConfigModal: noop,
  onOpenRecentSalesModal: noop,
  onOpenCustomerModal: noop,
  setDelivery: noop,
};

for (const blocked of [true, false]) {
  test(`Vender con un carrito listo queda ${blocked ? "deshabilitado" : "habilitado"} según el turno`, () => {
    const html = renderToStaticMarkup(<PosCartPanel {...props} salesBlocked={blocked} />);
    const sellButton = html.match(/<button\b[^>]*>(?:(?!<\/button>)[\s\S])*?<span>Vender<\/span>(?:(?!<\/button>)[\s\S])*?<\/button>/)?.[0];
    assert.ok(sellButton, "El botón Vender debe seguir visible");
    assert.equal(sellButton.includes('disabled=""'), blocked);
    if (blocked) assert.ok(sellButton.includes("Abre tu turno para vender"));
  });
}
