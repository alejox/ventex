import test from "node:test";
import assert from "node:assert/strict";
import { parseDateOnly, toISODate, todayISO, formatDateOnly } from "../lib/date";

test("1. Un día de calendario no se corre por zona horaria", () => {
  // El bug del informe: `new Date("2026-08-07")` se interpreta como medianoche
  // UTC y en Colombia (UTC-5) renderiza el 6. La compra cargada el 07/08/2026
  // aparecía fechada el 6/8/2026 en el listado.
  const d = parseDateOnly("2026-08-07");
  assert.equal(d.getFullYear(), 2026);
  assert.equal(d.getMonth(), 7, "agosto es el mes 7 (base cero)");
  assert.equal(d.getDate(), 7);
});

test("2. Ida y vuelta sin pérdida, incluidos los bordes de mes y año", () => {
  // Si el parseo o el formateo corrieran el día, alguno de estos no volvería
  // igual. Los bordes son donde el corrimiento se nota.
  for (const iso of [
    "2026-01-01",
    "2026-02-28",
    "2026-03-01",
    "2026-08-07",
    "2026-12-31",
    "2024-02-29",
  ]) {
    assert.equal(toISODate(parseDateOnly(iso)), iso, `no volvió igual: ${iso}`);
  }
});

test("3. Acepta un timestamp completo y se queda con el día", () => {
  assert.equal(toISODate(parseDateOnly("2026-08-07T23:30:00+00:00")), "2026-08-07");
});

test("4. todayISO usa el reloj local, no UTC", () => {
  const now = new Date();
  const esperado = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  assert.equal(todayISO(), esperado);
});

test("5. El formateo respeta el día que se le pasó", () => {
  const texto = formatDateOnly("2026-08-07", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  assert.match(texto, /07/, `esperaba el día 07 en "${texto}"`);
  assert.match(texto, /08/, `esperaba el mes 08 en "${texto}"`);
  assert.match(texto, /2026/);
});
