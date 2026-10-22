import type { Appointment } from "@/services/appointments.service";

/**
 * Agenda privada: un trabajador ve completas SOLO sus citas; del resto del
 * equipo ve que el horario está ocupado, sin cliente, servicio ni persona.
 *
 * Lo que de verdad lo impide es la base: la RLS de `appointments` le devuelve
 * solo sus filas y `agenda_busy_slots` solo fechas y horas. Esto es lo que la
 * pantalla hace con eso.
 */

/** Una fila de `agenda_busy_slots`: cuándo, y si es una cita propia. Nada más. */
export interface AgendaBusySlot {
  appointment_date: string;
  start_time: string;
  end_time: string;
  is_mine: boolean;
}

interface AgendaProfile {
  isWorker: boolean;
  isWorkspaceAdmin: boolean;
  staffId?: string | null;
  workerPermissions?: Partial<Record<string, boolean>> | null;
}

/**
 * Agenda completa: dueño y administradores (espejo de `is_tenant_owner()`) y el
 * trabajador con `calendar_all` (que, como todo hijo, exige `calendar`). Es el
 * mismo predicado que la RLS de `appointments`. Sin perfil todavía se asume la
 * vista restringida: la base igual no entrega más.
 */
export function canSeeFullAgenda(profile: AgendaProfile | null | undefined): boolean {
  if (!profile) return false;
  if (!profile.isWorker || profile.isWorkspaceAdmin) return true;
  const perms = profile.workerPermissions ?? {};
  return Boolean(perms.calendar && perms.calendar_all);
}

/** La ficha a la que queda atada la agenda de un trabajador; null si ve todo. */
export function ownAgendaStaffId(profile: AgendaProfile | null | undefined): string | null {
  if (!profile || canSeeFullAgenda(profile)) return null;
  return profile.staffId ?? null;
}

export const BUSY_TITLE = "Ocupado";
/** Estado ficticio: no es de la base, solo pinta el bloque en gris. */
export const BUSY_STATUS = "busy";
const BUSY_ID_PREFIX = "busy:";

/**
 * Convierte los horarios ocupados en bloques para la grilla. Los propios
 * (`is_mine`) se descartan: esa cita ya llega completa por la RLS.
 */
export function busyPlaceholders(slots: AgendaBusySlot[]): Appointment[] {
  return slots
    .filter((slot) => !slot.is_mine)
    .map((slot, index) => ({
      id: `${BUSY_ID_PREFIX}${slot.appointment_date}:${slot.start_time}:${index}`,
      customer_id: null,
      service_id: null,
      staff_id: null,
      vehicle_id: null,
      title: BUSY_TITLE,
      description: null,
      service_type: null,
      vehicle_plate: null,
      vehicle_model: null,
      appointment_date: slot.appointment_date,
      start_time: slot.start_time,
      end_time: slot.end_time,
      // `Appointment.status` no incluye "busy" a propósito: solo existe acá.
      status: BUSY_STATUS as Appointment["status"],
      notes: null,
      created_at: "",
      sale_id: null,
      customers: null,
      services: null,
      staff: null,
    }));
}

/** ¿Es un bloque "Ocupado" y no una cita real? No se abre ni se arrastra. */
export function isBusyPlaceholder(appointment: { id: string }): boolean {
  return appointment.id.startsWith(BUSY_ID_PREFIX);
}

/**
 * Quién queda en "Asignado a" al abrir el formulario. En una cita NUEVA, la
 * ficha propia de quien entra (`profile.staffId`, de su membresía activa) si
 * está entre el equipo activo — sea trabajador, con agenda completa o admin que
 * también atiende; espejo del vendedor por defecto del POS. Sin ficha (dueño)
 * queda como hoy: asignación automática. Editar nunca cambia la persona, y una
 * elección ya hecha se respeta.
 */
export function defaultAppointmentStaffId(input: {
  staffId: string | null | undefined;
  staffList: { id: string; status: string }[];
  isEditing: boolean;
  current: string | null;
}): string | null {
  if (input.isEditing || input.current) return input.current;
  const own = input.staffId;
  if (!own) return null;
  return input.staffList.some((m) => m.id === own && m.status === "active") ? own : null;
}
