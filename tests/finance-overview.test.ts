import { test } from "node:test";
import assert from "node:assert/strict";
import { fetchAllRows, monthKeyOfInstant } from "@/services/finance.service";

/** Simula PostgREST: devuelve el tramo [from, to] de `rows`, como `.range()`. */
function fakeTable<T>(rows: T[]) {
  const calls: [number, number][] = [];
  const page = (from: number, to: number) => {
    calls.push([from, to]);
    return Promise.resolve({ data: rows.slice(from, to + 1), error: null });
  };
  return { page, calls };
}

test("fetchAllRows junta todas las páginas aunque pasen de 1.000 filas", async () => {
  const rows = Array.from({ length: 2500 }, (_, i) => ({ id: i, total: 1 }));
  const { page, calls } = fakeTable(rows);
  const all = await fetchAllRows(page);
  assert.equal(all.length, 2500);
  assert.equal(all.reduce((s, r) => s + r.total, 0), 2500);
  assert.deepEqual(calls, [[0, 999], [1000, 1999], [2000, 2999]]);
});

test("fetchAllRows pide una página extra cuando el total es múltiplo exacto", async () => {
  const { page, calls } = fakeTable(Array.from({ length: 4 }, (_, i) => i));
  assert.deepEqual(await fetchAllRows(page, 2), [0, 1, 2, 3]);
  assert.equal(calls.length, 3);
});

test("fetchAllRows con tabla vacía hace una sola consulta", async () => {
  const { page, calls } = fakeTable<number>([]);
  assert.deepEqual(await fetchAllRows(page), []);
  assert.equal(calls.length, 1);
});

test("fetchAllRows propaga el error de cualquier página", async () => {
  const boom = new Error("boom");
  await assert.rejects(
    fetchAllRows((from) =>
      Promise.resolve(from === 0 ? { data: [1, 2], error: null } : { data: null, error: boom }),
    2),
    boom,
  );
});

test("monthKeyOfInstant usa el mes LOCAL, no el de UTC", () => {
  // Construido en hora local: el último instante del mes, que en UTC-5 ya es
  // el mes siguiente si se corta el ISO.
  const lastMinute = new Date(2026, 9, 31, 23, 30);
  assert.equal(monthKeyOfInstant(lastMinute.toISOString()), "2026-10");
  assert.equal(monthKeyOfInstant(new Date(2026, 10, 1, 0, 15).toISOString()), "2026-11");
});
