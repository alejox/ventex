import { redirect } from "next/navigation";
import { fetchProfileServer } from "@/services/profile.server";
import { workerNavItems } from "@/config/business";
import { DashboardHome } from "./DashboardHome";

// Server Component: el Panel muestra finanzas del negocio (ingresos, gastos,
// neto), así que un trabajador solo lo ve con el permiso `panel`. El gate va en
// el servidor porque DashboardHome dispara sus consultas al montar: un redirect
// en el cliente ya habría pedido los datos que no debe ver.
export default async function DashboardPage() {
  const profile = await fetchProfileServer();

  if (profile?.isWorker && !profile.workerPermissions?.panel) {
    // Sin Panel, cae en su primer módulo permitido (orden canónico del sidebar).
    const first = workerNavItems(profile.workerPermissions ?? {})[0];
    if (first) redirect(first.href);
    if (profile.workerPermissions?.settings) redirect("/dashboard/settings");

    return (
      <div className="w-full max-w-md mx-auto py-20 text-center animate-in fade-in duration-300">
        <h1 className="text-lg font-bold text-on-surface">Sin módulos asignados</h1>
        <p className="text-sm text-on-surface-variant mt-2">
          Tu cuenta aún no tiene permisos para ninguna sección. Pídele al dueño del negocio que te
          asigne acceso.
        </p>
      </div>
    );
  }

  return <DashboardHome />;
}
