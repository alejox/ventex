/**
 * Date helpers of the public booking calendar (month grid), shared by the
 * booking widget and the "Cambiar fecha" step of the lookup modal.
 *
 * Every date travels as a local "YYYY-MM-DD" string: `new Date("YYYY-MM-DD")`
 * is UTC and would shift the day in Colombia, and `toISOString()` likewise.
 */

/** Local YYYY-MM-DD; toISOString() would shift the day for negative offsets. */
export function toDateInput(date: Date): string {
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

/** Parsed field by field: `new Date("2026-08-05")` is UTC and shifts a day. */
export function parseDateInput(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, (month ?? 1) - 1, day ?? 1);
}

/** Clave `YYYY-MM` del mes de una fecha, para comparar meses sin tocar husos. */
export const claveMes = (fecha: string) => fecha.slice(0, 7);

/**
 * Las celdas del mes que se está mirando, con los huecos del principio.
 *
 * Se arma desde el primer día del mes y no desde la lista cargada: un mes tiene
 * que verse entero aunque la disponibilidad empiece a mitad de mes, o el
 * visitante no reconoce el calendario. Empieza en domingo, como el `dow` de
 * Postgres y el resto de la app.
 */
export function celdasDelMes(mes: string): (string | null)[] {
  const [anio, num] = mes.split("-").map(Number);
  const primero = new Date(anio, num - 1, 1);
  const diasEnMes = new Date(anio, num, 0).getDate();
  const huecos = primero.getDay();
  const celdas: (string | null)[] = Array.from({ length: huecos }, () => null);
  for (let d = 1; d <= diasEnMes; d++) {
    celdas.push(`${anio}-${String(num).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
  }
  return celdas;
}

export const longDateFmt = new Intl.DateTimeFormat("es-CO", {
  weekday: "long",
  day: "numeric",
  month: "long",
});
