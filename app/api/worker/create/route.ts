import { type NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { requireSelectedWorkspaceOwner } from "@/services/workspace.server";
import { sendExistingUserInvitationEmail } from "@/services/invitation-email.server";
import {
  findAuthUserByEmail,
  findMembership,
  insertMembership,
  provisionalIdentityIsUnused,
  updateMembership,
} from "@/services/workspace-admin.server";
import {
  WORKER_PERMISSION_LABELS,
  type WorkerPermission,
  type WorkerPermissions,
} from "@/config/business";

const MEMBERSHIP_ALREADY_ACTIVE = "MEMBERSHIP_ALREADY_ACTIVE";
const MEMBERSHIP_ALREADY_PENDING = "MEMBERSHIP_ALREADY_PENDING";
const MEMBERSHIP_SUSPENDED = "MEMBERSHIP_SUSPENDED";

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

function invitationRedirect(
  request: NextRequest,
  membershipId: string,
): string {
  const url = new URL("/update-password", request.nextUrl.origin);
  url.searchParams.set("invitation", membershipId);
  return url.toString();
}

function invitationError(message: string): string {
  const normalized = message.toLowerCase();
  if (normalized.includes("rate") || normalized.includes("limit")) {
    return "Se alcanzó el límite temporal de invitaciones. Esperá unos minutos e intentá de nuevo.";
  }
  return "No se pudo enviar la invitación. Verificá el correo e intentá de nuevo.";
}

async function deleteUnusedProvisionalIdentity(userId: string): Promise<void> {
  if (await provisionalIdentityIsUnused(userId)) {
    await createAdminClient().auth.admin.deleteUser(userId);
  }
}

export async function POST(request: NextRequest) {
  const owner = await requireSelectedWorkspaceOwner();
  if (!owner) {
    return NextResponse.json(
      { error: "Solo el dueño del negocio seleccionado puede invitar empleados." },
      { status: 403 },
    );
  }

  const body = await request.json();
  const email = String(body.email ?? "").trim().toLowerCase();
  const staffId = String(body.staffId ?? "");
  const role = body.role ? String(body.role).trim() : null;
  const permissions = sanitizePermissions(body.permissions);
  const { workspaceId } = owner;

  if (!email || !email.includes("@") || !staffId) {
    return NextResponse.json(
      { error: "El correo y el miembro del personal son obligatorios." },
      { status: 400 },
    );
  }

  const admin = createAdminClient();
  const { data: staff } = await admin
    .from("staff")
    .select("id, full_name, user_id")
    .eq("id", staffId)
    .eq("user_id", workspaceId)
    .maybeSingle();

  if (!staff) {
    return NextResponse.json(
      { error: "Ese miembro del personal no pertenece al negocio seleccionado." },
      { status: 403 },
    );
  }

  const [emailMembership, staffMembership] = await Promise.all([
    findMembership({ workspace_id: workspaceId, invited_email: email }),
    findMembership({ workspace_id: workspaceId, staff_id: staffId }),
  ]);
  const existingMembership = emailMembership ?? staffMembership;
  if (
    emailMembership &&
    staffMembership &&
    emailMembership.id !== staffMembership.id
  ) {
    return NextResponse.json(
      { error: "El correo y el miembro del personal ya están vinculados a accesos distintos." },
      { status: 409 },
    );
  }

  if (existingMembership?.status === "active") {
    return NextResponse.json(
      { code: MEMBERSHIP_ALREADY_ACTIVE, error: "Ese correo ya tiene acceso activo a este negocio." },
      { status: 409 },
    );
  }
  if (existingMembership?.status === "pending") {
    return NextResponse.json(
      { code: MEMBERSHIP_ALREADY_PENDING, error: "Ese correo ya tiene una invitación pendiente para este negocio." },
      { status: 409 },
    );
  }
  if (existingMembership?.status === "suspended") {
    return NextResponse.json(
      { code: MEMBERSHIP_SUSPENDED, error: "Ese acceso está suspendido. Reactivalo en lugar de crear otra invitación." },
      { status: 409 },
    );
  }

  let existingAuthUserId: string | null;
  try {
    existingAuthUserId = await findAuthUserByEmail(email);
  } catch {
    return NextResponse.json(
      { error: "No se pudo verificar si el correo ya tiene una cuenta." },
      { status: 500 },
    );
  }

  let membershipId = existingMembership?.id ?? null;
  if (membershipId) {
    try {
      const restored = await updateMembership(
        membershipId,
        workspaceId,
        {
          auth_user_id: existingAuthUserId,
          staff_id: staffId,
          invited_email: email,
          role,
          permissions,
          status: "pending",
          provisional_auth_user: false,
          invited_at: new Date().toISOString(),
          accepted_at: null,
          activated_at: null,
          suspended_at: null,
          revoked_at: null,
          updated_at: new Date().toISOString(),
        },
        "revoked",
      );
      if (!restored) throw new Error("La membresía cambió de estado.");
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "No se pudo restaurar la membresía." },
        { status: 500 },
      );
    }
  } else {
    try {
      const membership = await insertMembership({
        workspace_id: workspaceId,
        auth_user_id: existingAuthUserId,
        staff_id: staffId,
        invited_email: email,
        member_kind: "member",
        role,
        permissions,
        status: "pending",
        provisional_auth_user: false,
        accepted_at: null,
        activated_at: null,
        suspended_at: null,
        revoked_at: null,
      });
      membershipId = membership.id;
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "No se pudo crear la membresía." },
        { status: 409 },
      );
    }
  }

  if (!membershipId) {
    return NextResponse.json(
      { error: "No se pudo resolver la membresía pendiente." },
      { status: 500 },
    );
  }

  if (existingAuthUserId) {
    try {
      await sendExistingUserInvitationEmail({
        recipient: email,
        employeeName: staff.full_name,
        businessName: owner.businessName ?? "Ventex",
        role,
        invitationUrl: new URL("/workspace", request.nextUrl.origin).toString(),
      });
    } catch (error) {
      await updateMembership(membershipId, workspaceId, {
        status: "revoked",
        revoked_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }, "pending");
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "No se pudo enviar la invitación." },
        { status: 502 },
      );
    }
    return NextResponse.json({
      membershipId,
      status: "pending",
      delivery: "email",
    });
  }

  const { data: invited, error: inviteError } =
    await admin.auth.admin.inviteUserByEmail(email, {
      redirectTo: invitationRedirect(request, membershipId),
      data: { full_name: staff.full_name },
    });

  if (inviteError || !invited.user) {
    await updateMembership(
      membershipId,
      workspaceId,
      {
        status: "revoked",
        revoked_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      "pending",
    );
    return NextResponse.json(
      { error: invitationError(inviteError?.message ?? "") },
      { status: 409 },
    );
  }

  const provisionalUserId = invited.user.id;
  let linkError: Error | null = null;
  try {
    const linked = await updateMembership(
      membershipId,
      workspaceId,
      {
        auth_user_id: provisionalUserId,
        provisional_auth_user: true,
        updated_at: new Date().toISOString(),
      },
      "pending",
    );
    if (!linked) linkError = new Error("La membresía cambió de estado.");
  } catch (error) {
    linkError = error instanceof Error ? error : new Error("No se pudo vincular la identidad.");
  }

  if (linkError) {
    await updateMembership(membershipId, workspaceId, {
      status: "revoked",
      revoked_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    await deleteUnusedProvisionalIdentity(provisionalUserId);
    return NextResponse.json(
      { error: "La invitación no pudo vincularse con el personal. Intentá de nuevo." },
      { status: 500 },
    );
  }

  return NextResponse.json({
    membershipId,
    status: "pending",
    delivery: "email",
  });
}
