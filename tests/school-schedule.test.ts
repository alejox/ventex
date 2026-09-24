import test from "node:test";
import assert from "node:assert/strict";
import {
  addDays,
  daysBetween,
  enrollmentScheduleView,
  fitsCapacity,
  fmtSessionDate,
  freeWindowsForDay,
  hasOverlap,
  hoursToMinutes,
  isoWeekdayOf,
  minutesToTime,
  mondayOf,
  overlappingOf,
  planSeries,
  scheduleErrorOf,
  seriesSessionCount,
  tsAtUtc,
} from "../services/school-schedule.service";
import type { OccupiedSlot, WeeklyAvailabilityRow } from "../services/school-schedule.service";

const slot = (start: string, end: string): OccupiedSlot => ({ start_at: start, end_at: end });

const lunes = "2026-09-28"; // 1 (es lunes)
const martes = "2026-09-29"; // 2
const dia14 = "2026-10-12"; // lunes 14 de octubre (i = 2 de la serie)

// ---- Aritmética de fechas y horas (1-4) ----

test("1. La aritmética de fechas es de calendario UTC, sin DST", () => {
  assert.equal(isoWeekdayOf("2026-09-28"), 1, "2026-09-28 es lunes");
  assert.equal(isoWeekdayOf("2026-09-27"), 7, "2026-09-27 es domingo");
  assert.equal(addDays("2026-09-28", 7), "2026-10-05");
  assert.equal(addDays("2026-12-30", 5), "2027-01-04", "cruza de año sin zona horaria");
  assert.equal(daysBetween("2026-09-28", "2026-10-12"), 14);
  assert.equal(mondayOf("2026-10-01"), "2026-09-28", "el lunes de esa semana");
  assert.equal(mondayOf("2026-09-28"), "2026-09-28", "un lunes es su propio lunes");
});

test("2. `tsAtUtc` arma el instante UTC que la base espera", () => {
  assert.equal(tsAtUtc("2026-09-28", "09:00"), "2026-09-28T09:00:00.000Z");
  assert.equal(tsAtUtc("2026-09-28", "23:30"), "2026-09-28T23:30:00.000Z");
  assert.equal(tsAtUtc("2026-12-31", "18:00"), "2026-12-31T18:00:00.000Z");
});

test("3. `hoursToMinutes`/`minutesToTime` son inversas", () => {
  assert.equal(hoursToMinutes("14:30"), 870);
  assert.equal(minutesToTime(870), "14:30");
  assert.equal(minutesToTime(0), "00:00");
  assert.equal(minutesToTime(1439), "23:59");
});

test("4. Un instante compara por tiempo real, no por texto", () => {
  // "Z" y "+00:00" representan lo mismo pero ordenan distinto como string.
  assert.equal(hasOverlap("2026-09-28T09:00:00Z", "2026-09-28T10:00:00Z", "2026-09-28T09:30:00+00:00", "2026-09-28T10:30:00+00:00"), true);
  assert.equal(hasOverlap("2026-09-28T09:00:00Z", "2026-09-28T10:00:00Z", "2026-09-28T10:00:00Z", "2026-09-28T11:00:00Z"), false, "adyacentes no chocan");
});

// ---- Conflictos de horario (5-9): los tres recursos del mismo predicado ----

test("5. Profesor doble-turnado: la segunda clase choca y se reporta", () => {
  const turno = [{ start_at: tsAtUtc(lunes, "15:00"), end_at: tsAtUtc(lunes, "16:00") }];
  const choque = overlappingOf(turno, tsAtUtc(lunes, "15:30"), tsAtUtc(lunes, "16:30"));
  assert.ok(choque, "15:30–16:30 contra 15:00–16:00 superpuesta");
  assert.equal(choque?.start_at, tsAtUtc(lunes, "15:00"));
  // El horario que termina justo donde empieza el otro NO choca.
  assert.equal(overlappingOf(turno, tsAtUtc(lunes, "16:00"), tsAtUtc(lunes, "17:00")), null);
});

