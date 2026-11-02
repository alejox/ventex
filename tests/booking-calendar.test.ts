import assert from "node:assert/strict";
import test from "node:test";
import {
  buildIcs,
  escapeIcsText,
  eventTimes,
  foldIcsLine,
  googleCalendarUrl,
  type BookingEvent,
} from "../lib/booking-calendar";

const base: BookingEvent = {
  uid: "abc-123",
  title: "Corte clásico en Barbería El Parche",
  date: "2026-11-20",
  time: "15:30",
  durationMinutes: 45,
  timeZone: "America/Bogota",
  location: "Cra. 7 # 12-34, Bogotá",
  description: "Reserva pendiente de confirmación.",
};

test("with the business time zone, start and end are UTC instants", () => {
  // Bogotá es UTC−5: 15:30 local = 20:30Z; 45 min después = 21:15Z.
  assert.deepEqual(eventTimes(base), {
    start: "20261120T203000Z",
    end: "20261120T211500Z",
    floating: false,
  });
});

test("without a usable time zone the times are floating (no Z)", () => {
  assert.deepEqual(eventTimes({ ...base, timeZone: null }), {
    start: "20261120T153000",
    end: "20261120T161500",
    floating: true,
  });
  assert.equal(eventTimes({ ...base, timeZone: "Marte/Olympus" }).floating, true);
});

test("an appointment that crosses midnight ends the next day", () => {
  const t = eventTimes({ ...base, time: "23:30", durationMinutes: 60, timeZone: null });
  assert.equal(t.end, "20261121T003000");
});

test("ICS text escapes backslash, semicolon, comma and newlines", () => {
  assert.equal(escapeIcsText("a\\b;c,d\ne\r\nf"), "a\\\\b\;c\\,d\\ne\\nf");
});

test("long lines fold at 75 octets with CRLF + space, counting UTF-8 bytes", () => {
  const line = `SUMMARY:${"ñ".repeat(60)}`;
  const folded = foldIcsLine(line);
  const parts = folded.split("\r\n");
  assert.ok(parts.length > 1);
  for (const [i, part] of parts.entries()) {
    assert.ok(Buffer.byteLength(part, "utf8") <= 75, `line ${i} too long`);
    if (i > 0) assert.equal(part[0], " ");
  }
  assert.equal(parts.map((p, i) => (i === 0 ? p : p.slice(1))).join(""), line);
});

test("the .ics is a CRLF VCALENDAR with the escaped event", () => {
  const ics = buildIcs(base, new Date(Date.UTC(2026, 10, 1, 12, 0, 0)));
  assert.ok(ics.startsWith("BEGIN:VCALENDAR\r\n"));
  assert.ok(ics.endsWith("END:VCALENDAR\r\n"));
  assert.ok(!/[^\r]\n/.test(ics), "every newline is CRLF");
  const lines = ics.split("\r\n");
  assert.ok(lines.includes("UID:abc-123@ventex"));
  assert.ok(lines.includes("DTSTAMP:20261101T120000Z"));
  assert.ok(lines.includes("DTSTART:20261120T203000Z"));
  assert.ok(lines.includes("DTEND:20261120T211500Z"));
  assert.ok(lines.includes("SUMMARY:Corte clásico en Barbería El Parche"));
  assert.ok(lines.includes("LOCATION:Cra. 7 # 12-34\\, Bogotá"));
  assert.ok(lines.includes("DESCRIPTION:Reserva pendiente de confirmación."));
});

test("the .ics omits empty location and description", () => {
  const ics = buildIcs({ ...base, location: null, description: "  " }, new Date(0));
  assert.ok(!ics.includes("LOCATION:"));
  assert.ok(!ics.includes("DESCRIPTION:"));
});

test("the Google Calendar link carries title, dates, details and location", () => {
  const url = new URL(googleCalendarUrl(base));
  assert.equal(url.origin + url.pathname, "https://calendar.google.com/calendar/render");
  assert.equal(url.searchParams.get("action"), "TEMPLATE");
  assert.equal(url.searchParams.get("text"), base.title);
  assert.equal(url.searchParams.get("dates"), "20261120T203000Z/20261120T211500Z");
  assert.equal(url.searchParams.get("details"), base.description);
  assert.equal(url.searchParams.get("location"), base.location);
});

test("a floating Google link leaves out the empty fields", () => {
  const url = new URL(googleCalendarUrl({ ...base, timeZone: null, location: null, description: null }));
  assert.equal(url.searchParams.get("dates"), "20261120T153000/20261120T161500");
  assert.equal(url.searchParams.has("location"), false);
  assert.equal(url.searchParams.has("details"), false);
});
