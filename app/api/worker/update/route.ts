import { type NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { requireSelectedWorkspaceOwner } from "@/services/workspace.server";
import {
  findMembership,
  listWorkspaceMemberships,
  updateMembership,
} from "@/services/workspace-admin.server";
import {
  WORKER_PERMISSION_LABELS,
  type WorkerPermission,
  type WorkerPermissions,
} from "@/config/business";

type AccessStatus = "pending" | "active" | "suspended" | "revoked";

function sanitizePermissions(raw: unknown): WorkerPermissions {
  if (!raw || typeof raw !== "object") return {};
  const permissions: WorkerPermissions = {};
  for (const key of Object.keys(
    WORKER_PERMISSION_LABELS,
  ) as WorkerPermission[]) {
    if ((raw as Record<string, unknown>)[key] === true) permissions[key] = true;
  }
  return permissions;
}

export async function GET() {
  const owner = await requireSelectedWorkspaceOwner();
  if (!owner) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const { workspaceId } = owner;
  const admin = createAdminClient();
  let memberships;
  try {
    memberships = await listWorkspaceMemberships(workspaceId);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No se pudieron cargar las membresías." },
      { status: 500 },
    );
  }

  const staffIds = (memberships ?? [])
    .map((membership) => membership.staff_id)
    .filter((id): id is string => Boolean(id));
  const { data: staffRows } = staffIds.length
    ? await admin
        .from("staff")
        .select("id, full_name")
        .eq("user_id", workspaceId)
        .in("id", staffIds)
    : { data: [] as Array<{ id: string; full_name: string }> };
  const staffById = new Map(
    (staffRows ?? []).map((staff) => [staff.id, staff.full_name]),
  );

  const accounts = (memberships ?? [])
    .filter(
      (membership) =>
        membership.staff_id && staffById.has(membership.staff_id),
    )
    .map((membership) => ({
      id: membership.id,
      auth_user_id: membership.auth_user_id,
      full_name: staffById.get(membership.staff_id!) ?? null,
      email: membership.invited_email,
      staff_id: membership.staff_id,
      role: membership.role,
      worker_permissions: membership.permissions,
      access_status: membership.status,
      invited_at: membership.invited_at,
      activated_at: membership.activated_at,
      suspended_at: membership.suspended_at,
      revoked_at: membership.revoked_at,
      created_at: membership.created_at,
    }));

  return NextResponse.json({ accounts });
}

export async function POST(request: NextRequest) {
  const owner = await requireSelectedWorkspaceOwner();
  if (!owner) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const body = await request.json();
  const membershipId = String(body.membershipId ?? body.workerId ?? "");
  const action = String(body.action ?? "update");
  const { workspaceId } = owner;
  if (!membershipId) {
    return NextResponse.json(
      { error: "Falta la membresía del empleado." },
      { status: 400 },
    );
  }

  const admin = createAdminClient();
  const membership = await findMembership({
    id: membershipId,
    workspace_id: workspaceId,
    member_kind: "member",
  });

  if (!membership?.staff_id) {
    return NextResponse.json(
      { error: "No tenés permiso para administrar esta membresía." },
      { status: 403 },
    );
  }

  // The admin client bypasses RLS. Revalidate the canonical employment row on
  // every mutation so owner A cannot target a membership or staff row in B.
  const { data: staff } = await admin
    .from("staff")
    .select("id")
    .eq("id", membership.staff_id)
    .eq("user_id", workspaceId)
    .maybeSingle();
  if (!staff) {
    return NextResponse.json(
      { error: "El personal vinculado no pertenece al negocio seleccionado." },
      { status: 403 },
    );
  }

  if (action === "update") {
    const fullName = String(body.fullName ?? "").trim();
    const role = body.role ? String(body.role).trim() : null;
    if (!fullName) {
      return NextResponse.json(
        { error: "El nombre es obligatorio." },
        { status: 400 },
      );
    }

    try {
      const [staffResult] = await Promise.all([
        admin
          .from("staff")
          .update({ full_name: fullName })
          .eq("id", membership.staff_id)
          .eq("user_id", workspaceId),
        updateMembership(membershipId, workspaceId, {
          role,
          updated_at: new Date().toISOString(),
        }),
      ]);
      if (staffResult.error) throw staffResult.error;
    } catch (error) {
      return NextResponse.json(
        {
          error:
            error instanceof Error
              ? error.message
              : "No se pudo actualizar el acceso.",
        },
        { status: 500 },
      );
    }
  } else if (action === "permissions") {
    try {
      await updateMembership(membershipId, workspaceId, {
        permissions: sanitizePermissions(body.permissions),
        updated_at: new Date().toISOString(),
      });
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "No se pudieron actualizar los permisos." },
        { status: 500 },
      );
    }
  } else if (action === "resend") {
    if (membership.status !== "pending") {
      return NextResponse.json(
        { error: "Solo se pueden reenviar invitaciones pendientes." },
        { status: 409 },
      );
    }
    return NextResponse.json(
      {
        error:
          "La invitación sigue pendiente y la cuenta no fue reemplazada. El usuario existente puede aceptarla desde su selector de negocios.",
      },
      { status: 409 },
    );
  } else if (
    action === "suspend" ||
    action === "reactivate" ||
    action === "revoke"
  ) {
    const nextStatus: AccessStatus =
      action === "suspend"
        ? "suspended"
        : action === "reactivate"
          ? "active"
          : "revoked";
    const expectedStatus: AccessStatus =
      action === "suspend"
        ? "active"
        : action === "reactivate"
          ? "suspended"
          : membership.status;

    if (membership.status !== expectedStatus || expectedStatus === "revoked") {
      return NextResponse.json(
        { error: "La membresía cambió de estado. Actualizá la página e intentá de nuevo." },
        { status: 409 },
      );
    }

    const now = new Date().toISOString();
    let updated;
    try {
      updated = await updateMembership(
        membershipId,
        workspaceId,
        {
          status: nextStatus,
          suspended_at: nextStatus === "suspended" ? now : null,
          revoked_at: nextStatus === "revoked" ? now : null,
          ...(nextStatus === "active" ? { activated_at: now } : {}),
          updated_at: now,
        },
        expectedStatus,
      );
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "No se pudo cambiar el acceso." },
        { status: 500 },
      );
    }
    if (!updated) {
      return NextResponse.json(
        { error: "La membresía cambió de estado. Actualizá la página e intentá de nuevo." },
        { status: 409 },
      );
    }
  } else {
    return NextResponse.json({ error: "Acción no válida." }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
