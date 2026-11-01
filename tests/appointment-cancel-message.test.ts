import test from "node:test";
import assert from "node:assert/strict";
import {
  buildCancelNoticeMessage,
  cancelNoticeLink,
  formatCancelDate,
} from "../lib/appointment-cancel-message";
import type { AppNotification } from "../services/notifications.service";

const notif = (over: Partial<AppNotification> = {}): AppNotification => ({
  id: "n1",
  type: "appointment",
  severity: "info",
  title: "Cita cancelada por el cliente",
  body: "Corte del 05/11/2026 a las 15:30 (Ana)",
  data: {
    event: "cancelled_by_customer",
    appointment_id: "a1",
    customer_name: "Ana",
    customer_phone: "3001234567",
    date: "2026-11-05",
    time: "15:30",
    service: "Corte",
  },
  read_at: null,
  created_at: "2026-11-01T12:00:00Z",
  ...over,
});

const textOf = (url: string | null): string => {
  assert.ok(url, "esperaba un enlace");
  return new URL(url).searchParams.get("text") ?? "";
};

test("formatCancelDate pasa YYYY-MM-DD a DD/MM/YYYY sin correrse de día", () => {
  assert.equal(formatCancelDate("2026-11-05"), "05/11/2026");
  assert.equal(formatCancelDate("2026-01-01"), "01/01/2026");
  assert.equal(formatCancelDate("2026-11-05T00:00:00"), "05/11/2026");
  assert.equal(formatCancelDate("no es fecha"), null);
  assert.equal(formatCancelDate(null), null);
});

test("buildCancelNoticeMessage arma el mensaje completo", () => {
  assert.equal(
    buildCancelNoticeMessage({
      customerName: "Ana",
      service: "Corte",
      date: "2026-11-05",
      time: "15:30",
      businessName: "La Barbería",
    }),
    "Hola Ana, se ha cancelado tu cita de Corte del 05/11/2026 a las 15:30 en La Barbería. Si quieres agendar de nuevo, escríbenos por aquí.",
  );
});

test("buildCancelNoticeMessage tolera datos faltantes sin 'undefined' ni dobles espacios", () => {
  const msg = buildCancelNoticeMessage({
    customerName: null,
    service: undefined,
    date: null,
    time: null,
    businessName: "  ",
  });
  assert.equal(msg, "Hola, se ha cancelado tu cita. Si quieres agendar de nuevo, escríbenos por aquí.");

  const parcial = buildCancelNoticeMessage({ customerName: "  Ana  ", service: "Corte", date: "2026-11-05" });
  assert.equal(parcial, "Hola Ana, se ha cancelado tu cita de Corte del 05/11/2026. Si quieres agendar de nuevo, escríbenos por aquí.");

  for (const m of [msg, parcial]) {
    assert.doesNotMatch(m, /undefined|null|\s{2}|\s[.,]/);
  }
});

test("cancelNoticeLink apunta al teléfono del cliente con indicativo 57", () => {
  const url = cancelNoticeLink(notif(), "La Barbería");
  assert.ok(url);
  assert.equal(new URL(url).searchParams.get("phone"), "573001234567");
  assert.equal(
    textOf(url),
    "Hola Ana, se ha cancelado tu cita de Corte del 05/11/2026 a las 15:30 en La Barbería. Si quieres agendar de nuevo, escríbenos por aquí.",
  );
});

test("cancelNoticeLink sin nombre de negocio omite 'en …'", () => {
  assert.doesNotMatch(textOf(cancelNoticeLink(notif(), null)), / en /);
});

test("cancelNoticeLink: null si no es una cancelación del cliente o el teléfono no sirve", () => {
  assert.equal(cancelNoticeLink(notif({ type: "insumo_bajo", data: { product_id: "p" }, title: "Reponer" }), null), null);
  assert.equal(cancelNoticeLink(notif({ data: { event: "booked", customer_phone: "3001234567" }, title: "Nueva reserva" }), null), null);
  assert.equal(cancelNoticeLink(notif({ data: { ...notif().data, customer_phone: "123" } }), null), null);
  assert.equal(cancelNoticeLink(notif({ data: { ...notif().data, customer_phone: null } }), null), null);
});

test("cancelNoticeLink: notificaciones viejas (sin event) se reconocen por el título y usan solo lo que hay", () => {
  const vieja = notif({
    data: { appointment_id: "a1", customer_name: "Ana", customer_phone: "3001234567" },
  });
  assert.equal(
    textOf(cancelNoticeLink(vieja, null)),
    "Hola Ana, se ha cancelado tu cita. Si quieres agendar de nuevo, escríbenos por aquí.",
  );
  assert.equal(cancelNoticeLink({ ...vieja, title: "Otra cosa" }, null), null);
});
