/**
 * Las tres formas de decirle a la impresora que abra el cajón.
 *
 * No hay una sola, y por eso no hay una sola. Una Xprinter en Windows suele
 * hablar por DRIVER, y ahí ningún navegador le puede mandar bytes crudos: el
 * pulso lo tiene que meter el propio driver, con un trabajo de impresión de por
 * medio. La misma impresora expuesta como COM se deja escribir directo, sin
 * papel. Y en macOS o Linux, donde nadie le clava la interfaz de impresora,
 * WebUSB llega igual de lejos.
 *
 * Esta es la única capa que toca el hardware. La política —qué se intenta y en
 * qué orden— es pura y vive en `lib/cash-drawer.ts`.
 */

import {
  drawerKickCommand,
  resolveTransportOrder,
  selectDrawerPortIndex,
  type DrawerCapabilities,
  type DrawerConfig,
  type DrawerTransport,
} from "@/lib/cash-drawer";

/** Forma mínima de Web Serial, ausente de lib.dom. */
interface SerialPortLike {
  open(options: { baudRate: number }): Promise<void>;
  close(): Promise<void>;
  getInfo(): { usbVendorId?: number; usbProductId?: number };
  readonly writable: WritableStream<Uint8Array> | null;
  readonly readable: ReadableStream<Uint8Array> | null;
}

interface SerialLike {
  getPorts(): Promise<SerialPortLike[]>;
  requestPort(): Promise<SerialPortLike>;
}

/** Forma mínima de WebUSB, ausente de lib.dom. */
interface UsbEndpointLike {
  endpointNumber: number;
  direction: "in" | "out";
  type: "bulk" | "interrupt" | "isochronous";
}
interface UsbAlternateLike {
  interfaceClass: number;
  endpoints: UsbEndpointLike[];
}
interface UsbInterfaceLike {
  interfaceNumber: number;
  alternates: UsbAlternateLike[];
}
interface UsbDeviceLike {
  vendorId: number;
  productId: number;
  configuration: { interfaces: UsbInterfaceLike[] } | null;
  open(): Promise<void>;
  close(): Promise<void>;
  selectConfiguration(value: number): Promise<void>;
  claimInterface(value: number): Promise<void>;
  releaseInterface(value: number): Promise<void>;
  transferOut(endpointNumber: number, data: Uint8Array): Promise<{ status: string }>;
}
interface UsbLike {
  getDevices(): Promise<UsbDeviceLike[]>;
  requestDevice(options: { filters: { classCode?: number }[] }): Promise<UsbDeviceLike>;
}

/** La clase USB "printer". Es la interfaz que traga ESC/POS. */
const USB_PRINTER_CLASS = 7;

const serialApi = (): SerialLike | null =>
  typeof navigator === "undefined"
    ? null
    : ((navigator as unknown as { serial?: SerialLike }).serial ?? null);

const usbApi = (): UsbLike | null =>
  typeof navigator === "undefined"
    ? null
    : ((navigator as unknown as { usb?: UsbLike }).usb ?? null);

/**
 * Qué puede este navegador en esta máquina.
 *
 * Serial y USB solo existen en contexto seguro, así que en http se ven igual
 * que un navegador sin soporte. Son dos problemas con dos soluciones distintas
 * y hay que poder decirlo en pantalla — por eso `secure` sale aparte.
 */
export function drawerCapabilities(): DrawerCapabilities & { secure: boolean } {
  if (typeof window === "undefined") {
    return { serial: false, usb: false, print: false, secure: false };
  }
  const secure = window.isSecureContext;
  return {
    secure,
    serial: secure && serialApi() !== null,
    usb: secure && usbApi() !== null,
    // Imprimir se puede en cualquier navegador. Que el driver traduzca ese
    // trabajo en un pulso al cajón ya no depende de nosotros.
    print: typeof window.print === "function",
  };
}

/**
 * Pide permiso para un dispositivo. EXIGE un gesto del usuario (un click).
 *
 * Se hace una vez por dispositivo y por vía: tanto Chrome como Edge recuerdan
 * el permiso por origen, y después `getPorts()`/`getDevices()` lo devuelven sin
 * volver a preguntar.
 */
