import test from "node:test";
import assert from "node:assert/strict";
import { usePosStore } from "../stores/pos.store";
import { useShiftsStore } from "../stores/shifts.store";
import type { CurrentShift } from "../services/shifts.service";

const shift: CurrentShift = {
  id: "shift", workspace_id: "workspace", membership_id: "membership",
  opened_at: "2026-10-05", opening_cash: 0, sales_count: 0,
  sales_total: 0, cash_total: 0, withdrawals_total: 0,
  expected_cash: 0, totals_by_method: {},
};

test("El turno asigna al cajero, conserva elecciones explícitas y lo reutiliza en nuevas ventas", () => {
  useShiftsStore.setState({ currentShift: null });
  usePosStore.setState({
    executionContext: { authUserId: "user", workspaceId: "workspace", membershipId: "membership", staffId: "cashier" },
    staff: [{ id: "cashier", full_name: "Cajero" }],
    defaultStaffId: null,
  });
  usePosStore.getState().addTab();
  const firstId = usePosStore.getState().activeTabId;
  useShiftsStore.setState({ currentShift: shift });
  assert.equal(usePosStore.getState().tabs.find(t => t.id === firstId)?.staffId, "cashier");
  usePosStore.getState().setStaff("barber");
  usePosStore.getState().syncShiftStaff();
  assert.equal(usePosStore.getState().tabs.find(t => t.id === firstId)?.staffId, "barber");
  usePosStore.getState().addTab();
  assert.equal(usePosStore.getState().tabs.at(-1)?.staffId, "cashier");
  useShiftsStore.setState({ currentShift: { ...shift, id: "other", membership_id: "other" } });
  assert.equal(usePosStore.getState().defaultStaffId, null);
  useShiftsStore.setState({ currentShift: null });
});
