import type { PublicSite } from "@/services/public-site.types";

const WEEKDAY_NUMBER: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

function minutesOf(value: string): number {
  const [hour = 0, minute = 0] = value.split(":").map(Number);
  return hour * 60 + minute;
}

export function BusinessStatus({ site, className = "" }: { site: PublicSite; className?: string }) {
  if (!site.hours.length) return null;

  let parts: Intl.DateTimeFormatPart[];

  try {
    parts = new Intl.DateTimeFormat("en-US", {
      timeZone: site.timezone,
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(new Date());
  } catch {
    return null;
  }

  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? "";
  const weekday = WEEKDAY_NUMBER[part("weekday")];
  const hour = Number(part("hour"));
  const minute = Number(part("minute"));
  const today = site.hours.find((item) => item.weekday === weekday);
  const now = hour * 60 + minute;
  const isOpen = Boolean(
    today?.isOpen && now >= minutesOf(today.opensAt) && now < minutesOf(today.closesAt),
  );

  return (
    <p className={`inline-flex items-center gap-2 text-xs font-semibold ${className}`}>
      <span
        aria-hidden="true"
        className={`h-2 w-2 rounded-full ${isOpen ? "bg-[var(--site-accent)]" : "bg-[var(--site-muted)]"}`}
      />
      {isOpen ? `Abierto ahora · hasta las ${today?.closesAt}` : "Cerrado ahora"}
    </p>
  );
}
