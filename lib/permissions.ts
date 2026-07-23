import type { Profile, WorkerPermission } from "@/config/business";

/**
 * ¿El perfil tiene este permiso?
 *
 * El dueño siempre lo tiene: los permisos existen para acotar empleados, no
 * para acotar a quien es dueño del negocio. Un empleado lo tiene solo si está
 * explícitamente encendido en su perfil.
 *
 * Espejo exacto de `public.worker_can(text)` en la base. Esto es UX —esconder
 * lo que la persona no puede usar—; el gate real está en la RLS, en los
 * triggers y en los RPC. Si los dos no dicen lo mismo, manda la base.
 */
export function can(profile: Profile | null, permission: WorkerPermission): boolean {
  if (!profile) return false;
  if (!profile.isWorker) return true;
  return Boolean(profile.workerPermissions?.[permission]);
}
