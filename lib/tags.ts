/**
 * Lógica pura de una lista de etiquetas (chips): qué entra, qué se descarta y
 * por qué. Vive aparte del componente para poder testearla sin DOM.
 */

/** Largo máximo de una etiqueta: los catálogos son nombres cortos. */
export const TAG_MAX_LENGTH = 60;

/** Separadores que parten lo escrito o pegado en varias etiquetas. */
const SEPARATORS = /[,;\n\r\t]+/;

export interface AddTagsResult {
  /** La lista resultante, en el orden en que se agregaron. */
  values: string[];
  /** Lo que se escribió pero ya estaba (sin distinguir mayúsculas/tildes). */
  duplicates: string[];
}

/** Normaliza espacios: "  Piano   clásico " → "Piano clásico". */
export function cleanTag(raw: string): string {
  return raw.replace(/\s+/g, " ").trim().slice(0, TAG_MAX_LENGTH);
}

/** Clave de comparación: "Guitarra", "guitarra" y "GUITARRA" son la misma. */
function tagKey(tag: string): string {
  return tag.normalize("NFD").replace(/[̀-ͯ]/g, "").toLocaleLowerCase("es");
}

/**
 * Agrega a `current` lo que haya en `raw` (una o varias etiquetas separadas
 * por coma, punto y coma o salto de línea). Descarta vacíos y repetidos,
 * incluidos los repetidos dentro del mismo `raw`.
 */
export function addTags(current: string[], raw: string): AddTagsResult {
  const values = [...current];
  const seen = new Set(current.map(tagKey));
  const duplicates: string[] = [];

  for (const piece of raw.split(SEPARATORS)) {
    const tag = cleanTag(piece);
    if (!tag) continue;
    const key = tagKey(tag);
    if (seen.has(key)) {
      duplicates.push(tag);
      continue;
    }
    seen.add(key);
    values.push(tag);
  }

  return { values, duplicates };
}
