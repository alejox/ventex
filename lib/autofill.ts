/**
 * ¿Se puede pisar este campo con lo que trajo el código de barras?
 *
 * La regla que estaba era "sólo si está vacío", y por eso escanear un segundo
 * código no hacía nada: el primero ya había llenado el nombre, así que el
 * segundo producto llegaba y no tenía dónde entrar. Desde afuera se ve como que
 * la pantalla dejó de reaccionar — cambia el código, cambia el producto
 * encontrado, y la ficha se queda con los datos del anterior.
 *
 * Pero "siempre pisar" es peor: le borra a la persona lo que acaba de escribir.
 *
 * La distinción que faltaba no es vacío/lleno, es **quién lo escribió**. Se pisa
 * lo que autocompletamos nosotros; no se toca lo que escribió la persona. Por
 * eso hace falta recordar qué valor pusimos: sin esa memoria, un campo lleno es
 * indistinguible de un campo tipeado.
 *
 * Se compara con `trim` porque el valor viaja por un `<input>` controlado y
 * vuelve con los espacios que el navegador o la persona hayan dejado; comparar
 * en crudo haría que un espacio de más lo convierta en "lo escribió la persona"
 * y congele el campo para siempre.
 */
export function canAutofill(
  current: string | null | undefined,
  lastAuto: string | null | undefined,
): boolean {
  const value = (current ?? "").trim();

  // Vacío: no hay nada que respetar.
  if (!value) return true;

  // Lleno con exactamente lo que pusimos la vez pasada: es nuestro, se reemplaza.
  if (lastAuto == null) return false;
  return value === lastAuto.trim();
}
