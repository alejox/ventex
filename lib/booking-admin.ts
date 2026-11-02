/**
 * Online booking: whether "any available" bookings may land on the admin's own
 * staff row. Pure helpers; the authoritative rule lives in SQL
 * (`public.site_booking_excluded_staff`, migration
 * 20261101120000_booking_admin_assignment.sql). If one changes, change the other.
 */

export interface BookingExclusionInput {
  /** `settings.booking_admin_staff_id`. */
  adminStaffId: string | null;
  /** `settings.booking_assign_admin`. */
  assignAdmin: boolean;
  /** Active staff rows visible on the public site (catalog-filtered). */
  visibleStaffIds: readonly string[];
}

/**
 * Staff row excluded from auto-assignment and from "any staff" capacity, or
 * null. Falls back to null when the admin is the only visible staff, so a
 * one-person business keeps its online agenda open.
 */
export function excludedBookingStaffId({
  adminStaffId,
  assignAdmin,
  visibleStaffIds,
}: BookingExclusionInput): string | null {
  if (!adminStaffId || assignAdmin) return null;
  const othersVisible = visibleStaffIds.some((id) => id !== adminStaffId);
  return othersVisible ? adminStaffId : null;
}

interface StaffOption {
  id: string;
  full_name: string;
  status: string;
}

/**
 * Staff rows offered in "¿Cuál es tu ficha en el equipo?": active ones sorted by
 * name, plus the saved one even if it is no longer active (so the picker never
 * shows a value that is not in its list).
 */
export function bookingAdminOptions<T extends StaffOption>(staff: readonly T[], savedId: string | null): T[] {
  const active = staff
    .filter((s) => s.status === "active")
    .sort((a, b) => a.full_name.localeCompare(b.full_name, "es"));
  if (savedId && !active.some((s) => s.id === savedId)) {
    const saved = staff.find((s) => s.id === savedId);
    if (saved) active.push(saved);
  }
  return active;
}

export interface BookingAdminSettingsInput {
  booking_admin_staff_id: string | null;
  booking_assign_admin: boolean;
}

/** Normalizes the form state: without a selected row the toggle is meaningless and stays off. */
export function bookingAdminSettingsInput(adminStaffId: string, assignAdmin: boolean): BookingAdminSettingsInput {
  const id = adminStaffId.trim() || null;
  return { booking_admin_staff_id: id, booking_assign_admin: id ? assignAdmin : false };
}
