/**
 * Tipos de documento de Colombia, en el orden en que se usan: cédula y NIT
 * primero. Sin RFC (es de México) — los registros viejos que lo tengan siguen
 * mostrándose, pero no se ofrece para cargar nuevos.
 */
export const DOC_TYPES = [
  { value: "CC", label: "CC · Cédula de ciudadanía" },
  { value: "NIT", label: "NIT" },
  { value: "CE", label: "CE · Cédula de extranjería" },
  { value: "PP", label: "Pasaporte" },
  { value: "PPT", label: "PPT · Permiso por protección temporal" },
  { value: "TI", label: "TI · Tarjeta de identidad" },
] as const;

export const DOC_TYPE_VALUES: string[] = DOC_TYPES.map((d) => d.value);

/** Placeholder de teléfono para Colombia. */
export const PHONE_PLACEHOLDER = "+57 300 123 4567";

/**
 * Opciones del selector para un registro existente: si trae un tipo que ya no
 * se ofrece (RFC, RUT), se agrega al final para no borrarlo al guardar.
 */
export function docTypeOptionsFor(current: string | null | undefined): { value: string; label: string }[] {
  const base: { value: string; label: string }[] = DOC_TYPES.map((d) => ({ value: d.value, label: d.label }));
  if (current && !DOC_TYPE_VALUES.includes(current)) base.push({ value: current, label: current });
  return base;
}

/** Lee un tipo de documento escrito a mano ("cedula", "C.C.", "nit"). */
export function parseDocType(raw: string): string | null {
  const s = raw.normalize("NFD").replace(/\p{Diacritic}/gu, "").replace(/[\s.]/g, "").toUpperCase();
  if (s === "") return null;
  if (DOC_TYPE_VALUES.includes(s)) return s;
  if (s.startsWith("CEDULADECIUDADANIA") || s === "CEDULA") return "CC";
  if (s.startsWith("CEDULADEEXTRANJERIA")) return "CE";
  if (s.startsWith("PASAPORTE")) return "PP";
  if (s.startsWith("TARJETADEIDENTIDAD")) return "TI";
  if (s === "RUT") return "NIT";
  return null;
}
