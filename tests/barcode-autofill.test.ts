import assert from "node:assert/strict";
import test from "node:test";
import { barcodeAutofill, parseQuantityUnit } from "../lib/autofill";

const arroz = { name: "arroz roa", quantity: "500 g", imageUrl: "https://img/arroz.jpg" };
const cafe = { name: "café sello rojo", quantity: "250 g", imageUrl: "https://img/cafe.jpg" };
const empty = { name: "", unit: "Unidad", image_url: "" };

test("new product: empty fields take the scanned product", () => {
  const { patch, auto } = barcodeAutofill(empty, arroz, {}, { editing: false });
  assert.deepEqual(patch, { name: "arroz roa", unit: "g", image_url: "https://img/arroz.jpg" });
  assert.deepEqual(auto, { name: "arroz roa", unit: "g", image: "https://img/arroz.jpg" });
});

test("new product: changing the code replaces what WE filled", () => {
  const first = barcodeAutofill(empty, arroz, {}, { editing: false });
  const form = { ...empty, ...first.patch };
  const second = barcodeAutofill(form, cafe, first.auto, { editing: false });
  assert.equal(second.patch.name, "café sello rojo");
  assert.equal(second.patch.image_url, "https://img/cafe.jpg");
});

test("what the person typed is never overwritten", () => {
  const typed = { ...empty, name: "Arroz de la casa" };
  const { patch } = barcodeAutofill(typed, arroz, {}, { editing: false });
  assert.equal(patch.name, undefined);
});

test("editing: an emptied name is filled, the unit never changes", () => {
  const editing = { name: "", unit: "Unidad", image_url: "" };
  const { patch } = barcodeAutofill(editing, arroz, {}, { editing: true });
  assert.equal(patch.name, "arroz roa");
  assert.equal(patch.image_url, "https://img/arroz.jpg");
  // Unidad → g on a saved product would turn 10 units of stock into 10 grams.
  assert.equal(patch.unit, undefined);
});

test("editing: saved values are kept", () => {
  const saved = { name: "Arroz", unit: "Unidad", image_url: "https://img/mine.jpg" };
  const { patch } = barcodeAutofill(saved, arroz, {}, { editing: true });
  assert.deepEqual(patch, {});
});

test("editing: changing the code updates what was autofilled", () => {
  const editing = { name: "", unit: "Unidad", image_url: "" };
  const first = barcodeAutofill(editing, arroz, {}, { editing: true });
  const second = barcodeAutofill({ ...editing, ...first.patch }, cafe, first.auto, { editing: true });
  assert.equal(second.patch.name, "café sello rojo");
  assert.equal(second.patch.image_url, "https://img/cafe.jpg");
});

test("the result depends only on its inputs (safe under StrictMode double calls)", () => {
  const form = { ...empty, name: "arroz roa", unit: "g", image_url: "https://img/arroz.jpg" };
  const before = { name: "arroz roa", unit: "g", image: "https://img/arroz.jpg" };
  const a = barcodeAutofill(form, cafe, before, { editing: false });
  const b = barcodeAutofill(form, cafe, before, { editing: false });
  assert.deepEqual(a, b);
  assert.deepEqual(before, { name: "arroz roa", unit: "g", image: "https://img/arroz.jpg" });
});

test("quantity text maps to a unit", () => {
  assert.equal(parseQuantityUnit("500 g"), "g");
  assert.equal(parseQuantityUnit("1 L"), "L");
  assert.equal(parseQuantityUnit("12 oz"), "g");
  assert.equal(parseQuantityUnit("mucho"), undefined);
});
