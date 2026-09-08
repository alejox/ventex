import test from "node:test";
import assert from "node:assert/strict";
import {
  canKickWith,
  DEFAULT_DRAWER_CONFIG,
  drawerKickCommand,
  parseDrawerConfig,
  resolveTransportOrder,
  selectDrawerPortIndex,
  serializeDrawerConfig,
} from "../lib/cash-drawer";

/** Las tres puertas abiertas. El caso más común de todos es no tener ninguna. */
const TODO = { serial: true, usb: true, print: true };

test("1. El pulso es el comando ESC/POS que la impresora sabe leer", () => {
  // ESC p m t1 t2 = 0x1B 0x70 <pin> <encendido> <apagado>. La impresora no
  // interpreta nada: si un byte está fuera de lugar, el cajón no se mueve y no
  // hay error que avise. Por eso la secuencia se congela acá.
  assert.deepEqual(
    Array.from(drawerKickCommand(2, 50, 500)),
    [0x1b, 0x70, 0x00, 25, 250],
  );
});

test("2. El pin 5 cambia un solo byte", () => {
  // El RJ11 tiene dos pines de disparo y cuál usa el cajón lo decide el
  // fabricante, no nosotros. Con el pin equivocado el cajón queda mudo.
  assert.deepEqual(
    Array.from(drawerKickCommand(5, 50, 500)),
    [0x1b, 0x70, 0x01, 25, 250],
  );
});

test("3. Los tiempos viajan en unidades de 2 ms, no en milisegundos", () => {
  // Mandar 50 en vez de 25 dispara un pulso del DOBLE de largo. En un solenoide
  // eso es calor, no precisión.
  assert.deepEqual(Array.from(drawerKickCommand(2, 100, 200)).slice(3), [50, 100]);
  assert.deepEqual(Array.from(drawerKickCommand(2, 2, 2)).slice(3), [1, 1]);
});

test("4. Un pulso más largo que el máximo se recorta, NO da la vuelta", () => {
  // 600 ms / 2 = 300, que en un byte es 44: un pulso de 88 ms disfrazado de uno
  // de 600. El cajón haría clic sin abrir y el síntoma sería "a veces funciona".
  assert.deepEqual(Array.from(drawerKickCommand(2, 600, 900)).slice(3), [255, 255]);
});

test("5. Un pulso de cero no es un pulso", () => {
  // El solenoide necesita corriente por un rato para vencer el resorte. Un t1 de
  // 0 manda un comando perfectamente válido que no abre nada.
  assert.deepEqual(Array.from(drawerKickCommand(2, 0, 0)).slice(3), [1, 1]);
  assert.deepEqual(Array.from(drawerKickCommand(2, -30, -30)).slice(3), [1, 1]);
});

test("6. Un dispositivo sin configurar arranca con los valores por defecto", () => {
  // El cajón es configuración de ESTE navegador: una terminal nueva no hereda
  // nada, y tiene que poder vender igual desde el primer día.
  assert.deepEqual(parseDrawerConfig(null), DEFAULT_DRAWER_CONFIG);
  assert.deepEqual(parseDrawerConfig(""), DEFAULT_DRAWER_CONFIG);
});

test("7. Un JSON roto no puede romper el cobro", () => {
  // localStorage lo puede tocar cualquiera y sobrevive a versiones viejas de la
  // app. Si leer la config tira, la venta se cae con ella.
  assert.deepEqual(parseDrawerConfig("{no es json"), DEFAULT_DRAWER_CONFIG);
  assert.deepEqual(parseDrawerConfig("null"), DEFAULT_DRAWER_CONFIG);
  assert.deepEqual(parseDrawerConfig("[]"), DEFAULT_DRAWER_CONFIG);
  assert.deepEqual(parseDrawerConfig('"9600"'), DEFAULT_DRAWER_CONFIG);
});

test("8. Un pin inválido cae al 2 en vez de viajar al puerto", () => {
  // Lo que sale por el cable es un byte. Un pin 7 guardado a mano se convertiría
  // en 0x07, que no es ninguno de los dos comandos que el firmware conoce.
  assert.equal(parseDrawerConfig('{"pin":7}').pin, 2);
  assert.equal(parseDrawerConfig('{"pin":"5"}').pin, 2);
  assert.equal(parseDrawerConfig('{"pin":5}').pin, 5);
});

