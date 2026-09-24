import test from "node:test";
import assert from "node:assert/strict";
import {
  attendancePayloadOf,
  classErrorOf,
  closeResultOf,
  consumptionAmountOf,
  consumptionPlanOf,
  linkConfirmGate,
  pendingCloseLessonsOf,
  sessionConfirmGate,
} from "../services/school-classes.service";
import { enrollmentBalanceOf } from "../services/school-enrollments.service";
import type { CloseParticipantRow, PendingCloseCandidate } from "../services/school-classes.service";

// ---- Saldo reconstruido desde el libro mayor (1) ----

test("1. `enrollmentBalanceOf` reconstruye el saldo: 8 asignadas, 3 consumidas, 1 revertida → 6", () => {
  const movements = [
    { amount: 8 }, // assignment de la matrícula
    { amount: -1 }, // consumo clase 1
    { amount: -1 }, // consumo clase 2
    { amount: -1 }, // consumo clase 3
    { amount: 1 }, // revertido (cancel_return / ajuste a favor)
  ];
  assert.equal(enrollmentBalanceOf(movements), 6);
  assert.equal(enrollmentBalanceOf([]), 0, "sin movimientos el saldo es cero, nunca negativo");
});

// ---- Matriz de consumo de la política congelada (2-5) ----

test("2. attended consume; absent consume SOLO si la política congelada lo contempla", () => {
  const base = { attendance_status: "attended", enrollment_status: "active" };
  assert.equal(consumptionAmountOf({ ...base, attendance_status: "attended", policy_consume_on_unjustified_absence: false }), -1);
  assert.equal(consumptionAmountOf({ ...base, attendance_status: "absent", policy_consume_on_unjustified_absence: true }), -1);
  assert.equal(consumptionAmountOf({ ...base, attendance_status: "absent", policy_consume_on_unjustified_absence: false }), 0);
});

test("3. justified nunca consume: el derecho a reponer queda en el saldo", () => {
  assert.equal(
    consumptionAmountOf({
      attendance_status: "justified",
      enrollment_status: "active",
      policy_consume_on_unjustified_absence: true,
    }),
    0
  );
  assert.equal(
    consumptionAmountOf({
      attendance_status: "justified",
      enrollment_status: "active",
      policy_consume_on_unjustified_absence: false,
    }),
    0
  );
});

test("4. Una matrícula no activa no consume, ni siquiera asistiendo", () => {
  assert.equal(
    consumptionAmountOf({
      attendance_status: "attended",
      enrollment_status: "expired",
      policy_consume_on_unjustified_absence: true,
    }),
    0
  );
  assert.equal(
    consumptionAmountOf({
      attendance_status: "absent",
      enrollment_status: "voided",
      policy_consume_on_unjustified_absence: true,
    }),
    0
  );
});

test("5. Editar la política NO es retroactivo: la decisión usa el boolean congelado", () => {
  // La política entra como parámetro CONGELADO de la matrícula; cambiar
  // `school_settings` después no altera contratos ya firmados. La función es
  // pura en ese boolean, y este test fija el contrato.
  const frozenWithAbsence = { attendance_status: "absent", enrollment_status: "active", policy_consume_on_unjustified_absence: true };
  const frozenWithout = { ...frozenWithAbsence, policy_consume_on_unjustified_absence: false };
  assert.equal(consumptionAmountOf(frozenWithout), 0);
  assert.equal(consumptionAmountOf(frozenWithAbsence), -1);
  // La escuela igual de un lado, matrices distintas: el contrato no se reabre.
  assert.notEqual(consumptionAmountOf(frozenWithout), consumptionAmountOf(frozenWithAbsence));
});

// ---- Plan de consumo de un cierre completo (6-7) ----

