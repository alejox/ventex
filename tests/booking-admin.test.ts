import test from "node:test";
import assert from "node:assert/strict";
import {
  bookingAdminOptions,
  bookingAdminSettingsInput,
  excludedBookingStaffId,
} from "../lib/booking-admin";
import { mapSettings } from "../services/settings.service";

const staff = [
  { id: "b", full_name: "Bruno", status: "active" },
  { id: "a", full_name: "Ana", status: "active" },
  { id: "x", full_name: "Xavier", status: "inactive" },
];

test("excludedBookingStaffId: no admin selected excludes nobody", () => {
  assert.equal(
    excludedBookingStaffId({ adminStaffId: null, assignAdmin: false, visibleStaffIds: ["a", "b"] }),
    null,
  );
});

test("excludedBookingStaffId: toggle on excludes nobody", () => {
  assert.equal(
    excludedBookingStaffId({ adminStaffId: "a", assignAdmin: true, visibleStaffIds: ["a", "b"] }),
    null,
  );
});

test("excludedBookingStaffId: toggle off excludes the admin while others remain", () => {
  assert.equal(
    excludedBookingStaffId({ adminStaffId: "a", assignAdmin: false, visibleStaffIds: ["a", "b"] }),
    "a",
  );
});

test("excludedBookingStaffId: admin as the only visible staff falls back to no exclusion", () => {
  assert.equal(
    excludedBookingStaffId({ adminStaffId: "a", assignAdmin: false, visibleStaffIds: ["a"] }),
    null,
  );
  assert.equal(
    excludedBookingStaffId({ adminStaffId: "a", assignAdmin: false, visibleStaffIds: [] }),
    null,
  );
});

test("bookingAdminOptions: active staff sorted by name", () => {
  assert.deepEqual(
    bookingAdminOptions(staff, null).map((s) => s.id),
    ["a", "b"],
  );
});

test("bookingAdminOptions: keeps the saved admin even if inactive", () => {
  assert.deepEqual(
    bookingAdminOptions(staff, "x").map((s) => s.id),
    ["a", "b", "x"],
  );
});

test("bookingAdminSettingsInput: no admin forces the toggle off", () => {
  assert.deepEqual(bookingAdminSettingsInput("", true), {
    booking_admin_staff_id: null,
    booking_assign_admin: false,
  });
  assert.deepEqual(bookingAdminSettingsInput("a", true), {
    booking_admin_staff_id: "a",
    booking_assign_admin: true,
  });
});

test("mapSettings: booking admin fields default when the columns are missing", () => {
  const s = mapSettings({ id: "s1" });
  assert.equal(s.booking_admin_staff_id, null);
  assert.equal(s.booking_assign_admin, false);
  const saved = mapSettings({ id: "s1", booking_admin_staff_id: "a", booking_assign_admin: true });
  assert.equal(saved.booking_admin_staff_id, "a");
  assert.equal(saved.booking_assign_admin, true);
});

test("Ajustes → Reservas: solo para negocios que ven el calendario de citas", async () => {
  const { usesAppointments } = await import("../config/business");
  assert.equal(usesAppointments("salon", null), true);
  assert.equal(usesAppointments("lavaautos", null), true);
  assert.equal(usesAppointments("servicios", null), true);
  // Escuela agenda en su propia agenda de clases, no en el calendario de citas.
  assert.equal(usesAppointments("escuela", null), false);
  assert.equal(usesAppointments(null, null), false);
});
