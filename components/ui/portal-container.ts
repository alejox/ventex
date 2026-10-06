"use client";

import { createContext, useContext } from "react";

/**
 * Dónde montar los portales (desplegables, popovers) de un componente.
 *
 * `<Modal>` usa `<dialog>.showModal()`: el diálogo sube a la *top layer* y TODO
 * lo que queda fuera de él se vuelve `inert`. Un desplegable portaleado a
 * `document.body` quedaría debajo del fondo oscuro y sin poder recibir clics.
 * Por eso el Modal publica su propio `<dialog>` acá y los portales lo usan como
 * destino cuando existe; fuera de un Modal, el destino sigue siendo `<body>`.
 */
export const PortalContainerContext = createContext<HTMLElement | null>(null);

/** Elemento al que portalear: el `<dialog>` del Modal más cercano o `<body>`. */
export function usePortalContainer(): HTMLElement | null {
  const container = useContext(PortalContainerContext);
  if (container) return container;
  return typeof document === "undefined" ? null : document.body;
}
