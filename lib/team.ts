import type { StaffMember } from "@/services/staff.service";
import type { WorkerMember } from "@/services/worker.service";

/**
 * Una persona del negocio, vista completa.
 *
 * El registro canónico es la FICHA (`public.staff`): nombre, cargo y comisión.
 * El acceso al sistema (`profiles` con `is_worker`) es un atributo opcional
 * suyo: hay gente que trabaja y no entra al software, y el vínculo entre ambos
 * es `profiles.staff_id`.
 *
 * Se arma en el cliente, uniendo las dos consultas, en vez de con un embed de
 * PostgREST: `profiles` tiene grants por columna y RLS propios, y un embed que
 * devolviera null por permisos se vería igual que "esta persona no tiene
 * acceso" — un falso negativo peligroso justo en la pantalla de accesos.
 */
export interface TeamMember extends StaffMember {
  /** Cuenta con la que entra al sistema. null = solo ficha, no inicia sesión. */
  account: WorkerMember | null;
}

/**
 * Cruza fichas y cuentas por `staff_id`.
 *
 * Una cuenta sin ficha no debería existir (la migración
 * 20260728000000_link_workers_to_staff le dio ficha a todas), pero si aparece
 * una se devuelve igual con una ficha sintética: perder de vista a alguien que
 * SÍ puede entrar al sistema es peor que mostrar una fila incompleta.
 */
export function mergeTeam(staff: StaffMember[], accounts: WorkerMember[]): TeamMember[] {
  const byStaffId = new Map(
    accounts.filter((a) => a.staff_id).map((a) => [a.staff_id as string, a]),
  );

  const merged: TeamMember[] = staff.map((member) => ({
    ...member,
    account: byStaffId.get(member.id) ?? null,
  }));

  const huerfanas = accounts.filter((a) => !a.staff_id);
  for (const account of huerfanas) {
    merged.push({
      id: `account:${account.id}`,
      full_name: account.full_name ?? account.username ?? "Sin nombre",
      role: account.role,
      phone: null,
      email: null,
      status: "active",
      created_at: account.created_at,
      account,
    });
  }

  return merged;
}

/** Las filas sintéticas de `mergeTeam` no tienen ficha que editar ni borrar. */
export function hasStaffRecord(member: TeamMember): boolean {
  return !member.id.startsWith("account:");
}
