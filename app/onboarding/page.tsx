import { redirect } from "next/navigation";
import { fetchProfileServer } from "@/services/profile.server";
import { OnboardingForm } from "./OnboardingForm";

/**
 * Onboarding de usuarios que entraron por OAuth (Google) sin pasar por el
 * registro por correo, así que llegan sin `business_type`. Se ejecuta fuera de
 * `/dashboard` a propósito: el layout del dashboard desvía acá a los perfiles
 * incompletos, y meterlo debajo de ese layout crearía un bucle de redirección.
 */
export default async function OnboardingPage() {
  const profile = await fetchProfileServer();

  if (!profile) redirect("/login");
  // Ya completó el negocio (registro por correo, o vuelta atrás): nada que hacer.
  if (profile.businessType) redirect("/dashboard/pos");
  // Los empleados heredan el negocio del dueño; no eligen tipo.
  if (profile.isWorker) redirect("/dashboard/pos");

  return (
    <div className="min-h-screen flex items-center justify-center px-5 py-10 bg-surface">
      <OnboardingForm defaultName={profile.fullName} />
    </div>
  );
}