test("6. Crossover de alumno: dos matrículas del mismo estudiante no se pisan", () => {
  const clasesDelAlumno = [
    slot(tsAtUtc(martes, "09:00"), tsAtUtc(martes, "10:00")),
    slot(tsAtUtc(martes, "11:00"), tsAtUtc(martes, "12:00")),
  ];
  assert.ok(
    overlappingOf(clasesDelAlumno, tsAtUtc(martes, "09:30"), tsAtUtc(martes, "10:30")),
    "la clase de piano contra la de canto"
  );
  assert.equal(
    overlappingOf(clasesDelAlumno, tsAtUtc(martes, "10:00"), tsAtUtc(martes, "11:00")),
    null,
    "hueco de 10:00 a 11:00 libre"
  );
});

test("7. Ocupación del salón: dos clases no comparten sala a la vez", () => {
  const sala = [slot(tsAtUtc(lunes, "18:00"), tsAtUtc(lunes, "19:00"))];
  assert.ok(overlappingOf(sala, tsAtUtc(lunes, "18:15"), tsAtUtc(lunes, "19:15")));
  assert.equal(overlappingOf(sala, tsAtUtc(lunes, "19:00"), tsAtUtc(lunes, "20:00")), null);
});

test("8. Cupo individual (1) rechaza al segundo participante; el grupal admite hasta llenarse", () => {
  assert.equal(fitsCapacity(0, 1), true);
  assert.equal(fitsCapacity(1, 1), false, "clase individual: el cupo es 1, ya está ocupado");
  assert.equal(fitsCapacity(2, 3), true);
  assert.equal(fitsCapacity(3, 3), false, "clase grupal llena");
});

test("9. Un hueco de 10:00 a 11:00 entre clases del alumno sigue libre para el profesor", () => {
  // El predicado es el mismo para los tres recursos; el hueco exacto no choca
  // ni con la clase anterior ni con la siguiente.
  const clases = [
    slot("2026-09-29T09:00:00Z", "2026-09-29T10:00:00Z"),
    slot("2026-09-29T11:00:00Z", "2026-09-29T12:00:00Z"),
  ];
  const ventana = freeWindowsForDay({
    date: martes,
    weekly: [{ id: "w1", teacher_profile_id: "t1", weekday: 2, start_time: "09:00", end_time: "12:00" }],
    blockedDates: [],
    occupied: clases,
    durationMinutes: 60,
  });
  assert.deepEqual(
    ventana.map((w) => w.start_at),
    ["2026-09-29T10:00:00.000Z"],
    "solo la ventana de 10:00 queda libre"
  );
});

// ---- Ventanas libres (10-11) ----

test("10. La grilla recorre la franja semanal en pasos fijos sin salirse", () => {
  const weekly: WeeklyAvailabilityRow[] = [
    { id: "w1", teacher_profile_id: "t1", weekday: 1, start_time: "09:00", end_time: "11:00" },
  ];
  const ventanas = freeWindowsForDay({
    date: lunes,
    weekly,
    blockedDates: [],
    occupied: [],
    durationMinutes: 60,
  });
  assert.deepEqual(
    ventanas.map((w) => w.start_at),
    ["2026-09-28T09:00:00.000Z", "2026-09-28T09:30:00.000Z", "2026-09-28T10:00:00.000Z"],
    "09:00, 09:30 y 10:00; 10:30 se sale del rango"
  );
  assert.equal(ventanas[0]?.end_at, "2026-09-28T10:00:00.000Z");
});

test("11. Un día bloqueado no ofrece ninguna ventana", () => {
  const weekly: WeeklyAvailabilityRow[] = [
    { id: "w1", teacher_profile_id: "t1", weekday: 1, start_time: "09:00", end_time: "11:00" },
  ];
  const ventanas = freeWindowsForDay({
    date: lunes,
    weekly,
    blockedDates: [lunes],
    occupied: [],
    durationMinutes: 60,
  });
  assert.deepEqual(ventanas, []);
});

