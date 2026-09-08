/**
 * Cajón monedero: el pulso, no la impresión.
 *
 * El cajón no habla con Ventex. Cuelga de la impresora por un RJ11 y se abre
 * cuando la impresora le manda corriente al solenoide. Hasta hoy eso pasaba de
 * rebote: al imprimir el recibo, el driver metía el pulso al arrancar el
 * trabajo. Es decir, el cajón no se abría porque el negocio cobrara — se abría
 * porque alguien apretó "Imprimir". Cobrar sin imprimir dejaba la plata del
 * lado de afuera.
 *
 * Acá está el comando crudo que hace lo mismo SIN papel, y las reglas de por
 * dónde mandarlo. Todo puro y sin navegador: el que habla con el hardware es
 * `services/cash-drawer.service.ts`.
 */

/** Los dos pines de disparo del conector RJ11. Cuál usa el cajón lo decide el fabricante. */
export type DrawerPin = 2 | 5;

/**
 * Por dónde le llega el pulso a la impresora. No hay una sola respuesta, y por
 * eso hay tres.
 *
 * - `serial`: puerto COM (nativo o USB-serial). El mejor caso: silencioso, sin
 *   papel, y sobrevive al driver instalado porque el spooler suelta el COM
 *   entre trabajos.
 * - `usb`: WebUSB contra la interfaz de impresora (clase 7). Igual de limpio,
 *   pero en Windows `usbprint.sys` se queda con esa interfaz apenas se instala
 *   el driver y no se puede reclamar. Anda sobre todo en macOS y Linux.
 * - `print`: un trabajo de impresión mínimo, para que el pulso lo meta el
 *   DRIVER, como venía pasando hasta hoy. Es la ÚNICA vía cuando la impresora
 *   solo se deja hablar por driver —la mayoría del parque Windows—, y cuesta un
 *   pedazo de papel y el diálogo del navegador.
 */
export type DrawerTransport = "serial" | "usb" | "print";

/** `auto` prueba las vías silenciosas; el resto fija una y no se mueve. */
export type DrawerTransportChoice = "auto" | DrawerTransport;

/** Qué puede este navegador, en esta máquina. Lo mide el service. */
export interface DrawerCapabilities {
  serial: boolean;
  usb: boolean;
  print: boolean;
}

export interface DrawerConfig {
  /** Abrir solo, al terminar cada venta. Apagado deja el botón manual. */
  autoOpenOnSale: boolean;
  pin: DrawerPin;
  baudRate: number;
  /**
   * Qué puerto serie es el de la impresora.
   *
   * Web Serial no deja guardar el puerto: cada sesión devuelve objetos nuevos.
   * Lo único estable que expone `getInfo()` son los ids USB, así que ese es el
   * documento de identidad del cajón entre recargas.
   */
  serialVendorId: number | null;
  serialProductId: number | null;
  /**
   * Qué dispositivo USB es la impresora. Par SEPARADO del de arriba a propósito.
   *
   * Un cable USB-serial es un aparato con ids propios (un CH340 es 1a86:7523),
   * distintos de los de la impresora que cuelga de él. Con un solo par
   * compartido, parear por serie dejaría al fallback USB buscando un dispositivo
   * que no existe: la vía de respaldo no fallaría, directamente nunca andaría.
   */
  usbVendorId: number | null;
  usbProductId: number | null;
  /** Vía elegida a mano, o `auto` para que la app pruebe las silenciosas. */
  transport: DrawerTransportChoice;
  /**
   * La vía que efectivamente abrió el cajón la última vez.
   *
   * No es una estadística: es lo que evita que una terminal donde solo anda USB
   * se coma un intento de serie fallido en CADA venta. El cajón abriría tarde y
   * el aviso de error sería ruido, no información.
   */
  lastWorking: DrawerTransport | null;
}

