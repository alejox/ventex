import React from "react";
import { redirect } from "next/navigation";
import { IconSettings } from "@/app/assets/icons/DashboardIcons";
import { fetchProfileServer } from "@/services/profile.server";
import { SettingsTabs } from "./SettingsTabs";

// Server Component: todo lo que cuelga de /dashboard/settings es configuración
// del negocio (facturación, tipo de negocio y módulos, datos fiscales,
// trabajadores). El dueño siempre entra; un trabajador solo con el permiso
// `settings` que le asigne el dueño. Se gatea aquí, en el servidor, antes de
// pintar nada, así también cubre la navegación directa por URL.
export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const profile = await fetchProfileServer();
  const isWorker = profile?.isWorker ?? false;
  if (isWorker && !profile?.workerPermissions?.settings) redirect("/dashboard");

  return (
    <div className="w-full max-w-4xl mx-auto pb-20 animate-in fade-in duration-300">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
          <IconSettings className="w-5 h-5" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-on-surface">Ajustes</h1>
          <p className="text-sm text-on-surface-variant">Configuración general de tu cuenta.</p>
        </div>
      </div>

      <div className="border-b border-outline-variant/20 mb-8">
        <SettingsTabs showWorkers={!isWorker} />
      </div>

      {children}
    </div>
  );
}
