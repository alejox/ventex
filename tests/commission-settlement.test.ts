import test from "node:test";
import assert from "node:assert/strict";
import { settlementSelection, isSettlementChangedError } from "../services/staff.service";
import { toMessage } from "../lib/errors";

/**
 * La liquidación paga LO QUE EL DUEÑO VIO: el modal manda los ids tildados y su
 * suma, y `settle_commissions` rechaza (LIQUIDACION_CAMBIO) si la base suma otra
 * cosa. Estos tests custodian la mitad del cliente de ese contrato.
 */

const items = [
  { id: "a", commissionAmount: 0.1 },
  { id: "b", commissionAmount: 0.2 },
  { id: "c", commissionAmount: 15000 },
];

test("1. Manda solo los ids tildados, en el orden en que se ven", () => {
  const sel = settlementSelection(items, new Set(["c"]));
  assert.deepEqual(sel.itemIds, ["a", "b"]);
  assert.deepEqual(sel.excludedItemIds, ["c"]);
});

test("2. El total va redondeado a centavos (0.1 + 0.2 no es 0.30000000000000004)", () => {
  const sel = settlementSelection(items, new Set(["c"]));
  assert.equal(sel.expectedTotal, 0.3);
});

test("3. Sin nada destildado, el total es la suma de todo lo visible", () => {
  const sel = settlementSelection(items, new Set());
  assert.equal(sel.expectedTotal, 15000.3);
  assert.deepEqual(sel.excludedItemIds, []);
});

test("4. Todo destildado: lista vacía y total cero (la base responde SIN_COMISIONES)", () => {
  const sel = settlementSelection(items, new Set(["a", "b", "c"]));
  assert.deepEqual(sel.itemIds, []);
  assert.equal(sel.expectedTotal, 0);
});

test("5. Un id excluido que ya no está en pantalla no viaja como excluido", () => {
  const sel = settlementSelection(items, new Set(["fantasma"]));
  assert.deepEqual(sel.excludedItemIds, []);
  assert.equal(sel.itemIds.length, 3);
});

test("6. LIQUIDACION_CAMBIO se reconoce para recargar el detalle", () => {
  const err = { code: "P0001", message: "LIQUIDACION_CAMBIO: las comisiones pendientes cambiaron…" };
  assert.equal(isSettlementChangedError(err), true);
  assert.equal(isSettlementChangedError({ code: "P0001", message: "SIN_COMISIONES: no hay…" }), false);
  assert.equal(isSettlementChangedError(null), false);
  assert.equal(isSettlementChangedError("LIQUIDACION_CAMBIO"), false);
});

test("7. toMessage traduce los códigos nuevos a copy en tuteo", () => {
  assert.match(
    toMessage({ code: "P0001", message: "LIQUIDACION_CAMBIO: x" }),
    /cambiaron mientras revisabas.*vuelve a confirmar/,
  );
  assert.match(
    toMessage({ code: "42501", message: "GASTO_DE_RETIRO: x" }),
    /retiro de caja.*Solo puedes editar la descripción y la categoría/,
  );
  assert.match(
    toMessage({ code: "42501", message: "GASTO_VINCULADO: x" }),
    /solo los crea el sistema/,
  );
});
