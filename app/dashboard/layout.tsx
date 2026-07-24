import { fetchProfileServer, ensureLicenseCurrent } from "@/services/profile.server";
import { ProfileProvider } from "@/components/ProfileProvider";
import { DashboardShell } from "@/components/DashboardShell";
import { LicenseBlocked } from "@/components/LicenseBlocked";
import { OnboardingModal } from "@/components/onboarding/OnboardingModal";

// Server Component: el perfil se lee en el servidor y se inyecta por context,
// de modo que la navegación se gatea antes de pintar (sin parpadeo). El shell
// interactivo (sidebar/topbar) es el Client Component DashboardShell.
//
// Gate de licencia: para clientes creados por un revendedor, cada entrada al
// dashboard valida/renueva su licencia mensual en la BD (el primer login
// activa el mes y consume 1 crédito del revendedor). Sin licencia vigente,
// se bloquea el acceso. Cuentas directas no se ven afectadas (managed=false).
// Los workers (empleados) no pasan por el gate de licencia.
export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await fetchProfileServer();

  // Perfil de dueño sin tipo de negocio = entró por OAuth (Google) y todavía no
  // completó el onboarding. Los workers heredan el negocio del dueño; los
  // super admins y revendedores tienen sus propios paneles y no necesitan tipo.
  //
  // Se muestra un modal bloqueante sobre el shell en lugar de renderizar la
  // página pedida: sin tipo de negocio el gating de navegación no tiene de dónde
  // agarrarse, y así ninguna página corre sus consultas hasta que el perfil esté
  // completo.
  if (
    profile &&
    !profile.isWorker &&
    !profile.isSuperAdmin &&
    !profile.isReseller &&
    !profile.businessType
  ) {
    return (
      <ProfileProvider profile={profile}>
        <DashboardShell>
          <OnboardingModal defaultName={profile.fullName} />
        </DashboardShell>
      </ProfileProvider>
    );
  }

  if (profile && !profile.isWorker) {
    const license = await ensureLicenseCurrent();
    if (license.managed && license.blocked) {
      return <LicenseBlocked status={license.status ?? "expired"} />;
    }
  }

  return (
    <ProfileProvider profile={profile}>
      <DashboardShell>{children}</DashboardShell>
    </ProfileProvider>
  );
}
