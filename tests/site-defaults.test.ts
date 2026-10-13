import { test } from "node:test";
import assert from "node:assert/strict";
import { defaultLandingConfig, siteDefaultsFor } from "../services/public-site.types";

test("salón: los valores por defecto de un sitio nuevo no cambian", () => {
  const defaults = siteDefaultsFor("salon");
  assert.equal(defaults.bookingEnabled, true);
  assert.deepEqual(defaults.config, defaultLandingConfig());
});

test("sin tipo de negocio y en los demás rubros con agenda: mismos valores de siempre", () => {
  for (const type of [null, undefined, "lavaautos", "servicios", "escuela"] as const) {
    const defaults = siteDefaultsFor(type);
    assert.equal(defaults.bookingEnabled, true);
    assert.deepEqual(defaults.config, defaultLandingConfig());
  }
});

test("tienda: sin reservas y con los productos primero", () => {
  const { bookingEnabled, config } = siteDefaultsFor("tienda");
  assert.equal(bookingEnabled, false);
  assert.equal(config.sections[0].id, "products");
  assert.equal(config.sections[0].visible, true);
  assert.equal(config.sections[0].title, "Nuestros productos");
  assert.equal(config.sections[0].subtitle, "Haz tu pedido por WhatsApp");
  assert.equal(config.hero.eyebrow, "Bienvenido");
});

test("tienda: servicios, equipo y reservas ocultos; horarios y contacto visibles", () => {
  const { config } = siteDefaultsFor("tienda");
  const visible = Object.fromEntries(config.sections.map((s) => [s.id, s.visible]));
  assert.deepEqual(visible, {
    products: true,
    about: true,
    gallery: true,
    hours: true,
    contact: true,
    services: false,
    team: false,
    booking: false,
  });
  // Todas las secciones siguen presentes: ocultas, no borradas.
  assert.equal(config.sections.length, defaultLandingConfig().sections.length);
});

test("tienda: respeta la plantilla pedida y devuelve una configuración independiente", () => {
  const first = siteDefaultsFor("tienda", "fallspa");
  const second = siteDefaultsFor("tienda", "fallspa");
  assert.equal(first.config.template, "fallspa");
  first.config.sections[0].title = "Cambiado";
  assert.equal(second.config.sections[0].title, "Nuestros productos");
});

test("tienda: sin plantilla pedida arranca en Mercado; los demás rubros siguen en Rasm", () => {
  assert.equal(siteDefaultsFor("tienda").config.template, "mercado");
  for (const type of [null, undefined, "salon", "lavaautos", "servicios", "escuela"] as const) {
    assert.equal(siteDefaultsFor(type).config.template, "rasm");
  }
});
