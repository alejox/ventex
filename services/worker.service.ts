import { createClient } from "@/utils/supabase/client";
import type { WorkerPermissions } from "@/config/business";

export interface WorkerMember {
  id: string;
  full_name: string | null;
  username: string | null;
  staff_id: string | null;
  role: string | null;
  worker_permissions: WorkerPermissions;
  created_at: string;
}

export interface InviteWorkerInput {
  username: string;
  password: string;
  fullName: string;
  role: string;
  staffId?: string;
}

export interface UpdateWorkerInput {
  fullName: string;
  username: string;
  role: string;
  /** Opcional: si se indica, restablece la contraseña del trabajador. */
  password?: string;
}

// El trabajador inicia sesión con la llave del negocio + `worker_username` + contraseña.
// El rol vive en `worker_role`. El correo (auth) es sintético y no se muestra.
const WORKER_SELECT = `
  id,
  full_name,
  staff_id,
  worker_role,
  worker_username,
  worker_permissions,
  created_at
`;

export async function fetchWorkers(): Promise<WorkerMember[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select(WORKER_SELECT)
    .eq("is_worker", true)
    .order("created_at", { ascending: false });

  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.id,
    full_name: row.full_name,
    username: row.worker_username ?? null,
    staff_id: row.staff_id,
    role: row.worker_role ?? null,
    worker_permissions: (row.worker_permissions ?? {}) as WorkerPermissions,
    created_at: row.created_at,
  }));
}

/**
 * Actualiza nombre, usuario, cargo y (opcionalmente) la contraseña de un trabajador.
 * Va por una ruta de servidor: cambiar el usuario (unicidad) y la contraseña exige
 * privilegios de administrador que no existen en el cliente.
 */
export async function updateWorker(workerId: string, input: UpdateWorkerInput): Promise<void> {
  const res = await fetch("/api/worker/update", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ workerId, ...input }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Error al actualizar trabajador");
}

export async function inviteWorker(input: InviteWorkerInput): Promise<{ userId: string }> {
  const supabase = createClient();

  const { data, error } = await supabase.functions.invoke("worker-create-account", {
    body: input,
  });

  if (error) {
    const ctx = (error as { context?: Response }).context;
    if (ctx) {
      const body = await ctx.json().catch(() => null);
      if (body?.error) throw new Error(body.error);
    }
    throw error;
  }

  return { userId: data.userId };
}

export async function inviteWorkerViaApi(input: InviteWorkerInput): Promise<{ userId: string }> {
  const res = await fetch("/api/worker/create", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Error al crear trabajador");
  return data;
}

export async function updateWorkerPermissions(
  workerId: string,
  permissions: WorkerPermissions,
): Promise<void> {
  const supabase = createClient();
  // `.select()` para detectar el caso en que RLS filtra el UPDATE a 0 filas
  // (p. ej. un trabajador mal enlazado): sin filas devueltas, no se guardó nada.
  const { data, error } = await supabase
    .from("profiles")
    .update({ worker_permissions: permissions })
    .eq("id", workerId)
    .select("id");
  if (error) throw error;
  if (!data || data.length === 0) {
    throw new Error("No se pudieron guardar los permisos. Verifica que el trabajador pertenece a tu negocio.");
  }
}

export async function updateWorkerStaffLink(
  workerId: string,
  staffId: string | null,
): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("profiles")
    .update({ staff_id: staffId })
    .eq("id", workerId);
  if (error) throw error;
}

export async function deactivateWorker(workerId: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.rpc("deactivate_worker", { p_worker_id: workerId });
  if (error) throw error;
}
