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
  progressAfterRedeem,
  haircutsPaidByReward,
  renderRedeemMessage,
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

// ---------------------------------------------------------------------------
// El excedente del canje arranca el conteo siguiente.
// ---------------------------------------------------------------------------

test("El premio consume su umbral, no todo el progreso", () => {
  // Llegó a 11 antes de pasar por el mostrador: el corte 11 es suyo.
  assert.equal(progressAfterRedeem(11, [hito({ threshold: 10 })]), 1);
});

test("Justo en el umbral queda en cero", () => {
  assert.equal(progressAfterRedeem(10, [hito({ threshold: 10 })]), 0);
});

test("Con varios hitos descuenta el ENTREGADO, no el más bajo", () => {
  // Progreso 21 con hitos de 10 y 20: se entrega el de 20 y queda 1.
  // Descontar 10 dejaría 11 y le regalaría un segundo premio al toque.
  const hitos = [hito({ threshold: 10 }), hito({ id: "m2", threshold: 20 })];
  assert.equal(progressAfterRedeem(21, hitos), 1);
});

test("Sin premio que corresponda, el progreso no se toca", () => {
  assert.equal(progressAfterRedeem(9, [hito({ threshold: 10 })]), 9);
});

test("Un hito inactivo no consume nada", () => {
  const inactivo = hito({ threshold: 10, is_active: false });
  assert.equal(progressAfterRedeem(12, [inactivo]), 12);
});

// ---------------------------------------------------------------------------
// El corte que paga el premio no cuenta para el premio siguiente.
//
// Medido en produccion: los 5 canjes de la base tenian `progress_before = 11`
// contra un umbral de 10, y en los 4 que salieron del POS la venta se cobro en
// $0.00 con un corte que cuenta adentro. Ese 11 no era un cliente que volvio y
// pago de mas: era el corte gratis, contado por el trigger antes de que el
// canje corriera. El cliente quedaba con un credito por un corte que nunca
// pago.
// ---------------------------------------------------------------------------

test("El corte que el premio pago no cuenta: 10 + corte gratis queda en 0", () => {
  // El trigger ya sumo el corte gratis (progreso 11), pero lo pago el premio.
  assert.equal(progressAfterRedeem(11, [hito({ threshold: 10 })], 1), 0);
});

test("El corte que el cliente PAGO sigue arrastrando", () => {
  // Mismo 11, pero nadie regalo nada: el corte de mas es suyo y queda 1.
  assert.equal(progressAfterRedeem(11, [hito({ threshold: 10 })], 0), 1);
});

test("El hito se elige sobre el progreso EFECTIVO, no sobre el inflado", () => {
  // Con hitos de 10 y 11, el corte gratis empujaba el progreso a 11 y entregaba
  // el premio de 11 — uno que el cliente no habia ganado con cortes propios.
  const hitos = [hito({ threshold: 10, reward: "Corte gratis" }), hito({ id: "m2", threshold: 11, reward: "Barba gratis" })];
  assert.equal(progressAfterRedeem(11, hitos, 1), 0);
});

test("Un premio que cubre la unidad entera paga el corte; uno parcial no", () => {
  const cuentan = ["svc-corte"];
  const carrito = [linea({ unitPrice: 18000 })];

  // Gratis: el descuento iguala el precio de la unidad. Ese corte lo pago el premio.
  assert.equal(haircutsPaidByReward(18000, carrito, cuentan), 1);
  // 50%: el cliente puso la otra mitad, asi que ese corte es suyo y cuenta.
  assert.equal(haircutsPaidByReward(9000, carrito, cuentan), 0);
  // Un monto mayor al precio sigue siendo UN corte, no dos.
  assert.equal(haircutsPaidByReward(25000, carrito, cuentan), 1);
});

test("Sin descuento o sin cortes en la cuenta, el premio no pago ningun corte", () => {
  const cuentan = ["svc-corte"];
  // Premio de tipo `texto`: se entrega a mano y no toca la cuenta.
  assert.equal(haircutsPaidByReward(null, [linea()], cuentan), 0);
  // El premio se aplico sobre una cuenta sin cortes que cuenten.
  assert.equal(haircutsPaidByReward(18000, [linea({ itemId: "otro" })], cuentan), 0);
  assert.equal(haircutsPaidByReward(18000, [], cuentan), 0);
});

