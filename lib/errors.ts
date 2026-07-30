/**
 * Mensaje legible para el usuario a partir de lo que sea que se haya lanzado.
 *
 * Existe porque la versión que había duplicada en cada store —`e instanceof
 * Error ? e.message : "Ocurrió un error inesperado"`— tapaba justo los errores
 * que más importan: los de Supabase (`PostgrestError`) son objetos planos
 * `{ message, details, hint, code }`, NO instancias de `Error`. Resultado: cada
 * fallo de la base aparecía como "Ocurrió un error inesperado" y había que
 * abrir la consola para saber qué pasó.
 *
 * También traduce los errores que levantan los guards de permisos, que llegan
 * con el prefijo `SIN_PERMISO:` desde las policies y funciones de Postgres.
 */
/**
 * Mensaje legible para los errores de Supabase Auth.
 *
 * Existe aparte de `toMessage` porque GoTrue devuelve texto en inglés y códigos
 * propios (`over_email_send_rate_limit`, `otp_expired`, …) que el usuario final
 * no puede interpretar. El caso más frecuente es el límite de envío: sin
 * traducirlo, la pantalla de "restablecer contraseña" muestra un mensaje en
 * inglés que parece un error del sistema cuando en realidad solo hay que
 * esperar unos segundos.
 */
export function authMessage(e: unknown): string {
  const code =
    e && typeof e === "object" ? (e as { code?: unknown }).code : undefined;
  const raw =
    typeof e === "string"
      ? e
      : e && typeof e === "object" && typeof (e as { message?: unknown }).message === "string"
        ? ((e as { message: string }).message)
        : "";

  // "For security purposes, you can only request this after 43 seconds."
  const cooldown = /after (\d+) seconds?/i.exec(raw);
  if (code === "over_email_send_rate_limit" || cooldown) {
    return cooldown
      ? `Por seguridad, esperá ${cooldown[1]} segundos antes de pedir otro enlace.`
      : "Se alcanzó el límite de correos. Esperá unos minutos e intentá de nuevo.";
  }

  if (code === "otp_expired" || /expired|invalid.*(token|link)|token not found/i.test(raw)) {
    return "El enlace ya se usó o venció. Pedí uno nuevo.";
  }

  if (code === "same_password" || /should be different from the old/i.test(raw)) {
    return "La contraseña nueva tiene que ser distinta de la anterior.";
  }

  if (code === "weak_password" || /password should be at least/i.test(raw)) {
    return "La contraseña es muy corta. Usá al menos 6 caracteres.";
  }

  if (/auth session missing|session_not_found/i.test(raw)) {
    return "La sesión de recuperación no es válida. Pedí un enlace nuevo.";
  }

  if (/failed to fetch|network/i.test(raw)) {
    return "No pudimos conectar con el servidor. Revisá tu conexión.";
  }

  return toMessage(e);
}

/**
 * Firmas de "no llegué al servidor" en los tres motores. Cada navegador
 * redacta el fallo de `fetch` a su manera y hay que cubrir los tres: Chrome
 * dice "Failed to fetch", Firefox "NetworkError when attempting to fetch
 * resource" y Safari —el de las tablets del salón— simplemente "Load failed".
 */
const NETWORK_FAILURE =
  /failed to fetch|networkerror|network request failed|load failed|fetch failed|internet connection appears to be offline|err_internet_disconnected/i;

/**
 * Si el error es "no llegué al servidor" y no "el servidor me dijo que no".
 *
 * La distinción decide si una venta se puede encolar para reenviarla. Y la
 * asimetría del riesgo es fuerte, así que ante la duda esta función devuelve
 * FALSE:
 *
 * - Tratar un rechazo del servidor como fallo de red encola una venta que no
 *   va a entrar nunca. El cajero cree que cobró, entrega la mercadería y el
 *   descuadre aparece horas después. Es el error caro.
 * - Tratar un fallo de red como rechazo solo muestra un error y el cajero
 *   reintenta. Desde que `create_sale` es idempotente, ese reintento es gratis
 *   incluso si la venta sí había entrado: devuelve la misma. Es el error barato.
 *
 * Por eso el criterio es "confirmá que fue la red", no "descartá que fue el
 * servidor". Un timeout o un error raro caen del lado del reintento.
 */
export function isNetworkError(e: unknown): boolean {
  if (!e || typeof e !== "object") return false;

  // Todo error de Postgres viaja con su SQLSTATE ('P0001' para los `raise
  // exception` de create_sale, '23505' para el índice único, '42501' para la
  // RLS...). Si hay código, el servidor contestó: no fue la red, sin importar
  // lo que diga el mensaje. Va primero por eso.
  const code = (e as { code?: unknown }).code;
  if (typeof code === "string" && code.trim() !== "") return false;

  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;

  const message = (e as { message?: unknown }).message;
  return typeof message === "string" && NETWORK_FAILURE.test(message);
}

/**
 * Si el servidor rechazó la venta de forma DEFINITIVA.
 *
 * Sirve para decidir si una venta encolada se sigue reintentando o se manda a
 * la bandeja de conflictos. Solo devuelve true con códigos que no cambian por
 * reintentar:
 *
 * - `P0001`: los `raise exception` de `create_sale` (STOCK_INSUFICIENTE, tope
 *   del plan, cupo de crédito, turno cerrado).
 * - clase `23`: violaciones de restricción.
 * - clase `42`: permisos y RLS.
 *
 * Lo que queda afuera importa tanto como lo que entra. Un `PGRST301` (JWT
 * vencido) o un 5xx traen código pero SÍ pueden andar en el próximo intento, y
 * marcarlos como definitivos perdería ventas cobradas.
 */
export function isBusinessRejection(e: unknown): boolean {
  if (!e || typeof e !== "object") return false;
  const code = (e as { code?: unknown }).code;
  if (typeof code !== "string") return false;
  return code === "P0001" || code.startsWith("23") || code.startsWith("42");
}

export function toMessage(e: unknown): string {
  if (typeof e === "string" && e.trim()) return e;

  if (e && typeof e === "object") {
    const raw = (e as { message?: unknown }).message;
    if (typeof raw === "string" && raw.trim()) {
      // `SIN_PERMISO: no tenés permiso para X` → `No tenés permiso para X`
      const withoutTag = raw.replace(/^SIN_PERMISO:\s*/i, "");
      const clean = withoutTag === raw ? raw : withoutTag.charAt(0).toUpperCase() + withoutTag.slice(1);

      // La RLS rechaza sin explicar; el mensaje crudo no le dice nada a nadie.
      if (/row-level security|permission denied/i.test(clean)) {
        return "No tenés permiso para hacer esto.";
      }
      return clean;
    }
  }

  return "Ocurrió un error inesperado";
}