export const DEFAULT_DRAWER_CONFIG: DrawerConfig = {
  autoOpenOnSale: true,
  pin: 2,
  baudRate: 9600,
  serialVendorId: null,
  serialProductId: null,
  usbVendorId: null,
  usbProductId: null,
  transport: "auto",
  lastWorking: null,
};

/**
 * Las vías que se pueden intentar solas, en orden de preferencia.
 *
 * Serie antes que USB porque es la que convive con el driver instalado, que es
 * el escenario más común de todos.
 */
const SILENT_TRANSPORTS: readonly DrawerTransport[] = ["serial", "usb"];

const TRANSPORTS: readonly DrawerTransport[] = ["serial", "usb", "print"];

/** Velocidades que hablan las impresoras térmicas del rubro. 9600 es el de fábrica. */
export const DRAWER_BAUD_RATES = [9600, 19200, 38400, 57600, 115200] as const;

/** Clave de localStorage. La config es de ESTE dispositivo, no del negocio. */
export const DRAWER_STORAGE_KEY = "ventex.cashDrawer";

/**
 * Cuánto dura el pulso, en milisegundos.
 *
 * 50 ms es lo que tarda el solenoide en vencer el resorte; menos hace clic sin
 * abrir. Los 500 ms de apagado son el descanso antes de que se pueda volver a
 * disparar, y existen para que dos ventas seguidas no lo recalienten.
 */
const PULSE_ON_MS = 50;
const PULSE_OFF_MS = 500;

/** ESC/POS mide los tiempos en unidades de 2 ms y los manda en UN byte. */
const toPulseUnits = (ms: number): number => {
  const units = Math.round(ms / 2);
  // El recorte no es cosmético: 600 ms son 300 unidades, y 300 en un byte es
  // 44. El pulso saldría de 88 ms —débil— y el síntoma sería un cajón que "a
  // veces abre". Un pulso de 0 es un comando válido que no abre nada.
  if (!Number.isFinite(units) || units < 1) return 1;
  return Math.min(units, 255);
};

/**
 * El comando que abre el cajón: `ESC p m t1 t2`.
 *
 * La impresora no valida nada ni contesta. Si un byte está mal, el cajón queda
 * quieto y no hay error que lo cuente: por eso la secuencia está congelada en
 * un test.
 */
export function drawerKickCommand(
  pin: DrawerPin,
  onMs: number = PULSE_ON_MS,
  offMs: number = PULSE_OFF_MS,
): Uint8Array {
  return new Uint8Array([
    0x1b, // ESC
    0x70, // p
    pin === 5 ? 0x01 : 0x00,
    toPulseUnits(onMs),
    toPulseUnits(offMs),
  ]);
}

const asPositiveInt = (value: unknown): number | null =>
  typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : null;

/**
 * Lee la config guardada sin poder tirar nunca.
 *
 * Esto corre en medio del cobro. Un JSON viejo, roto o editado a mano no puede
 * llevarse puesta una venta: ante cualquier duda, valores por defecto.
 */
export function parseDrawerConfig(raw: string | null | undefined): DrawerConfig {
  if (!raw) return DEFAULT_DRAWER_CONFIG;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return DEFAULT_DRAWER_CONFIG;
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return DEFAULT_DRAWER_CONFIG;
  }
  const source = parsed as Record<string, unknown>;
  const baudRate = source.baudRate;
  const pin = source.pin;
  return {
    autoOpenOnSale:
      typeof source.autoOpenOnSale === "boolean"
        ? source.autoOpenOnSale
        : DEFAULT_DRAWER_CONFIG.autoOpenOnSale,
    // Un pin fuera de los dos que el firmware conoce viajaría igual por el
    // cable, como un byte que no significa nada.
    pin: pin === 5 ? 5 : 2,
    baudRate:
      typeof baudRate === "number" &&
      (DRAWER_BAUD_RATES as readonly number[]).includes(baudRate)
        ? baudRate
        : DEFAULT_DRAWER_CONFIG.baudRate,
    serialVendorId: asPositiveInt(source.serialVendorId),
    serialProductId: asPositiveInt(source.serialProductId),
    usbVendorId: asPositiveInt(source.usbVendorId),
    usbProductId: asPositiveInt(source.usbProductId),
    transport:
      source.transport === "serial" ||
      source.transport === "usb" ||
      source.transport === "print"
        ? source.transport
        : "auto",
    lastWorking: TRANSPORTS.includes(source.lastWorking as DrawerTransport)
      ? (source.lastWorking as DrawerTransport)
      : null,
  };
}

