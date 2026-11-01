import test from "node:test";
import assert from "node:assert/strict";
import { normalizeColombianMobile, phoneLookupKey } from "../lib/co-mobile";

test("1. normalizeColombianMobile acepta 10 dígitos que empiezan en 3", () => {
  assert.equal(normalizeColombianMobile("3001234567"), "3001234567");
  assert.equal(normalizeColombianMobile("300 123 4567"), "3001234567");
});

test("2. normalizeColombianMobile quita el +57", () => {
  assert.equal(normalizeColombianMobile("+57 300 123 4567"), "3001234567");
  assert.equal(normalizeColombianMobile("573001234567"), "3001234567");
});

test("3. normalizeColombianMobile rechaza fijos y números cortos", () => {
  assert.equal(normalizeColombianMobile("6012345678"), null);
  assert.equal(normalizeColombianMobile("300123"), null);
  assert.equal(normalizeColombianMobile(""), null);
});

test("4. phoneLookupKey se queda con los últimos 10 dígitos, como el SQL", () => {
  assert.equal(phoneLookupKey("+57 300 123 4567"), "3001234567");
  assert.equal(phoneLookupKey("(300) 123-4567"), "3001234567");
  assert.equal(phoneLookupKey("3001234567"), "3001234567");
});

test("5. phoneLookupKey deja pasar números de 7 a 9 dígitos tal cual", () => {
  assert.equal(phoneLookupKey("123 4567"), "1234567");
  assert.equal(phoneLookupKey("601234567"), "601234567");
});

test("6. phoneLookupKey devuelve null con menos de 7 dígitos", () => {
  assert.equal(phoneLookupKey("123456"), null);
  assert.equal(phoneLookupKey("abc"), null);
  assert.equal(phoneLookupKey(""), null);
});