test("6. El plan de cierre es UNA fila de movimiento por participante que consume", () => {
  const rows: CloseParticipantRow[] = [
    {
      participant_id: "p1", enrollment_id: "e1", student_name: "Ana",
      attendance_status: "attended", enrollment_status: "active",
      policy_consume_on_unjustified_absence: false,
    },
    {
      participant_id: "p2", enrollment_id: "e2", student_name: "Beto",
      attendance_status: "absent", enrollment_status: "active",
      policy_consume_on_unjustified_absence: true,
    },
    {
      participant_id: "p3", enrollment_id: "e3", student_name: "Caro",
      attendance_status: "justified", enrollment_status: "active",
      policy_consume_on_unjustified_absence: true,
    },
  ];
  assert.deepEqual(consumptionPlanOf(rows), [
    { participant_id: "p1", enrollment_id: "e1", amount: -1 },
    { participant_id: "p2", enrollment_id: "e2", amount: -1 },
  ]);
});

test("7. Sin consumidores no hay movimientos: el cierre no inventa créditos", () => {
  const rows: CloseParticipantRow[] = [
    {
      participant_id: "p1", enrollment_id: "e1", student_name: "Ana",
      attendance_status: "absent", enrollment_status: "active",
      policy_consume_on_unjustified_absence: false,
    },
    {
      participant_id: "p2", enrollment_id: "e2", student_name: "Beto",
      attendance_status: "justified", enrollment_status: "active",
      policy_consume_on_unjustified_absence: false,
    },
  ];
  assert.deepEqual(consumptionPlanOf(rows), []);
});

// ---- Cierre: payload y contrato de idempotencia (8-9) ----

test("8. El payload de asistencia lista todos los participantes en el formato del RPC", () => {
  assert.deepEqual(attendancePayloadOf([{ participant_id: "p1", status: "attended" }]), [
    { participant_id: "p1", status: "attended" },
  ]);
  assert.deepEqual(
    attendancePayloadOf([
      { participant_id: "p1", status: "absent", observation: "  Sin avisar  " },
    ]),
    [{ participant_id: "p1", status: "absent", observation: "Sin avisar" }]
  );
  assert.deepEqual(
    attendancePayloadOf([{ participant_id: "p1", status: "attended", observation: "   " }]),
    [{ participant_id: "p1", status: "attended" }],
    "una observación en blanco no viaja"
  );
});

test("9. Contrato de idempotencia del doble cierre: `alreadyClosed` es un éxito sin tocar nada", () => {
  assert.deepEqual(closeResultOf({ alreadyClosed: true, id: "l1" }), {
    id: "l1", status: null, alreadyClosed: true, participants: 0, consumed: 0,
  });
  assert.deepEqual(
    closeResultOf({ id: "l1", status: "realized", participants: 2, consumed: 2 }),
    { id: "l1", status: "realized", alreadyClosed: false, participants: 2, consumed: 2 }
  );
  // La respuesta desconocida NO se confunde con un cierre exitoso.
  assert.equal(closeResultOf({}).alreadyClosed, false);
});

// ---- Clases por cerrar: derivación, nunca transición (10-11) ----

const terminada: PendingCloseCandidate = {
  id: "l1", status: "scheduled", instrument: "Piano",
  start_at: "2026-09-24T14:00:00.000Z", end_at: "2026-09-24T15:00:00.000Z",
  confirmed_at: null,
};

test("10. Por cerrar = programada + sin confirmar + ya terminada", () => {
  const now = "2026-09-24T16:00:00.000Z";
  const porCerrar = pendingCloseLessonsOf(
    [
      terminada,
      { ...terminada, id: "l2", confirmed_at: now }, // confirmada: pendiente de cierre, no "por cerrar"
      { ...terminada, id: "l3", end_at: "2026-09-24T17:00:00.000Z" }, // todavía no terminó
      { ...terminada, id: "l4", status: "realized" }, // ya realizada
      { ...terminada, id: "l5", status: "cancelled" },
    ],
    now
  );
  assert.deepEqual(pendingCloseLessonsOf([terminada], now).map((l) => l.id), ["l1"]);
  assert.deepEqual(porCerrar.map((l) => l.id), ["l1"]);
});

