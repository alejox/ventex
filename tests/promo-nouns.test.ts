import test from "node:test";
import assert from "node:assert/strict";
import { defaultPromoMessageFor, promoNounFor, howMany, articleSingular, promoTemplateFor } from "../config/promo-nouns";
import { DEFAULT_PROMO_MESSAGE, renderPromoMessage } from "../services/promos.service";
import { isPromoDraftDirty } from "../app/dashboard/settings/promociones/promo-draft";

test("Cada rubro cuenta con su palabra", () => {
  assert.equal(promoNounFor("salon").plural, "cortes");
  assert.equal(promoNounFor("lavaautos").plural, "lavados");
  assert.equal(promoNounFor("escuela").plural, "clases");
  assert.equal(promoNounFor("servicios").plural, "visitas");
  assert.equal(promoNounFor(null).plural, "visitas");
  assert.equal(howMany(promoNounFor("escuela")), "cuántas");
  assert.equal(articleSingular(promoNounFor("lavaautos")), "el");
});

test("El salón conserva el mensaje por defecto tal cual", () => {
  assert.equal(defaultPromoMessageFor(promoNounFor("salon")), DEFAULT_PROMO_MESSAGE);
});

test("Otro rubro cambia solo la palabra, nunca la variable", () => {
  const msg = defaultPromoMessageFor(promoNounFor("escuela"));
  assert.ok(msg.includes("{cortes} clases"));
  assert.ok(!msg.includes("💈"));
  assert.ok(msg.includes("{premio}"));
  // Y renderPromoMessage lo singulariza igual que con "cortes".
  const texto = renderPromoMessage(msg, { cliente: "Ana", cortes: 1, negocio: "Do Re Mi" });
  assert.ok(texto.includes("1 clase "), texto);
});

test("Cambios sin guardar: servicios en otro orden no cuentan", () => {
  const saved = { enabled: true, serviceIds: ["a", "b"], message: null };
  assert.equal(isPromoDraftDirty(saved, { enabled: true, serviceIds: ["b", "a"], message: "X" }, "X"), false);
  assert.equal(isPromoDraftDirty(saved, { enabled: true, serviceIds: ["a"], message: "X" }, "X"), true);
  assert.equal(isPromoDraftDirty(saved, { enabled: false, serviceIds: ["a", "b"], message: "X" }, "X"), true);
  assert.equal(isPromoDraftDirty(saved, { enabled: true, serviceIds: ["a", "b"], message: "Y" }, "X"), true);
  assert.equal(
    isPromoDraftDirty(saved, { enabled: true, serviceIds: ["a", "c"], message: "X" }, "X"),
    true,
    "mismo tamaño, distinto contenido",
  );
});

test("POS y Clientes: sin mensaje guardado se usa el default DEL RUBRO", () => {
  assert.equal(promoTemplateFor(null, "lavaautos"), defaultPromoMessageFor(promoNounFor("lavaautos")));
  assert.ok(promoTemplateFor("   ", "escuela").includes("{cortes} clases"));
  assert.equal(promoTemplateFor(null, "salon"), DEFAULT_PROMO_MESSAGE);
  // Lo que guardó el negocio manda, aunque diga "cortes" en un lavaautos.
  assert.equal(promoTemplateFor("Hola {cliente}", "lavaautos"), "Hola {cliente}");
});

test("El default habla de tú, no de vos", () => {
  assert.ok(DEFAULT_PROMO_MESSAGE.includes("Ya llevas {cortes}"), DEFAULT_PROMO_MESSAGE);
  assert.ok(!/llevás/.test(DEFAULT_PROMO_MESSAGE));
});
