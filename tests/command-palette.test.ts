import test from "node:test";
import assert from "node:assert/strict";
import {
  filterCommands,
  normalizeSearch,
  NAV_KEYWORDS,
  type PaletteCommand,
} from "../components/ui/CommandPalette";
import { visibleNavItems } from "../config/business";

const COMMANDS: PaletteCommand[] = [
  { id: "panel", label: "Panel", href: "/dashboard", group: null, keywords: NAV_KEYWORDS.panel },
  { id: "pos", label: "Punto de venta", href: "/dashboard/pos", group: "Ventas", keywords: NAV_KEYWORDS.pos },
  { id: "billing", label: "Facturación", href: "/dashboard/billing", group: "Ventas", keywords: NAV_KEYWORDS.billing },
  { id: "customers", label: "Todos los clientes", href: "/dashboard/customers", group: "Clientes" },
  { id: "calendar", label: "Calendario", href: "/dashboard/calendar", group: "Agenda", keywords: NAV_KEYWORDS.calendar },
];

test("normalizeSearch: minúsculas, sin tildes y sin espacios a los lados", () => {
  assert.equal(normalizeSearch("  Facturación "), "facturacion");
});

test("filterCommands: sin texto devuelve todo en el orden del menú", () => {
  assert.deepEqual(
    filterCommands(COMMANDS, "  ").map((c) => c.id),
    COMMANDS.map((c) => c.id),
  );
});

test("filterCommands: encuentra sin tildes y prioriza lo que empieza igual", () => {
  assert.deepEqual(filterCommands(COMMANDS, "factura").map((c) => c.id), ["billing"]);
  // "cal" empieza "Calendario"; "cli" es una palabra de "Todos los clientes".
  const ids = filterCommands(COMMANDS, "c").map((c) => c.id);
  assert.equal(ids[0], "calendar");
  assert.ok(ids.indexOf("calendar") < ids.indexOf("customers"));
});

test("filterCommands: los sinónimos y el grupo también cuentan", () => {
  assert.deepEqual(filterCommands(COMMANDS, "cobrar").map((c) => c.id), ["pos"]);
  assert.deepEqual(filterCommands(COMMANDS, "citas").map((c) => c.id), ["calendar"]);
  assert.ok(filterCommands(COMMANDS, "ventas").some((c) => c.id === "billing"));
});

test("filterCommands: sin coincidencias devuelve vacío (ya no manda todo al catálogo)", () => {
  assert.deepEqual(filterCommands(COMMANDS, "zzz"), []);
});

test("la paleta solo ofrece lo que el menú ya muestra (visibleNavItems)", () => {
  const items = visibleNavItems("tienda", null);
  const commands = items.map((i) => ({ id: i.id, label: i.name, href: i.href, keywords: NAV_KEYWORDS[i.id] }));
  const results = filterCommands(commands, "a");
  assert.ok(results.length > 0);
  for (const result of results) {
    assert.ok(items.some((i) => i.id === result.id));
  }
});