test("9. Una velocidad que la impresora no habla cae a 9600", () => {
  // Con el baud rate equivocado no hay error: salen bytes que del otro lado son
  // basura. 9600 es el default de fábrica de prácticamente todo el rubro.
  assert.equal(parseDrawerConfig('{"baudRate":1234}').baudRate, 9600);
  assert.equal(parseDrawerConfig('{"baudRate":0}').baudRate, 9600);
  assert.equal(parseDrawerConfig('{"baudRate":115200}').baudRate, 115200);
});

test("10. Lo que se guarda se vuelve a leer igual", () => {
  const config = {
    autoOpenOnSale: false,
    pin: 5 as const,
    baudRate: 19200,
    serialVendorId: 0x1a86,
    serialProductId: 0x7523,
    usbVendorId: 0x0416,
    usbProductId: 0x5011,
    transport: "usb" as const,
    lastWorking: "serial" as const,
  };
  assert.deepEqual(parseDrawerConfig(serializeDrawerConfig(config)), config);
});

test("11. Con el puerto ya identificado se usa ESE, no el primero de la lista", () => {
  // En un mostrador con balanza, lector y visor de cliente hay varios puertos
  // serie. Mandarle el pulso al que no es le escribe bytes crudos a otro aparato.
  const infos = [
    { usbVendorId: 0x1a86, usbProductId: 0x7523 },
    { usbVendorId: 0x0416, usbProductId: 0x5011 },
  ];
  assert.equal(selectDrawerPortIndex(infos, { vendorId: 0x0416, productId: 0x5011 }), 1);
});

test("12. Si el puerto guardado no está, no se elige otro", () => {
  // El cajero desenchufó la impresora. Que no abra es la respuesta correcta;
  // patear al vecino de puerto es la incorrecta.
  const infos = [{ usbVendorId: 0x1a86, usbProductId: 0x7523 }];
  assert.equal(selectDrawerPortIndex(infos, { vendorId: 0x0416, productId: 0x5011 }), -1);
});

test("13. Sin puerto guardado y con uno solo autorizado, ese es", () => {
  // El caso normal: una terminal, una impresora. Obligar a reconfigurar después
  // de un pareo que ya ocurrió es fricción sin motivo.
  const SIN_PAREAR = { vendorId: null, productId: null };
  assert.equal(selectDrawerPortIndex([{}], SIN_PAREAR), 0);
  assert.equal(
    selectDrawerPortIndex([{ usbVendorId: 0x0416, usbProductId: 0x5011 }], SIN_PAREAR),
    0,
  );
});

test("14. Sin puerto guardado y con varios autorizados, no se adivina", () => {
  const infos = [{ usbVendorId: 1, usbProductId: 1 }, { usbVendorId: 2, usbProductId: 2 }];
  assert.equal(selectDrawerPortIndex(infos, { vendorId: null, productId: null }), -1);
  assert.equal(selectDrawerPortIndex([], { vendorId: null, productId: null }), -1);
});

test("15. Elegir un transporte a mano significa ese y ningún otro", () => {
  // Quien lo fijó a mano ya sabe qué anda en SU mostrador. Caerse a otro por
  // atrás convierte un problema de configuración en uno intermitente.
  const config = { ...DEFAULT_DRAWER_CONFIG, transport: "usb" as const };
  assert.deepEqual(resolveTransportOrder(config, TODO), ["usb"]);
});

test("16. Un transporte elegido que el navegador no tiene no cae a otro", () => {
  // El cartel tiene que decir "acá no hay WebUSB", no abrir el cajón por una vía
  // que el usuario no pidió y después no poder explicar qué pasó.
  const config = { ...DEFAULT_DRAWER_CONFIG, transport: "usb" as const };
  assert.deepEqual(resolveTransportOrder(config, { ...TODO, usb: false }), []);
});

test("17. En automático se prueban los silenciosos, serie primero", () => {
  // Serie antes que USB porque es el que sobrevive al driver instalado: en
  // Windows usbprint.sys se queda con la interfaz de impresora y WebUSB no la
  // puede reclamar, pero el COM sigue libre entre trabajos.
  assert.deepEqual(resolveTransportOrder(DEFAULT_DRAWER_CONFIG, TODO), ["serial", "usb"]);
});

