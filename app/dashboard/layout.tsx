import { fetchProfileServer } from "@/services/profile.server";
import { ProfileProvider } from "@/components/ProfileProvider";
import { DashboardShell } from "@/components/DashboardShell";

// Server Component: el perfil se lee en el servidor y se inyecta por context,
// de modo que la navegación se gatea antes de pintar (sin parpadeo). El shell
// interactivo (sidebar/topbar) es el Client Component DashboardShell.
export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await fetchProfileServer();

  return (
    <ProfileProvider profile={profile}>
      <DashboardShell>{children}</DashboardShell>
    </ProfileProvider>
  );
}
