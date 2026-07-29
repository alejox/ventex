import React from "react";
import { redirect } from "next/navigation";
import { fetchProfileServer } from "@/services/profile.server";

/**
 * Personal es exclusivo del dueño.
 *
 * Este gate venía del layout de la vieja pestaña Ajustes → Trabajadores y se
 * conserva íntegro: desde acá se crean cuentas, se asignan permisos y se cierran
 * turnos ajenos, así que un trabajador con acceso podría ampliarse los permisos
 * a sí mismo. El menú ya no le muestra el ítem (no existe un permiso `staff`),
 * pero eso es UX: el gate real es este, en el servidor, y cubre la URL directa.
 *
 * La otra mitad del candado vive en la base: desde la migración
 * 20260728000001_staff_rls_owner_writes, escribir en `public.staff` es solo del
 * dueño, y crear cuentas pasa por app/api/worker/create, que revalida el dueño.
 */
export default async function StaffLayout({ children }: { children: React.ReactNode }) {
  const profile = await fetchProfileServer();
  if (profile?.isWorker) redirect("/dashboard");

  return <>{children}</>;
}