/**
 * Qué vías intentar, en qué orden, para ESTA máquina.
 *
 * Dos reglas cargan todo el peso:
 *
 * 1. **Una elección a mano es una sola vía.** Quien la fijó ya sabe qué anda en
 *    su mostrador; caerse a otra por atrás convierte un problema de
 *    configuración en uno intermitente, que es mucho más caro de encontrar.
 * 2. **El automático NUNCA imprime.** La vía por impresión gasta papel y abre
 *    el diálogo del navegador en cada venta. Un cajón que no abre es un
 *    problema; un diálogo robándose el foco con el cliente enfrente es peor, y
 *    nadie lo pidió. Se elige a mano o no se usa.
 */
export function resolveTransportOrder(
  config: DrawerConfig,
  caps: DrawerCapabilities,
): DrawerTransport[] {
  if (config.transport !== "auto") {
    return caps[config.transport] ? [config.transport] : [];
  }
  const order = SILENT_TRANSPORTS.filter((t) => caps[t]);
  const learned = config.lastWorking;
  // Lo aprendido manda solo si esta máquina todavía lo soporta: el mismo
  // localStorage puede haber viajado desde otra terminal.
  if (learned && learned !== "print" && order.includes(learned)) {
    return [learned, ...order.filter((t) => t !== learned)];
  }
  return order;
}

export function serializeDrawerConfig(config: DrawerConfig): string {
  return JSON.stringify(config);
}

/** Lo que `SerialPort.getInfo()` devuelve y nos sirve para reconocerlo. */
export interface DrawerPortInfo {
  usbVendorId?: number;
  usbProductId?: number;
}

/**
 * Cuál de los puertos autorizados es el de la impresora.
 *
 * Un mostrador puede tener balanza, lector y visor de cliente colgando de
 * puertos serie. Elegir mal no es "no abre": es escribirle cinco bytes crudos a
 * otro aparato. Por eso, cuando no hay forma de saberlo, la respuesta es -1 y
 * no un intento.
 */
export function selectDrawerPortIndex(
  infos: readonly DrawerPortInfo[],
  ids: { vendorId: number | null; productId: number | null },
): number {
  if (ids.vendorId !== null && ids.productId !== null) {
    return infos.findIndex(
      (info) => info.usbVendorId === ids.vendorId && info.usbProductId === ids.productId,
    );
  }
  // Sin identificación guardada: un solo puerto autorizado es el caso normal
  // (una terminal, una impresora) y pedir que lo vuelva a elegir es fricción
  // sin motivo. Con varios, adivinar es peor que no hacer nada.
  return infos.length === 1 ? 0 : -1;
}

/**
 * ¿Tiene sentido siquiera intentar abrir el cajón en esta terminal?
 *
 * Es la pregunta que evita el ruido. Sin esto, una terminal sin cajón —la
 * mayoría— se comería un intento fallido y un cartel de error en CADA venta,
 * por un accesorio que nadie enchufó.
 *
 * Que el navegador tenga Web Serial no alcanza: hasta que alguien elige el
 * puerto no hay a quién escribirle. La vía por impresión es la excepción,
 * porque sale por la impresora predeterminada del sistema y no hay nada que
 * parear.
 */
export function canKickWith(
  config: DrawerConfig,
  caps: DrawerCapabilities,
  authorized: { serial: number; usb: number },
): boolean {
  return resolveTransportOrder(config, caps).some(
    (t) => t === "print" || authorized[t] > 0,
  );
}
