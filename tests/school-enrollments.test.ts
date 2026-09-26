import test from "node:test";
import assert from "node:assert/strict";
import { ageOn, ageRangeLabel, isOutsideAgeRange } from "../services/school-enrollments.service";

// ---- ageOn ----
//
// `ageOn` lee mes/día de `today` con los getters LOCALES a propósito (es la
// fecha de "hoy" de quien mira la pantalla). Por eso las fechas de estos
// tests se arman con el constructor `new Date(y, m, d)` (componentes locales
// literales) y no con un string ISO `Z` — un ISO en UTC correría distinto
// según la zona horaria de quien ejecuta `npm test`.

test("1. Sin fecha de nacimiento, la edad es null (dato opcional)", () => {
  assert.equal(ageOn(null, new Date(2026, 8, 26)), null);
  assert.equal(ageOn(undefined, new Date(2026, 8, 26)), null);
});

test("2. Ya pasó el cumpleaños este año: la edad ya subió", () => {
  assert.equal(ageOn("2015-03-10", new Date(2026, 8, 26)), 11);
});

test("3. Todavía no llega el cumpleaños este año: la edad no subió", () => {
  assert.equal(ageOn("2015-11-10", new Date(2026, 8, 26)), 10);
});

test("4. Hoy es el cumpleaños: ya cumplió, la edad sube hoy mismo", () => {
  assert.equal(ageOn("2015-09-26", new Date(2026, 8, 26)), 11);
});

test("5. Cumpleaños 29 de febrero, en un año NO bisiesto: cae el 1 de marzo", () => {
  // Nacido el 29/feb/2012 (bisiesto). 2026 no es bisiesto — el 1/mar/2026 ya
  // cumplió 14; el 28/feb/2026 todavía no.
  assert.equal(ageOn("2012-02-29", new Date(2026, 1, 28)), 13);
  assert.equal(ageOn("2012-02-29", new Date(2026, 2, 1)), 14);
});

// ---- ageRangeLabel ----

test("6. Plan sin rango no tiene etiqueta", () => {
  assert.equal(ageRangeLabel(null, null), "");
});

test("7. Rango completo", () => {
  assert.equal(ageRangeLabel(8, 12), "8–12 años");
});

test("8. Solo mínimo", () => {
  assert.equal(ageRangeLabel(8, null), "Desde 8 años");
});

test("9. Solo máximo", () => {
  assert.equal(ageRangeLabel(null, 12), "Hasta 12 años");
});

// ---- isOutsideAgeRange ----

test("10. Sin edad (falta fecha de nacimiento), nunca avisa", () => {
  assert.equal(isOutsideAgeRange(null, 8, 12), false);
});

test("11. Plan sin rango, nunca avisa aunque haya edad", () => {
  assert.equal(isOutsideAgeRange(30, null, null), false);
});

test("12. Edad dentro del rango, no avisa", () => {
  assert.equal(isOutsideAgeRange(10, 8, 12), false);
});

test("13. Edad por debajo del mínimo, avisa", () => {
  assert.equal(isOutsideAgeRange(6, 8, 12), true);
});

test("14. Edad por encima del máximo, avisa", () => {
  assert.equal(isOutsideAgeRange(15, 8, 12), true);
});

test("15. En el borde exacto (mínimo o máximo), no avisa", () => {
  assert.equal(isOutsideAgeRange(8, 8, 12), false);
  assert.equal(isOutsideAgeRange(12, 8, 12), false);
});
