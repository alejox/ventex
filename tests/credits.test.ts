import test from "node:test";
import assert from "node:assert/strict";
import {
  creditStatusOf,
  creditLabelOf,
  creditAvailable,
  creditSummary,
  paymentAmountOf,
} from "../lib/credits";

test("1. Sin deuda no hay nada que cobrar", () => {
  assert.equal(creditStatusOf(0, null), "al_dia");
  assert.equal(creditStatusOf(0, 200000), "al_dia");
  // Un saldo negativo es plata a favor del cliente, no una deuda.
  assert.equal(creditStatusOf(-5000, 200000), "al_dia");
});

test("2. Deber sin cupo configurado es deber, y nada más", () => {
  // `credit_limit` null significa "no le puse tope", no "tope cero". Tratarlo
  // como excedido bloquearía a todo cliente al que nunca se le configuró uno.
  assert.equal(creditStatusOf(120000, null), "debe");
  assert.equal(creditStatusOf(9999999, null), "debe");
});

test("3. Cerca del cupo avisa ANTES de que el POS rechace la venta", () => {
  // El cajero se entera hoy cuando `create_sale` le tira el error en la cara,
  // con el cliente enfrente. El aviso vale antes.
  assert.equal(creditStatusOf(150000, 200000), "debe"); // 75%: todavía no
  assert.equal(creditStatusOf(160000, 200000), "cerca_del_cupo"); // 80%: sí
  assert.equal(creditStatusOf(199999, 200000), "cerca_del_cupo");
  assert.equal(creditStatusOf(100000, 200000), "debe"); // 50%
});

test("4. Alcanzar el cupo ya es no poder fiar más", () => {
  // create_sale rechaza cuando (saldo + total) > cupo. Con el cupo justo
  // clavado, cualquier venta nueva rebota: eso NO es "cerca", es lleno.
  assert.equal(creditStatusOf(200000, 200000), "excedido");
  assert.equal(creditStatusOf(240000, 200000), "excedido");
});

test("5. Cuánto más se le puede fiar", () => {
  assert.equal(creditAvailable(120000, 200000), 80000);
  assert.equal(creditAvailable(240000, 200000), 0);
  // Sin cupo configurado no hay número que devolver: null es "sin tope", que
  // no es lo mismo que 0 ni que Infinity.
  assert.equal(creditAvailable(120000, null), null);
});

test("6. La etiqueta dice el número, no solo el estado", () => {
  assert.equal(creditLabelOf(0, null), "Al día");
  assert.equal(creditLabelOf(120000, null), "Debe $120.000");
  assert.equal(creditLabelOf(240000, 200000), "Excedido $40.000 sobre el cupo");
});

test("7. El resumen de la cabecera sale de las mismas filas que la tabla", () => {
  // Un total calculado aparte del listado es un total que se puede contradecir
  // con él. Misma fuente, una sola pasada.
  const rows = [
    { credit_balance: 120000, credit_limit: 200000 },
    { credit_balance: 95000, credit_limit: null },
    { credit_balance: 0, credit_limit: 50000 },
    { credit_balance: 240000, credit_limit: 200000 },
  ];
  assert.deepEqual(creditSummary(rows), {
    totalPorCobrar: 455000,
    deudores: 3,
    excedidos: 1,
  });
});

test("8. El resumen de una cartera vacía es cero, no NaN", () => {
  assert.deepEqual(creditSummary([]), { totalPorCobrar: 0, deudores: 0, excedidos: 0 });
});

test("9. Un abono no puede superar la deuda", () => {
  // Cobrar $200.000 sobre una deuda de $120.000 es un error de tipeo, y el RPC
  // lo rechaza. Dejarlo pasar y recortarlo en silencio con greatest(...,0)
  // registra un abono que no coincide con la plata que bajó del saldo.
  assert.equal(paymentAmountOf("120000", 120000), 120000);
  assert.equal(paymentAmountOf("50000", 120000), 50000);
  assert.equal(paymentAmountOf("200000", 120000), null);
});

test("10. Un abono tiene que ser un monto de verdad", () => {
  assert.equal(paymentAmountOf("", 120000), null);
  assert.equal(paymentAmountOf("0", 120000), null);
  assert.equal(paymentAmountOf("-5000", 120000), null);
  assert.equal(paymentAmountOf("abc", 120000), null);
  // La coma es el separador decimal de quien cobra acá.
  assert.equal(paymentAmountOf("1500,50", 120000), 1500.5);
  // Los centavos se cortan donde los corta la base.
  assert.equal(paymentAmountOf("1500.555", 120000), 1500.56);
});
