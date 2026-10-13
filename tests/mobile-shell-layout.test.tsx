import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DesktopHeaderActions, MobileDrawerContent } from "../components/MobileDrawerTools";
import { SidebarNavGroup } from "../components/SidebarNavGroup";
Object.assign(globalThis, { React });

test("secondary header controls have one unambiguous desktop-only display boundary", () => {
  const html = renderToStaticMarkup(<DesktopHeaderActions><button className="inline-flex">Tools</button></DesktopHeaderActions>);
  assert.match(html, /^<div class="hidden lg:flex[^"]*"><button class="inline-flex">/);
  assert.doesNotMatch(html.split('">')[0], /(?:^| )inline-flex/);
});

test("mobile drawer puts context and search before navigation, secondary tools after it", () => {
  const html = renderToStaticMarkup(<MobileDrawerContent context={<span>Business</span>} search={<button>Search</button>} navigation={<nav>Primary</nav>} tools={<button>Calculator</button>} />);
  assert.ok(html.indexOf("Business") < html.indexOf("Search"));
  assert.ok(html.indexOf("Search") < html.indexOf("Primary"));
  assert.ok(html.indexOf("Primary") < html.indexOf("Calculator"));
});

const group = { id: "inventario", label: "Inventario", items: [{ id: "products", name: "Productos", href: "/dashboard/products", modules: [] }, { id: "suppliers", name: "Proveedores", href: "/dashboard/suppliers", modules: [] }] };
test("mobile controlled groups can collapse the active section and use distinct panel IDs", () => {
  const closed = renderToStaticMarkup(<SidebarNavGroup group={group} activeNavId="products" open={false} controlled idPrefix="mobile" onToggle={() => {}} icons={{}} />);
  assert.match(closed, /aria-expanded="false"/);
  assert.match(closed, /aria-controls="mobile-nav-grupo-inventario"/);
  assert.doesNotMatch(closed, /aria-current="page"/);
  const open = renderToStaticMarkup(<SidebarNavGroup group={group} activeNavId="products" open controlled idPrefix="mobile" onToggle={() => {}} icons={{}} />);
  assert.match(open, /id="mobile-nav-grupo-inventario"/);
  assert.match(open, /aria-current="page"/);
});
