import test from "node:test";
import assert from "node:assert/strict";
import {
  clearOwnerShiftSkip,
  isOwnerShiftSkipped,
  localDayKey,
  markOwnerShiftSkipped,
  ownerShiftSkipKey,
  shouldPromptOwnerShift,
  usesShifts,
  type SkipStorage,
} from "../lib/owner-shift-prompt";

function memoryStorage(): SkipStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
}

const throwing: SkipStorage = {
  getItem: () => {
    throw new Error("SecurityError");
  },
  setItem: () => {
    throw new Error("QuotaExceededError");
  },
  removeItem: () => {
    throw new Error("SecurityError");
  },
};

test("localDayKey usa la fecha LOCAL con ceros a la izquierda", () => {
  assert.equal(localDayKey(new Date(2026, 0, 5, 23, 59)), "2026-01-05");
  assert.equal(localDayKey(new Date(2026, 9, 14, 0, 1)), "2026-10-14");
});

test("la clave separa negocio y membresía", () => {
  assert.notEqual(ownerShiftSkipKey("ws1", "m1"), ownerShiftSkipKey("ws2", "m1"));
  assert.notEqual(ownerShiftSkipKey("ws1", "m1"), ownerShiftSkipKey("ws1", "m2"));
  assert.equal(ownerShiftSkipKey("ws1", null), ownerShiftSkipKey("ws1", null));
});

test("saltar vale el resto del mismo día y vence al siguiente", () => {
  const storage = memoryStorage();
  const key = ownerShiftSkipKey("ws1", "m1");
  const morning = new Date(2026, 9, 14, 8, 0);
  const night = new Date(2026, 9, 14, 23, 30);
  const tomorrow = new Date(2026, 9, 15, 6, 0);

  assert.equal(isOwnerShiftSkipped(storage, key, morning), false);
  assert.equal(markOwnerShiftSkipped(storage, key, morning), true);
  assert.equal(isOwnerShiftSkipped(storage, key, night), true);
  assert.equal(isOwnerShiftSkipped(storage, key, tomorrow), false);
});

test("abrir caja limpia el salto: después de cerrar se vuelve a preguntar", () => {
  const storage = memoryStorage();
  const key = ownerShiftSkipKey("ws1", "m1");
  const now = new Date(2026, 9, 14, 10, 0);
  markOwnerShiftSkipped(storage, key, now);
  clearOwnerShiftSkip(storage, key);
  assert.equal(isOwnerShiftSkipped(storage, key, now), false);
});

test("sin storage (null o que lanza) no hay salto guardado y nada revienta", () => {
  const key = ownerShiftSkipKey("ws1", "m1");
  const now = new Date(2026, 9, 14, 10, 0);
  assert.equal(isOwnerShiftSkipped(null, key, now), false);
  assert.equal(isOwnerShiftSkipped(throwing, key, now), false);
  assert.equal(markOwnerShiftSkipped(null, key, now), false);
  assert.equal(markOwnerShiftSkipped(throwing, key, now), false);
  assert.doesNotThrow(() => clearOwnerShiftSkip(throwing, key));
});

test("usesShifts: el trabajador siempre; dueño/admin solo con el ajuste", () => {
  assert.equal(usesShifts({ isWorker: true, ownerUsesShifts: false }), true);
  assert.equal(usesShifts({ isWorker: false, ownerUsesShifts: false }), false);
  assert.equal(usesShifts({ isWorker: false, ownerUsesShifts: true }), true);
});

test("shouldPromptOwnerShift solo para dueño/admin con ajuste, turno resuelto, sin caja ni salto", () => {
  const base = {
    isWorker: false,
    ownerUsesShifts: true,
    shiftResolved: true,
    hasShift: false,
    skippedToday: false,
    otherShiftModalOpen: false,
  };
  assert.equal(shouldPromptOwnerShift(base), true);
  assert.equal(shouldPromptOwnerShift({ ...base, isWorker: true }), false);
  assert.equal(shouldPromptOwnerShift({ ...base, ownerUsesShifts: false }), false);
  // Sin respuesta del turno todavía: nada de parpadeo.
  assert.equal(shouldPromptOwnerShift({ ...base, shiftResolved: false }), false);
  // Con caja abierta (aunque sea de ayer) no se pregunta.
  assert.equal(shouldPromptOwnerShift({ ...base, hasShift: true }), false);
  assert.equal(shouldPromptOwnerShift({ ...base, skippedToday: true }), false);
  assert.equal(shouldPromptOwnerShift({ ...base, otherShiftModalOpen: true }), false);
});
