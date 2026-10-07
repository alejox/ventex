import React from "react";
import { redirect } from "next/navigation";
import { fetchProfileServer } from "@/services/profile.server";
import { effectiveModules } from "@/config/business";

/**
 * Producción solo existe con el módulo "Recetas y producción" encendido, y un
 * trabajador entra con `production` (registrar lotes) o `inventory_edit`
 * (armar recetas). Se decide en el servidor porque la pantalla dispara sus
 * consultas al montar; el gate real de cada escritura sigue siendo la base
 * (`production_module_enabled()` y `worker_can` en cada RPC).
 */
export default async function ProductionLayout({ children }: { children: React.ReactNode }) {
  const profile = await fetchProfileServer();
  if (!profile) redirect("/login");
  const modules = effectiveModules(profile.businessType, profile.modules);
  if (modules.production !== true) redirect("/dashboard");
  if (profile.isWorker && !profile.workerPermissions?.production && !profile.workerPermissions?.inventory_edit) {
    redirect("/dashboard");
  }
  return <>{children}</>;
}
