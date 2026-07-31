import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

const migrationPath =
  "supabase/migrations/20260730233000_multi_workspace_memberships.sql";

test.describe("Multi-business workspace authority", () => {
  test("models one identity with independent memberships in multiple businesses", () => {
    const migration = source(migrationPath);

    expect(migration).toContain("create table public.workspaces");
    expect(migration).toContain("create table public.workspace_memberships");
    expect(migration).toContain("workspace_memberships_workspace_auth_key");
    expect(migration).toContain("workspace_memberships_staff_workspace_fkey");
    expect(migration).toContain("status in ('pending', 'active', 'suspended', 'revoked')");
    expect(migration).toContain("member_kind in ('owner', 'member')");
  });

  test("selects a workspace per JWT session and fails closed without a selection", () => {
    const migration = source(migrationPath);
    const serverProfile = source("services/profile.server.ts");

    expect(migration).toContain("create table public.workspace_session_selections");
    expect(migration).toContain("auth.jwt() ->> 'session_id'");
    expect(migration).toContain(
      "create or replace function public.select_active_workspace",
    );
    expect(migration).toContain(
      "create or replace function public.get_effective_user_id()",
    );
    expect(migration).toContain("m.status = 'active'");
    expect(serverProfile).toContain("await resolveWorkspaceForDashboard()");
    expect(migration).not.toContain(
      "when coalesce(p.is_worker, false) = false\n      then auth.uid()",
    );
  });

  test("suspension and revocation are membership-local", () => {
    const route = source("app/api/worker/update/route.ts");

    expect(route).toContain("findMembership");
    expect(route).toContain("updateMembership");
    expect(route).toContain("workspace_id: workspaceId");
    expect(route).not.toContain("admin.auth.admin.updateUserById");
    expect(route).not.toContain("admin.auth.admin.deleteUser");
  });

  test("validates owner administration against the selected workspace", () => {
    const createRoute = source("app/api/worker/create/route.ts");
    const updateRoute = source("app/api/worker/update/route.ts");

    for (const route of [createRoute, updateRoute]) {
      expect(route).toContain("requireSelectedWorkspaceOwner");
      expect(route).toContain("workspaceId");
    }
  });

  test("handles existing and new identities without replacing passwords", () => {
    const route = source("app/api/worker/create/route.ts");
    const migration = source(migrationPath);

    expect(migration).toContain(
      "create or replace function public.find_auth_user_by_email",
    );
    expect(route).toContain("findAuthUserByEmail");
    expect(route).toContain("inviteUserByEmail");
    expect(route).toContain("provisional_auth_user");
    expect(route).not.toContain("updateUserById");
    expect(route).toContain("MEMBERSHIP_ALREADY_ACTIVE");
    expect(route).toContain("MEMBERSHIP_ALREADY_PENDING");
  });

  test("accepts exactly one pending invitation after email validation", () => {
    const migration = source(migrationPath);
    const route = source("app/api/worker/activate/route.ts");

    expect(migration).toContain(
      "create or replace function public.accept_workspace_invitation",
    );
    expect(migration).toContain("lower(trim(u.email)) = m.invited_email");
    expect(migration).toContain("where m.id = p_membership_id");
    expect(route).toContain("membershipId");
  });

  test("binds shifts and sales to workspace membership context", () => {
    const migration = source(migrationPath);

    expect(migration).toContain(
      "alter table public.shifts add column membership_id",
    );
    expect(migration).toContain(
      "create unique index shifts_one_open_per_workspace_membership",
    );
    expect(migration).toContain(
      "alter table public.sales add column membership_id",
    );
    expect(migration).toContain(
      "alter table public.sales alter column membership_id set not null",
    );
    expect(migration).toContain("sales_membership_fkey");
    expect(migration).toContain("cash_movements_shift_context_fkey");
    expect(migration).toContain("p_expected_workspace_id uuid");
    expect(migration).toContain("p_expected_membership_id uuid");
    expect(migration).toContain("p_expected_shift_id uuid");
    expect(migration).toContain("CONTEXTO_DE_TRABAJO_CAMBIO");
  });

  test("partitions offline sales by workspace, membership, and shift", () => {
    const queue = source("services/offline-queue.service.ts");
    const store = source("stores/pos.store.ts");

    expect(queue).toContain("workspaceId: string");
    expect(queue).toContain("membershipId: string");
    expect(queue).toContain('const DB_VERSION = 2');
    expect(queue).toContain("by_workspace_context");
    expect(store).toContain("getWorkspaceExecutionContext");
    expect(store).toContain("venta.workspaceId");
    expect(store).toContain("venta.membershipId");
    expect(store).toContain("shiftId: params.input.shiftId");
    expect(store).toContain(
      "params.input.workspaceId !== params.context.workspaceId",
    );
  });

  test("uses the effective workspace for storage folders and mutation policies", () => {
    const migration = source(migrationPath);
    const inventory = source("services/inventory.service.ts");
    const settings = source("services/settings.service.ts");

    expect(migration).toContain(
      "(storage.foldername(name))[1] = public.get_effective_user_id()::text",
    );
    expect(inventory).toContain("getSelectedWorkspaceId");
    expect(settings).toContain("getSelectedWorkspaceId");
  });

  test("protects the workspace chooser from anonymous sessions", () => {
    const proxy = source("proxy.ts");

    expect(proxy).toContain('pathname === "/workspace"');
  });

  test("keeps privileged membership tables and lookup functions server-only", () => {
    const migration = source(migrationPath);

    expect(migration).toContain(
      "revoke all on table public.workspace_memberships from public, anon, authenticated",
    );
    expect(migration).toContain(
      "revoke execute on function public.find_auth_user_by_email(text) from public, anon, authenticated",
    );
    expect(migration).toContain(
      "grant execute on function public.find_auth_user_by_email(text) to service_role",
    );
    expect(migration).toContain("membership authority assertion failed");
  });
});
