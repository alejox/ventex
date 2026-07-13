import { redirect } from "next/navigation";
import { fetchProfileServer } from "@/services/profile.server";
import { ResellerShell } from "@/components/ResellerShell";

// Server Component: guard del panel de revendedor. El perfil (con is_reseller)
// se lee en el servidor; quien no sea revendedor se redirige al dashboard.
// El acceso a datos está además protegido en la BD por RPCs SECURITY DEFINER
// que verifican is_reseller() y acotan a los clientes propios: defensa en capas.
export default async function ResellerLayout({ children }: { children: React.ReactNode }) {
  const profile = await fetchProfileServer();

  if (!profile) redirect("/login");
  if (!profile.isReseller) redirect("/dashboard");

  return <ResellerShell resellerName={profile.fullName}>{children}</ResellerShell>;
}
