import { whatsappLink } from "@/services/promos.service";

// ============================================================================
// Materiales + comunicación (fase 5 / U4).
//
// La parte PURA vive arriba (sin I/O, cubierta por
// `tests/school-messages.test.ts`): plantillas de mensaje, reemplazo de
// variables, singularización, límite de datos personales y las URLs de los
// enlaces de token. El acceso a datos (materiales, enlaces de acceso,
// proyección familiar, bitácora) va después, siguiendo el mismo patrón de
// `school-classes.service.ts`: los RPC de la migración 0100 son los únicos
// que escriben; acá solo se arman los argumentos y se decodifica la respuesta.
// ============================================================================

// ---- Tipos del dominio ----

export type CommunicationPurpose = "attendance" | "reschedule" | "material" | "reminder" | "other";
export type CommunicationState = "prepared" | "shared";
export type MaterialKind = "file" | "link";

export interface GateResult {
  ok: boolean;
  reason?: string;
}

export const SCHOOL_MESSAGE_PURPOSE_LABELS: Record<CommunicationPurpose, string> = {
  attendance: "Asistencia",
  reschedule: "Reprogramación",
  material: "Material",
  reminder: "Recordatorio",
  other: "Otro",
};

/**
 * Plantillas por defecto (una por propósito con variables conocidas). `other`
 * no tiene plantilla: es texto libre del operador, sin variables que rellenar.
 *
 * Cada plantilla usa SOLO datos del alumno destinatario y su propio acudiente
 * — nunca el nombre de otro alumno ni el contacto de otra familia. Esto es una
 * garantía de DISEÑO, no una validación en tiempo de ejecución: el llamador
 * arma `vars` con los datos de un único estudiante (ver `renderSchoolMessage`),
 * así que no existe una ruta por la que el texto renderizado incluya a un
 * segundo alumno.
 */
export const DEFAULT_SCHOOL_TEMPLATES: Record<
  Exclude<CommunicationPurpose, "other">,
  string
> = {
  attendance:
    "Hola {acudiente}, te contamos la asistencia de {alumno} en la clase de {instrumento} del {fecha}: {estado}.",
  reschedule:
    "Hola {acudiente}, la clase de {instrumento} de {alumno} se reprogramó: pasa del {fecha_anterior} al {fecha_nueva}.",
  material:
    'Hola {acudiente}, subimos material nuevo para {alumno}: "{titulo}". Podés verlo en tu enlace de la escuela: {enlace}',
  reminder:
    "Hola {acudiente}, te recordamos la clase de {instrumento} de {alumno} el {fecha} a las {hora}. Saldo del plan: {clases} clases.",
};

/**
 * Con 1 clase restante, la palabra pegada al token va en singular ("Le queda
 * 1 clase" y no "Le queda 1 clases"). Mismo defecto y misma solución que
 * `singularizarJuntoAl` de `services/promos.service.ts`: se corrige sobre la
 * PLANTILLA (la palabra la escribe el negocio) y solo en la palabra pegada al
 * token, para no tocar otro "1 algo" del mensaje.
 */
function singularizarJuntoAlToken(template: string, token: string, valor: number): string {
  if (valor !== 1) return template;
  return template.replace(
    new RegExp(`\\{${token}\\}(\\s+)(\\p{L}+)`, "gu"),
    (match, espacio: string, palabra: string) => {
      if (!palabra.endsWith("s")) return match;
      const singular = palabra.endsWith("ces") ? `${palabra.slice(0, -3)}z` : palabra.slice(0, -1);
      return `{${token}}${espacio}${singular}`;
    }
  );
}

/**
 * Reemplaza las variables de una plantilla de escuela.
 *
 * Los valores se insertan con una función de reemplazo (nunca como segundo
 * argumento string de `String.replace`, que interpreta `$&`/`$1`/`$'`): el
 * título de un material o el motivo de un cambio los escribe una persona, y
 * un texto con un `$&` adentro se corrompía solo al insertarse (mismo defecto
 * documentado en `renderPromoMessage`). Una variable sin valor se va a la
 * cadena vacía y no queda como `{token}` colgando en el mensaje final.
 */
