/**
 * ¿Es seguro redirigir a este `next`?
 *
 * El parámetro dice a dónde volver después de entrar, y en el caso que lo hizo
 * necesario lo arma un TERCERO: se vuelve del checkout de ePayco a
 * `/dashboard/subscription?pay=<orden>`, la sesión no viaja, y `proxy.ts` manda
 * a `/login?next=…` para no perder la orden recién pagada.
 *
 * Que el valor venga de la URL es exactamente por lo que hay que validarlo.
 * Redirigir a donde diga un parámetro sin mirarlo es un redirect abierto: basta
 * mandarle a alguien `/login?next=https://sitio-falso/login` para que entre en
 * Ventex y termine en una copia del login pidiéndole la clave otra vez, con el
 * dominio real en el historial dándole credibilidad.
 *
 * Por eso la regla es una lista blanca de FORMA, no una lista negra de dominios:
 * sólo rutas internas, y las formas conocidas de disfrazar un destino externo
 * como interno quedan afuera.
 *
 * Vive suelto y puro para que lo usen los DOS lugares que redirigen —`proxy.ts`
 * y la acción `login`— con la misma regla. Duplicar el criterio es cómo se
 * arregla uno y se deja el otro abierto.
 */

/** Caracteres de control: pueden partir la cabecera `Location` en dos. */
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;

export function isSafeNext(value: string | null | undefined): boolean {
  if (!value) return false;

  // Tiene que ser una ruta absoluta del propio sitio.
  if (!value.startsWith("/")) return false;

  // `//sitio-externo` es protocol-relative: el navegador lo resuelve como otro
  // dominio aunque empiece con `/`. `/\sitio` es la variante con barra
  // invertida, que algunos navegadores normalizan igual.
  if (value.startsWith("//") || value.startsWith("/\\")) return false;

  if (CONTROL_CHARS.test(value)) return false;

  // Último control: resuelto contra un origen cualquiera NO tiene que escaparse
  // de él. Cubre lo que las reglas de arriba no hayan anticipado.
  try {
    const base = "https://ventex.invalid";
    return new URL(value, base).origin === base;
  } catch {
    return false;
  }
}
