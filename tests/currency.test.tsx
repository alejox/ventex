import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DEFAULT_CURRENCY, formatMoney, moneyFormatter, normalizeCurrency } from "../lib/money";
import { selectCurrency, useCurrency, useFormatMoney } from "../lib/useMoney";
import { creditLabelOf, renderStatementMessage } from "../lib/credits";
Object.assign(globalThis, { React });

/** Espacio no separable entre el signo y el número (ver lib/money.ts). */
const NBSP = " ";

test("1. normalizeCurrency: código válido en mayúsculas, cualquier otra cosa cae a COP", () => {
  assert.equal(normalizeCurrency("USD"), "USD");
  assert.equal(normalizeCurrency(" usd "), "USD");
  assert.equal(normalizeCurrency(null), DEFAULT_CURRENCY);
  assert.equal(normalizeCurrency(undefined), "COP");
  assert.equal(normalizeCurrency(""), "COP");
  assert.equal(normalizeCurrency("pesos"), "COP");
  assert.equal(normalizeCurrency("U$D"), "COP");
});

test("2. formatMoney respeta la moneda pedida y no revienta con una inválida", () => {
  assert.equal(formatMoney(45000), `$${NBSP}45.000`);
  assert.equal(formatMoney(45000, "COP"), `$${NBSP}45.000`);
  // es-CO marca las monedas que no son la local ("US$ 10", "EUR 10"): nunca
  // se confunden con pesos.
  assert.match(formatMoney(10, "USD"), /US\$\s10/);
  assert.match(formatMoney(10, "EUR"), /(EUR|€)\s?10/);
  // Texto libre en la base: antes Intl tiraba RangeError y tumbaba la pantalla.
  assert.equal(formatMoney(45000, "no-es-moneda"), `$${NBSP}45.000`);
});

test("3. moneyFormatter fija la moneda para pasarla a helpers puros", () => {
  const usd = moneyFormatter("usd");
  assert.equal(usd(10), formatMoney(10, "USD"));
  assert.equal(moneyFormatter(null)(45000), `$${NBSP}45.000`);
});

test("4. selectCurrency lee settings.currency con fallback a COP", () => {
  assert.equal(selectCurrency({ settings: null }), "COP");
  assert.equal(selectCurrency({ settings: { currency: "USD" } }), "USD");
  assert.equal(selectCurrency({ settings: { currency: "" } }), "COP");
});

test("5. Sin settings cargados, el hook formatea en COP (lo de siempre)", () => {
  function Probe() {
    const money = useFormatMoney();
    const currency = useCurrency();
    return (
      <span>
        {currency}|{money(45000)}
      </span>
    );
  }
  assert.equal(renderToStaticMarkup(<Probe />), `<span>COP|$${NBSP}45.000</span>`);
});

test("6. Fiados: etiqueta y estado de cuenta usan la moneda del negocio", () => {
  assert.equal(creditLabelOf(120000, null), `Debe $${NBSP}120.000`);
  assert.match(creditLabelOf(120, null, "USD"), /^Debe US\$\s120$/);
  const msg = renderStatementMessage({
    cliente: "Ana",
    negocio: "La Tienda",
    balance: 50,
    sales: [],
    payments: [],
    currency: "USD",
  });
  assert.match(msg, /Saldo pendiente: US\$\s50/);
});
