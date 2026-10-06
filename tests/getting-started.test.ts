import { test } from "node:test";
import assert from "node:assert/strict";
import {
  allGettingStartedDone,
  gettingStartedSteps,
  type GettingStartedFacts,
} from "@/lib/getting-started";

const NOTHING: GettingStartedFacts = {
  hasProduct: false,
  hasService: false,
  hasStaff: false,
  businessConfigured: false,
  sitePublished: false,
  hasSale: false,
};

const ids = (steps: { id: string }[]) => steps.map((s) => s.id);

test("tienda: producto, datos del negocio y primera venta — sin personal ni sitio", () => {
  const steps = gettingStartedSteps("tienda", null, NOTHING);
  assert.deepEqual(ids(steps), ["catalog", "business", "first-sale"]);
  assert.equal(steps[0].href, "/dashboard/inventory/product");
  assert.match(steps[0].label, /producto/);
});

test("salón: servicio, personal, datos, sitio de reservas y primera venta", () => {
  const steps = gettingStartedSteps("salon", null, NOTHING);
  assert.deepEqual(ids(steps), ["catalog", "staff", "business", "site", "first-sale"]);
  assert.equal(steps[0].href, "/dashboard/inventory/product?type=servicio");
  assert.equal(steps.find((s) => s.id === "site")?.href, "/dashboard/landing");
});

test("escuela: el catálogo es el plan de clases y el personal son profesores", () => {
  const steps = gettingStartedSteps("escuela", { school: true }, NOTHING);
  assert.deepEqual(ids(steps), ["catalog", "staff", "business", "site", "first-sale"]);
  assert.equal(steps[0].href, "/dashboard/school/planes");
  assert.match(steps[1].label, /profesores/);
});

test("sin tipo de negocio no hay checklist", () => {
  assert.deepEqual(gettingStartedSteps(null, null, NOTHING), []);
  assert.equal(allGettingStartedDone([]), false);
});

test("cualquier ítem del catálogo marca el primer paso", () => {
  const conServicio = gettingStartedSteps("tienda", null, { ...NOTHING, hasService: true });
  assert.equal(conServicio[0].done, true);
  const conProducto = gettingStartedSteps("salon", null, { ...NOTHING, hasProduct: true });
  assert.equal(conProducto[0].done, true);
});

test("cada paso se marca con su propio hecho", () => {
  const steps = gettingStartedSteps("salon", null, {
    ...NOTHING,
    hasStaff: true,
    sitePublished: true,
  });
  const done = Object.fromEntries(steps.map((s) => [s.id, s.done]));
  assert.deepEqual(done, {
    catalog: false,
    staff: true,
    business: false,
    site: true,
    "first-sale": false,
  });
  assert.equal(allGettingStartedDone(steps), false);
});

test("todo hecho: el checklist se da por completo", () => {
  const all: GettingStartedFacts = {
    hasProduct: true,
    hasService: true,
    hasStaff: true,
    businessConfigured: true,
    sitePublished: true,
    hasSale: true,
  };
  assert.equal(allGettingStartedDone(gettingStartedSteps("salon", null, all)), true);
  // La tienda no necesita personal ni sitio para terminar.
  assert.equal(
    allGettingStartedDone(gettingStartedSteps("tienda", null, { ...NOTHING, hasProduct: true, businessConfigured: true, hasSale: true })),
    true,
  );
});
