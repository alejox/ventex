import assert from "node:assert/strict";
import test from "node:test";
import {
  MIN_DURATION_MINUTES,
  checkReschedule,
  columnAt,
  dragSpan,
  pixelsToMinutes,
  snapMinutes,
  swipeDirection,
} from "../lib/appointment-drag";
import { toMinutes } from "../lib/calendar-layout";

const span = (from: string, to: string) => ({ start: toMinutes(from), end: toMinutes(to) });

test("los píxeles pasan a minutos con el alto de la hora", () => {
  assert.equal(pixelsToMinutes(64, 64), 60);
  assert.equal(pixelsToMinutes(16, 64), 15);
});

test("el arrastre cae cada 15 minutos", () => {
  assert.equal(snapMinutes(7), 0);
  assert.equal(snapMinutes(8), 15);
  assert.equal(snapMinutes(-8), -15);
  assert.ok(!Object.is(snapMinutes(-3), -0));
});

test("mover conserva la duración y salta relativo a la hora original", () => {
  assert.deepEqual(dragSpan(span("09:00", "10:30"), 62, "move"), span("10:00", "11:30"));
  // Una cita de 9:10 no se redondea sola a 9:15: se corre de a 15 desde 9:10.
  assert.deepEqual(dragSpan(span("09:10", "09:40"), 14, "move"), span("09:25", "09:55"));
});

test("mover no saca la cita de la ventana visible", () => {
  const bounds = span("07:00", "21:00");
  assert.deepEqual(dragSpan(span("08:00", "09:00"), -180, "move", bounds), span("07:00", "08:00"));
  assert.deepEqual(dragSpan(span("19:00", "20:00"), 180, "move", bounds), span("20:00", "21:00"));
});

test("estirar cambia solo el fin y nunca deja menos de 15 minutos", () => {
  assert.deepEqual(dragSpan(span("09:00", "10:00"), 30, "resize"), span("09:00", "10:30"));
  assert.deepEqual(dragSpan(span("09:00", "10:00"), -120, "resize"), { start: toMinutes("09:00"), end: toMinutes("09:00") + MIN_DURATION_MINUTES });
  assert.deepEqual(dragSpan(span("20:00", "20:30"), 120, "resize", span("07:00", "21:00")), span("20:00", "21:00"));
});

test("columnAt elige el día bajo el puntero y no se sale de la semana", () => {
  assert.equal(columnAt(150, 100, 700, 7), 0);
  assert.equal(columnAt(450, 100, 700, 7), 3);
  assert.equal(columnAt(5000, 100, 700, 7), 6);
  assert.equal(columnAt(-20, 100, 700, 7), 0);
  assert.equal(columnAt(450, 100, 700, 1), 0);
});

test("soltar sobre otra cita de la misma persona choca (la misma regla del formulario)", () => {
  const busy = [
    { id: "a", staff_id: "ana", start_time: "10:00:00", end_time: "11:00:00" },
    { id: "b", staff_id: "luis", start_time: "09:00:00", end_time: "12:00:00" },
  ];
  const moving = { id: "m", staff_id: "ana" };
  const clash = checkReschedule(busy, moving, "10:30", "11:30");
  assert.equal(clash.ok, false);
  if (!clash.ok) assert.equal(clash.conflict.id, "a");
  assert.equal(checkReschedule(busy, moving, "11:00", "12:00").ok, true);
  // La propia cita no choca consigo misma.
  assert.equal(checkReschedule(busy, { id: "a", staff_id: "ana" }, "10:15", "11:15").ok, true);
  // Sin persona asignada no choca con nadie.
  assert.equal(checkReschedule(busy, { id: "x", staff_id: null }, "10:00", "11:00").ok, true);
});

test("swipe: horizontal y largo cambia de día; vertical o corto no", () => {
  assert.equal(swipeDirection(-120, 10), "next");
  assert.equal(swipeDirection(120, -20), "prev");
  assert.equal(swipeDirection(-40, 0), null);
  assert.equal(swipeDirection(-100, 90), null);
});
