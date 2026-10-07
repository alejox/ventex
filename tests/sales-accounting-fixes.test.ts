import { test } from "node:test";
import assert from "node:assert/strict";
import { parseVoidSaleResult } from "@/services/sales.service";
import { isBusinessRejection, toMessage } from "@/lib/errors";

// ---- void_sale: respuesta ----

test("void_sale nuevo: lee el efectivo y el aviso de devolución sin caja", () => {
  assert.deepEqual(
    parseVoidSaleResult({ cash_refund: 5000, cash_refund_shift_id: null, cash_refund_unrecorded: true }),
    { cashRefund: 5000, cashRefundUnrecorded: true },
  );
  assert.deepEqual(
    parseVoidSaleResult({ cash_refund: "12000.50", cash_refund_shift_id: "s1", cash_refund_unrecorded: false }),
    { cashRefund: 12000.5, cashRefundUnrecorded: false },
  );
});

test("void_sale viejo (returns void → null): no hay nada que avisar", () => {
  assert.deepEqual(parseVoidSaleResult(null), { cashRefund: 0, cashRefundUnrecorded: false });
  assert.deepEqual(parseVoidSaleResult(undefined), { cashRefund: 0, cashRefundUnrecorded: false });
  assert.deepEqual(parseVoidSaleResult(""), { cashRefund: 0, cashRefundUnrecorded: false });
});

test("solo un true explícito dispara el aviso (no un string ni un número)", () => {
  assert.equal(parseVoidSaleResult({ cash_refund_unrecorded: "true" }).cashRefundUnrecorded, false);
  assert.equal(parseVoidSaleResult({ cash_refund_unrecorded: 1 }).cashRefundUnrecorded, false);
  assert.equal(parseVoidSaleResult({ cash_refund: "x" }).cashRefund, 0);
});

// ---- Mensajes de los errores nuevos ----

test("DESCUENTO_NO_JUSTIFICADO llega en español, con tuteo y sin el código", () => {
  const e = {
    code: "42501",
    message: "DESCUENTO_NO_JUSTIFICADO: el descuento ($5000.00) supera lo que justifican las ofertas, el premio y los puntos del cliente ($0.00)",
  };
  const msg = toMessage(e);
  assert.match(msg, /no tienes permiso para descuentos manuales/);
  assert.doesNotMatch(msg, /DESCUENTO_NO_JUSTIFICADO/);
  // Rechazo definitivo: una venta encolada con esto va a conflictos, no se reintenta.
  assert.equal(isBusinessRejection(e), true);
});

test("CLIENTE_NO_ENCONTRADO llega en español", () => {
  const msg = toMessage({ code: "P0001", message: "CLIENTE_NO_ENCONTRADO: el cliente de la venta no existe en este negocio" });
  assert.match(msg, /El cliente de la venta ya no existe/);
  assert.doesNotMatch(msg, /CLIENTE_NO_ENCONTRADO/);
});

test("CREDITO_YA_ABONADO explica por qué no se anula el fiado", () => {
  const msg = toMessage({ code: "P0001", message: "CREDITO_YA_ABONADO: la venta fió $5000.00 pero el cliente solo debe $2000.00" });
  assert.match(msg, /ya abonó parte o todo este fiado/);
  assert.doesNotMatch(msg, /CREDITO_YA_ABONADO/);
});

test("SIN_PERMISO_DESCUENTO sigue con su propio mensaje", () => {
  const msg = toMessage({ code: "42501", message: "SIN_PERMISO_DESCUENTO" });
  assert.match(msg, /No tienes permiso para aplicar descuentos manuales/);
});
