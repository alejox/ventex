import { fetchSchoolAccess } from "@/services/school.server";

/**
 * Gate de servidor de TODA la escuela: módulo activo + `worker_can('school')`.
 * Un trabajador sin permiso (o un dueño con el módulo apagado) nunca ve ni una
 * fila; el RPC lo revalidaría igual, esto evita el render.
 */
export default async function SchoolLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await fetchSchoolAccess();
  return <>{children}</>;
}