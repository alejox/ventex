/**
 * ¿Dos juegos de permisos dicen lo mismo? Solo cuentan los encendidos: `{pos:
 * false}` y `{}` son iguales (la base guarda uno u otro según por dónde pasó),
 * y el orden de las claves no importa. Sirve para saber si un modal de
 * permisos tiene cambios sin guardar.
 */
export function samePermissions(a: Record<string, boolean | undefined>, b: Record<string, boolean | undefined>): boolean {
  const on = (perms: Record<string, boolean | undefined>) =>
    Object.keys(perms).filter((key) => perms[key]).sort().join(",");
  return on(a) === on(b);
}
