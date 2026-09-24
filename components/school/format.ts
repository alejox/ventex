"use client";

/** Formatea pesos (COP) para las pantallas de la escuela. */
export function formatMoney(n: number): string {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(n);
}

/** Fecha corta tipo "24 sep" para listas y tarjetas. */
export function formatShortDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("es-CO", { day: "2-digit", month: "short" });
}

/** Días de la semana en orden ISO (índice 0 = lunes). */
export const SCHOOL_DAYS = [
  "Lunes",
  "Martes",
  "Miércoles",
  "Jueves",
  "Viernes",
  "Sábado",
  "Domingo",
];

/** Día de la semana LOCAL de un instante, en numeración ISO (1 = lunes). */
export function localWeekdayOf(date: Date): number {
  const dow = date.getDay(); // 0 = domingo
  return dow === 0 ? 7 : dow;
}