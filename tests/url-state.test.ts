import test from "node:test";
import assert from "node:assert/strict";
import { readUrlParams, writeUrlParams, parseTableState, withBackParam, DEFAULT_TABLE_STATE } from "../lib/useUrlState";
import { nextSort, ariaSortOf } from "../components/DataTable";

test("readUrlParams toma lo presente y deja el default en lo ausente o vacío", () => {
  assert.deepEqual(readUrlParams("?q=ana&status=", { q: "", status: "active" }), { q: "ana", status: "active" });
});

test("writeUrlParams borra los defaults y respeta parámetros ajenos", () => {
  assert.equal(writeUrlParams("?id=7&q=ana", { q: "" }, { q: "" }), "id=7");
  assert.equal(writeUrlParams("", { page: 1, status: "all" }, { page: "1", status: "active" }), "status=all");
  assert.equal(writeUrlParams("?q=a", { q: "pan dulce" }), "q=pan+dulce");
});

test("parseTableState no se rompe con valores pegados a mano", () => {
  assert.deepEqual(parseTableState({ page: "abc", size: "-3", dir: "up", sort: "" }), DEFAULT_TABLE_STATE);
  assert.deepEqual(parseTableState({ t_page: "3", t_sort: "total", t_dir: "desc" }, "t_"), {
    ...DEFAULT_TABLE_STATE,
    page: 3,
    sort: "total",
    dir: "desc",
  });
});

test("withBackParam agrega back solo cuando hay estado que preservar", () => {
  assert.equal(withBackParam("/p?id=1", "/dashboard/inventory", "/dashboard/inventory"), "/p?id=1");
  assert.equal(
    withBackParam("/p?id=1", "/dashboard/inventory?q=pan&page=2", "/dashboard/inventory"),
    "/p?id=1&back=%2Fdashboard%2Finventory%3Fq%3Dpan%26page%3D2",
  );
});

test("orden de tabla: misma columna invierte, otra arranca ascendente; aria-sort coherente", () => {
  assert.deepEqual(nextSort({ sort: null, dir: "asc" }, "total"), { sort: "total", dir: "asc" });
  assert.deepEqual(nextSort({ sort: "total", dir: "asc" }, "total"), { sort: "total", dir: "desc" });
  assert.deepEqual(nextSort({ sort: "total", dir: "desc" }, "fecha"), { sort: "fecha", dir: "asc" });
  assert.equal(ariaSortOf(undefined, { sort: "x", dir: "asc" }), undefined);
  assert.equal(ariaSortOf("fecha", { sort: "x", dir: "asc" }), "none");
  assert.equal(ariaSortOf("x", { sort: "x", dir: "desc" }), "descending");
});
