export type TimeFormat = "12" | "24";

/** Presentation only: persisted appointment times remain HH:mm. */
export function formatAppointmentTime(time: string, format: TimeFormat = "12"): string {
  const [hour, minute] = time.split(":").map(Number);
  if (!Number.isInteger(hour) || hour < 0 || hour > 23 || !Number.isInteger(minute) || minute < 0 || minute > 59) return time;
  const minutes = String(minute).padStart(2, "0");
  return format === "24"
    ? `${String(hour).padStart(2, "0")}:${minutes}`
    : `${hour % 12 || 12}:${minutes} ${hour < 12 ? "AM" : "PM"}`;
}