test("18. El automático NUNCA imprime", () => {
  // La vía por impresión gasta papel y abre el diálogo del navegador. En cada
  // venta. Un cajón que no abre es un problema; un diálogo de impresión que se
  // roba el foco con el cliente enfrente es peor, y nadie lo pidió.
  assert.equal(resolveTransportOrder(DEFAULT_DRAWER_CONFIG, TODO).includes("print"), false);
  const aprendido = { ...DEFAULT_DRAWER_CONFIG, lastWorking: "print" as const };
  assert.equal(resolveTransportOrder(aprendido, TODO).includes("print"), false);
});

test("19. El que funcionó la última vez se prueba primero", () => {
  // Sin esto, una terminal donde solo anda USB se come un intento de serie
  // fallido en CADA venta: el cajón abre tarde y el log se llena de errores que
  // no son errores.
  const config = { ...DEFAULT_DRAWER_CONFIG, lastWorking: "usb" as const };
  assert.deepEqual(resolveTransportOrder(config, TODO), ["usb", "serial"]);
});

test("20. Lo aprendido no manda si el navegador ya no lo soporta", () => {
  // Misma app, otra máquina, mismo localStorage sincronizado: lo aprendido allá
  // no puede dejar sin intentos a la de acá.
  const config = { ...DEFAULT_DRAWER_CONFIG, lastWorking: "usb" as const };
  assert.deepEqual(resolveTransportOrder(config, { ...TODO, usb: false }), ["serial"]);
});

test("21. Sin ninguna vía disponible no se intenta nada", () => {
  // Safari, Firefox, un celular. La respuesta correcta es una lista vacía, no un
  // intento que falla: así el POS sabe que no tiene que avisar nada.
  assert.deepEqual(
    resolveTransportOrder(DEFAULT_DRAWER_CONFIG, { serial: false, usb: false, print: false }),
    [],
  );
});

test("22. Por impresión se elige a mano, y entonces sí se usa", () => {
  // Es la única vía que funciona con la impresora instalada por driver en
  // Windows, que es la mayoría del parque. Existir, existe.
  const config = { ...DEFAULT_DRAWER_CONFIG, transport: "print" as const };
  assert.deepEqual(resolveTransportOrder(config, TODO), ["print"]);
});

test("23. Un transporte inventado en el storage cae a automático", () => {
  assert.equal(parseDrawerConfig('{"transport":"bluetooth"}').transport, "auto");
  assert.equal(parseDrawerConfig('{"transport":7}').transport, "auto");
  assert.equal(parseDrawerConfig('{"transport":"serial"}').transport, "serial");
  assert.equal(parseDrawerConfig('{"lastWorking":"telepatia"}').lastWorking, null);
  assert.equal(parseDrawerConfig('{"lastWorking":"print"}').lastWorking, "print");
});

test("24. Sin dispositivo autorizado no hay cajón, aunque el navegador pueda", () => {
  // Tener Web Serial no es tener una impresora: hasta que alguien elige el
  // puerto no hay a quién escribirle. Sin esto, cada venta intentaría y
  // fallaría, y el cajero vería un error que no puede resolver desde el POS.
  assert.equal(canKickWith(DEFAULT_DRAWER_CONFIG, TODO, { serial: 0, usb: 0 }), false);
  assert.equal(canKickWith(DEFAULT_DRAWER_CONFIG, TODO, { serial: 1, usb: 0 }), true);
  assert.equal(canKickWith(DEFAULT_DRAWER_CONFIG, TODO, { serial: 0, usb: 1 }), true);
});

test("25. El pareo de una vía no habilita la otra", () => {
  // Elegir el COM a mano y tener un USB autorizado de antes no significa que el
  // COM esté listo.
  const soloSerie = { ...DEFAULT_DRAWER_CONFIG, transport: "serial" as const };
  assert.equal(canKickWith(soloSerie, TODO, { serial: 0, usb: 1 }), false);
  assert.equal(canKickWith(soloSerie, TODO, { serial: 1, usb: 0 }), true);
});

test("26. La vía por impresión no necesita parear nada", () => {
  // No hay dispositivo que elegir: el trabajo sale por la impresora
  // predeterminada del sistema.
  const porImpresion = { ...DEFAULT_DRAWER_CONFIG, transport: "print" as const };
  assert.equal(canKickWith(porImpresion, TODO, { serial: 0, usb: 0 }), true);
  assert.equal(
    canKickWith(porImpresion, { ...TODO, print: false }, { serial: 0, usb: 0 }),
    false,
  );
});
