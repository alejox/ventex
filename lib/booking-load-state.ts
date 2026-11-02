/**
 * Load status of a keyed query on the public booking widget.
 *
 * The store remembers which query produced the data it holds (`loadedKey`) and
 * which query failed (`failedKey`). Deriving the status from those keys keeps
 * three cases apart that used to collapse into one empty list:
 * still loading, failed, and answered with nothing.
 */
export type BookingLoadStatus = "idle" | "loading" | "failed" | "empty" | "ready";

export interface BookingLoadInput {
  /** False while there is nothing to ask (e.g. no service picked yet). */
  enabled: boolean;
  wantedKey: string;
  loadedKey: string | null;
  failedKey: string | null;
  /** Items in the stored answer for `loadedKey`. */
  count: number;
}

export function loadStatusOf({
  enabled,
  wantedKey,
  loadedKey,
  failedKey,
  count,
}: BookingLoadInput): BookingLoadStatus {
  if (!enabled) return "idle";
  if (loadedKey !== wantedKey) return "loading";
  if (failedKey === wantedKey) return "failed";
  return count === 0 ? "empty" : "ready";
}
