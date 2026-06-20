"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { IconSettings } from "@/app/assets/icons/DashboardIcons";

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  const tabs = [
    { name: "General", href: "/dashboard/settings" },
    { name: "Datos de tu negocio", href: "/dashboard/settings/business" },
  ];

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
        <nav className="flex gap-6 -mb-px">
          {tabs.map((tab) => {
            const isActive = pathname === tab.href;
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={`pb-3 text-sm font-semibold transition-colors border-b-2 ${
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
      </div>

      {children}
    </div>
  );
}
