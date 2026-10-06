import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SuccessModal } from "../app/dashboard/pos/components/SuccessModal";
import { CheckoutModal } from "../app/dashboard/pos/components/CheckoutModal";
Object.assign(globalThis, { React });

const noop = () => {};

test("el modal de éxito muestra total, recibido y el cambio a entregar", () => {
  const html = renderToStaticMarkup(
    <SuccessModal onPrint={noop} onClose={noop} total={45000} tendered={50000} change={5000} />,
  );
  assert.match(html, /Total/);
  assert.match(html, /Recibido/);
  assert.match(html, /Entregar cambio/);
  assert.match(html, /5\.000/);
});

test("sin cambio no aparece el bloque de entregar cambio", () => {
  const html = renderToStaticMarkup(
    <SuccessModal onPrint={noop} onClose={noop} total={45000} tendered={null} change={0} />,
  );
  assert.match(html, /Total/);
  assert.doesNotMatch(html, /Entregar cambio/);
  assert.doesNotMatch(html, /Recibido/);
});

test("el modal de cobro muestra el motivo cuando el cobro falla", () => {
  const html = renderToStaticMarkup(
    <CheckoutModal
      totals={{ total: 100, gross: 100, subtotal: 100, taxAmount: 0, discount: 0, exemptionDiscount: 0 }}
      cart={[]}
      paymentMethod="tarjeta"
      setPaymentMethod={noop}
      transferMethod={null}
      cardMethod={null}
      setTransferMethod={noop}
      setCardMethod={noop}
      paymentOptions={[]}
      splits={[]}
      addSplit={noop}
      removeSplit={noop}
      updateSplitAmount={noop}
      updateSplitMethod={noop}
      transferMethodsEnabled={[]}
      cardMethodsEnabled={[]}
      asksCardMethod={false}
      asksTransferMethod={false}
      submitting={false}
      amountTendered=""
      setAmountTendered={noop}
      error="Stock insuficiente para Sample product"
      onConfirm={noop}
      onClose={noop}
    />,
  );
  assert.match(html, /role="alert"/);
  assert.match(html, /No se pudo cobrar/);
  assert.match(html, /Stock insuficiente para Sample product/);
});
