import assert from "node:assert/strict";
import test from "node:test";
import { notificationDestination, type AppNotification } from "../services/notifications.service";

const notification = (overrides: Partial<AppNotification> = {}): AppNotification => ({
  id: "alert-1", type: "appointment", severity: "info", title: "Nueva reserva pendiente",
  body: null, data: { appointment_id: "reserve-1" }, read_at: null, created_at: "2026-10-04T12:00:00Z", ...overrides,
});

test("booking notifications open their specific appointment even after being read", () => {
  assert.equal(notificationDestination(notification()), "/dashboard/calendar?appointment=reserve-1");
  assert.equal(notificationDestination(notification({ read_at: "2026-10-04T13:00:00Z" })), "/dashboard/calendar?appointment=reserve-1");
});

test("other alerts and bookings without an ID do not invent a destination", () => {
  assert.equal(notificationDestination(notification({ type: "cash_withdrawal" })), null);
  for (const data of [{}, { appointment_id: 12 }, { appointment_id: " " }]) {
    assert.equal(notificationDestination(notification({ data })), null);
  }
});

test("appointment IDs cannot append unrelated query parameters", () => {
  const destination = notificationDestination(notification({ data: { appointment_id: "id&extra=1" } }));
  assert.equal(new URL(destination!, "https://ventex.app").searchParams.get("appointment"), "id&extra=1");
});
