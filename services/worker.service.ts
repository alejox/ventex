import { createClient } from "@/utils/supabase/client";
import type { WorkerPermission, WorkerPermissions } from "@/config/business";

export interface WorkerMember {
  id: string;
  full_name: string | null;
  email: string | null;
  staff_id: string | null;
  staff_role: string | null;
  worker_permissions: WorkerPermissions;
  created_at: string;
}

export interface InviteWorkerInput {
  email: string;
  password: string;
  fullName: string;
  role: string;
  staffId?: string;
}

const WORKER_SELECT = `
  id,
  full_name,
  email,
  staff_id,
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
  return (data ?? []) as WorkerMember[];
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
  const { error } = await supabase
    .from("profiles")
    .update({ worker_permissions: permissions })
    .eq("id", workerId);
  if (error) throw error;
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
