import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_SITE_IMAGES,
  SITE_TEMPLATES,
  TEMPLATE_DESCRIPTIONS,
  TEMPLATE_GROUP_LABELS,
  TEMPLATE_GROUPS,
  TEMPLATE_LABELS,
  normalizeLandingConfig,
  templatesFor,
} from "../services/public-site.types";

const LEGACY = ["rasm", "fallspa", "qutter"];
const SALON = ["rasm", "fallspa", "qutter", "barberia", "barberia-artesanal", "barberia-urbana", "luxia", "lezar", "zen"];

test("mercado está registrada, en el grupo Tiendas y con copia para el editor", () => {
  assert.ok(SITE_TEMPLATES.includes("mercado"));
  assert.equal(TEMPLATE_GROUPS.mercado, "tienda");
  assert.equal(TEMPLATE_GROUP_LABELS.tienda, "Tiendas");
  assert.ok(TEMPLATE_LABELS.mercado);
  assert.ok(TEMPLATE_DESCRIPTIONS.mercado);
  assert.ok("mercado" in DEFAULT_SITE_IMAGES);
  assert.equal(normalizeLandingConfig({ template: "mercado" }).template, "mercado");
});

test("orgánico está registrada, en el grupo Tiendas, sin foto con licencia y con copia", () => {
  assert.ok(SITE_TEMPLATES.includes("organico"));
  assert.equal(SITE_TEMPLATES.indexOf("organico"), SITE_TEMPLATES.indexOf("mercado") + 1);
  assert.equal(TEMPLATE_GROUPS.organico, "tienda");
  assert.equal(TEMPLATE_LABELS.organico, "Orgánico");
  assert.ok(TEMPLATE_DESCRIPTIONS.organico);
  assert.equal(DEFAULT_SITE_IMAGES.organico, "");
  assert.equal(normalizeLandingConfig({ template: "organico" }).template, "organico");
});

test("despensa está registrada después de orgánico, en el grupo Tiendas, sin foto con licencia y con copia", () => {
  assert.ok(SITE_TEMPLATES.includes("despensa"));
  assert.equal(SITE_TEMPLATES.indexOf("despensa"), SITE_TEMPLATES.indexOf("organico") + 1);
  assert.equal(TEMPLATE_GROUPS.despensa, "tienda");
  assert.equal(TEMPLATE_LABELS.despensa, "Despensa");
  assert.ok(TEMPLATE_DESCRIPTIONS.despensa);
  assert.equal(DEFAULT_SITE_IMAGES.despensa, "");
  assert.equal(normalizeLandingConfig({ template: "despensa" }).template, "despensa");
});

test("tienda ve SOLO las plantillas de tienda", () => {
  const offered = templatesFor("tienda");
  assert.deepEqual(offered, ["mercado", "organico", "despensa"]);
  for (const template of offered) assert.equal(TEMPLATE_GROUPS[template], "tienda");
});

test("una tienda con una plantilla vieja la conserva en la lista", () => {
  const STORE = ["mercado", "organico", "despensa"];
  assert.deepEqual(templatesFor("tienda", "rasm"), ["rasm", ...STORE]);
  assert.deepEqual(templatesFor("tienda", "barberia-artesanal"), ["barberia-artesanal", ...STORE]);
  assert.deepEqual(templatesFor("tienda", "mercado"), STORE);
  assert.deepEqual(templatesFor("tienda", "organico"), STORE);
  assert.deepEqual(templatesFor("tienda", "despensa"), STORE);
});

test("los demás rubros ven exactamente lo de antes, sin plantillas de tienda", () => {
  assert.deepEqual(templatesFor("salon"), SALON);
  for (const type of [null, undefined, "lavaautos", "servicios", "escuela"]) {
    assert.deepEqual(templatesFor(type), LEGACY);
  }
  assert.deepEqual(templatesFor("servicios", "luxia"), [...LEGACY, "luxia"]);
});

test("un negocio que dejó de ser tienda conserva su plantilla de tienda guardada", () => {
  assert.deepEqual(templatesFor("salon", "mercado"), [...SALON, "mercado"]);
  assert.deepEqual(templatesFor("salon", "organico"), [...SALON, "organico"]);
  assert.deepEqual(templatesFor("servicios", "organico"), [...LEGACY, "organico"]);
  assert.deepEqual(templatesFor("salon", "despensa"), [...SALON, "despensa"]);
});
