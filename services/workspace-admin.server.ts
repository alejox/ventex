import "server-only";
import type { Json } from "@/utils/supabase/database.types";

export interface WorkspaceMembershipAdminRow {
  id: string;
  workspace_id: string;
  auth_user_id: string | null;
  staff_id: string | null;
  invited_email: string;
  member_kind: "owner" | "member";
  role: string | null;
  permissions: Json;
  status: "pending" | "active" | "suspended" | "revoked";
  provisional_auth_user: boolean;
  invited_at: string;
  accepted_at: string | null;
  activated_at: string | null;
  suspended_at: string | null;
  revoked_at: string | null;
  created_at: string;
  updated_at: string;
}

type MembershipPatch = Partial<
  Omit<WorkspaceMembershipAdminRow, "id" | "created_at">
>;

function credentials() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Faltan variables de entorno SUPABASE");
  return { url, key };
}

async function serviceRequest<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const { url, key } = credentials();
  const response = await fetch(`${url}/rest/v1/${path}`, {
    ...init,
    cache: "no-store",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(body?.message ?? "Falló una operación administrativa.");
  }
  return body as T;
}

function membershipQuery(filters: Record<string, string>): string {
  const params = new URLSearchParams({
    select: "*",
    ...Object.fromEntries(
      Object.entries(filters).map(([key, value]) => [key, `eq.${value}`]),
    ),
  });
  return `workspace_memberships?${params.toString()}`;
}

export async function findMembership(
  filters: Record<string, string>,
): Promise<WorkspaceMembershipAdminRow | null> {
  const rows = await serviceRequest<WorkspaceMembershipAdminRow[]>(
    membershipQuery(filters),
  );
  return rows[0] ?? null;
}

export async function listWorkspaceMemberships(
  workspaceId: string,
): Promise<WorkspaceMembershipAdminRow[]> {
  const params = new URLSearchParams({
    select: "*",
    workspace_id: `eq.${workspaceId}`,
    member_kind: "eq.member",
    order: "created_at.desc",
  });
  return serviceRequest(`workspace_memberships?${params.toString()}`);
}

export async function insertMembership(
  row: MembershipPatch & {
    workspace_id: string;
    staff_id: string;
    invited_email: string;
    member_kind: "member";
    status: "pending";
  },
): Promise<WorkspaceMembershipAdminRow> {
  const rows = await serviceRequest<WorkspaceMembershipAdminRow[]>(
    "workspace_memberships",
    {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(row),
    },
  );
  if (!rows[0]) throw new Error("No se pudo crear la membresía.");
  return rows[0];
}

export async function updateMembership(
  membershipId: string,
  workspaceId: string,
  patch: MembershipPatch,
  expectedStatus?: WorkspaceMembershipAdminRow["status"],
): Promise<WorkspaceMembershipAdminRow | null> {
  const params = new URLSearchParams({
    id: `eq.${membershipId}`,
    workspace_id: `eq.${workspaceId}`,
    ...(expectedStatus ? { status: `eq.${expectedStatus}` } : {}),
  });
  const rows = await serviceRequest<WorkspaceMembershipAdminRow[]>(
    `workspace_memberships?${params.toString()}`,
    {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(patch),
    },
  );
  return rows[0] ?? null;
}

export async function findAuthUserByEmail(
  email: string,
): Promise<string | null> {
  return serviceRequest<string | null>("rpc/find_auth_user_by_email", {
    method: "POST",
    body: JSON.stringify({ p_email: email }),
  });
}

export async function provisionalIdentityIsUnused(
  userId: string,
): Promise<boolean> {
  const [memberships, workspaces] = await Promise.all([
    serviceRequest<Array<{ id: string }>>(
      `workspace_memberships?select=id&auth_user_id=eq.${encodeURIComponent(userId)}&limit=1`,
    ),
    serviceRequest<Array<{ id: string }>>(
      `workspaces?select=id&owner_user_id=eq.${encodeURIComponent(userId)}&limit=1`,
    ),
  ]);
  return memberships.length === 0 && workspaces.length === 0;
}
