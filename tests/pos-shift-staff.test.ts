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

test("Sin turno ni ficha de cajero se preselecciona la única persona; varias requieren elección", () => {
  useShiftsStore.setState({ currentShift: null });
  usePosStore.setState({ tabs: [], activeTabId: "", defaultStaffId: null,
    executionContext: { authUserId: "owner", workspaceId: "workspace", membershipId: "membership", staffId: null },
    staff: [{ id: "only", full_name: "Única persona" }],
  });
  usePosStore.getState().addTab();
  usePosStore.getState().syncShiftStaff();
  assert.equal(usePosStore.getState().tabs[0].staffId, "only");
  usePosStore.getState().setStaff("explicit");
  usePosStore.getState().syncShiftStaff();
  assert.equal(usePosStore.getState().tabs[0].staffId, "explicit");
  usePosStore.setState({ staff: [{ id: "only", full_name: "Uno" }, { id: "other", full_name: "Dos" }] });
  usePosStore.getState().syncShiftStaff();
  assert.equal(usePosStore.getState().defaultStaffId, null);
});

test("La cita y su clave de cobro pertenecen a la pestaña y se limpian al vaciar", () => {
  usePosStore.setState({ tabs: [], activeTabId: "", defaultStaffId: null });
  usePosStore.getState().addTab();
  const firstId = usePosStore.getState().activeTabId;
  usePosStore.getState().bindAppointment("appointment", "service");
  usePosStore.getState().addTab();
  assert.equal(usePosStore.getState().tabs.find((t) => t.id === firstId)?.appointmentId, "appointment");
  assert.equal(usePosStore.getState().tabs.find((t) => t.id === firstId)?.checkoutId, "appointment");
  assert.equal(usePosStore.getState().tabs.at(-1)?.appointmentId, null);
  usePosStore.getState().setActiveTab(firstId);
  usePosStore.getState().clearCart();
  assert.equal(usePosStore.getState().tabs[0].appointmentId, null);
  assert.equal(usePosStore.getState().tabs[0].checkoutId, null);
});
