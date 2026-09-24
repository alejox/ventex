import { cache } from "react";
import { redirect } from "next/navigation";
import { fetchProfileServer } from "@/services/profile.server";
import type { Profile } from "@/config/business";

/**
 * Gate de servidor común a todas las pantallas de la escuela.
 *
 * Dos candados, en orden:
 * 1. Módulo: `profiles.modules->>'school'` (fuente autoritativa, opt-in). Un
 *    negocio que no lo activó no debe ver NINGUNA pantalla, ni por URL directa.
 * 2. Permiso: un trabajador solo entra con `worker_can('school')`. Sin
 *    permiso, la creación de datos está bloqueada en la base igual —esto es
 *    UX y no filtrar nada antes del render.
 *
 * Memoizado por request como `fetchProfileServer`: cada layout/página del grupo
 * lo pide sin pagar una consulta nueva.
 */
export const fetchSchoolAccess = cache(async (): Promise<Profile> => {
  const profile = await fetchProfileServer();
  if (!profile) redirect("/login");
  if (!profile.modules?.school || (profile.isWorker && !profile.workerPermissions?.school)) {
    redirect("/dashboard");
  }
  return profile;
});