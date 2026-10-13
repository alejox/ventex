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

const UNIT_MAP: Record<string, string> = {
  ml: "ml", cl: "ml", l: "L", dl: "L",
  g: "g", kg: "kg", lb: "lb", oz: "g",
  m: "m", cm: "cm",
  unidad: "Unidad", un: "Unidad", docena: "Docena",
  pack: "Pack", caja: "Caja",
};

/** "500 g" → "g": la unidad del formulario a partir del contenido de Open Facts. */
export function parseQuantityUnit(raw: string): string | undefined {
  const parts = raw.toLowerCase().trim().split(/\s+/);
  for (const part of parts) {
    const match = UNIT_MAP[part];
    if (match) return match;
  }
}

/** Lo último que autocompletamos: lo que se puede pisar sin borrar lo de la persona. */
export interface AutofillMemory {
  name?: string;
  unit?: string;
  image?: string;
}

interface AutofillFields {
  name: string;
  unit: string;
  image_url: string;
}

interface ScannedProduct {
  name: string;
  quantity?: string;
  imageUrl?: string;
}

/**
 * Qué cambia en la ficha cuando el código de barras encuentra un producto.
 *
 * PURA a propósito: recibe una FOTO de la memoria y devuelve la nueva. Antes la
 * memoria se mutaba dentro del `setForm(prev => …)`, y React en modo estricto
 * corre ese updater dos veces: la primera marcaba el nombre nuevo como "nuestro"
 * y la segunda ya no reconocía el viejo, así que cambiar de código dejaba la
 * ficha con el producto anterior.
 *
 * Al EDITAR un producto guardado solo se llenan campos vacíos (o los que
 * llenamos nosotros en esta misma edición) y la unidad no se toca nunca:
 * pasar de "Unidad" a "g" convertiría 10 unidades de stock en 10 gramos.
 */
export function barcodeAutofill(
  form: AutofillFields,
  product: ScannedProduct,
  memory: AutofillMemory,
  { editing }: { editing: boolean },
): { patch: Partial<AutofillFields>; auto: AutofillMemory } {
  const patch: Partial<AutofillFields> = {};
  const auto: AutofillMemory = { ...memory };

  if (product.name && canAutofill(form.name, memory.name)) {
    patch.name = product.name;
    auto.name = product.name;
  }

  if (!editing && product.quantity) {
    const unit = parseQuantityUnit(product.quantity);
    // "Unidad" es el valor por defecto del formulario, así que cuenta como
    // vacío: nadie lo eligió, vino puesto.
    if (unit && (form.unit === "Unidad" || canAutofill(form.unit, memory.unit))) {
      patch.unit = unit;
      auto.unit = unit;
    }
  }

  if (product.imageUrl && canAutofill(form.image_url, memory.image)) {
    patch.image_url = product.imageUrl;
    auto.image = product.imageUrl;
  }

  return { patch, auto };
}

/**
 * El nombre que el código de barras propone, o null si no hay nada que ofrecer.
 *
 * Al editar, el autocompletado no pisa un nombre guardado: un escaneo por error
 * en el mostrador cambiaría en silencio el nombre que ya sale en ventas y
 * reportes. En vez de pisarlo, la ficha ofrece "Usar «X» como nombre" — este es
 * el criterio de cuándo mostrar esa oferta.
 */
export function suggestedName(current: string | null | undefined, found: string | null | undefined): string | null {
  const name = (found ?? "").trim();
  if (!name) return null;
  return name.toLocaleLowerCase("es") === (current ?? "").trim().toLocaleLowerCase("es") ? null : name;
}
