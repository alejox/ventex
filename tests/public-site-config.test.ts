import test from "node:test";
import assert from "node:assert/strict";
import {
  defaultLandingConfig,
  normalizeLandingConfig,
  SITE_SECTION_IDS,
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
