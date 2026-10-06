import test from "node:test";
import assert from "node:assert/strict";
import {
  defaultLandingConfig,
  normalizeLandingConfig,
  SITE_TEMPLATES,
  SITE_SECTION_IDS,
  TEMPLATE_DESCRIPTIONS,
  TEMPLATE_GROUPS,
  TEMPLATE_LABELS,
  templatesFor,
} from "../services/public-site.types";

test("defaultLandingConfig creates an independent complete configuration", () => {
  const first = defaultLandingConfig("fallspa");
  const second = defaultLandingConfig("fallspa");
  first.sections[0].title = "Cambio";

  assert.equal(first.template, "fallspa");
  assert.deepEqual(second.sections.map((section) => section.id), SITE_SECTION_IDS);
  assert.equal(second.sections[0].title, "Servicios");
});

test("normalizeLandingConfig rejects unknown templates and completes missing sections", () => {
  const config = normalizeLandingConfig({
    version: 1,
    template: "desconocido",
    sections: [{ id: "gallery", visible: false, title: "Fotos", subtitle: "Mirá" }],
  });

  assert.equal(config.template, "rasm");
  assert.equal(config.sections[0].id, "gallery");
  assert.equal(config.sections[0].visible, false);
  assert.deepEqual(new Set(config.sections.map((section) => section.id)), new Set(SITE_SECTION_IDS));
});

test("normalizeLandingConfig removes duplicate sections and limits gallery images", () => {
  const images = Array.from({ length: 15 }, (_, index) => ({
    id: String(index),
    url: `https://example.com/${index}.jpg`,
    alt: `Imagen ${index}`,
  }));
  const config = normalizeLandingConfig({
    version: 1,
    template: "qutter",
    gallery: { images },
    sections: [
      { id: "services", title: "Primero" },
      { id: "services", title: "Duplicado" },
    ],
  });

  assert.equal(config.gallery.images.length, 12);
  assert.equal(config.sections.filter((section) => section.id === "services").length, 1);
  assert.equal(config.sections[0].title, "Primero");
});

test("all six templates survive normalization and have editor copy", () => {
  for (const template of SITE_TEMPLATES) {
    assert.equal(normalizeLandingConfig({ version: 1, template }).template, template);
    assert.ok(TEMPLATE_LABELS[template]);
    assert.ok(TEMPLATE_DESCRIPTIONS[template]);
  }
});

test("barber templates are offered only to salons", () => {
  assert.deepEqual(templatesFor("tienda"), ["rasm", "fallspa", "qutter"]);
  assert.deepEqual(templatesFor("salon"), SITE_TEMPLATES);
});

test("the new salon designs are grouped by tab and offered only to salons", () => {
  const salon = templatesFor("salon");
  for (const template of ["luxia", "lezar", "zen"] as const) {
    assert.ok(salon.includes(template));
    assert.ok(!templatesFor("tienda").includes(template));
    assert.equal(TEMPLATE_GROUPS[template], "salon");
  }
  for (const template of ["qutter", "barberia", "barberia-artesanal", "barberia-urbana"] as const) {
    assert.equal(TEMPLATE_GROUPS[template], "barberia");
  }
  // Toda plantilla tiene pestaña, etiqueta y descripción.
  for (const template of SITE_TEMPLATES) {
    assert.ok(TEMPLATE_GROUPS[template] && TEMPLATE_LABELS[template] && TEMPLATE_DESCRIPTIONS[template]);
  }
});

test("a saved salon design remains selectable after a business type change", () => {
  assert.ok(templatesFor("tienda", "luxia").includes("luxia"));
});

test("a saved barber template remains selectable after a business type change", () => {
  assert.deepEqual(
    templatesFor("tienda", "barberia-artesanal"),
    ["rasm", "fallspa", "qutter", "barberia-artesanal"],
  );
});