export function renderSchoolMessage(
  template: string | null,
  purpose: Exclude<CommunicationPurpose, "other">,
  vars: Record<string, string | number>
): string {
  let base = template?.trim() || DEFAULT_SCHOOL_TEMPLATES[purpose];

  if (typeof vars.clases === "number") {
    base = singularizarJuntoAlToken(base, "clases", vars.clases);
  }

  const literal = (valor: string) => () => valor;
  let out = base;
  for (const [key, value] of Object.entries(vars)) {
    out = out.replace(new RegExp(`\\{${key}\\}`, "g"), literal(String(value)));
  }

  return out
    .replace(/\{[a-zA-Z_]+\}/g, "") // variable sin valor provisto → vacío
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

/**
 * URL de WhatsApp para compartir un mensaje. Con teléfono conocido usa
 * `whatsappLink` (precedente de promos); sin teléfono cae al enlace `wa.me`
 * sin destinatario —mismo recurso que ya usa `RescheduleDialog` para compartir
 * un cambio— que abre WhatsApp con el texto listo y deja que la persona elija
 * el contacto. Nunca devuelve null: siempre hay algo que abrir.
 */
export function shareWhatsAppUrl(phone: string | null | undefined, message: string): string {
  return whatsappLink(phone ?? null, message) ?? `https://wa.me/?text=${encodeURIComponent(message)}`;
}

/** URL pública de la página familiar (anon, fuera de `/dashboard`). */
export function buildFamilyLinkUrl(origin: string, token: string): string {
  return `${origin.replace(/\/$/, "")}/school/f/${token}`;
}

/** URL pública de la página de confirmación del profesor (anon, POST-only). */
export function buildConfirmLinkUrl(origin: string, token: string): string {
  return `${origin.replace(/\/$/, "")}/school/c/${token}`;
}

/**
 * Compuerta de envío: honra `notices_enabled` del acudiente. La base también
 * la revalida en `school_log_communication` (falla cerrado); esto es para
 * avisar temprano en la UI y no mostrar un botón que la base va a rechazar.
 */
export function noticeShareGate(guardian: { notices_enabled: boolean }): GateResult {
  if (!guardian.notices_enabled) {
    return { ok: false, reason: "este acudiente tiene los avisos desactivados" };
  }
  return { ok: true };
}

/**
 * Espejo puro del CHECK `school_materials_exactly_one`: un material es
 * archivo O enlace externo, nunca los dos ni ninguno. Sirve para deshabilitar
 * el botón de guardar antes de que la base lo rechace.
 */
export function materialInputGate(input: {
  kind: MaterialKind;
  hasFile: boolean;
  externalUrl: string;
}): GateResult {
  if (input.kind === "file") {
    return input.hasFile
      ? { ok: true }
      : { ok: false, reason: "seleccioná un archivo para subir" };
  }
  const url = input.externalUrl.trim();
  if (!url) return { ok: false, reason: "escribí el enlace externo" };
  if (!/^https?:\/\//i.test(url)) {
    return { ok: false, reason: "el enlace debe empezar con http:// o https://" };
  }
  return { ok: true };
}

/**
 * Cuota de almacenamiento: cuánto queda y si el archivo entra. Se recalcula
 * server-side en `/api/school/upload` (nunca confiando en el cliente); esto
 * es para avisar temprano en el formulario.
 */
export function quotaGate(usedBytes: number, quotaBytes: number, fileSize: number): GateResult {
  if (usedBytes + fileSize > quotaBytes) {
    const restanteMb = Math.max(0, (quotaBytes - usedBytes) / (1024 * 1024)).toFixed(1);
    return {
      ok: false,
      reason: `supera la cuota de almacenamiento del negocio (quedan ${restanteMb} MB)`,
    };
  }
  return { ok: true };
}
