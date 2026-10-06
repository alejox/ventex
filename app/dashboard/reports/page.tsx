import { redirect } from "next/navigation";
import { fetchProfileServer } from "@/services/profile.server";
import { ReportsClient } from "./ReportsClient";

// Server Component: Reportes muestra las finanzas completas del negocio, igual
// que el Panel. Mismo gate que `/dashboard/page.tsx`: un trabajador solo entra
// con el permiso `panel`, y se decide en el servidor porque la pantalla dispara
// sus consultas al montar.
export default async function ReportsPage() {
  const profile = await fetchProfileServer();
  if (profile?.isWorker && !profile.workerPermissions?.panel) redirect("/dashboard");
  return <ReportsClient />;
}
