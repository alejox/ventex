import type { WorkerPermissions } from "@/config/business";

export type WorkerAccessStatus =
  | "pending"
  | "active"
  | "suspended"
  | "revoked";

export interface WorkerMember {
  id: string;
  full_name: string | null;
  email: string | null;
  staff_id: string | null;
  role: string | null;
  worker_permissions: WorkerPermissions;
  access_status: WorkerAccessStatus;
  invited_at: string | null;
  activated_at: string | null;
  suspended_at: string | null;
  created_at: string;
}

export interface InviteWorkerInput {
  email: string;
  fullName: string;
  role: string;
  staffId: string;
  permissions?: WorkerPermissions;
}

export interface UpdateWorkerInput {
  fullName: string;
  role: string;
}

async function api<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(path, init);
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(data?.error ?? "No se pudo actualizar el acceso.");
  }
  return data as T;
}

export async function fetchWorkers(): Promise<WorkerMember[]> {
  const result = await api<{
    accounts: Array<{
      id: string;
      full_name: string | null;
      email: string | null;
      staff_id: string | null;
      role: string | null;
      worker_permissions: WorkerPermissions | null;
      access_status: WorkerAccessStatus;
      invited_at: string | null;
      activated_at: string | null;
      suspended_at: string | null;
      revoked_at: string | null;
      created_at: string;
    }>;
  }>("/api/worker/update");

  return result.accounts.map((row) => ({
    id: row.id,
    full_name: row.full_name,
    email: row.email,
    staff_id: row.staff_id,
    role: row.role,
    worker_permissions: row.worker_permissions ?? {},
    access_status: row.access_status,
    invited_at: row.invited_at,
    activated_at: row.activated_at,
    suspended_at: row.suspended_at,
    created_at: row.created_at,
  }));
}

export async function inviteWorkerViaApi(
  input: InviteWorkerInput,
): Promise<{ membershipId: string; status: "pending" }> {
  return api("/api/worker/create", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function updateWorker(
  membershipId: string,
  input: UpdateWorkerInput,
): Promise<void> {
  await api("/api/worker/update", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ membershipId, action: "update", ...input }),
  });
}

export async function updateWorkerPermissions(
  membershipId: string,
  permissions: WorkerPermissions,
): Promise<void> {
  await api("/api/worker/update", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ membershipId, action: "permissions", permissions }),
  });
}

export async function changeWorkerAccess(
  membershipId: string,
  action: "suspend" | "reactivate" | "resend" | "revoke",
): Promise<void> {
  await api("/api/worker/update", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ membershipId, action }),
  });
}
