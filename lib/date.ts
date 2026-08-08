/**
 * Días de calendario, sin que la zona horaria les mueva la fecha.
 *
 * Una columna `date` de Postgres (`invoices.issue_date`, `expenses.expense_date`,
 * `appointments.appointment_date`) llega como "YYYY-MM-DD": es un día del
 * calendario, no un instante en el tiempo. Y ahí están los dos errores que se
 * cometen todo el tiempo, uno en cada dirección:
 *
 *   LEER  `new Date("2026-08-07")` lo interpreta como medianoche UTC. En
 *         Colombia (UTC-5) eso son las 19:00 del día 6, así que la compra
 *         cargada el 7 se mostraba fechada el 6.
 *
 *   ESCRIBIR  `new Date().toISOString().slice(0, 10)` da el día EN UTC. Después
 *         de las 19:00 hora local ya es el día siguiente en UTC: una venta de
 *         la noche del lunes quedaba registrada el martes.
 *
 * Los dos se resuelven igual: construir y leer la fecha con los componentes
 * locales, nunca dejando que el motor interprete zona.
 */

/**
 * "YYYY-MM-DD" (o un ISO completo) como el día que dice, en hora local.
 *
 * Acepta un timestamp entero y se queda con la parte de la fecha, para poder
 * usarse indistintamente sobre columnas `date` y sobre el prefijo de un
 * `timestamptz` ya convertido.
 */
export function parseDateOnly(iso: string): Date {
  const [year, month, day] = iso.slice(0, 10).split("-").map(Number);
  return new Date(year, (month ?? 1) - 1, day ?? 1);
}

/** El día de calendario de una fecha, según el reloj local. */
export function toISODate(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Hoy, según el reloj del negocio.
 *
 * Este es el valor que va a una columna `date`. Nunca `toISOString()`: el corte
 * del día es el del mostrador, no el de Greenwich.
 */
export const todayISO = (): string => toISODate();

/**
 * Formatea una columna `date` sin que la zona horaria le corra el día.
 *
 * Reemplaza al parche `new Date(iso + "T00:00:00")` que había suelto en un par
 * de pantallas: funcionaba, pero cada quien tenía que acordarse de escribirlo.
 */
export function formatDateOnly(
  iso: string,
  options: Intl.DateTimeFormatOptions = {},
  locale = "es-CO",
): string {
  return parseDateOnly(iso).toLocaleDateString(locale, options);
}
