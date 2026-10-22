import test from "node:test";
import assert from "node:assert/strict";
import {
  staffDeleteDecision,
  staffDeleteErrorMessage,
  STAFF_DELETE_CODES,
  type StaffDeleteMembership,
} from "../lib/staff-delete";

const fk = (table: string) => ({
  code: "23503",
  message: `update or delete on table "staff" violates foreign key constraint "${table}_staff_id_fkey" on table "${table}"`,
});

test("eliminar personal con acceso al sistema explica el bloqueo y sugiere inactivo", () => {
  const msg = staffDeleteErrorMessage(fk("workspace_memberships"));
  assert.match(msg, /acceso al sistema/);
  assert.match(msg, /inactiv/i);
});

test("eliminar personal con comisiones pagadas explica el bloqueo", () => {
  assert.match(staffDeleteErrorMessage(fk("commission_settlements")), /comisiones pagadas/);
});

test("eliminar personal con perfil docente explica el bloqueo", () => {
  assert.match(staffDeleteErrorMessage(fk("school_teacher_profiles")), /perfil docente/);
});

test("otra referencia desconocida igual da un mensaje en español con la salida", () => {
  const msg = staffDeleteErrorMessage(fk("otra_tabla"));
  assert.doesNotMatch(msg, /foreign key/);
  assert.match(msg, /inactiv/i);
});

test("un error que no es de referencia pasa por el traductor genérico", () => {
  assert.equal(staffDeleteErrorMessage("Sin conexión"), "Sin conexión");
});

// ---------------------------------------------------------------------------
// Borrar a alguien con invitación nunca aceptada (ruta /api/worker/delete-staff)
// ---------------------------------------------------------------------------

const pending: StaffDeleteMembership = {
  id: "m-1",
  status: "pending",
  accepted_at: null,
  provisional_auth_user: true,
  auth_user_id: "u-1",
};
const clean = { shiftsCount: 0, settlementsCount: 0, hasTeacherProfile: false };

test("sin cuenta de acceso se borra solo la ficha", () => {
  assert.equal(staffDeleteDecision({ memberships: [], ...clean }), "delete-staff-only");
});

test("con invitación pendiente nunca aceptada se cancela la invitación y se borra", () => {
  assert.equal(
    staffDeleteDecision({ memberships: [pending], ...clean }),
    "cancel-invitation-and-delete",
  );
});

test("una invitación pendiente sin identidad provisional también se cancela", () => {
  assert.equal(
    staffDeleteDecision({
      memberships: [{ ...pending, provisional_auth_user: false, auth_user_id: null }],
      ...clean,
    }),
    "cancel-invitation-and-delete",
  );
});

// "revoked" sin aceptar ni activar es una invitación fallida y se cancela (ver
// los tests de invitación revocada más abajo); revocada tras activarse, bloquea.
for (const status of ["active", "suspended"]) {
  test(`una cuenta en estado ${status} bloquea el borrado`, () => {
    assert.deepEqual(
      staffDeleteDecision({ memberships: [{ ...pending, status }], ...clean }),
      { blocked: STAFF_DELETE_CODES.accountAccepted },
    );
  });
}

test("una cuenta pendiente que ya se aceptó alguna vez bloquea el borrado", () => {
  assert.deepEqual(
    staffDeleteDecision({
      memberships: [{ ...pending, accepted_at: "2026-10-01T00:00:00Z" }],
      ...clean,
    }),
    { blocked: STAFF_DELETE_CODES.accountAccepted },
  );
});

test("si alguna de varias membresías ya se aceptó, bloquea", () => {
  assert.deepEqual(
    staffDeleteDecision({
      memberships: [pending, { ...pending, id: "m-2", status: "active" }],
      ...clean,
    }),
    { blocked: STAFF_DELETE_CODES.accountAccepted },
  );
});

test("una invitación pendiente con turnos registrados bloquea", () => {
  assert.deepEqual(
    staffDeleteDecision({ memberships: [pending], ...clean, shiftsCount: 1 }),
    { blocked: STAFF_DELETE_CODES.hasShifts },
  );
});

