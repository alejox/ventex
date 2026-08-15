import test from "node:test";
import assert from "node:assert/strict";
import {
  milestoneFor,
  renderPromoMessage,
  whatsappNumber,
  whatsappLink,
  DEFAULT_PROMO_MESSAGE,
  businessDisplayName,
} from "../services/promos.service";
import type { PromoMilestone } from "../services/promos.service";

const hito = (over: Partial<PromoMilestone> = {}): PromoMilestone => ({
  id: "m1",
  threshold: 10,
  reward: "Corte gratis",
  recurring: true,
  is_active: true,
  ...over,
});

test("1. Un hito que se repite cae en cada múltiplo; uno que no, solo en el número exacto", () => {
  const cada10 = [hito({ threshold: 10, recurring: true })];
  assert.equal(milestoneFor(10, cada10)?.reward, "Corte gratis");
  assert.equal(milestoneFor(20, cada10)?.reward, "Corte gratis");
  assert.equal(milestoneFor(9, cada10), null);
  assert.equal(milestoneFor(11, cada10), null);

  const soloA50 = [hito({ threshold: 50, recurring: false, reward: "Kit de barba" })];
  assert.equal(milestoneFor(50, soloA50)?.reward, "Kit de barba");
  assert.equal(milestoneFor(100, soloA50), null, "no se repite: 100 no lo vuelve a otorgar");
});

test("2. Con dos hitos a la vez gana el umbral MÁS ALTO", () => {
  // A los 50 cortes aplican los dos: 50 es múltiplo de 10 y además es el hito
  // propio de 50. La noticia es haber llegado a 50, no que sea múltiplo de 10.
  const milestones = [
    hito({ id: "a", threshold: 10, recurring: true, reward: "Corte gratis" }),
    hito({ id: "b", threshold: 50, recurring: false, reward: "Kit de barba" }),
  ];
  assert.equal(milestoneFor(50, milestones)?.reward, "Kit de barba");
  assert.equal(milestoneFor(30, milestones)?.reward, "Corte gratis", "a los 30 solo aplica el de 10");
});

test("3. Un hito inactivo no otorga nada, y cero cortes nunca es un hito", () => {
  assert.equal(milestoneFor(10, [hito({ is_active: false })]), null);
  // Sin este corte, `0 % 10 === 0` haría que un cliente sin un solo corte
  // "alcanzara" el hito y le llegara el mensaje de premio.
  assert.equal(milestoneFor(0, [hito()]), null);
  assert.equal(milestoneFor(10, []), null);
});

test("4. El mensaje reemplaza las variables y no deja huecos visibles", () => {
  const texto = renderPromoMessage("Hola {cliente}, llevás {cortes} en {negocio}. {premio}", {
    cliente: "Juan",
    cortes: 7,
    negocio: "La Barbe",
    premio: null,
  });
  assert.equal(texto, "Hola Juan, llevás 7 en La Barbe.");
  assert.ok(!texto.includes("{"), "ninguna variable puede llegarle al cliente sin reemplazar");

  // Una plantilla vacía cae en el default en vez de mandar un mensaje en blanco.
  assert.equal(
    renderPromoMessage("   ", { cliente: "Ana", cortes: 3, negocio: "X" }),
    DEFAULT_PROMO_MESSAGE.replace("{cliente}", "Ana").replace("{cortes}", "3").replace("{negocio}", "X"),
  );
});

test("5. El teléfono se normaliza a lo que espera WhatsApp", () => {
  // Los teléfonos se cargan como los dicta el cliente; wa.me no acepta ni
  // espacios ni signos, y sin indicativo abre un chat con un número inexistente.
  assert.equal(whatsappNumber("311 232 9185"), "573112329185");
  assert.equal(whatsappNumber("+57 311 232 9185"), "573112329185");
  assert.equal(whatsappNumber("3112329185"), "573112329185");
  assert.equal(whatsappNumber(null), null);
  assert.equal(whatsappNumber("123"), null, "demasiado corto para ser un teléfono");
});

test("6. Sin teléfono no hay enlace, y el texto viaja escapado", () => {
  assert.equal(whatsappLink(null, "hola"), null);
  assert.equal(whatsappLink("", "hola"), null);

  const link = whatsappLink("3112329185", "Hola Juan, llevás 10 cortes 💈")!;
  assert.ok(link.startsWith("https://api.whatsapp.com/send?phone=573112329185"));
  assert.ok(link.includes("text="));
  assert.ok(!link.includes(" "), "un espacio sin escapar corta la URL");
  assert.ok(link.includes(encodeURIComponent("💈")), "el emoji tiene que sobrevivir el escapado");
});

test("7. El nombre del negocio cae en cadena, no directo al genérico", () => {
  // Hay DOS fuentes: lo que el dueño escribió en Ajustes y el nombre con el que
  // se registró. El POS leía SOLO la primera —que arranca vacía hasta que
  // alguien abre esa pestaña— y le mandaba "nuestro local" al cliente teniendo
  // "labarbe" a un campo de distancia.
  assert.equal(businessDisplayName("La Barbería", "labarbe"), "La Barbería");
  assert.equal(businessDisplayName(null, "labarbe"), "labarbe");
  assert.equal(businessDisplayName("", "labarbe"), "labarbe");
  assert.equal(businessDisplayName("   ", "labarbe"), "labarbe", "en blanco no es un nombre");
  assert.equal(businessDisplayName(undefined, undefined), "nuestro local");
});
