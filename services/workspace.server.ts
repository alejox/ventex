import { cache } from "react";
import { createClient } from "@/utils/supabase/server";
import {
  normalizeWorkspaceContext,
  type WorkspaceContext,
} from "@/services/workspace.service";

type RpcResult = {
  data: unknown;
  error: { message: string } | null;
};

type UntypedRpc = (
  name: string,
  args?: Record<string, unknown>,
) => Promise<RpcResult>;

async function serverRpc(
  client: Awaited<ReturnType<typeof createClient>>,
  name: string,
  args?: Record<string, unknown>,
): Promise<unknown> {
  // Temporary seam until database.types.ts is regenerated from the migrated
  // remote schema.
  const rpc = client.rpc.bind(client) as unknown as UntypedRpc;
  const { data, error } = await rpc(name, args);
  if (error) throw new Error(error.message);
  return data;
}

export const fetchWorkspaceContextServer = cache(
  async function fetchWorkspaceContextServer(): Promise<WorkspaceContext | null> {
    const client = await createClient();
    const {
      data: { user },
    } = await client.auth.getUser();
    if (!user) return null;
    return normalizeWorkspaceContext(
      await serverRpc(client, "workspace_context"),
    );
  },
);

export const resolveWorkspaceForDashboard = cache(
  async function resolveWorkspaceForDashboard(): Promise<WorkspaceContext | null> {
    const client = await createClient();
    const {
      data: { user },
    } = await client.auth.getUser();
    if (!user) return null;

    let context = normalizeWorkspaceContext(
      await serverRpc(client, "workspace_context"),
    );
    if (!context.active && context.available.length === 1) {
      await serverRpc(client, "select_active_workspace", {
        p_workspace_id: context.available[0].workspace_id,
      });
      context = normalizeWorkspaceContext(
        await serverRpc(client, "workspace_context"),
      );
    }
    return context;
  },
);

export async function requireSelectedWorkspaceOwner() {
  const client = await createClient();
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return null;

  const context = normalizeWorkspaceContext(
    await serverRpc(client, "workspace_context"),
  );
  if (
    !context.active ||
    context.active.member_kind !== "owner" ||
    context.active.status !== "active"
  ) {
    return null;
  }

  return {
    user,
    workspaceId: context.active.workspace_id,
    membershipId: context.active.id,
    businessName: context.active.business_name,
    client,
  };
}