test("comisiones pagadas bloquean aunque no tenga cuenta", () => {
  assert.deepEqual(
    staffDeleteDecision({ memberships: [], ...clean, settlementsCount: 2 }),
    { blocked: STAFF_DELETE_CODES.hasSettlements },
  );
});

test("un perfil docente bloquea aunque no tenga cuenta", () => {
  assert.deepEqual(
    staffDeleteDecision({ memberships: [pending], ...clean, hasTeacherProfile: true }),
    { blocked: STAFF_DELETE_CODES.hasTeacherProfile },
  );
});

test("las comisiones pagadas se informan antes que la cuenta aceptada", () => {
  assert.deepEqual(
    staffDeleteDecision({
      memberships: [{ ...pending, status: "active" }],
      ...clean,
      settlementsCount: 1,
    }),
    { blocked: STAFF_DELETE_CODES.hasSettlements },
  );
});

const routeError = (code: string) => Object.assign(new Error("crudo"), { code });

test("cuenta aceptada sugiere suspender el acceso y marcar inactiva", () => {
  const msg = staffDeleteErrorMessage(routeError(STAFF_DELETE_CODES.accountAccepted));
  assert.match(msg, /Suspender acceso/);
  assert.match(msg, /inactiv/i);
});

test("turnos registrados explica el bloqueo", () => {
  const msg = staffDeleteErrorMessage(routeError(STAFF_DELETE_CODES.hasShifts));
  assert.match(msg, /turnos/);
  assert.match(msg, /inactiv/i);
});

test("comisiones pagadas y perfil docente desde la ruta usan el mismo texto", () => {
  assert.match(staffDeleteErrorMessage(routeError(STAFF_DELETE_CODES.hasSettlements)), /comisiones pagadas/);
  assert.match(staffDeleteErrorMessage(routeError(STAFF_DELETE_CODES.hasTeacherProfile)), /perfil docente/);
});

test("quien no es el dueño recibe un mensaje claro", () => {
  assert.match(staffDeleteErrorMessage(routeError(STAFF_DELETE_CODES.notOwner)), /dueño/);
});

test("un borrado incompleto lo dice sin texto técnico", () => {
  const msg = staffDeleteErrorMessage(routeError(STAFF_DELETE_CODES.incomplete));
  assert.doesNotMatch(msg, /crudo/);
  assert.match(msg, /invitación/);
});

test("ningún mensaje de la ruta usa voseo", () => {
  for (const code of Object.values(STAFF_DELETE_CODES)) {
    const msg = staffDeleteErrorMessage(routeError(code));
    assert.doesNotMatch(msg, /\b(podés|tenés|usá|marcala|recargá|intentá)\b/i, code);
  }
});

test("una invitación revocada que nunca se aceptó ni se activó se cancela igual que una pendiente", () => {
  // `/api/worker/create` la deja así cuando falla el correo de invitación.
  const failed = { ...pending, status: "revoked", provisional_auth_user: false };
  assert.equal(staffDeleteDecision({ memberships: [failed], ...clean }), "cancel-invitation-and-delete");
});

test("una cuenta revocada que llegó a activarse sigue bloqueada", () => {
  const used = { ...pending, status: "revoked", activated_at: "2026-10-01T00:00:00Z" };
  assert.deepEqual(staffDeleteDecision({ memberships: [used], ...clean }), { blocked: STAFF_DELETE_CODES.accountAccepted });
});

test("una invitación pendiente con activación registrada no se trata como nunca aceptada", () => {
  const odd = { ...pending, activated_at: "2026-10-01T00:00:00Z" };
  assert.deepEqual(staffDeleteDecision({ memberships: [odd], ...clean }), { blocked: STAFF_DELETE_CODES.accountAccepted });
});

test("suspendida nunca se cancela, aunque no tenga fecha de aceptación", () => {
  const suspended = { ...pending, status: "suspended" };
  assert.deepEqual(staffDeleteDecision({ memberships: [suspended], ...clean }), { blocked: STAFF_DELETE_CODES.accountAccepted });
});
