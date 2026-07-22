"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Navegación por pestañas de Ajustes. Cliente solo por `usePathname`.
 * `showWorkers`: administrar trabajadores es exclusivo del dueño, incluso si
 * un trabajador tiene permiso para ver el resto de la configuración.
 */
export function SettingsTabs({ showWorkers }: { showWorkers: boolean }) {
  const pathname = usePathname();

  const tabs = [
    { name: "General", href: "/dashboard/settings" },
    { name: "Datos de tu negocio", href: "/dashboard/settings/business" },
    ...(showWorkers ? [{ name: "Trabajadores", href: "/dashboard/settings/trabajadores" }] : []),
  ];

  return (
    <nav className="flex gap-6 -mb-px overflow-x-auto">
      {tabs.map((tab) => {
        const isActive = pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`pb-3 text-sm font-semibold transition-colors border-b-2 shrink-0 ${
              isActive
                ? "border-primary text-primary"
                : "border-transparent text-on-surface-variant hover:text-on-surface hover:border-outline-variant/30"
            }`}
          >
            {tab.name}
          </Link>
        );
      })}
    </nav>
  );
}
