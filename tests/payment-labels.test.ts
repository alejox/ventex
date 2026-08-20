import test from "node:test";
import assert from "node:assert/strict";
import { paymentMethodLabel } from "../config/plans";

/**
 * Los códigos son los que devuelve `GET /client/payment/methods` de la cuenta
 * real de ePayco, no los que uno supondría. El mapa anterior tenía los de la
 * pasarela anterior (`CREDIT_CARD`, `WALLET`), así que un cobro real con Visa
 * le mostraba "VS" al dueño en la pantalla de suscripción.
 */

test("1. Los códigos de ePayco se traducen a nombres legibles", () => {
  assert.equal(paymentMethodLabel("VS"), "Tarjeta Visa");
  assert.equal(paymentMethodLabel("MC"), "Tarjeta Mastercard");
  assert.equal(paymentMethodLabel("PSE"), "PSE");
  assert.equal(paymentMethodLabel("DP"), "Daviplata");
  assert.equal(paymentMethodLabel("EF"), "Efectivo (Efecty)");
});

test("2. Un código desconocido se muestra tal cual, no vacío", () => {
  // Preferible que el dueño vea un código raro a que vea un guion y no sepa
  // con qué le pagaron.
  assert.equal(paymentMethodLabel("XYZ"), "XYZ");
});

test("3. Sin medio informado se muestra un guion", () => {
  assert.equal(paymentMethodLabel(null), "—");
  assert.equal(paymentMethodLabel(undefined), "—");
  assert.equal(paymentMethodLabel(""), "—");
});