// ---- Series (12-16) ----

test("12. Una serie por cantidad materializa EXACTAMENTE N sesiones, una por semana", () => {
  const plan = planSeries({
    firstDate: lunes,
    weekday: 1,
    startTime: "09:00",
    endTime: "10:00",
    count: 8,
    blockedDates: [],
    teacherSlots: [],
    studentSlots: [],
    roomSlots: [],
  });
  assert.equal(plan.sessions.length, 8, "8 clases, ni una más");
  assert.deepEqual(plan.conflicts, []);
  assert.deepEqual(plan.skipped, []);
  assert.equal(isWeekly(plan.sessions), true, "todas las sesiones caen en lunes, separadas 7 días");
  assert.equal(plan.sessions[0]?.start_at, "2026-09-28T09:00:00.000Z");
  assert.equal(plan.sessions[7]?.start_at, "2026-11-16T09:00:00.000Z", "última sesión = inicial + 49 días");
});

test("13. Una serie por fecha límite da el mismo conteo, inclusive", () => {
  const byUntil = planSeries({
    firstDate: lunes,
    weekday: 1,
    startTime: "09:00",
    endTime: "10:00",
    untilDate: "2026-11-16",
    blockedDates: [],
    teacherSlots: [],
    studentSlots: [],
    roomSlots: [],
  });
  assert.equal(seriesSessionCount("2026-09-28", "2026-11-16"), 8);
  assert.equal(byUntil.sessions.length, 8, "la fecha límite cuenta la semana que termina ese día");
  // La fecha límite fuera de día de semana se trunca hacia el lunes anterior.
  const truncado = planSeries({
    firstDate: lunes,
    weekday: 1,
    startTime: "09:00",
    endTime: "10:00",
    untilDate: "2026-11-18", // miércoles
    blockedDates: [],
    teacherSlots: [],
    studentSlots: [],
    roomSlots: [],
  });
  assert.equal(truncado.sessions.length, 8, "el miércoles 18 no agrega una clase");
});

test("14. Una fecha bloqueada se SALtea y se REPORTA, no se cuela en silencio", () => {
  const plan = planSeries({
    firstDate: lunes,
    weekday: 1,
    startTime: "09:00",
    endTime: "10:00",
    count: 8,
    blockedDates: [dia14], // el tercer lunes de la serie
    teacherSlots: [],
    studentSlots: [],
    roomSlots: [],
  });
  assert.equal(plan.sessions.length, 7, "la serie pierde esa sesión...");
  assert.deepEqual(plan.skipped, [dia14], "...pero el usuario lo SABE");
  // Las fechas alrededor no se corren: la serie mantiene el pulso semanal.
  assert.equal(plan.sessions[1]?.start_at, "2026-10-05T09:00:00.000Z");
  assert.equal(plan.sessions[2]?.start_at, "2026-10-19T09:00:00.000Z");
});

test("15. Un conflicto de horario se reporta con su fecha y NO se genera a medias", () => {
  const chocaElDia = dia14; // el tercer lunes
  const plan = planSeries({
    firstDate: lunes,
    weekday: 1,
    startTime: "09:00",
    endTime: "10:00",
    count: 8,
    blockedDates: [],
    teacherSlots: [slot(tsAtUtc(chocaElDia, "09:00"), tsAtUtc(chocaElDia, "10:00"))],
    studentSlots: [],
    roomSlots: [],
  });
  assert.deepEqual(plan.conflicts, [{ date: chocaElDia, reason: "profesor ocupado" }]);
  assert.ok(plan.conflicts.length > 0, "el diálogo bloquea la generación cuando hay conflictos");
  assert.equal(plan.sessions.some((s) => s.date === chocaElDia), false);
});

