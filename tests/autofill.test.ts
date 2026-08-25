import test from "node:test";
import assert from "node:assert/strict";
import { canAutofill } from "../lib/autofill";

/**
 * El autocompletado por código de barras tiene que poder CORREGIRSE —escanear
 * otro código y ver la ficha cambiar— sin borrarle a nadie lo que escribió.
 * La regla vieja ("sólo si está vacío") cumplía lo segundo y rompía lo primero.
 */

test("1. Un campo vacío siempre se llena", () => {
  assert.equal(canAutofill("", null), true);
  assert.equal(canAutofill("   ", null), true);
  assert.equal(canAutofill(null, null), true);
  assert.equal(canAutofill(undefined, "lo que sea"), true);
});

test("2. Lo que escribió la persona NO se pisa", () => {
  // Nunca autocompletamos nada, así que lo que hay es tipeado.
  assert.equal(canAutofill("Gaseosa del abuelo", null), false);
});

test("3. Lo que autocompletamos ANTES sí se reemplaza", () => {
  // Este es el caso que estaba roto: primer escaneo llenó "Coca-Cola 350ml",
  // segundo escaneo traía otro producto y no entraba porque el campo no
  // estaba vacío.
  assert.equal(canAutofill("Coca-Cola 350ml", "Coca-Cola 350ml"), true);
});

test("4. Si la persona EDITÓ lo que autocompletamos, pasa a ser suyo", () => {
  // Corrigió el nombre a mano: deja de ser nuestro y no se toca más.
  assert.equal(canAutofill("Coca-Cola 350 ml retornable", "Coca-Cola 350ml"), false);
});

test("5. Los espacios no convierten lo nuestro en ajeno", () => {
  // El valor va y vuelve por un input controlado; comparar en crudo dejaría el
  // campo congelado por un espacio de más.
  assert.equal(canAutofill("  Coca-Cola 350ml  ", "Coca-Cola 350ml"), true);
  assert.equal(canAutofill("Coca-Cola 350ml", "  Coca-Cola 350ml  "), true);
});

test("6. Distingue mayúsculas: no son el mismo texto", () => {
  // Cambiar la caja es una edición deliberada, no ruido de formato.
  assert.equal(canAutofill("coca-cola 350ml", "Coca-Cola 350ml"), false);
});
