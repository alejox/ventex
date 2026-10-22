import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { requireSelectedWorkspaceOwner } from "@/services/workspace.server";
import { provisionalIdentityIsUnused } from "@/services/workspace-admin.server";
import {
  STAFF_DELETE_CODES,
  staffDeleteDecision,
  staffDeleteErrorMessage,
  type StaffDeleteCode,
} from "@/lib/staff-delete";

/**
 * Borra a una persona del personal cancelando, si la tiene, su invitación de
 * acceso NUNCA aceptada. `workspace_memberships.staff_id` es ON DELETE
 * RESTRICT, así que sin esto una invitación pendiente dejaba la ficha imborrable.
 *
 * Orden: membresía → ficha → identidad provisional. Si algo falla a mitad, lo
 * que queda es una ficha sin invitación (reintentable), nunca una membresía
 * huérfana sin ficha.
 */

function fail(error: StaffDeleteCode, status: number) {
  return NextResponse.json(
    { error, message: staffDeleteErrorMessage({ code: error }) },
    { status },
  );
}

export async function POST(request: NextRequest) {
  const client = await createClient();
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { error: "NO_AUTENTICADO", message: "Inicia sesión para continuar." },
      { status: 401 },
    );
  }

  const owner = await requireSelectedWorkspaceOwner();
  if (!owner) {
    return fail(STAFF_DELETE_CODES.notOwner, 403);
  }
  const { workspaceId } = owner;

  const body = await request.json().catch(() => null);
  const staffId = String(body?.staffId ?? "").trim();
  if (!staffId) {
    return NextResponse.json(
      { error: "DATOS_INVALIDOS", message: "Falta la persona a eliminar." },
      { status: 400 },
    );
  }

  const admin = createAdminClient();
  const { data: staff, error: staffError } = await admin
    .from("staff")
    .select("id, user_id")
    .eq("id", staffId)
    .eq("user_id", workspaceId)
    .maybeSingle();
  if (staffError) {
    console.error("[delete-staff] staff lookup failed", staffError);
    return NextResponse.json(
      { error: "ERROR_INTERNO", message: "No se pudo verificar a la persona." },
      { status: 500 },
    );
  }
  if (!staff) {
    return fail(STAFF_DELETE_CODES.notFound, 404);
  }

  const [memberships, settlements, teacher] = await Promise.all([
    admin
      .from("workspace_memberships")
      .select("id, status, accepted_at, provisional_auth_user, auth_user_id")
      .eq("staff_id", staffId),
    admin
      .from("commission_settlements")
      .select("id", { count: "exact", head: true })
      .eq("staff_id", staffId),
    admin
      .from("school_teacher_profiles")
      .select("staff_id", { count: "exact", head: true })
      .eq("staff_id", staffId),
  ]);
  const lookupError = memberships.error ?? settlements.error ?? teacher.error;
  if (lookupError) {
    console.error("[delete-staff] dependency lookup failed", lookupError);
    return NextResponse.json(
      { error: "ERROR_INTERNO", message: "No se pudo verificar el historial de la persona." },
      { status: 500 },
    );
  }

  const membershipRows = memberships.data ?? [];
  const membershipIds = membershipRows.map((m) => m.id);
  let shiftsCount = 0;
  if (membershipIds.length) {
    const shifts = await admin
      .from("shifts")
      .select("id", { count: "exact", head: true })
      .in("membership_id", membershipIds);
    if (shifts.error) {
      console.error("[delete-staff] shifts lookup failed", shifts.error);
      return NextResponse.json(
        { error: "ERROR_INTERNO", message: "No se pudieron verificar los turnos de la persona." },
        { status: 500 },
      );
    }
    shiftsCount = shifts.count ?? 0;
  }

  const decision = staffDeleteDecision({
    memberships: membershipRows,
    shiftsCount,
    settlementsCount: settlements.count ?? 0,
    hasTeacherProfile: (teacher.count ?? 0) > 0,
  });
  if (typeof decision === "object") {
    return fail(decision.blocked, 409);
  }

  if (decision === "cancel-invitation-and-delete") {
    // El filtro repite la condición: si la invitación se aceptó entre la
    // lectura y este punto, no se borra nada.
    const { data: removed, error: removeError } = await admin
      .from("workspace_memberships")
      .delete()
      .in("id", membershipIds)
      .eq("workspace_id", workspaceId)
      .eq("status", "pending")
      .is("accepted_at", null)
      .select("id");
    if (removeError) {
      console.error("[delete-staff] membership delete failed", removeError);
      // Una FK aquí es un turno abierto en el medio (`shifts.membership_id`).
      if (removeError.code === "23503") return fail(STAFF_DELETE_CODES.hasShifts, 409);
      return NextResponse.json(
        { error: "ERROR_INTERNO", message: "No se pudo cancelar la invitación. Intenta de nuevo." },
        { status: 500 },
      );
    }
    if ((removed ?? []).length !== membershipIds.length) {
      return fail(STAFF_DELETE_CODES.accountAccepted, 409);
    }
  }

  const { error: deleteError } = await admin
    .from("staff")
    .delete()
    .eq("id", staffId)
    .eq("user_id", workspaceId);
  if (deleteError) {
    console.error("[delete-staff] staff delete failed after cancelling invitation", {
      staffId,
      cancelledMemberships: decision === "cancel-invitation-and-delete" ? membershipIds : [],
      error: deleteError,
    });
    if (decision === "delete-staff-only") {
      return NextResponse.json(
        { error: deleteError.code ?? "ERROR_INTERNO", message: deleteError.message },
        { status: deleteError.code === "23503" ? 409 : 500 },
      );
    }
    return fail(STAFF_DELETE_CODES.incomplete, 500);
  }

  // Identidades provisionales: solo las que creó la invitación y que ya no
  // usa ninguna otra membresía ni negocio. Su `profiles` cae por CASCADE.
  const leftovers: string[] = [];
  if (decision === "cancel-invitation-and-delete") {
    const provisional = membershipRows
      .filter((m) => m.provisional_auth_user && m.auth_user_id)
      .map((m) => m.auth_user_id as string);
    for (const authUserId of new Set(provisional)) {
      try {
        if (!(await provisionalIdentityIsUnused(authUserId))) continue;
        const { error } = await admin.auth.admin.deleteUser(authUserId);
        if (error) throw error;
      } catch (error) {
        console.error("[delete-staff] provisional auth user cleanup failed", {
          staffId,
          authUserId,
          error,
        });
        leftovers.push(authUserId);
      }
    }
  }

  return NextResponse.json(
    leftovers.length
      ? {
          ok: true,
          warning:
            "La persona se eliminó, pero no se pudo borrar su cuenta provisional de acceso.",
        }
      : { ok: true },
  );
}
