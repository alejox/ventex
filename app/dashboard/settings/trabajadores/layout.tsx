import React from "react";
import { redirect } from "next/navigation";
import { fetchProfileServer } from "@/services/profile.server";

// Administrar trabajadores (crear cuentas, asignar permisos, cerrar turnos
// ajenos) es exclusivo del dueño: un trabajador con permiso de configuración
// podría, si no, ampliarse los permisos a sí mismo.
export default async function TrabajadoresLayout({ children }: { children: React.ReactNode }) {
  const profile = await fetchProfileServer();
  if (profile?.isWorker) redirect("/dashboard/settings");

  return <>{children}</>;
}