test("16. Los inputs inválidos de una serie se rechazan igual que el RPC", () => {
  const base = {
    weekday: 1,
    startTime: "09:00",
    endTime: "10:00",
    blockedDates: [] as string[],
    teacherSlots: [] as OccupiedSlot[],
    studentSlots: [] as OccupiedSlot[],
    roomSlots: [] as OccupiedSlot[],
  };
  assert.throws(() => planSeries({ ...base, firstDate: lunes, count: 8, untilDate: "2026-11-16" }), /excluyentes/);
  assert.throws(() => planSeries({ ...base, firstDate: martes, count: 8 }), /no cae en el día/);
  assert.throws(() => planSeries({ ...base, firstDate: lunes, count: 0 }), /mayor a cero/);
  assert.throws(() => planSeries({ ...base, firstDate: lunes, count: 8, startTime: "10:00", endTime: "10:00" }), /inválido/);
  assert.throws(() => planSeries({ ...base, firstDate: "2026-11-30", untilDate: "2026-10-01" }), /anterior/);
});

// ---- Vista contratadas / consumidas / reservadas (17-18) ----

test("17. El escenario del diseño: 8 contratadas, 0 consumidas, 1 reservada → 7 programables", () => {
  const vista = enrollmentScheduleView(8, 0, 1);
  assert.deepEqual(vista, { contracted: 8, consumed: 0, reserved: 1, programmable: 7 });
});

test("18. La vista nunca inventa créditos: programables topados en cero", () => {
  assert.equal(enrollmentScheduleView(8, 5, 5).programmable, 0);
  assert.equal(enrollmentScheduleView(8, 8, 3).programmable, 0);
  assert.equal(enrollmentScheduleView(8, 2, 2).programmable, 4);
});

// ---- Errores amigables (19-20) ----

test("19. Los tags SIN_HORARIO / SIN_CUPO / SIN_CREDITO se despellejan a español", () => {
  assert.equal(
    scheduleErrorOf(new Error("SIN_HORARIO: El profesor ya tiene una clase de 15:00 a 16:00")),
    "El profesor ya tiene una clase de 15:00 a 16:00."
  );
  assert.equal(scheduleErrorOf(new Error("SIN_CUPO: La clase ya alcanzó su cupo")), "La clase ya alcanzó su cupo.");
  assert.equal(
    scheduleErrorOf(new Error("SIN_CREDITO: la matrícula no tiene clases disponibles")),
    "La matrícula no tiene clases disponibles."
  );
});

test("20. Lo que no es un tag ya viene en español y pasa igual", () => {
  assert.equal(scheduleErrorOf(new Error("El salón está ocupado en ese horario")), "El salón está ocupado en ese horario");
  assert.equal(scheduleErrorOf(new Error("El profesor no dicta ese instrumento")), "El profesor no dicta ese instrumento");
  assert.equal(scheduleErrorOf(new Error("Matrícula no encontrada")), "Matrícula no encontrada");
});

test("21. fmtSessionDate renderiza el día del calendario LOCAL en español corto", () => {
  // El día NO se interpreta como instante UTC: "2026-10-12" es el 12 del mes
  // local, con o sin zona horaria con desvío (un 11T19:00Z de Colombia
  // rompería la fecha mostrada si se parseara con Date.parse).
  assert.match(fmtSessionDate("2026-10-12"), /^12 de [a-z]{3,4}$/i);
  assert.match(fmtSessionDate("2027-01-05"), /^5 de ene/i);
  // Entrada sin ceros a la izquierda también es estable.
  assert.equal(fmtSessionDate("2026-1-2"), fmtSessionDate("2026-01-02"));
});

// ---- Helpers de aserción ----

/** Todas las sesiones caen en el mismo día hábil, separadas exactamente 7 días. */
function isWeekly(sessions: { start_at: string }[]): boolean {
  for (let i = 1; i < sessions.length; i++) {
    const prev = Date.parse(sessions[i - 1]!.start_at);
    const curr = Date.parse(sessions[i]!.start_at);
    if (curr - prev !== 7 * 86_400_000) return false;
    if (new Date(curr).getUTCDay() !== new Date(prev).getUTCDay()) return false;
  }
  return true;
}