test("11. La derivación nunca auto-transiciona: no cambia estados ni se corre a los confirmados", () => {
  const now = "2026-09-25T10:00:00.000Z";
  const input = [
    terminada,
    { ...terminada, id: "l2", end_at: "2026-09-24T14:00:00.000Z", confirmed_at: now },
  ];
  const output = pendingCloseLessonsOf(input, now);
  for (const lesson of output) {
    assert.equal(lesson.status, "scheduled", "la derivación no muta el estado de la clase");
  }
  assert.deepEqual(output.map((l) => l.id), ["l1"]);
});

// ---- Compuertas de confirmación: sesión vs. enlace (12-15) ----

test("12. Sesión: se confirma una clase programada y ya terminada", () => {
  const now = "2026-09-24T15:30:00.000Z";
  assert.deepEqual(sessionConfirmGate({ status: "scheduled", end_at: "2026-09-24T15:00:00.000Z" }, now), { ok: true });
  const noTermino = sessionConfirmGate({ status: "scheduled", end_at: "2026-09-24T16:00:00.000Z" }, now);
  assert.equal(noTermino.ok, false);
  assert.match(noTermino.reason ?? "", /no terminó/);
  const noProgramada = sessionConfirmGate({ status: "pending_close", end_at: "2026-09-24T15:00:00.000Z" }, now);
  assert.equal(noProgramada.ok, false);
});

test("13. Enlace: propósito, ciclo de vida y vencimiento se validan antes de confirmar", () => {
  const now = "2026-09-24T15:30:00.000Z";
  const lesson = { version: 3, status: "scheduled", end_at: "2026-09-24T15:00:00.000Z" };
  const vivo = {
    purpose: "teacher_confirm", revoked_at: null, used_at: null,
    expires_at: "2026-10-01T00:00:00.000Z", version: 3,
  };
  assert.equal(linkConfirmGate(vivo, lesson, now).ok, true);
  assert.equal(
    linkConfirmGate({ ...vivo, purpose: "family_read" }, lesson, now).ok,
    false,
    "un enlace de lectura familiar no confirma"
  );
  assert.equal(linkConfirmGate({ ...vivo, revoked_at: now }, lesson, now).ok, false);
  assert.equal(linkConfirmGate({ ...vivo, used_at: now }, lesson, now).ok, false);
  assert.equal(
    linkConfirmGate({ ...vivo, expires_at: "2026-09-24T10:00:00.000Z" }, lesson, now).ok,
    false,
    "vencido falla cerrado"
  );
});

test("14. Enlace: una clase reprogramada invalida los enlaces viejos por VERSIÓN", () => {
  const now = "2026-09-24T15:30:00.000Z";
  const viejo = {
    purpose: "teacher_confirm", revoked_at: null, used_at: null,
    expires_at: "2026-10-01T00:00:00.000Z", version: 2,
  };
  const claseActualizada = { version: 3, status: "scheduled", end_at: "2026-09-24T15:00:00.000Z" };
  const gate = linkConfirmGate(viejo, claseActualizada, now);
  assert.equal(gate.ok, false, "la aprobación de la reprogramación sube la versión; el enlace viejo muere");
  assert.match(gate.reason ?? "", /cambió|nuevo/);
});

test("15. `classErrorOf` despelleja tags y deja pasar el español de la base", () => {
  assert.equal(
    classErrorOf(new Error("SIN_ESTADO: la clase debe estar confirmada (estado actual: scheduled)")),
    "La clase debe estar confirmada (estado actual: scheduled)."
  );
  assert.equal(classErrorOf(new Error("SIN_HORARIO: el profesor ya tiene una clase en ese horario")), "El profesor ya tiene una clase en ese horario.");
  assert.equal(classErrorOf(new Error("El motivo de la cancelación es obligatorio")), "El motivo de la cancelación es obligatorio");
  assert.equal(classErrorOf(new Error("LINK_INVALIDO: el enlace fue revocado o ya se usó")), "El enlace fue revocado o ya se usó.");
});