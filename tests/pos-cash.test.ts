import test from "node:test";
import assert from "node:assert/strict";
import {
  COP_DENOMINATIONS,
  effectiveTendered,
  parseDenominationCount,
  suggestedCashAmounts,
  sumDenominationCounts,
} from "../lib/pos-cash";

test("billetes sugeridos: 37.500 → 40.000, 50.000, 100.000", () => {
  assert.deepEqual(suggestedCashAmounts(37500), [40000, 50000, 100000]);
});

test("billetes sugeridos: un total exacto en billete no se repite a sí mismo", () => {
  assert.deepEqual(suggestedCashAmounts(50000), [60000, 100000]);
  assert.deepEqual(suggestedCashAmounts(20000), [50000, 100000]);
});

test("billetes sugeridos: totales chicos usan los billetes de 1.000 y 2.000", () => {
  assert.deepEqual(suggestedCashAmounts(1200), [2000, 5000, 10000, 20000]);
});

test("billetes sugeridos: totales grandes redondean a 100.000", () => {
  assert.deepEqual(suggestedCashAmounts(137500), [140000, 150000, 200000]);
});

test("billetes sugeridos: total cero o inválido no sugiere nada", () => {
  assert.deepEqual(suggestedCashAmounts(0), []);
  assert.deepEqual(suggestedCashAmounts(Number.NaN), []);
});

test("vacío = pago exacto; lo escrito se respeta", () => {
  assert.equal(effectiveTendered("", 37500), "37500");
  assert.equal(effectiveTendered("   ", 37500), "37500");
  assert.equal(effectiveTendered("50000", 37500), "50000");
  assert.equal(effectiveTendered("1000", 37500), "1000");
});

test("contador: suma cantidad × denominación, ignora basura y negativos", () => {
  assert.equal(
    sumDenominationCounts({ b100000: "2", b50000: "1", b1000: "3", m1000: "2", m500: "4", m50: "-3", b2000: "abc" }),
    200000 + 50000 + 3000 + 2000 + 2000,
  );
  assert.equal(sumDenominationCounts({}), 0);
  assert.equal(parseDenominationCount("2.7"), 2);
  assert.equal(parseDenominationCount(""), 0);
});

test("denominaciones: ids únicos aunque billete y moneda de 1.000 compartan valor", () => {
  const ids = COP_DENOMINATIONS.map((d) => d.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(COP_DENOMINATIONS.filter((d) => d.value === 1000).length, 2);
});
