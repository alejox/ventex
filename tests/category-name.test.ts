import test from "node:test";
import assert from "node:assert/strict";
import { normalizeCategoryName, isDuplicateName, findDuplicateCategory } from "../services/inventory.service";

test("1. Normaliza a mayúsculas y recorta", () => {
  assert.equal(normalizeCategoryName("  electronica  "), "ELECTRONICA");
  assert.equal(normalizeCategoryName("Electronica"), "ELECTRONICA");
  assert.equal(normalizeCategoryName("ELECTRONICA"), "ELECTRONICA");
});

test("2. NO toca la Ñ ni las tildes", () => {
  // El español tiene letras propias y son parte del nombre, no ruido a limpiar.
  // Si alguien alguna vez agrega un `normalize("NFD")` para "limpiar acentos",
  // este test lo frena: BAÑO no es BANO y PAPELERÍA no es PAPELERIA.
  assert.equal(normalizeCategoryName("baño"), "BAÑO");
  assert.equal(normalizeCategoryName("papelería"), "PAPELERÍA");
  assert.equal(normalizeCategoryName("Ñandú"), "ÑANDÚ");
  assert.equal(normalizeCategoryName("BAÑO").length, 4);
});

test("3. Reconoce la violación de índice único de Postgres", () => {
  // PostgREST propaga el código de Postgres; 23505 es "unique_violation".
  // Sin esto, el usuario recibía el mensaje crudo del índice —o nada.
  assert.equal(isDuplicateName({ code: "23505", message: "duplicate key..." }), true);
  assert.equal(isDuplicateName({ code: "42501", message: "permission denied" }), false);
  assert.equal(isDuplicateName(new Error("cualquier cosa")), false);
  assert.equal(isDuplicateName(null), false);
  assert.equal(isDuplicateName(undefined), false);
});

test("4. Detecta el duplicado del lado del cliente, sin distinguir mayúsculas", () => {
  const categorias = [
    { id: "a", name: "ELECTRONICA", description: null },
    { id: "b", name: "ROPA", description: null },
  ];

  // El caso exacto del informe: crear una segunda "Electronica".
  assert.equal(findDuplicateCategory(categorias, "Electronica")?.id, "a");
  assert.equal(findDuplicateCategory(categorias, "  electronica  ")?.id, "a");
  assert.equal(findDuplicateCategory(categorias, "PAPELERIA"), undefined);
});

test("5. Al editar, una categoría no choca consigo misma", () => {
  const categorias = [
    { id: "a", name: "ELECTRONICA", description: null },
    { id: "b", name: "ROPA", description: null },
  ];

  // Sin `exceptId`, renombrar "ELECTRONICA" a "Electronica" —o solo corregirle
  // la descripción— sería imposible: se detectaría a sí misma como duplicado.
  assert.equal(findDuplicateCategory(categorias, "Electronica", "a"), undefined);
  // Pero seguir chocando con OTRA sí tiene que fallar.
  assert.equal(findDuplicateCategory(categorias, "ROPA", "a")?.id, "b");
});
