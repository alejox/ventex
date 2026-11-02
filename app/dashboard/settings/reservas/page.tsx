import { redirect } from "next/navigation";
import { usesAppointments } from "@/config/business";
import { fetchProfileServer } from "@/services/profile.server";
import { BookingSettings } from "@/components/settings/BookingSettings";

/**
 * Ajustes → Reservas. Solo el dueño (la reserva en línea y a quién se asigna son
 * decisiones del negocio; `settings_guard_booking_admin` y la RLS de
 * `business_sites` lo exigen igual) y solo en negocios que agendan citas: el
 * mismo cálculo que muestra "Calendario" en el menú.
 */
export default async function BookingSettingsPage() {
  const profile = await fetchProfileServer();
  if (!profile || profile.isWorker || !usesAppointments(profile.businessType, profile.modules)) {
    redirect("/dashboard/settings");
  }
  return <BookingSettings />;
}
