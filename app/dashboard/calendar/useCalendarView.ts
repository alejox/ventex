"use client";

import { useCallback, useState, useSyncExternalStore } from "react";
import { NARROW_CALENDAR_QUERY, initialCalendarView, parseCalendarView, type CalendarView } from "@/lib/calendar-layout";

const STORAGE_KEY = "ventex.calendar.view";

function subscribeNarrow(onChange: () => void) {
  const media = window.matchMedia(NARROW_CALENDAR_QUERY);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

function subscribeStorage(onChange: () => void) {
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
}

function readStored(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

/**
 * Vista del calendario (Mes / Semana / Día).
 *
 * - Sin elección: Semana en escritorio, Día por debajo de 768px (la semana
 *   necesita ~792px y en el teléfono quedaba con scroll horizontal).
 * - `chooseView`: la persona tocó un botón de vista. Eso manda desde ahora y se
 *   recuerda en este navegador, aunque la pantalla sea angosta.
 * - `showView`: la pantalla cambia de vista por su cuenta (abrir el día desde
 *   Mes, abrir una reserva enlazada). Vale para esta visita, no se guarda.
 *
 * Pantalla y `localStorage` se leen con `useSyncExternalStore`: en el servidor
 * no existen y leerlos en un efecto haría un render en cascada.
 */
export function useCalendarView() {
  const narrow = useSyncExternalStore(subscribeNarrow, () => window.matchMedia(NARROW_CALENDAR_QUERY).matches, () => false);
  const stored = parseCalendarView(useSyncExternalStore(subscribeStorage, readStored, () => null));
  const [override, setOverride] = useState<CalendarView | null>(null);

  const chooseView = useCallback((view: CalendarView) => {
    setOverride(view);
    try {
      window.localStorage.setItem(STORAGE_KEY, view);
    } catch {
      // Sin storage (modo privado): la elección vale para esta visita.
    }
  }, []);

  const showView = useCallback((view: CalendarView) => setOverride(view), []);

  return { view: override ?? initialCalendarView(stored, narrow), chooseView, showView };
}