// ---------------------------------------------------------------------------
// Al completar la promo, el mensaje lo ANUNCIA.
//
// `{premio}` renderizaba el nombre pelado del premio, asi que al llegar al hito
// al cliente le llegaba "...Ya llevas 10 cortes en La Barbe. Corte gratis" — una
// etiqueta colgando al final de una frase que no la presenta. El anuncio se
// arma DENTRO de `renderPromoMessage` y no en cada pantalla: es lo unico que
// alcanza a las plantillas YA GUARDADAS. El editor precarga el default y
// guardarlo lo congela, asi que mejorar el default no le llega a quien ya
// guardo — y el unico negocio con promos activas guardo exactamente el default.
// ---------------------------------------------------------------------------

test("Al llegar al hito el mensaje anuncia la promo completada", () => {
  const texto = renderPromoMessage(DEFAULT_PROMO_MESSAGE, {
    cliente: "Juan",
    cortes: 10,
    negocio: "La Barbe",
    premio: "Corte gratis",
  });
  assert.ok(/te espera|próxima/i.test(texto), "tiene que anunciarlo, no solo nombrarlo");
  assert.ok(texto.includes("Corte gratis"), "y el premio sigue nombrado");
  assert.ok(texto.includes("10 cortes"), "el contador sigue estando");
});

test("Sin premio ganado no se anuncia nada", () => {
  const texto = renderPromoMessage(DEFAULT_PROMO_MESSAGE, {
    cliente: "Ana",
    cortes: 3,
    negocio: "La Barbe",
    premio: null,
  });
  assert.ok(!/te espera|te ganaste/i.test(texto), "a los 3 cortes no gano nada");
  assert.ok(!texto.includes("{"), "y la variable no le llega cruda al cliente");
});

test("El anuncio alcanza a la plantilla YA GUARDADA", () => {
  // El texto exacto que el negocio tiene guardado hoy en `settings`.
  const guardada = "¡Hola {cliente}! Gracias por tu visita 💈 Ya llevás {cortes} cortes en {negocio}. {premio}";
  const texto = renderPromoMessage(guardada, {
    cliente: "Juan",
    cortes: 10,
    negocio: "La Barbe",
    premio: "Corte gratis",
  });
  assert.ok(/te espera/i.test(texto));
});

test("El anuncio no duplica el cierre que el premio ya trae", () => {
  const con = (premio: string) =>
    renderPromoMessage("{premio}", { cliente: "J", cortes: 10, negocio: "X", premio });

  assert.ok(!con("Corte gratis.").includes(".."), "un premio que ya termina en punto no lleva otro");
  assert.ok(!con("¡Corte gratis!").includes("!."), "ni uno que termina en signo");
  assert.ok(con("Corte gratis").endsWith("."), "y al que no trae cierre se le pone");
});

test("Un premio con caracteres de reemplazo no rompe el mensaje", () => {
  // `String.replace` interpreta `$&` y `$'` en el string de reemplazo: un premio
  // llamado "50% off $& mas" se corrompia solo al insertarse.
  const texto = renderPromoMessage("{premio}", {
    cliente: "J", cortes: 10, negocio: "X", premio: "Corte $& gratis",
  });
  assert.ok(texto.includes("Corte $& gratis"), "el premio se inserta literal");
});

// ---------------------------------------------------------------------------
// Al canjear, el mensaje dice que CANJEO — no cuenta cortes.
//
// Despues de canjear el progreso queda en 0, y eso esta bien. Lo que estaba mal
// era el mensaje: el POS ofrecia igual el boton "Enviar a Juan" con el texto
// "Ya llevas 0 cortes en La Barbe", que es lo ultimo que hay que mandarle a
// alguien a quien se le acaba de entregar un premio. El contador arranca de
// nuevo en la visita SIGUIENTE; el mensaje de esta visita es otro.
// ---------------------------------------------------------------------------

test("El mensaje de canje dice que canjeo y nombra el premio", () => {
  const texto = renderRedeemMessage(null, {
    cliente: "Juan",
    negocio: "La Barbe",
    premio: "Corte gratis",
    total: 41,
  });
  assert.ok(/[Cc]anjeaste/.test(texto), "tiene que decir que lo canjeo");
  assert.ok(texto.includes("Corte gratis"), "y nombrar el premio entregado");
  assert.ok(texto.includes("La Barbe"));
  assert.ok(!texto.includes("{"), "ninguna variable puede llegarle cruda al cliente");
});

test("El mensaje de canje NO cuenta cortes ni anuncia una promo ganada", () => {
  const texto = renderRedeemMessage(null, {
    cliente: "Juan", negocio: "La Barbe", premio: "Corte gratis", total: 41,
  });
  assert.ok(!texto.includes("0 cortes"), "el cero no se le menciona al cliente");
  assert.ok(!/te espera/i.test(texto), "eso es el mensaje del hito, no el del canje");
});

