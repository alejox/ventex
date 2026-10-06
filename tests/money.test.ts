import test from "node:test";
import assert from "node:assert/strict";
import { formatCOP, formatMoney } from "../lib/money";
import { formatMoney as formatMoneyFromPlans } from "../config/plans";

/** Espacio no separable: va entre el signo y el número para que no se partan. */
const NBSP = " ";

test("1. Pesos colombianos: punto de miles, sin decimales, espacio no separable", () => {
  assert.equal(formatMoney(45000), `$${NBSP}45.000`);
  assert.equal(formatMoney(1234567), `$${NBSP}1.234.567`);
  assert.equal(formatMoney(999), `$${NBSP}999`);
});

test("2. Los centavos se redondean: el mostrador no cobra fracciones de peso", () => {
  assert.equal(formatMoney(45000.4), `$${NBSP}45.000`);
  assert.equal(formatMoney(45000.5), `$${NBSP}45.001`);
  assert.equal(formatMoney(3333.33), `$${NBSP}3.333`);
});

test("3. Cero se muestra como cero, nunca como '-$ 0'", () => {
  assert.equal(formatMoney(0), `$${NBSP}0`);
  assert.equal(formatMoney(-0), `$${NBSP}0`);
  assert.equal(formatMoney(-0.4), `$${NBSP}0`);
});

test("4. Negativos llevan el signo adelante del símbolo", () => {
  assert.equal(formatMoney(-1500), `-$${NBSP}1.500`);
  assert.equal(formatMoney(-45000), `-$${NBSP}45.000`);
});

test("5. null, undefined y NaN se muestran como cero en vez de reventar", () => {
  assert.equal(formatMoney(null), `$${NBSP}0`);
  assert.equal(formatMoney(undefined), `$${NBSP}0`);
  assert.equal(formatMoney(Number.NaN), `$${NBSP}0`);
  assert.equal(formatMoney(Number.POSITIVE_INFINITY), `$${NBSP}0`);
});

test("6. Otra moneda usa su propio símbolo, con el mismo formato colombiano", () => {
  assert.equal(formatMoney(45000, "USD"), `US$${NBSP}45.000`);
  // Una moneda vacía no rompe: cae a COP.
  assert.equal(formatMoney(45000, ""), `$${NBSP}45.000`);
});

test("7. formatCOP y el reexport de config/plans son el mismo formato", () => {
  assert.equal(formatCOP(45000), formatMoney(45000));
  assert.equal(formatMoneyFromPlans(45000), formatMoney(45000));
});
