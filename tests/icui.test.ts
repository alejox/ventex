import test from "node:test";
import assert from "node:assert/strict";
import { ICUI_RATE, ICUI_LABEL, icuiRateFor, icuiAmountFor } from "../lib/icui";

test("la tasa ICUI es la vigente (20 %) y el rótulo la refleja", () => {
  assert.equal(ICUI_RATE, 0.2);
  assert.equal(ICUI_LABEL, "ICUI 20%");
});

test("icuiRateFor conserva la tasa guardada al editar y 'Ninguno' la apaga", () => {
  // Compra guardada con ICUI: sigue con su tasa aunque la vigente cambie.
  assert.equal(icuiRateFor("ICUI", 0.15), 0.15);
  // Pasar a "Ninguno" es explícito.
  assert.equal(icuiRateFor("Ninguno", 0.2), 0);
  // Compra sin ICUI a la que se le activa: toma la vigente.
  assert.equal(icuiRateFor("ICUI", 0), ICUI_RATE);
  // Alta: la vigente.
  assert.equal(icuiRateFor("ICUI", undefined), ICUI_RATE);
});

test("icuiAmountFor calcula en centavos sobre la base marcada", () => {
  assert.equal(icuiAmountFor(100000, 0.2), 20000);
  assert.equal(icuiAmountFor(0, 0.2), 0);
  // Sin tasa no hay monto.
  assert.equal(icuiAmountFor(100000, 0), 0);
  // Una base negativa (no debería pasar) no descuenta.
  assert.equal(icuiAmountFor(-50, 0.2), 0);
});

test("redondea a centavos como la base", () => {
  assert.equal(icuiAmountFor(33.33, 0.2), 6.67);
  assert.equal(icuiAmountFor(10.005, 0.2), 2);
});