test("El premio del canje se nombra, pero NO se anuncia como ganado", () => {
  // `renderPromoMessage` envuelve `{premio}` en "¡Ya te ganaste tu premio!".
  // Reusar esa funcion para el canje diria que gano un premio que acaba de usar.
  const texto = renderRedeemMessage("{premio}", {
    cliente: "J", negocio: "X", premio: "Corte gratis", total: 1,
  });
  assert.equal(texto, "Te llevaste: Corte gratis.");
  assert.ok(!/te espera/i.test(texto), "ya lo uso: no lo esta esperando");
});

test("El canje tambien inserta literal y cae al default", () => {
  assert.ok(
    renderRedeemMessage("{premio}", { cliente: "J", negocio: "X", premio: "Corte $& gratis", total: 1 })
      .includes("Corte $& gratis"),
  );
  // Una plantilla en blanco cae al default en vez de mandar un mensaje vacio.
  assert.ok(renderRedeemMessage("   ", { cliente: "Ana", negocio: "X", premio: "P", total: 2 }).length > 0);
  // `{total}` es el historico de por vida: el canje no lo toca.
  assert.equal(
    renderRedeemMessage("{cliente} lleva {total}", { cliente: "Ana", negocio: "X", premio: "P", total: 41 }),
    "Ana lleva 41",
  );
});

// ---------------------------------------------------------------------------
// Progreso 0 CON historial = la ultima visita fue la del canje.
//
// El dueno lo pidio explicito despues de que le plantee el riesgo del cero
// ambiguo, asi que se implementa — pero se cierra el agujero que ese riesgo
// senalaba con el dato que la funcion YA recibe: `{total}`, el historico de por
// vida. Progreso 0 con total 0 es el cliente nuevo que nunca vino, y a ese no se
// le dice que canjeo nada. Progreso 0 con total > 0 solo lo deja un canje.
//
// Va en `renderPromoMessage` y no en cada pantalla porque el mensaje sale de
// TRES lugares —POS, Clientes y Promociones— y arreglar uno solo fue justamente
// lo que dejo el problema vivo.
// ---------------------------------------------------------------------------

test("Progreso 0 con historial dice que canjeo, no '0 cortes'", () => {
  const texto = renderPromoMessage(DEFAULT_PROMO_MESSAGE, {
    cliente: "Luis",
    cortes: 0,
    total: 44,
    negocio: "labarbe",
    premio: null,
  });
  assert.ok(/[Cc]anjeaste/.test(texto), "tiene que decir que canjeo");
  assert.ok(!texto.includes("0 cortes"), "el cero no se le menciona al cliente");
});

test("El cliente que nunca vino no canjeo nada: hace falta HABER hecho cortes", () => {
  // "La promocion nunca se podra canjear si no hay cortes, eso es imposible."
  // Es la regla del negocio, y esta es esa misma regla puesta en codigo: sin
  // cortes no hubo canje. `total` es el historico de por vida, el unico dato
  // que separa los dos ceros — el del que acaba de canjear y el del que nunca
  // piso el local. Decirle a un cliente nuevo que canjeo algo es la clase de
  // mensaje que lo hace desconfiar del negocio, no del sistema.
  const texto = renderPromoMessage(DEFAULT_PROMO_MESSAGE, {
    cliente: "Ana",
    cortes: 0,
    total: 0,
    negocio: "labarbe",
    premio: null,
  });
  assert.ok(!/[Cc]anjeaste/.test(texto), "nunca vino: decirle que canjeo es mentirle");
});

test("El aviso de canje tambien alcanza a la plantilla ya guardada", () => {
  const guardada = "¡Hola {cliente}! Gracias por tu visita 💈 Ya llevás {cortes} cortes en {negocio}. {premio}";
  const texto = renderPromoMessage(guardada, {
    cliente: "Luis", cortes: 0, total: 44, negocio: "labarbe", premio: null,
  });
  assert.ok(/[Cc]anjeaste/.test(texto));
  assert.ok(!texto.includes("0 cortes"));
});

test("Sin premio conocido el mensaje de canje igual se entiende", () => {
  // Desde Clientes o Promociones no se sabe QUE premio se entrego —solo que el
  // progreso volvio a cero—, y el mensaje tiene que funcionar igual.
  const texto = renderRedeemMessage(null, { cliente: "Luis", negocio: "labarbe", premio: "", total: 44 });
  assert.ok(/[Cc]anjeaste/.test(texto));
  assert.ok(!texto.includes(": ."), "no puede quedar el hueco del premio ausente");
  assert.ok(!texto.includes("  "), "ni dos espacios seguidos");
});

