import { createClient } from "@supabase/supabase-js";
import { dbClient } from "./db";

// ============================================================================
// Reservas del sitio público en specs E2E.
//
// Estos specs ESCRIBEN en la base compartida (crean una cita y, si el
// celular es nuevo, un cliente). Por eso:
//
//   * Solo corren contra un sitio del NEGOCIO E2E: `E2E_BOOKING_SLUG` tiene que
//     ser un slug que la cuenta E2E (E2E_EMAIL) puede leer en
//     `business_sites` por RLS, publicado y con reservas activas. Si falta o
//     no es suyo, `bookingSiteOrSkipReason()` devuelve el motivo y el spec se
//     salta. Nunca se reserva en el sitio de un negocio real.
//   * Cada corrida usa un celular único (`uniqueBookingPhone()`) y
//     `cleanupBookings()` borra, con la sesión del dueño E2E, las citas y el
//     cliente de ese celular.
//   * Las notificaciones NO tienen policy de DELETE: sin
//     `SUPABASE_SERVICE_ROLE_KEY` en el entorno, las del dueño quedan marcadas
//     como leídas (y la del profesional asignado, si la hay, queda en su
//     campana). Con la service-role key se borran.
// ============================================================================

export const BOOKING_SLUG = process.env.E2E_BOOKING_SLUG ?? "";

export interface BookingSite {
  slug: string;
  userId: string;
}

/** Devuelve el sitio de reservas del negocio E2E, o el motivo para saltar. */
export async function bookingSiteOrSkipReason(): Promise<BookingSite | string> {
  if (!BOOKING_SLUG) {
    return "Falta E2E_BOOKING_SLUG: el slug del sitio (publicado, con reservas) del negocio E2E";
  }
  let sb;
  try {
    sb = await dbClient();
  } catch (e) {
    return `No se pudo abrir la sesión E2E de verificación: ${(e as Error).message}`;
  }
  const { data, error } = await sb
    .from("business_sites")
    .select("slug, user_id, published, booking_enabled")
    .eq("slug", BOOKING_SLUG)
    .maybeSingle();
  if (error) return `No se pudo leer business_sites: ${error.message}`;
  const row = data as { slug: string; user_id: string; published: boolean; booking_enabled: boolean } | null;
  if (!row) return `El sitio /${BOOKING_SLUG} no es del negocio E2E (RLS no lo devuelve)`;
  if (!row.published || !row.booking_enabled) {
    return `El sitio /${BOOKING_SLUG} no está publicado o no tiene reservas activas`;
  }
  return { slug: row.slug, userId: row.user_id };
}

/** Celular colombiano de 10 dígitos que empieza por 3, distinto en cada corrida. */
export function uniqueBookingPhone(): string {
  const tail = String(Date.now()).slice(-6) + String(Math.floor(Math.random() * 1000)).padStart(3, "0");
  return `3${tail}`;
}

export interface SeededBooking {
  id: string;
  date: string;
  time: string;
  service: string;
}

function isoDay(offset: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Reserva por el mismo RPC que usa el sitio (`public_site_book`), con el
 * primer servicio y el primer horario libre de los próximos 21 días (desde
 * mañana: hoy puede quedarse sin horarios mientras corre el spec).
 */
export async function seedSiteBooking(slug: string, name: string, phone: string): Promise<SeededBooking> {
  const sb = await dbClient();
  const { data: services, error: svcErr } = await sb
    .from("services")
    .select("id")
    .eq("status", "active")
    .order("created_at", { ascending: true });
  if (svcErr) throw new Error(`seedSiteBooking: services: ${svcErr.message}`);

  for (const { id: serviceId } of (services ?? []) as { id: string }[]) {
    for (let d = 1; d <= 21; d++) {
      const date = isoDay(d);
      const { data: slots, error } = await sb.rpc("public_site_slots", {
        p_slug: slug, p_service_id: serviceId, p_date: date, p_staff_id: null,
      });
      if (error) throw new Error(`seedSiteBooking: public_site_slots: ${error.message}`);
      const first = ((slots ?? []) as { slot_time: string }[])[0];
      if (!first) continue;
      const { data: booked, error: bookErr } = await sb.rpc("public_site_book", {
        p_slug: slug, p_service_id: serviceId, p_date: date, p_time: first.slot_time,
        p_customer_name: name, p_customer_phone: phone, p_staff_id: null, p_notes: null,
      });
      if (bookErr) throw new Error(`seedSiteBooking: public_site_book: ${bookErr.message}`);
      return booked as SeededBooking;
    }
  }
  throw new Error(`seedSiteBooking: el sitio /${slug} no tiene horarios libres en 21 días`);
}

export async function appointmentStatus(id: string): Promise<string | null> {
  const sb = await dbClient();
  const { data, error } = await sb.from("appointments").select("status").eq("id", id).maybeSingle();
  if (error) throw new Error(`appointmentStatus(${id}): ${error.message}`);
  return (data as { status: string } | null)?.status ?? null;
}

/**
 * Borra lo que dejaron las reservas de prueba: citas y cliente de cada
 * celular, y sus notificaciones (o las marca leídas, ver arriba). Nunca tira:
 * un fallo de limpieza se reporta en consola para no tapar el resultado real.
 */
export async function cleanupBookings(phones: string[]): Promise<void> {
  if (phones.length === 0) return;
  try {
    const sb = await dbClient();
    const { data: customers } = await sb.from("customers").select("id").in("phone", phones);
    const customerIds = ((customers ?? []) as { id: string }[]).map((c) => c.id);
    if (customerIds.length === 0) return;

    const { data: appts } = await sb.from("appointments").select("id").in("customer_id", customerIds);
    const appointmentIds = ((appts ?? []) as { id: string }[]).map((a) => a.id);

    if (appointmentIds.length > 0) {
      const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
      if (serviceKey && url) {
        const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
        const { error } = await admin
          .from("notifications")
          .delete()
          .in("data->>appointment_id", appointmentIds);
        if (error) console.warn(`cleanupBookings: notifications: ${error.message}`);
      } else {
        await sb
          .from("notifications")
          .update({ read_at: new Date().toISOString() })
          .in("data->>appointment_id", appointmentIds);
      }

      const { error: apptErr } = await sb.from("appointments").delete().in("id", appointmentIds);
      if (apptErr) console.warn(`cleanupBookings: appointments: ${apptErr.message}`);
    }

    const { error: custErr } = await sb.from("customers").delete().in("id", customerIds);
    if (custErr) console.warn(`cleanupBookings: customers: ${custErr.message}`);
  } catch (e) {
    console.warn(`cleanupBookings: ${(e as Error).message}`);
  }
}
