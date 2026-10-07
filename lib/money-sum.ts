/**
 * Sumas de plata sin artefactos de punto flotante.
 *
 * `0.1 + 0.2` da `0.30000000000000004`, y sumar cientos de montos con
 * centavos termina en totales como `125000.00999999` que la pantalla redondea
 * para un lado y la exportación para el otro (±$0,01 entre dos números que
 * tendrían que ser el mismo). Se suma en CENTAVOS ENTEROS —exactos hasta
 * 9·10^13 pesos— y se vuelve a pesos al final.
 */

/** Monto → centavos enteros. Un valor no numérico cuenta como 0. */
export function toCents(value: unknown): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

/** Centavos enteros → monto con 2 decimales exactos. */
export function fromCents(cents: number): number {
  return cents / 100;
}

/** Suma exacta (a centavos) de una lista de montos. */
export function sumMoney(values: Iterable<unknown>): number {
  let cents = 0;
  for (const v of values) cents += toCents(v);
  return fromCents(cents);
}

/** `a + b` a centavos: para acumuladores (`bucket.income = addMoney(...)`). */
export function addMoney(a: unknown, b: unknown): number {
  return fromCents(toCents(a) + toCents(b));
}

/** `a − b` a centavos. */
export function subMoney(a: unknown, b: unknown): number {
  return fromCents(toCents(a) - toCents(b));
}