export async function pairCashDrawer(
  transport: "serial" | "usb",
): Promise<{ vendorId: number | null; productId: number | null }> {
  if (transport === "serial") {
    const api = serialApi();
    if (!api) throw new Error("Este navegador no puede hablarle al puerto serie.");
    const info = (await api.requestPort()).getInfo();
    return { vendorId: info.usbVendorId ?? null, productId: info.usbProductId ?? null };
  }
  const api = usbApi();
  if (!api) throw new Error("Este navegador no puede hablarle al dispositivo USB.");
  // El filtro por clase 7 deja en la lista solo impresoras: elegir el teclado
  // por error no debería ni ser posible.
  const device = await api.requestDevice({ filters: [{ classCode: USB_PRINTER_CLASS }] });
  return { vendorId: device.vendorId, productId: device.productId };
}

/** Cuántos dispositivos ya autorizados hay por cada vía. Alimenta el "listo" de Ajustes. */
export async function countAuthorized(): Promise<{ serial: number; usb: number }> {
  const [ports, devices] = await Promise.all([
    serialApi()?.getPorts().catch(() => []) ?? Promise.resolve([]),
    usbApi()?.getDevices().catch(() => []) ?? Promise.resolve([]),
  ]);
  return { serial: ports.length, usb: devices.length };
}

/**
 * Vía COM: abre, escribe y CIERRA.
 *
 * Dejarlo abierto sería más rápido, y es exactamente lo que no hay que hacer:
 * un puerto serie lo toma un proceso a la vez. Si Chrome se queda con el COM,
 * el spooler no lo puede tomar y `window.print()` deja de imprimir el recibo.
 * Sería el problema de hoy, dado vuelta.
 */
async function kickViaSerial(config: DrawerConfig): Promise<void> {
  const api = serialApi();
  if (!api) throw new Error("Puerto serie no disponible.");
  const ports = await api.getPorts();
  const index = selectDrawerPortIndex(
    ports.map((p) => p.getInfo()),
    { vendorId: config.serialVendorId, productId: config.serialProductId },
  );
  if (index < 0) throw new Error("No hay un puerto serie autorizado para la impresora.");

  const port = ports[index];
  try {
    // `readable`/`writable` en null es la forma de preguntar si está cerrado:
    // llamar a open() sobre un puerto abierto tira InvalidStateError.
    if (!port.readable && !port.writable) await port.open({ baudRate: config.baudRate });
    const writable = port.writable;
    if (!writable) throw new Error("El puerto no acepta escritura.");
    const writer = writable.getWriter();
    try {
      await writer.write(drawerKickCommand(config.pin));
    } finally {
      writer.releaseLock();
    }
  } finally {
    // Cerrar SIEMPRE, incluso si la escritura falló: un puerto que quedó tomado
    // por un error es el mismo bloqueo del spooler, con menos pistas.
    try {
      await port.close();
    } catch {
      // Cerrar uno que nunca llegó a abrirse no es un problema.
    }
  }
}

/**
 * Vía WebUSB, contra la interfaz de impresora.
 *
 * En Windows esto falla apenas está el driver instalado —`usbprint.sys` se
 * queda con la interfaz y `claimInterface` devuelve acceso denegado—, y eso es
 * correcto: ahí la vía es otra. En macOS y Linux es tan limpia como el COM.
 */
async function kickViaUsb(config: DrawerConfig): Promise<void> {
  const api = usbApi();
  if (!api) throw new Error("WebUSB no disponible.");
  const devices = await api.getDevices();
  const index = selectDrawerPortIndex(
    devices.map((d) => ({ usbVendorId: d.vendorId, usbProductId: d.productId })),
    { vendorId: config.usbVendorId, productId: config.usbProductId },
  );
  if (index < 0) throw new Error("No hay un dispositivo USB autorizado para la impresora.");

  const device = devices[index];
  let claimed: number | null = null;
  try {
    await device.open();
    if (!device.configuration) await device.selectConfiguration(1);
    const interfaces = device.configuration?.interfaces ?? [];
    let endpoint: number | null = null;
    for (const iface of interfaces) {
      const alt = iface.alternates.find((a) => a.interfaceClass === USB_PRINTER_CLASS);
      const out = alt?.endpoints.find((e) => e.direction === "out" && e.type === "bulk");
      if (alt && out) {
        await device.claimInterface(iface.interfaceNumber);
        claimed = iface.interfaceNumber;
        endpoint = out.endpointNumber;
        break;
      }
    }
    if (endpoint === null) throw new Error("El dispositivo no expone una interfaz de impresora.");
    await device.transferOut(endpoint, drawerKickCommand(config.pin));
  } finally {
    // Soltar la interfaz antes de irse, por la misma razón que el COM: si nos
    // quedamos con ella, el driver del sistema no puede imprimir.
    try {
      if (claimed !== null) await device.releaseInterface(claimed);
      await device.close();
    } catch {
      // Nada que soltar.
    }
  }
}

