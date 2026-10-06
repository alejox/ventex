import test from "node:test";
import assert from "node:assert/strict";
import React, { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DataTable, matchesSearch } from "../components/DataTable";
Object.assign(globalThis, { React });

type Row = { id: string; name: string };

test("el detalle desplegable no se dibuja con la fila cerrada (ni en móvil)", () => {
  const html = renderToStaticMarkup(
    createElement(DataTable<Row>, {
      rows: [{ id: "1", name: "Ana" }],
      rowKey: (r) => r.id,
      columns: [{ header: "Nombre", mobile: "title", cell: (r) => r.name }],
      renderExpanded: (r) => createElement("div", null, `DETALLE-${r.id}`),
    }),
  );
  // Antes la tarjeta móvil lo dibujaba SIEMPRE, sin mirar si estaba abierta.
  assert.equal(html.includes("DETALLE-1"), false);
  assert.ok(html.includes("Ver detalle"));
});

test("matchesSearch ignora mayúsculas y tildes", () => {
  assert.ok(matchesSearch("María Gómez", "gomez"));
  assert.ok(matchesSearch("Maria Gomez", "MARÍA"));
  assert.equal(matchesSearch("Pedro", "ana"), false);
});

test("matchesSearch compara solo dígitos en teléfonos y documentos", () => {
  assert.ok(matchesSearch("Ana 300 123 4567", "3001234567"));
  assert.ok(matchesSearch("Ana 1.020.304", "1020304"));
  assert.ok(matchesSearch("Ana 3001234567", "300-123"));
  // Un texto con letras no cae al modo dígitos.
  assert.equal(matchesSearch("Ana 3001234567", "ana 300-123"), false);
});

test("matchesSearch con búsqueda vacía deja pasar todo", () => {
  assert.ok(matchesSearch("cualquiera", "   "));
});

test("searchable dibuja el buscador con su placeholder", () => {
  const html = renderToStaticMarkup(
    createElement(DataTable<Row>, {
      rows: [{ id: "1", name: "Ana" }],
      rowKey: (r) => r.id,
      columns: [{ header: "Nombre", cell: (r) => r.name }],
      searchable: true,
      searchPlaceholder: "Buscar clientes",
    }),
  );
  assert.ok(html.includes('placeholder="Buscar clientes"'));
});

test("encabezado ordenable: <button> dentro del <th> con aria-sort y ↕", () => {
  const html = renderToStaticMarkup(
    createElement(DataTable<Row>, {
      rows: [{ id: "1", name: "Ana" }],
      rowKey: (r) => r.id,
      columns: [
        { header: "Nombre", cell: (r) => r.name, sortKey: "nombre" },
        { header: "Id", cell: (r) => r.id },
      ],
    }),
  );
  assert.match(html, /<th[^>]*aria-sort="none"[^>]*><button type="button"/);
  assert.ok(html.includes("↕"));
  // La columna no ordenable no lleva aria-sort.
  assert.equal((html.match(/aria-sort/g) ?? []).length, 1);
});

test("estado controlado: ordena y pagina según `state`", () => {
  const rows = [{ id: "1", name: "Carla" }, { id: "2", name: "Ana" }, { id: "3", name: "Beto" }];
  const html = renderToStaticMarkup(
    createElement(DataTable<Row>, {
      rows,
      rowKey: (r) => r.id,
      columns: [{ header: "Nombre", cell: (r) => r.name, sortKey: "nombre", mobile: "title" }],
      state: { q: "", sort: "nombre", dir: "desc", page: 1, size: 2 },
      onStateChange: () => {},
    }),
  );
  assert.match(html, /aria-sort="descending"/);
  const desktop = html.slice(html.indexOf("<tbody"), html.indexOf("</tbody>"));
  assert.ok(desktop.indexOf("Carla") < desktop.indexOf("Beto"));
  assert.equal(desktop.includes("Ana"), false);
});

test("fila accionable: sin role=button en la fila; el botón vive en la celda título", () => {
  const html = renderToStaticMarkup(
    createElement(DataTable<Row>, {
      rows: [{ id: "1", name: "Ana" }],
      rowKey: (r) => r.id,
      columns: [
        { header: "Nombre", mobile: "title", cell: (r) => r.name },
        { header: "Acciones", mobile: "actions", cell: () => createElement("button", { type: "button" }, "Borrar") },
      ],
      onRowClick: () => {},
    }),
  );
  assert.equal(html.includes('role="button"'), false);
  assert.match(html, /<td[^>]*><button type="button"[^>]*>Ana<\/button><\/td>/);
});
