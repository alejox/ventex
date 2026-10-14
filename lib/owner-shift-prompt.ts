/**
 * Caja del dueño/administrador (`settings.owner_uses_shifts`).
 *
 * Al trabajador la caja se la exige el negocio; al dueño y a los
 * administradores es opcional: con el ajuste encendido, el POS les pide abrir
 * caja al entrar y pueden "Iniciar sin abrir caja". Ese salto dura el resto del
 * día LOCAL y vive en este dispositivo (localStorage); al día siguiente se
 * vuelve a preguntar.
 *
 * Abrir una caja borra el salto del día: así, si la cierran y siguen vendiendo,
 * el aviso vuelve a aparecer en vez de quedar silenciado por un salto viejo.
 *
 * Todo acceso a storage va con try/catch: en una ventana privada o con los
 * datos bloqueados `localStorage` lanza, y entonces simplemente no hay salto
 * guardado (se pregunta de nuevo al volver a entrar).
 */

export type SkipStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

/** `localStorage` si se puede tocar; null en servidor o si el navegador lo bloquea. */
export function safeLocalStorage(): SkipStorage | null {
  try {
    if (typeof window === "undefined") return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

/** Fecha LOCAL `YYYY-MM-DD`: con UTC el salto vencería a las 19:00 en Colombia. */
export function localDayKey(now: Date): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Una clave por negocio y membresía: un mismo equipo puede atender dos negocios. */
export function ownerShiftSkipKey(workspaceId: string, membershipId: string | null): string {
  return `ventex:caja-admin-sin-abrir:${workspaceId}:${membershipId ?? "-"}`;
}

export function isOwnerShiftSkipped(storage: SkipStorage | null, key: string, now: Date): boolean {
  if (!storage) return false;
  try {
    return storage.getItem(key) === localDayKey(now);
  } catch {
    return false;
  }
}

/** Devuelve true si quedó guardado; false si no hay storage (vale solo esta visita). */
export function markOwnerShiftSkipped(storage: SkipStorage | null, key: string, now: Date): boolean {
  if (!storage) return false;
  try {
    storage.setItem(key, localDayKey(now));
    return true;
  } catch {
    return false;
  }
}

export function clearOwnerShiftSkip(storage: SkipStorage | null, key: string): void {
  if (!storage) return;
  try {
    storage.removeItem(key);
  } catch {
    // Sin storage no hay nada que limpiar.
  }
}

/** Quién trabaja con caja en el POS: el trabajador siempre; dueño/admin si eligió hacerlo. */
export function usesShifts({ isWorker, ownerUsesShifts }: { isWorker: boolean; ownerUsesShifts: boolean }): boolean {
  return isWorker || ownerUsesShifts;
}

/**
 * Si se muestra "Abre tu caja para empezar". Nunca antes de saber si hay turno
 * (`shiftResolved`), para no hacerlo parpadear, ni encima de otro modal de caja.
 */
export function shouldPromptOwnerShift(input: {
  isWorker: boolean;
  ownerUsesShifts: boolean;
  shiftResolved: boolean;
  hasShift: boolean;
  skippedToday: boolean;
  otherShiftModalOpen: boolean;
}): boolean {
  return (
    !input.isWorker &&
    input.ownerUsesShifts &&
    input.shiftResolved &&
    !input.hasShift &&
    !input.skippedToday &&
    !input.otherShiftModalOpen
  );
}
