"use client";

import { useEffect, useId } from "react";

/**
 * Registro central de "hay cambios sin guardar".
 *
 * Los formularios que ya saben si están sucios lo declaran con
 * `useUnsavedChangesGuard(dirty)`; el shell (menú lateral, encabezado, paleta
 * de comandos) consulta `hasUnsavedChanges()` ANTES de navegar y, si hay algo,
 * pregunta con `useConfirm`. Sin esto, el aviso de cada formulario solo cubría
 * su propio botón Volver/Cancelar y un clic en el menú tiraba los cambios.
 *
 * No es un store de React a propósito: nadie necesita re-renderizar cuando
 * cambia, solo leerlo en el momento del clic.
 */
const active = new Set<string>();

export function hasUnsavedChanges(): boolean {
  return active.size > 0;
}

/**
 * Declara que el componente tiene cambios sin guardar mientras `dirty` sea
 * true. Se limpia solo al desmontarse (al guardar y navegar, por ejemplo).
 *
 * No agrega el aviso de `beforeunload` (recargar/cerrar la pestaña): cada
 * formulario ya lo maneja con sus propias excepciones (p. ej. "ya guardé").
 */
export function useUnsavedChangesGuard(dirty: boolean): void {
  const id = useId();
  useEffect(() => {
    if (!dirty) return;
    active.add(id);
    return () => {
      active.delete(id);
    };
  }, [dirty, id]);
}

/** Texto del aviso al salir por el menú: el mismo en todo el panel. */
export const LEAVE_WITH_UNSAVED_CHANGES = {
  title: "¿Salir sin guardar?",
  description: "Tienes cambios sin guardar. Si sales, se pierden.",
  confirmLabel: "Salir sin guardar",
  cancelLabel: "Seguir editando",
  tone: "danger" as const,
};

/**
 * ¿Este clic sobre un enlace es una navegación interna normal (que hay que
 * frenar si hay cambios)? Se dejan pasar los clics que abren otra pestaña o
 * ventana, las descargas y los enlaces externos: esos no tiran el formulario.
 */
export function interceptableLinkClick(
  e: Pick<MouseEvent, "button" | "metaKey" | "ctrlKey" | "shiftKey" | "altKey" | "defaultPrevented" | "target">,
): HTMLAnchorElement | null {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return null;
  const target = e.target as Element | null;
  const anchor = target?.closest?.("a[href]") as HTMLAnchorElement | null;
  if (!anchor) return null;
  if (anchor.target && anchor.target !== "_self") return null;
  if (anchor.hasAttribute("download")) return null;
  const url = new URL(anchor.href, window.location.href);
  if (url.origin !== window.location.origin) return null;
  // Mismo destino (o solo un #ancla): no se pierde nada.
  if (url.pathname === window.location.pathname && url.search === window.location.search) return null;
  return anchor;
}
