import test from "node:test";
import assert from "node:assert/strict";
import { distributeFixedDiscount, parseDiscountAmount } from "../lib/pos-discount";

const sum = (xs: number[]) => Math.round(xs.reduce((s, x) => s + x, 0) * 100) / 100;

test("Monto: fuera de 0..tope o no numérico se rechaza", () => {
  assert.equal(parseDiscountAmount("", 1000), null);
  assert.equal(parseDiscountAmount("abc", 1000), null);
  assert.equal(parseDiscountAmount("-1", 1000), null);
  assert.equal(parseDiscountAmount("1001", 1000), null);
  assert.equal(parseDiscountAmount("1000", 1000), 1000);
  assert.equal(parseDiscountAmount("0", 1000), 0);
  assert.equal(parseDiscountAmount("12.345", 1000), 12.35);
});

test("Reparto proporcional que suma EXACTO lo pedido", () => {
  const out = distributeFixedDiscount([2000, 6000], 1000);
  assert.deepEqual(out, [250, 750]);
  const odd = distributeFixedDiscount([3333, 3333, 3334], 1000);
  assert.equal(sum(odd), 1000);
});

test("Ninguna línea queda con más descuento que su valor; el total se topa", () => {
  const out = distributeFixedDiscount([100, 50], 500);
  assert.deepEqual(out, [100, 50]);
  for (const [i, g] of [100, 50].entries()) assert.ok(out[i] <= g);
});

test("Sin líneas o monto cero no descuenta nada", () => {
  assert.deepEqual(distributeFixedDiscount([], 100), []);
  assert.deepEqual(distributeFixedDiscount([1000, 2000], 0), [0, 0]);
});