// ---------------------------------------------------------------------------
// El hito AVISA, el hito + 1 CANJEA. Dos palabras distintas.
//
// Con un hito de 10, el corte 10 es el ultimo que el cliente PAGA y el 11 es el
// premio. El mensaje del 10 decia "¡Completaste tu promocion!", que se lee como
// si ya la hubiera canjeado — un corte antes de que pase. Desde afuera parece
// que el sistema dispara la promo corrida, cuando lo unico corrido es el texto.
// ---------------------------------------------------------------------------

test("En el hito el mensaje AVISA que le espera el premio, no que lo canjeo", () => {
  const texto = renderPromoMessage(DEFAULT_PROMO_MESSAGE, {
    cliente: "Luis", cortes: 10, total: 10, negocio: "labarbe", premio: "Corte gratis",
  });
  assert.ok(!/[Cc]anjeaste/.test(texto), "todavia no canjeo nada: eso pasa en el corte 11");
  assert.ok(/te espera|próxima/i.test(texto), "tiene que invitarlo a venir a buscarlo");
  assert.ok(texto.includes("Corte gratis"), "y decirle que se gano");
  assert.ok(texto.includes("10 cortes"), "el contador sigue estando");
});

test("En el hito + 1 el mensaje dice que CANJEO, y ahi el contador reinicia", () => {
  const texto = renderRedeemMessage(null, {
    cliente: "Luis", negocio: "labarbe", premio: "Corte gratis", total: 11,
  });
  assert.ok(/[Cc]anjeaste/.test(texto));
  assert.ok(!/te espera/i.test(texto), "ya no lo espera: se lo llevo");
  // Y el contador queda en cero, no en 1: el corte 11 lo pago el premio.
  assert.equal(progressAfterRedeem(11, [hito({ threshold: 10 })], 1), 0);
});

// ---------------------------------------------------------------------------
// Con un solo corte, la palabra va en singular.
//
// "Ya llevas 1 cortes" pasa en CADA reinicio de ciclo, asi que no es un caso
// raro. La palabra la escribe el negocio en su plantilla —la variable solo
// aporta el numero—, asi que se singulariza la palabra que sigue al token, no
// cualquier "1 algo" del texto: "Ya llevas 1 mas" no se toca.
// ---------------------------------------------------------------------------

test("Un solo corte va en singular", () => {
  const g = "¡Hola {cliente}! Ya llevás {cortes} cortes en {negocio}.";
  assert.ok(
    renderPromoMessage(g, { cliente:"Luis", cortes:1, total:1, negocio:"labarbe", premio:null })
      .includes("1 corte en"),
  );
});

test("Del 2 en adelante sigue en plural, y el 0 tambien", () => {
  const g = "{cortes} cortes";
  const v = (n: number) => renderPromoMessage(g, { cliente:"L", cortes:n, total:n, negocio:"X", premio:null });
  assert.equal(v(2), "2 cortes");
  assert.equal(v(7), "7 cortes");
  // "0 cortes" es correcto en español: el cero va en plural.
  assert.equal(v(0), "0 cortes");
});

test("Los que TERMINAN en 1 siguen en plural", () => {
  // 11 y 21 son la trampa de cualquier regla que mire solo el ultimo digito.
  const g = "{cortes} cortes";
  assert.equal(renderPromoMessage(g, { cliente:"L", cortes:11, total:11, negocio:"X", premio:null }), "11 cortes");
  assert.equal(renderPromoMessage(g, { cliente:"L", cortes:21, total:21, negocio:"X", premio:null }), "21 cortes");
});

test("Funciona con la palabra que el negocio haya escrito, no solo 'cortes'", () => {
  const uno = (plantilla: string) =>
    renderPromoMessage(plantilla, { cliente:"L", cortes:1, total:1, negocio:"X", premio:null });
  assert.equal(uno("{cortes} visitas"), "1 visita");
  assert.equal(uno("{cortes} servicios"), "1 servicio");
  // El plural en -ces vuelve a -z: "1 veces" seria peor que el problema original.
  assert.equal(uno("{cortes} veces"), "1 vez");
  // Una palabra que ya esta en singular no se toca.
  assert.equal(uno("{cortes} corte"), "1 corte");
});

test("Solo se toca la palabra pegada al token, no cualquier 1 del mensaje", () => {
  // "1 más" no puede volverse "1 má".
  const texto = renderPromoMessage("{cortes} cortes y 1 más", {
    cliente:"L", cortes:1, total:1, negocio:"X", premio:null,
  });
  assert.equal(texto, "1 corte y 1 más");
});

test("El historico tambien se singulariza", () => {
  assert.equal(
    renderPromoMessage("{total} cortes de por vida", { cliente:"L", cortes:5, total:1, negocio:"X", premio:null }),
    "1 corte de por vida",
  );
});
