import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import AppointmentModal from "../components/appointments/AppointmentModal";
import type { Appointment } from "../services/appointments.service";

// tsx runs the repository's preserved JSX using React's classic runtime.
Object.assign(globalThis, { React });
const appointment: Appointment = {
  id: "appointment", customer_id: null, service_id: "service", staff_id: null,
  vehicle_id: null, title: "Título personalizado", description: "Detalle existente",
  service_type: "Corte", vehicle_plate: null, vehicle_model: null,
  appointment_date: "2026-10-05", start_time: "15:30", end_time: "16:00",
  notes: "Nota existente", status: "pending", created_at: "2026-10-05",
  customers: null, services: { name: "Corte" }, staff: null,
};

test("La reserva pendiente tiene una sola confirmación y conserva los detalles personalizados", () => {
  const html = renderToStaticMarkup(<AppointmentModal open appointment={appointment} onClose={() => {}} />);
  assert.equal((html.match(/>Confirmar reserva</g) ?? []).length, 1);
  assert.ok(!html.includes("Confirmar y avisar"));
  assert.ok(!html.includes("Avisar por WhatsApp"));
  assert.ok(html.includes('form="appointment-edit-form"'));
  assert.ok(html.includes("Título personalizado"));
  assert.ok(html.includes("Detalle existente"));
  assert.ok(html.includes("Nota existente"));
});

test("Confirmada muestra el cobro y las acciones secundarias sin repetir confirmación", () => {
  const html = renderToStaticMarkup(<AppointmentModal open appointment={{ ...appointment, status: "confirmed" }} onClose={() => {}} />);
  assert.ok(html.includes("Reserva confirmada"));
  assert.ok(html.includes(">Cobrar<"));
  assert.ok(html.includes("Cancelar cita"));
  assert.ok(!html.includes(">Confirmar reserva<"));
});
