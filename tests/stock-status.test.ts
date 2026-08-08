import test from "node:test";
import assert from "node:assert/strict";
import { stockStatusOf, stockLabelOf, needsRestock } from "../lib/stock";
import { SERVICE_UNIT } from "../services/inventory.service";

test("1. El estado se mide contra el mínimo del producto, no contra un umbral fijo", () => {
  // El caso exacto del informe de QA: con el umbral fijo de 5 ninguno de estos
  // tres contaba como stock bajo, aunque los tres están en o por debajo del
  // mínimo que el negocio configuró.
  assert.equal(stockStatusOf(7, 10), "low", "7 de un mínimo de 10 es stock bajo");
  assert.equal(stockStatusOf(10, 10), "low", "justo en el mínimo ya es stock bajo");
  assert.equal(stockStatusOf(0, 10), "out", "sin unidades es agotado, no bajo");
  assert.equal(stockStatusOf(11, 10), "optimal");
});

test("2. Sin mínimo configurado no existe el stock bajo", () => {
  // `minimum_stock = 0` es "no llevo mínimo para esto". Sin este corte, todo
  // producto en cero caía en `level <= minimum` y además rompía la división
  // por cero al ordenar las sugerencias de reposición.
  assert.equal(stockStatusOf(1, 0), "optimal");
  assert.equal(stockStatusOf(0, 0), "out", "cero unidades sigue siendo agotado");
});

test("3. El stock negativo tiene estado propio", () => {
  // Con `allow_oversell` el POS deja vender sin unidades: eso es una deuda de
  // inventario, no un stock bajo.
  assert.equal(stockStatusOf(-2, 10), "oversold");
  assert.equal(stockStatusOf(-2, 0), "oversold");
});

test("4. needsRestock es el ÚNICO predicado de 'stock bajo' de la app", () => {
  const low = { stock_level: 7, minimum_stock: 10 };
  const atMinimum = { stock_level: 10, minimum_stock: 10 };
  const out = { stock_level: 0, minimum_stock: 10 };
  const oversold = { stock_level: -2, minimum_stock: 10 };
  const fine = { stock_level: 50, minimum_stock: 10 };
  const noMinimum = { stock_level: 3, minimum_stock: 0 };

  // Los tres del informe de QA tienen que dar el mismo resultado en el KPI de
  // Inventario, en el filtro y en el widget del Panel.
  assert.equal([low, atMinimum, out].filter(needsRestock).length, 3);
  assert.equal(needsRestock(oversold), true);
  assert.equal(needsRestock(fine), false);
  assert.equal(needsRestock(noMinimum), false);
});

test("5. Un servicio nunca necesita reposición", () => {
  // No tiene existencias: su cero no es "hay que comprar más".
  const service = { stock_level: 0, minimum_stock: 0, unit: SERVICE_UNIT };
  assert.equal(needsRestock(service), false);

  // Ni siquiera si arrastra datos viejos de antes de la regla.
  assert.equal(needsRestock({ stock_level: -2, minimum_stock: 10, unit: SERVICE_UNIT }), false);
});

test("6. La etiqueta dice contra qué mínimo se está comparando", () => {
  assert.equal(stockLabelOf(7, 10), "Stock bajo (7/10)");
  assert.equal(stockLabelOf(0, 10), "Agotado");
  assert.equal(stockLabelOf(-2, 10), "Sobrevendido (-2)");
  assert.equal(stockLabelOf(50, 10), "50 en stock");
});
