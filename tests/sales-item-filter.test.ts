import test from "node:test";
import assert from "node:assert/strict";
import {
  itemOptionValue,
  itemFilterFromOption,
  NO_ITEM_FILTER,
  hasItemFilter,
} from "../services/sales.service";

test("1. Un producto y un servicio con el MISMO id no son el mismo ítem", () => {
  // Viven en tablas distintas y `sale_items` los referencia con dos FK
  // distintas. Si el selector mandara el uuid pelado, la base no sabría en cuál
  // de las dos buscarlo.
  const id = "11111111-1111-1111-1111-111111111111";
  assert.notEqual(itemOptionValue("product", id), itemOptionValue("service", id));
  assert.deepEqual(itemFilterFromOption(itemOptionValue("product", id)), {
    productId: id,
    serviceId: "",
    categoryId: "",
  });
  assert.deepEqual(itemFilterFromOption(itemOptionValue("service", id)), {
    productId: "",
    serviceId: id,
    categoryId: "",
  });
});

test("2. Sin selección no hay filtro", () => {
  assert.deepEqual(itemFilterFromOption(""), NO_ITEM_FILTER);
  assert.equal(hasItemFilter(NO_ITEM_FILTER), false);
});

test("3. Una opción corrupta no filtra por nada en vez de filtrar por cualquier cosa", () => {
  // Falla cerrado: un valor que no se entiende NO puede convertirse en un
  // filtro parcial que devuelva ventas que no corresponden.
  assert.deepEqual(itemFilterFromOption("p:"), NO_ITEM_FILTER);
  assert.deepEqual(itemFilterFromOption("x:algo"), NO_ITEM_FILTER);
  assert.deepEqual(itemFilterFromOption("sin-prefijo"), NO_ITEM_FILTER);
});

test("4. La categoría es un filtro aparte y NO se mezcla con el ítem", () => {
  // Elegir un producto concreto manda su id; la categoría sigue su propio
  // camino porque `products` y `services` comparten la misma tabla de
  // categorías. Mandar los dos a la vez pediría "este producto Y de esta otra
  // categoría", que casi siempre da cero filas sin que se entienda por qué.
  const cat = "22222222-2222-2222-2222-222222222222";
  assert.equal(hasItemFilter({ ...NO_ITEM_FILTER, categoryId: cat }), true);
  assert.equal(hasItemFilter({ productId: "abc", serviceId: "", categoryId: "" }), true);
});
