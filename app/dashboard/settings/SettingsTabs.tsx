"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Navegación por pestañas de Ajustes. Cliente solo por `usePathname`.
 *
 * Ya no hay pestaña "Trabajadores": el acceso al sistema es un atributo de la
 * ficha de personal, así que se administra completo en /dashboard/staff.
 */
export function SettingsTabs() {
  const pathname = usePathname();

  const tabs = [
    { name: "General", href: "/dashboard/settings" },
    { name: "Datos de tu negocio", href: "/dashboard/settings/business" },
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
