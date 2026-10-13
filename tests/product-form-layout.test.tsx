import { test } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ProductPresentationSection } from "../app/dashboard/inventory/product/components/ProductPresentationSection";
Object.assign(globalThis, { React });
const noop = () => {};
const props = {
  presentation: "package" as const, setPresentation: noop, editId: null,
  unitsPerPackage: "12", onUnitsPerPackageChange: noop,
  initialPackages: "1", setInitialPackages: noop, initialLoose: "0", setInitialLoose: noop,
  packagePrice: "12000", onPackagePriceChange: noop, packageHint: "",
  tracksStock: true, onTracksStockChange: noop, openPrice: false, onOpenPriceChange: noop,
  currentStock: 0, canMoveStock: true, allowsFractions: false,
  entryPackages: "", setEntryPackages: noop, entryLoose: "", setEntryLoose: noop, entryUnits: 0,
  pricing: <input aria-label="Purchase and unit pricing" />,
  recipe: <div>Recipe editor slot</div>,
};
function assertOrder(html: string, labels: string[]) {
  let previous = -1;
  for (const label of labels) {
    const position = html.indexOf(label);
    assert.ok(position > previous, `${label} must follow the previous control`);
    previous = position;
  }
}
test("box definition precedes pricing and recipe precedes initial stock in actual DOM", () => {
  const html = renderToStaticMarkup(<ProductPresentationSection {...props} />);
  assertOrder(html, [">Caja<", "units-per-package", "Purchase and unit pricing", "Precio de venta por caja", "Recipe editor slot", "Precio abierto", "Stock inicial"]);
  assert.equal((html.match(/id="units-per-package"/g) ?? []).length, 1);
});
test("unit mode reserves desktop package geometry with disabled hidden controls", () => {
  const html = renderToStaticMarkup(<ProductPresentationSection {...props} presentation="unit" />);
  assertOrder(html, [">Unidad<", "Purchase and unit pricing", "Recipe editor slot", "Stock inicial"]);
  const input = html.match(/<input[^>]*id="units-per-package"[^>]*>/)?.[0];
  assert.ok(input, "desktop reservation must retain the same label/control/helper geometry");
  assert.match(input, /disabled=""/);
  assert.ok(!input.includes("required="));
  assert.match(html, /aria-hidden="true"[^>]*class="[^"]*hidden sm:block invisible/);
  assert.ok(!html.includes("Precio de venta por caja"));
});
test("ingredients omit sale-by-box and open pricing without losing the definition", () => {
  const html = renderToStaticMarkup(<ProductPresentationSection {...props} ingredientMode />);
  assertOrder(html, ["units-per-package", "Purchase and unit pricing", "Recipe editor slot", "Stock inicial"]);
  assert.ok(!html.includes("Precio de venta por caja"));
  assert.ok(!html.includes("Precio abierto"));
});
