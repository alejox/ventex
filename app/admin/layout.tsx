import { redirect } from "next/navigation";
import { fetchProfileServer } from "@/services/profile.server";
import { AdminShell } from "@/components/AdminShell";

// Server Component: guard del panel super admin. El perfil (con is_super_admin)
// se lee en el servidor; quien no sea super admin se redirige al dashboard.
// El acceso a datos cross-tenant está además protegido en la BD por RPCs
// SECURITY DEFINER que verifican is_super_admin(): esto es defensa en capas.
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const profile = await fetchProfileServer();

  if (!profile) redirect("/login");
  if (!profile.isSuperAdmin) redirect("/dashboard");

  return <AdminShell adminName={profile.fullName}>{children}</AdminShell>;
}
