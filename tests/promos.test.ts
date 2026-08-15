import test from "node:test";
import assert from "node:assert/strict";
import { nextMilestone } from "../services/promo-customers.service";
import {
  availableReward,
  promoDiscountFor,
  renderPromoMessage,
  whatsappNumber,
  whatsappLink,
  DEFAULT_PROMO_MESSAGE,
  businessDisplayName,
} from "../services/promos.service";
import type { PromoMilestone, DiscountableLine } from "../services/promos.service";

const hito = (over: Partial<PromoMilestone> = {}): PromoMilestone => ({
  id: "m1",
  threshold: 10,
  reward: "Corte gratis",
  reward_kind: "gratis",
  reward_value: null,
  is_active: true,
  ...over,
});

test("1. El premio se gana con el PROGRESO, y no exige llegar justo", () => {
  const cada10 = [hito({ threshold: 10 })];
  assert.equal(availableReward(10, cada10)?.reward, "Corte gratis");
  // Clave: el que llegó a 12 sin canjear NO perdió el premio de 10. Con la
  // aritmética de múltiplos que había antes, 12 no daba nada y el cliente se
  // enteraba de que su premio se evaporó por no venir el día exacto.
  assert.equal(availableReward(12, cada10)?.reward, "Corte gratis");
  assert.equal(availableReward(9, cada10), null);
  assert.equal(availableReward(0, cada10), null, "sin cortes no hay premio");
});

test("2. Con varios hitos ganados, gana el MÁS ALTO", () => {
  const escalones = [
    hito({ id: "a", threshold: 5, reward: "10% off" }),
    hito({ id: "b", threshold: 10, reward: "Corte gratis" }),
  ];
  assert.equal(availableReward(7, escalones)?.reward, "10% off");
  assert.equal(availableReward(10, escalones)?.reward, "Corte gratis");
  assert.equal(availableReward(4, escalones), null);
});

test("3. Un hito inactivo no otorga nada", () => {
  assert.equal(availableReward(10, [hito({ is_active: false })]), null);
  assert.equal(availableReward(10, []), null);
});

test("3b. Lo que falta para el próximo es el escalón más bajo por encima", () => {
  const escalones = [hito({ id: "a", threshold: 5 }), hito({ id: "b", threshold: 10 })];
  assert.deepEqual(nextMilestone(0, escalones)?.missing, 5);
  assert.deepEqual(nextMilestone(3, escalones)?.missing, 2);
  // Con 5 alcanzado, lo que viene es el de 10 — no el de 5 otra vez.
  assert.deepEqual(nextMilestone(5, escalones)?.threshold, 10);
  assert.equal(nextMilestone(10, escalones), null, "no hay más escalones");
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
  const porDefecto = renderPromoMessage("   ", { cliente: "Ana", cortes: 3, negocio: "X" });
  assert.ok(porDefecto.startsWith("¡Hola Ana!"));
  assert.ok(porDefecto.includes("3 cortes"));
  assert.ok(!porDefecto.includes("{"), "el default tampoco puede dejar variables sin reemplazar");
  assert.ok(DEFAULT_PROMO_MESSAGE.includes("{premio}"), "el default trae el premio");

  // El caso del pedido: a los 10 el mensaje anuncia el premio.
  const conPremio = renderPromoMessage(null, {
    cliente: "Juan", cortes: 10, negocio: "labarbe", premio: "Tu próximo corte es gratis 🎉",
  });
  assert.ok(conPremio.includes("10 cortes"));
  assert.ok(conPremio.includes("Tu próximo corte es gratis 🎉"));

  // `{total}` es el histórico y cae al progreso si no se pasa.
  assert.ok(
    renderPromoMessage("{cortes} de {total}", { cliente: "A", cortes: 2, negocio: "X", total: 47 })
      === "2 de 47",
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

const linea = (over: Partial<DiscountableLine> = {}): DiscountableLine => ({
  key: "l1",
  itemId: "svc-corte",
  isService: true,
  unitPrice: 18000,
  quantity: 1,
  ...over,
});

test("8. El premio 'gratis' descuenta UNA unidad de la línea más cara que cuenta", () => {
  const cuentan = ["svc-corte", "svc-barba"];
  const carrito = [
    linea({ key: "a", itemId: "svc-corte", unitPrice: 18000, quantity: 2 }),
    linea({ key: "b", itemId: "svc-barba", unitPrice: 24000 }),
  ];
  const d = promoDiscountFor({ reward_kind: "gratis", reward_value: null }, carrito, cuentan);
  // La más cara: "tu próximo corte es gratis" lo lee el cliente sobre el que se
  // hizo, y regalarle el más barato se discute en el mostrador.
  assert.equal(d?.key, "b");
  // UNA unidad, aunque la línea traiga dos: es un corte gratis, no la línea.
  assert.equal(d?.discountAmount, 24000);
});

test("9. Porcentaje y monto se topan en el precio de la unidad", () => {
  const cuentan = ["svc-corte"];
  const carrito = [linea({ unitPrice: 18000 })];

  assert.equal(
    promoDiscountFor({ reward_kind: "porcentaje", reward_value: 50 }, carrito, cuentan)?.discountAmount,
    9000,
  );
  assert.equal(
    promoDiscountFor({ reward_kind: "monto", reward_value: 5000 }, carrito, cuentan)?.discountAmount,
    5000,
  );
  // Un monto mayor al precio no puede devolverle plata al cliente.
  assert.equal(
    promoDiscountFor({ reward_kind: "monto", reward_value: 999999 }, carrito, cuentan)?.discountAmount,
    18000,
  );
});

test("10. No aplica cuando no hay dónde aplicarlo", () => {
  const cuentan = ["svc-corte"];
  // Premio informativo: se entrega a mano, no se descuenta.
  assert.equal(promoDiscountFor({ reward_kind: "texto", reward_value: null }, [linea()], cuentan), null);
  // Carrito sin servicios que cuenten: el cliente ganó, pero no en esta cuenta.
  assert.equal(
    promoDiscountFor({ reward_kind: "gratis", reward_value: null }, [linea({ itemId: "otro" })], cuentan),
    null,
  );
  assert.equal(promoDiscountFor({ reward_kind: "gratis", reward_value: null }, [], cuentan), null);
  // Un producto con el mismo id que un servicio no cuenta: `isService` manda.
  assert.equal(
    promoDiscountFor({ reward_kind: "gratis", reward_value: null }, [linea({ isService: false })], cuentan),
    null,
  );
});
