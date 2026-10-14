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
const catalog = <T extends { id: string }>(steps: T[]) => steps.find((s) => s.id === "catalog")!;

test("tienda: producto, datos del negocio, catálogo web y primera venta — sin personal", () => {
  const steps = gettingStartedSteps("tienda", null, NOTHING);
  assert.deepEqual(ids(steps), ["business", "catalog", "site", "first-sale"]);
  assert.equal(catalog(steps).href, "/dashboard/inventory/product");
  assert.match(catalog(steps).label, /producto/);
  const site = steps.find((s) => s.id === "site");
  assert.equal(site?.href, "/dashboard/landing");
  assert.match(site?.label ?? "", /catálogo/);
  assert.match(site?.hint ?? "", /WhatsApp/);
  assert.doesNotMatch(`${site?.label} ${site?.hint}`, /reserv/i);
});

test("salón: servicio, personal, datos, sitio de reservas y primera venta", () => {
  const steps = gettingStartedSteps("salon", null, NOTHING);
  assert.deepEqual(ids(steps), ["business", "catalog", "staff", "site", "first-sale"]);
  assert.equal(catalog(steps).href, "/dashboard/inventory/product?type=servicio");
  assert.equal(steps.find((s) => s.id === "site")?.href, "/dashboard/landing");
});

test("escuela: el catálogo es el plan de clases y el personal son profesores", () => {
  const steps = gettingStartedSteps("escuela", { school: true }, NOTHING);
  assert.deepEqual(ids(steps), ["business", "catalog", "staff", "site", "first-sale"]);
  assert.equal(catalog(steps).href, "/dashboard/school/planes");
  assert.match(steps.find((s) => s.id === "staff")!.label, /profesores/);
});

test("sin tipo de negocio no hay checklist", () => {
  assert.deepEqual(gettingStartedSteps(null, null, NOTHING), []);
  assert.equal(allGettingStartedDone([]), false);
});

test("cualquier ítem del catálogo marca el paso del catálogo", () => {
  const conServicio = gettingStartedSteps("tienda", null, { ...NOTHING, hasService: true });
  assert.equal(catalog(conServicio).done, true);
  const conProducto = gettingStartedSteps("salon", null, { ...NOTHING, hasProduct: true });
  assert.equal(catalog(conProducto).done, true);
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
  // La tienda no necesita personal para terminar, pero sí publicar su catálogo.
  const tiendaSinPersonal = { ...NOTHING, hasProduct: true, businessConfigured: true, hasSale: true };
  assert.equal(allGettingStartedDone(gettingStartedSteps("tienda", null, tiendaSinPersonal)), false);
  assert.equal(
    allGettingStartedDone(gettingStartedSteps("tienda", null, { ...tiendaSinPersonal, sitePublished: true })),
    true,
  );
});