/**
 * Vía driver: un trabajo de impresión mínimo, para que el pulso lo meta él.
 *
 * Es la única que funciona con la impresora instalada por driver —la mayoría
 * del parque Windows— y la que ya venía abriendo el cajón cada vez que se
 * imprimía un recibo. Se paga con un pedazo de papel y con el diálogo del
 * navegador, así que se elige a mano: nunca entra en el modo automático.
 *
 * Va en un iframe propio y no en `window.print()` para no mandar a la
 * impresora la pantalla del POS entera.
 *
 * Ojo con lo que esta función NO puede decir: el navegador no informa si el
 * trabajo llegó, ni si el driver disparó el pulso. Devolver sin error significa
 * "el trabajo se mandó", nunca "el cajón se abrió".
 */
async function kickViaPrint(): Promise<void> {
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.setAttribute("tabindex", "-1");
  frame.style.cssText = "position:fixed;left:-9999px;top:0;width:1px;height:1px;border:0;";
  document.body.appendChild(frame);
  try {
    const doc = frame.contentDocument;
    const win = frame.contentWindow;
    if (!doc || !win) throw new Error("No se pudo preparar el trabajo de impresión.");
    doc.open();
    // Una página vacía y del alto mínimo: lo que importa del trabajo es que
    // exista, no lo que diga.
    doc.write(
      '<!doctype html><html><head><meta charset="utf-8">' +
        "<style>@page{size:80mm 1mm;margin:0}html,body{margin:0;padding:0}</style>" +
        "</head><body></body></html>",
    );
    doc.close();
    win.focus();
    win.print();
  } finally {
    // Sacarlo enseguida cerraría el diálogo de impresión de Chrome antes de que
    // el usuario lo confirme.
    setTimeout(() => frame.remove(), 60_000);
  }
}

const KICKS: Record<DrawerTransport, (config: DrawerConfig) => Promise<void>> = {
  serial: kickViaSerial,
  usb: kickViaUsb,
  print: () => kickViaPrint(),
};

/**
 * Abre el cajón por la primera vía que responda, y dice cuál fue.
 *
 * El que llama guarda ese dato: sin él, una terminal donde solo anda una de las
 * vías se come el intento fallido de la otra en CADA venta.
 */
export async function openCashDrawer(config: DrawerConfig): Promise<DrawerTransport> {
  const caps = drawerCapabilities();
  const order = resolveTransportOrder(config, caps);

  if (order.length === 0) {
    throw new Error(
      config.transport === "auto"
        ? caps.secure
          ? "Este navegador no puede abrir el cajón solo. Probá Chrome o Edge de escritorio, o elegí la apertura por impresión en Ajustes."
          : "El cajón necesita una conexión segura (https)."
        : "La vía elegida para el cajón no está disponible en este navegador.",
    );
  }

  let last: unknown = null;
  for (const transport of order) {
    try {
      await KICKS[transport](config);
      return transport;
    } catch (e) {
      last = e;
    }
  }
  // Un reintento, y uno solo, por el caso real: la impresora justo estaba
  // imprimiendo y tenía el puerto tomado. Insistir más es quedarse trabado con
  // el cliente enfrente.
  await new Promise((r) => setTimeout(r, 350));
  try {
    await KICKS[order[0]](config);
    return order[0];
  } catch (e) {
    throw (last ?? e) instanceof Error
      ? (last as Error)
      : new Error("No se pudo abrir el cajón.");
  }
}
