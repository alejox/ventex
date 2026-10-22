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

/** Códigos que devuelve `/api/worker/delete-staff` en `{ error, message }`. */
export const STAFF_DELETE_CODES = {
  notOwner: "SOLO_DUENO",
  notFound: "PERSONAL_NO_ENCONTRADO",
  accountAccepted: "CUENTA_ACEPTADA",
  hasShifts: "INVITACION_CON_TURNOS",
  hasSettlements: "PERSONAL_CON_COMISIONES",
  hasTeacherProfile: "PERSONAL_CON_PERFIL_DOCENTE",
  incomplete: "ELIMINACION_INCOMPLETA",
} as const;

export type StaffDeleteCode =
  (typeof STAFF_DELETE_CODES)[keyof typeof STAFF_DELETE_CODES];

const ROUTE_MESSAGES: Record<StaffDeleteCode, string> = {
  SOLO_DUENO:
    "Solo el dueño del negocio puede eliminar a alguien que tiene acceso al sistema.",
  PERSONAL_NO_ENCONTRADO:
    "Esa persona ya no está en tu equipo. Recarga la página.",
  CUENTA_ACEPTADA:
    "No se puede eliminar porque ya aceptó su acceso al sistema. Usa “Suspender acceso” en su tarjeta y márcala como inactiva: abre su ficha y apaga “Activo”. Así deja de aparecer sin perder su historial.",
  INVITACION_CON_TURNOS: `No se puede eliminar porque tiene turnos de caja registrados. ${INACTIVE_HINT}`,
  PERSONAL_CON_COMISIONES: `No se puede eliminar porque tiene comisiones pagadas registradas. ${INACTIVE_HINT}`,
  PERSONAL_CON_PERFIL_DOCENTE: `No se puede eliminar porque tiene un perfil docente. ${INACTIVE_HINT}`,
  ELIMINACION_INCOMPLETA:
    "Se canceló la invitación, pero no se pudo terminar de eliminar a la persona. Intenta de nuevo en unos minutos.",
};

function isRouteCode(code: unknown): code is StaffDeleteCode {
  return typeof code === "string" && code in ROUTE_MESSAGES;
}

export function staffDeleteErrorMessage(e: unknown): string {
  const code = e && typeof e === "object" ? (e as { code?: unknown }).code : undefined;
  if (isRouteCode(code)) return ROUTE_MESSAGES[code];
  if (code !== "23503") return toMessage(e);

  const raw = String((e as { message?: unknown }).message ?? "");
  const reason = BLOCKERS.find(([table]) => raw.includes(`"${table}"`))?.[1];
  return reason
    ? `No se puede eliminar porque ${reason}. ${INACTIVE_HINT}`
    : `No se puede eliminar porque tiene historial asociado. ${INACTIVE_HINT}`;
}

export interface StaffDeleteMembership {
  id: string;
  status: string;
  accepted_at: string | null;
  provisional_auth_user: boolean;
  auth_user_id: string | null;
}

export interface StaffDeleteFacts {
  /** Todas las membresías que apuntan a esta persona (normalmente 0 o 1). */
  memberships: readonly StaffDeleteMembership[];
  /** Turnos (`shifts`) de esas membresías. */
  shiftsCount: number;
  settlementsCount: number;
  hasTeacherProfile: boolean;
}

export type StaffDeleteDecision =
  | "delete-staff-only"
  | "cancel-invitation-and-delete"
  | { blocked: StaffDeleteCode };

/** Una invitación que nadie aceptó nunca: lo único que esta ruta cancela. */
export function isNeverAcceptedInvitation(m: StaffDeleteMembership): boolean {
  return m.status === "pending" && m.accepted_at === null;
}

/**
 * Qué hace la ruta de borrado. Pura: la ruta junta los hechos con el cliente
 * admin y ejecuta lo que esto decida. Lo que tiene historial propio
 * (comisiones pagadas, perfil docente, turnos de caja) o una cuenta que ya se
 * usó nunca se borra: se suspende y se marca inactiva.
 */
export function staffDeleteDecision(facts: StaffDeleteFacts): StaffDeleteDecision {
  if (facts.settlementsCount > 0) return { blocked: STAFF_DELETE_CODES.hasSettlements };
  if (facts.hasTeacherProfile) return { blocked: STAFF_DELETE_CODES.hasTeacherProfile };
  if (facts.memberships.length === 0) return "delete-staff-only";
  if (!facts.memberships.every(isNeverAcceptedInvitation)) {
    return { blocked: STAFF_DELETE_CODES.accountAccepted };
  }
  if (facts.shiftsCount > 0) return { blocked: STAFF_DELETE_CODES.hasShifts };
  return "cancel-invitation-and-delete";
}
