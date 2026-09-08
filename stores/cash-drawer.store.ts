import { create } from "zustand";
import { toMessage } from "@/lib/errors";
import {
  canKickWith,
  DEFAULT_DRAWER_CONFIG,
  DRAWER_STORAGE_KEY,
  parseDrawerConfig,
  serializeDrawerConfig,
  type DrawerCapabilities,
  type DrawerConfig,
  type DrawerTransport,
} from "@/lib/cash-drawer";
import * as drawerService from "@/services/cash-drawer.service";

/**
 * El cajón es del DISPOSITIVO, no del negocio.
 *
 * El permiso del puerto lo guarda el navegador por origen y el cable está
 * enchufado a una máquina concreta. Un negocio con dos terminales —una con
 * cajón, otra sin— no puede tener una sola configuración en la base: la segunda
 * intentaría abrir un cajón que no existe en cada venta. Por eso localStorage.
 */
interface CashDrawerState {
  config: DrawerConfig;
  /** false hasta leer localStorage: en SSR no hay nada que leer. */
  hydrated: boolean;
  caps: (DrawerCapabilities & { secure: boolean }) | null;
  /** Cuántos dispositivos autorizados hay por vía. */
  authorized: { serial: number; usb: number };
  pairing: boolean;
  error: string | null;

  /** Hay al menos una vía por la que tiene sentido intentar. */
  canKick: () => boolean;
  init: () => Promise<void>;
  setConfig: (patch: Partial<DrawerConfig>) => void;
  pair: (transport: "serial" | "usb") => Promise<boolean>;
  /** Devuelve la vía que funcionó, o null. Nunca lanza: el que llama está cobrando. */
  kick: () => Promise<DrawerTransport | null>;
}

const persist = (config: DrawerConfig) => {
  try {
    localStorage.setItem(DRAWER_STORAGE_KEY, serializeDrawerConfig(config));
  } catch {
    // Modo incógnito o storage lleno. Se pierde la preferencia, no la venta.
  }
};

export const useCashDrawerStore = create<CashDrawerState>((set, get) => ({
  config: DEFAULT_DRAWER_CONFIG,
  hydrated: false,
  caps: null,
  authorized: { serial: 0, usb: 0 },
  pairing: false,
  error: null,

  canKick: () => {
    const { hydrated, caps, config, authorized } = get();
    return hydrated && caps !== null && canKickWith(config, caps, authorized);
  },

  init: async () => {
    let config = DEFAULT_DRAWER_CONFIG;
    try {
      config = parseDrawerConfig(localStorage.getItem(DRAWER_STORAGE_KEY));
    } catch {
      // Leer la config no puede ser un camino de falla.
    }
    const caps = drawerService.drawerCapabilities();
    const authorized = await drawerService.countAuthorized();
    set({ config, caps, authorized, hydrated: true });
  },

  setConfig: (patch) => {
    const config = { ...get().config, ...patch };
    persist(config);
    set({ config });
  },

  pair: async (transport) => {
    set({ pairing: true, error: null });
    try {
      const ids = await drawerService.pairCashDrawer(transport);
      const config: DrawerConfig =
        transport === "serial"
          ? { ...get().config, serialVendorId: ids.vendorId, serialProductId: ids.productId }
          : { ...get().config, usbVendorId: ids.vendorId, usbProductId: ids.productId };
      persist(config);
      set({ config, authorized: await drawerService.countAuthorized(), pairing: false });
      return true;
    } catch (e) {
      // Cerrar el selector sin elegir nada tira NotFoundError. Es un "no,
      // gracias", no una falla que merezca un cartel rojo.
      const aborted = e instanceof DOMException && e.name === "NotFoundError";
      set({ pairing: false, error: aborted ? null : toMessage(e) });
      return false;
    }
  },

  kick: async () => {
    try {
      const worked = await drawerService.openCashDrawer(get().config);
      // Recordar la vía que anduvo es lo que evita pagar el intento fallido de
      // la otra en cada venta.
      if (get().config.lastWorking !== worked) {
        const config = { ...get().config, lastWorking: worked };
        persist(config);
        set({ config });
      }
      set({ error: null });
      return worked;
    } catch (e) {
      set({ error: toMessage(e) });
      return null;
    }
  },
}));
