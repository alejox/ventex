import { test } from "node:test";
import assert from "node:assert/strict";
import { aggregateHaircuts, type HaircutLine } from "../services/staff.service";

const EQUIPO = [
  { id: "s1", full_name: "Carlos" },
  { id: "s2", full_name: "Ana" },
];

const linea = (over: Partial<HaircutLine> = {}): HaircutLine => ({
  sale_id: "v1",
  staff_id: "s1",
  quantity: 1,
  line_total: 20000,
  customer_id: "c1",
  ...over,
});

test("cuenta cantidades, no líneas: un corte doble son dos cortes", () => {
  const [fila] = aggregateHaircuts([linea({ quantity: 2 })], EQUIPO);
  assert.equal(fila.cortes, 2);
  // Pero sigue siendo UNA venta y UN cliente.
  assert.equal(fila.ventas, 1);
  assert.equal(fila.clientes, 1);
});

test("el mismo cliente dos veces es un cliente, no dos", () => {
  const [fila] = aggregateHaircuts(
    [linea({ sale_id: "v1", customer_id: "c1" }), linea({ sale_id: "v2", customer_id: "c1" })],
    EQUIPO,
  );
  assert.equal(fila.cortes, 2);
  assert.equal(fila.ventas, 2);
  assert.equal(fila.clientes, 1);
});

test("dos líneas de la MISMA venta no inflan el conteo de ventas", () => {
  const [fila] = aggregateHaircuts([linea({ sale_id: "v1" }), linea({ sale_id: "v1" })], EQUIPO);
  assert.equal(fila.cortes, 2);
  assert.equal(fila.ventas, 1);
});

test("cada venta sin cliente cuenta como un cliente distinto", () => {
  // Dos anónimos podrían ser la misma persona, pero no hay forma de saberlo:
  // colapsarlos a uno inventaría un dato; contarlos como uno cada uno es lo
  // más cerca de la verdad que se puede estar.
  const [fila] = aggregateHaircuts(
    [linea({ sale_id: "v1", customer_id: null }), linea({ sale_id: "v2", customer_id: null })],
    EQUIPO,
  );
  assert.equal(fila.clientes, 2);
});

test("ordena de mayor a menor por cortes", () => {
  const filas = aggregateHaircuts(
    [
      linea({ staff_id: "s1", sale_id: "v1" }),
      linea({ staff_id: "s2", sale_id: "v2" }),
      linea({ staff_id: "s2", sale_id: "v3" }),
    ],
    EQUIPO,
  );
  assert.deepEqual(
    filas.map((f) => f.full_name),
    ["Ana", "Carlos"],
  );
});

test("quien no cortó no aparece", () => {
  const filas = aggregateHaircuts([linea({ staff_id: "s1" })], EQUIPO);
  assert.equal(filas.length, 1);
  assert.equal(filas[0].staff_id, "s1");
});

test("una línea de alguien que ya no está en el equipo se descarta", () => {
  // El miembro pudo borrarse después de la venta. Mostrarlo sin nombre sería
  // peor que no mostrarlo: una fila anónima que nadie puede accionar.
  const filas = aggregateHaircuts([linea({ staff_id: "borrado" })], EQUIPO);
  assert.deepEqual(filas, []);
});

test("el vendido se redondea a dos decimales", () => {
  const [fila] = aggregateHaircuts(
    [linea({ line_total: 0.1 }), linea({ sale_id: "v2", line_total: 0.2 })],
    EQUIPO,
  );
  // 0.1 + 0.2 = 0.30000000000000004 en punto flotante.
  assert.equal(fila.vendido, 0.3);
});

test("sin líneas devuelve vacío, no filas en cero", () => {
  assert.deepEqual(aggregateHaircuts([], EQUIPO), []);
});
