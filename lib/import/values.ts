/**
 * Lectura tolerante de los valores que una persona escribe en una hoja.
 *
 * Nada de esto adivina en silencio: lo que no se puede leer con certeza vuelve
 * como error de la fila, para que se corrija en el archivo antes de importar.
 */

export type ValueResult<T> = { ok: true; value: T } | { ok: false; error: string };

const ok = <T>(value: T): ValueResult<T> => ({ ok: true, value });
const fail = <T>(error: string): ValueResult<T> => ({ ok: false, error });

/** Minúsculas, sin tildes, sin espacios dobles. Para comparar encabezados y nombres. */
export function normalizeText(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Encabezado normalizado: además de lo anterior, sin el `*` de obligatorio ni
 * lo que va entre paréntesis ("Precio de venta (IVA incluido) *" → "precio de
 * venta"). Así una plantilla vieja o editada a mano sigue reconociéndose.
 */
export function normalizeHeader(text: string): string {
  return normalizeText(text.replace(/\(.*?\)/g, " ").replace(/\*/g, " "));
}

/**
 * Número escrito "a la colombiana" o "a la gringa", sin adivinar:
 *
 * - `12500`, `12500.5`, `12500,5`   → como se ve.
 * - `12.500`, `1.250.000`           → miles con punto (es-CO).
 * - `12,500`, `1,250,000`           → miles con coma.
 * - `1.250.000,50` / `1,250,000.50` → el ÚLTIMO separador es el decimal.
 * - `$ 12.500`, `COP 12.500`        → se ignora la moneda.
 *
 * Vacío devuelve `null` (campo opcional sin dato), no cero.
 */
export function parseNumberCO(raw: string): ValueResult<number | null> {
  let s = raw.trim().replace(/\s/g, "").replace(/^(cop|\$|usd)+/i, "").replace(/\$/g, "");
  if (s === "") return ok(null);
  let negative = false;
  if (s.startsWith("-")) {
    negative = true;
    s = s.slice(1);
  }
  if (!/^[\d.,]+$/.test(s)) return fail(`"${raw.trim()}" no es un número`);

  const lastDot = s.lastIndexOf(".");
  const lastComma = s.lastIndexOf(",");
  let normalized: string;
  if (lastDot >= 0 && lastComma >= 0) {
    // Los dos: el último es el decimal y el otro, el de miles.
    const decimal = lastDot > lastComma ? "." : ",";
    const thousands = decimal === "." ? "," : ".";
    normalized = s.split(thousands).join("").replace(decimal, ".");
  } else if (lastDot >= 0 || lastComma >= 0) {
    const sep = lastDot >= 0 ? "." : ",";
    const groups = s.split(sep);
    // Grupos de a tres después del primero = separador de miles.
    const isThousands =
      groups.length > 1 && groups[0].length >= 1 && groups[0].length <= 3 &&
      groups.slice(1).every((g) => g.length === 3) && (groups.length > 2 || groups[0] !== "0");
    normalized = isThousands ? groups.join("") : groups.length === 2 ? groups.join(".") : "";
  } else {
    normalized = s;
  }
  const value = Number(normalized);
  if (normalized === "" || !Number.isFinite(value)) return fail(`"${raw.trim()}" no es un número`);
  return ok(negative ? -value : value);
}

const TRUE_WORDS = new Set(["si", "s", "yes", "y", "true", "1", "x", "verdadero"]);
const FALSE_WORDS = new Set(["no", "n", "false", "0", "falso"]);

/** "Sí"/"No" y sus variantes. Vacío = `null` (usar el valor por defecto). */
export function parseYesNo(raw: string): ValueResult<boolean | null> {
  const s = normalizeText(raw);
  if (s === "") return ok(null);
  if (TRUE_WORDS.has(s)) return ok(true);
  if (FALSE_WORDS.has(s)) return ok(false);
  return fail(`"${raw.trim()}" no es Sí o No`);
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function parseEmail(raw: string): ValueResult<string | null> {
  const s = raw.trim();
  if (s === "") return ok(null);
  return EMAIL_RE.test(s) ? ok(s.toLowerCase()) : fail(`"${s}" no es un correo válido`);
}

/**
 * Teléfono: se guarda como lo escribieron (es lo que se va a leer en la ficha),
 * pero tiene que parecer un teléfono: dígitos, espacios, guiones, paréntesis y
 * un `+` inicial, con 7 a 15 dígitos. Excel suele convertir 3001234567 en
 * `3001234567` o `3,00E+09`: lo segundo se rechaza, porque los dígitos ya se
 * perdieron.
 */
export function parsePhone(raw: string): ValueResult<string | null> {
  const s = raw.trim();
  if (s === "") return ok(null);
  if (!/^\+?[\d\s().-]+$/.test(s)) return fail(`"${s}" no parece un teléfono`);
  const digits = s.replace(/\D/g, "").length;
  if (digits < 7 || digits > 15) return fail(`"${s}" no tiene la cantidad de dígitos de un teléfono`);
  return ok(s);
}

/**
 * Documento (CC, NIT…) para COMPARAR duplicados: sin puntos, guiones ni
 * espacios y en mayúsculas. "1.020.304" y "1020304" son el mismo documento.
 * Lo que se guarda es lo escrito; esto es solo la clave de búsqueda.
 */
export function documentKey(raw: string | null | undefined): string {
  return (raw ?? "").replace(/[\s.\-_/]/g, "").toUpperCase();
}

/** Texto opcional: recortado, y vacío = `null`. */
export function optionalText(raw: string | undefined): string | null {
  const s = (raw ?? "").trim();
  return s === "" ? null : s;
}
