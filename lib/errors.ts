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
