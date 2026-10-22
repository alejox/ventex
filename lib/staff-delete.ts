import { toMessage } from "@/lib/errors";

/**
 * Qué impide borrar a una persona del personal. Tres tablas apuntan a `staff`
 * con ON DELETE RESTRICT; las demás (ventas, citas) quedan en SET NULL. El
 * mensaje crudo de Postgres ("violates foreign key constraint …") no le dice
 * nada al dueño, así que se traduce según la tabla que bloqueó.
 */
const BLOCKERS: [table: string, reason: string][] = [
  ["workspace_memberships", "tiene una cuenta de acceso al sistema"],
  ["commission_settlements", "tiene comisiones pagadas registradas"],
  ["school_teacher_profiles", "tiene un perfil docente"],
];

const INACTIVE_HINT =
  "Para que deje de aparecer sin perder su historial, márcala como inactiva: abre su ficha y apaga “Activo”.";

export function staffDeleteErrorMessage(e: unknown): string {
  const code = e && typeof e === "object" ? (e as { code?: unknown }).code : undefined;
  if (code !== "23503") return toMessage(e);

  const raw = String((e as { message?: unknown }).message ?? "");
  const reason = BLOCKERS.find(([table]) => raw.includes(`"${table}"`))?.[1];
  return reason
    ? `No se puede eliminar porque ${reason}. ${INACTIVE_HINT}`
    : `No se puede eliminar porque tiene historial asociado. ${INACTIVE_HINT}`;
}
