import { createClient } from "@/utils/supabase/client";
import type {
  BusinessType,
  Modules,
  WorkerPermissions,
} from "@/config/business";

export type WorkspaceMembershipStatus =
  | "pending"
  | "active"
  | "suspended"
  | "revoked";

export interface WorkspaceMembershipContext {
  id: string;
  workspace_id: string;
  member_kind: "owner" | "member";
  role: string | null;
  permissions: WorkerPermissions;
  status: WorkspaceMembershipStatus;
  staff_id: string | null;
  invited_email: string;
  business_name: string | null;
  business_type: BusinessType | null;
  modules: Modules;
  is_selected: boolean;
}

export interface WorkspaceContext {
  active: WorkspaceMembershipContext | null;
  available: WorkspaceMembershipContext[];
  invitations: WorkspaceMembershipContext[];
}

export interface WorkspaceExecutionContext {
  authUserId: string;
  workspaceId: string;
  membershipId: string;
}

type RpcResult = {
  data: unknown;
  error: { message: string } | null;
};

type UntypedRpc = (
  name: string,
  args?: Record<string, unknown>,
) => Promise<RpcResult>;

function rpc(client: ReturnType<typeof createClient>): UntypedRpc {
  // Temporary seam until the remote migration is applied and generated types
  // include the workspace RPCs. Runtime validation still lives in PostgreSQL.
  return client.rpc.bind(client) as unknown as UntypedRpc;
}

function normalizeMembership(
  value: unknown,
): WorkspaceMembershipContext | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (
    typeof row.id !== "string" ||
    typeof row.workspace_id !== "string" ||
    (row.member_kind !== "owner" && row.member_kind !== "member")
  ) {
    return null;
  }

  const status = row.status;
  if (
    status !== "pending" &&
    status !== "active" &&
    status !== "suspended" &&
    status !== "revoked"
  ) {
    return null;
  }

  return {
    id: row.id,
    workspace_id: row.workspace_id,
    member_kind: row.member_kind,
    role: typeof row.role === "string" ? row.role : null,
    permissions: (row.permissions ?? {}) as WorkerPermissions,
    status,
    staff_id: typeof row.staff_id === "string" ? row.staff_id : null,
    invited_email:
      typeof row.invited_email === "string" ? row.invited_email : "",
    business_name:
      typeof row.business_name === "string" ? row.business_name : null,
    business_type:
      typeof row.business_type === "string"
        ? (row.business_type as BusinessType)
        : null,
    modules: (row.modules ?? {}) as Modules,
    is_selected: row.is_selected === true,
  };
}

export function normalizeWorkspaceContext(value: unknown): WorkspaceContext {
  const row =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};
  const available = Array.isArray(row.available)
    ? row.available
        .map(normalizeMembership)
        .filter((item): item is WorkspaceMembershipContext => item !== null)
    : [];
  const invitations = Array.isArray(row.invitations)
    ? row.invitations
        .map(normalizeMembership)
        .filter((item): item is WorkspaceMembershipContext => item !== null)
    : [];

  return {
    active: normalizeMembership(row.active),
    available,
    invitations,
  };
}

export async function fetchWorkspaceContext(): Promise<WorkspaceContext> {
  const client = createClient();
  const { data, error } = await rpc(client)("workspace_context");
  if (error) throw new Error(error.message);
  return normalizeWorkspaceContext(data);
}

export async function selectWorkspace(workspaceId: string): Promise<void> {
  const client = createClient();
  const { error } = await rpc(client)("select_active_workspace", {
    p_workspace_id: workspaceId,
  });
  if (error) throw new Error(error.message);
}

export async function signOut(): Promise<void> {
  const client = createClient();
  const { error } = await client.auth.signOut();
  if (error) throw new Error(error.message);
}

export async function acceptInvitation(membershipId: string): Promise<void> {
  const response = await fetch("/api/worker/activate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ membershipId }),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(body?.error ?? "No se pudo aceptar la invitación.");
  }
}

export async function getSelectedWorkspaceId(): Promise<string> {
  const context = await fetchWorkspaceContext();
  if (!context.active) throw new Error("No hay un negocio seleccionado.");
  return context.active.workspace_id;
}

export async function getWorkspaceExecutionContext(): Promise<WorkspaceExecutionContext> {
  const client = createClient();
  const [{ data }, context] = await Promise.all([
    client.auth.getSession(),
    fetchWorkspaceContext(),
  ]);
  const authUserId = data.session?.user.id;
  if (!authUserId || !context.active) {
    throw new Error("No hay un contexto de negocio activo.");
  }
  return {
    authUserId,
    workspaceId: context.active.workspace_id,
    membershipId: context.active.id,
  };
}
