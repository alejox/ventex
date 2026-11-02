/**
 * Public booking: how the "¿Con quién?" step behaves.
 *
 * `business_sites.booking_allow_any` lets a business hide "Cualquiera
 * disponible". The authoritative rule is in SQL (`public_site_book` rejects a
 * null staff when the option is off and the site shows staff, migration
 * 20261102120000_booking_allow_any.sql); these pure helpers keep the widget in
 * line with it. If one changes, change the other.
 *
 * - `none`: the site shows nobody, so there is nothing to pick (booking works
 *   with a null staff, as before).
 * - `any`: "Cualquiera disponible" is offered and is the default (null).
 * - `required`: only real people; the visitor must pick one.
 */
export type StaffChoiceMode = "none" | "any" | "required";

export function staffChoiceMode(visibleStaffCount: number, allowAny: boolean): StaffChoiceMode {
  if (visibleStaffCount === 0) return "none";
  return allowAny ? "any" : "required";
}

/**
 * Starting selection. "Any" mode starts on "Cualquiera disponible" (null);
 * required mode preselects only when there is exactly one person — with two or
 * more, choosing for the visitor would be guessing.
 */
export function initialStaffId(visibleStaffIds: readonly string[], allowAny: boolean): string | null {
  if (allowAny) return null;
  return visibleStaffIds.length === 1 ? visibleStaffIds[0] : null;
}

/** True while the visitor still has to pick a person before seeing days/hours. */
export function needsStaffChoice(mode: StaffChoiceMode, staffId: string | null): boolean {
  return mode === "required" && staffId === null;
}

/**
 * "Con" row of the booking summary. In required mode it never says
 * "Cualquiera disponible": without a person there is no row (null).
 */
export function staffSummaryLabel(mode: StaffChoiceMode, staffName: string | null): string | null {
  if (staffName) return staffName;
  return mode === "required" ? null : "Cualquiera disponible";
}
