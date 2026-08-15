import test from "node:test";
import assert from "node:assert/strict";
import { commissionPeriodOf, currentMonthPeriod } from "../services/staff.service";

/**
 * El período de una liquidación viaja en DOS formatos: las fechas que eligió el
 * usuario (para el comprobante) y los instantes del corte (para la consulta).
 * Estos tests custodian que los instantes se calculen en la zona LOCAL, que es
 * donde vive el día del negocio, y que el "hasta" sea inclusivo.
 */

test("1. El 'hasta' es inclusivo: el corte cae al arrancar el día siguiente", () => {
  const p = commissionPeriodOf("2026-08-01", "2026-08-15");

  assert.equal(p.from, "2026-08-01", "la fecha del comprobante se conserva tal cual");
  assert.equal(p.to, "2026-08-15");

  // El usuario que pide "del 1 al 15" quiere que entre la venta de las 23:00 del
  // 15. Por eso el instante de corte es el 16 a las 00:00 y la comparación es
  // `< toTs`, no `<=`.
  const cut = new Date(p.toTs);
  assert.equal(cut.getDate(), 16);
  assert.equal(cut.getHours(), 0);
  assert.equal(cut.getMinutes(), 0);
});

test("2. Los instantes salen de la zona LOCAL, no de UTC", () => {
  const p = commissionPeriodOf("2026-08-01", "2026-08-15");

  // Esto es lo que evita el bug de borde: `sales.created_at` es timestamptz y la
  // base corre en UTC. Si el corte se armara con `Date.parse("2026-08-01")` —que
  // interpreta la cadena como UTC—, en Colombia (UTC-5) la venta de las 20:00
  // del 31 de julio caería DENTRO del período de agosto.
  const start = new Date(p.fromTs);
  assert.equal(start.getFullYear(), 2026);
  assert.equal(start.getMonth(), 7, "agosto es el mes 7 en la zona local");
  assert.equal(start.getDate(), 1);
  assert.equal(start.getHours(), 0, "arranca a medianoche LOCAL");

  // Y la comparación se hace contra un instante absoluto, así que el ISO que
  // viaja lleva la conversión ya hecha.
  assert.equal(start.getTime(), new Date(2026, 7, 1, 0, 0, 0, 0).getTime());
});

test("3. Un solo día es un rango válido de 24 horas", () => {
  const p = commissionPeriodOf("2026-08-15", "2026-08-15");
  const span = new Date(p.toTs).getTime() - new Date(p.fromTs).getTime();
  assert.equal(span, 24 * 60 * 60 * 1000, "del 15 al 15 es el día completo, no cero");
});

test("4. El fin de mes rueda al mes siguiente sin romperse", () => {
  // El día 32 no existe: `new Date(y, m, 32)` tiene que caer en el 1 del mes que
  // viene, no producir una fecha inválida.
  const p = commissionPeriodOf("2026-08-01", "2026-08-31");
  const cut = new Date(p.toTs);
  assert.equal(cut.getMonth(), 8, "septiembre");
  assert.equal(cut.getDate(), 1);

  // Y febrero, que es el que rompe los cálculos hechos a mano.
  const feb = commissionPeriodOf("2026-02-01", "2026-02-28");
  const febCut = new Date(feb.toTs);
  assert.equal(febCut.getMonth(), 2, "marzo: 2026 no es bisiesto");
  assert.equal(febCut.getDate(), 1);
});

test("5. El período por defecto es del 1 del mes a hoy, inclusive", () => {
  const now = new Date();
  const p = currentMonthPeriod();

  assert.match(p.from, /^\d{4}-\d{2}-01$/, "arranca el día 1");
  const start = new Date(p.fromTs);
  assert.equal(start.getMonth(), now.getMonth());
  assert.equal(start.getDate(), 1);

  // Hoy tiene que quedar DENTRO: liquidar a media tarde no puede dejar afuera
  // las ventas de la mañana.
  assert.ok(new Date(p.toTs).getTime() > now.getTime(), "el corte es posterior a ahora");
});
