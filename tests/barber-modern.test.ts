import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createElement, isValidElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { barberModernSite } from "./fixtures/barber-modern";
import { BookServiceLink, BOOK_SERVICE_EVENT } from "../app/[slug]/BookServiceLink";
import { BookingWidget } from "../app/[slug]/BookingWidget";

// Node does not bundle CSS modules; preserve class names for structural tests.
const require = createRequire(import.meta.url);
require.extensions[".css"] = (module) => { module.exports = { __esModule: true, default: new Proxy({}, { get: (_, key) => String(key) }) }; };
const { ModernoTemplate } = require("../app/[slug]/templates/ModernoTemplate") as typeof import("../app/[slug]/templates/ModernoTemplate");

function render(overrides: Partial<typeof barberModernSite> = {}) {
  return renderToStaticMarkup(createElement(ModernoTemplate, { site: { ...barberModernSite, ...overrides } }));
}

function descendants(node: ReactNode): React.ReactElement<Record<string, unknown>>[] {
  if (Array.isArray(node)) return node.flatMap(descendants);
  if (!isValidElement<Record<string, unknown>>(node)) return [];
  return [node, ...descendants(node.props.children as ReactNode)];
}

// Unwrap only the pure template, leaving client components as boundaries.
function templateElements() {
  let tree = ModernoTemplate({ site: barberModernSite });
  if (typeof tree.type === "function") tree = tree.type(tree.props);
  return descendants(tree);
}

test("barber Moderno renders the editorial landing and honest sample photography", () => {
  const html = render();
  assert.match(html, /data-template="barber-moderno"/);
  assert.match(html, /Distrito Barbería/);
  assert.match(html, /El detalle hace la diferencia/);
  assert.match(html, /barber-hero/);
  assert.match(html, /Imagen de referencia/);
  assert.match(html, /Corte de cabello/);
  assert.match(html, /Andrés Martínez/);
});

test("booking has exactly one target and one existing widget", () => {
  const html = render();
  assert.equal((html.match(/id="reservar"/g) ?? []).length, 1);
  assert.equal(templateElements().filter((node) => node.type === BookingWidget).length, 1);
  assert.doesNotMatch(html, /confirmación inmediata/i);
});

test("each real service retains the preselection link contract", () => {
  const links = templateElements().filter((node) => node.type === BookServiceLink);
  for (const service of barberModernSite.services) {
    assert.ok(links.some((node) => node.props.serviceId === service.id));
  }
  const events: Event[] = [];
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", { configurable: true, value: { dispatchEvent: (event: Event) => events.push(event) } });
  try {
    const link = BookServiceLink({ serviceId: "beard", className: "test", children: "Reservar" });
    link.props.onClick();
    assert.equal(link.props.href, "#reservar");
    assert.equal(events[0].type, BOOK_SERVICE_EVENT);
    assert.deepEqual((events[0] as CustomEvent).detail, { serviceId: "beard" });
  } finally {
    if (previousWindow) Object.defineProperty(globalThis, "window", previousWindow);
    else Reflect.deleteProperty(globalThis, "window");
  }
});

test("disabled booking exposes neither widget nor reservation links", () => {
  const html = render({ bookingEnabled: false });
  assert.doesNotMatch(html, /(?:id|href)="(?:#)?reservar"/);
  assert.doesNotMatch(html, /Agenda online/);
  assert.match(html, /Corte de cabello/);
});

test("empty catalogs and contact data do not invent sections or dead links", () => {
  const html = render({ services: [], staff: [], products: [], hours: [], address: null, whatsapp: null, instagram: null, about: null, bookingEnabled: false });
  for (const id of ["servicios", "precios", "equipo", "horarios", "contacto", "reservar", "nosotros"]) {
    assert.doesNotMatch(html, new RegExp(`(?:id|href)="(?:#)?${id}"`));
  }
  assert.match(html, /Distrito Barbería/);
});

test("uploaded imagery takes priority and is never labeled as a reference", () => {
  const html = render({ heroImageUrl: "/uploaded-hero.webp", about: null });
  assert.match(html, /uploaded-hero/);
  assert.doesNotMatch(html, /barber-hero/);
  assert.doesNotMatch(html, /Imagen de referencia/);
});

test("other business types retain the existing Moderno presentation", () => {
  for (const businessType of ["tienda", "lavaautos", "servicios", null]) {
    const html = render({ businessType });
    assert.doesNotMatch(html, /data-template="barber-moderno"|barber-hero|barber-detail/);
    assert.match(html, /Elegir un horario/);
  }
});
