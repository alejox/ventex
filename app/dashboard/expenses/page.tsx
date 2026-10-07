import { redirect } from "next/navigation";
import { fetchProfileServer } from "@/services/profile.server";
import { ExpensesClient } from "./ExpensesClient";

// Server Component: Gastos muestra el egreso completo del negocio (gastos +
// compras pagadas), igual que el Panel y Reportes. Mismo gate que esas dos
// pantallas: un trabajador solo entra con el permiso `panel`. Sin él, la RLS
// le escondía los gastos pero no las compras, y el KPI "Gasto total" mostraba
// un número parcial que se leía como el real. Se decide en el servidor porque
// la pantalla dispara sus consultas al montar.
export default async function ExpensesPage() {
  const profile = await fetchProfileServer();
  if (profile?.isWorker && !profile.workerPermissions?.panel) redirect("/dashboard");
  return <ExpensesClient />;
}
