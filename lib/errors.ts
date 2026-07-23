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
