import React from "react";
import Link from "next/link";
import { IconUsers, IconPlus } from "@/app/assets/icons/DashboardIcons";

export default function DistributorsPage() {
  return (
    <div className="flex flex-col gap-6 w-full animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-on-surface">Distribuidores</h1>
          <p className="text-sm text-on-surface-variant mt-1">Gestiona tus proveedores y distribuidores.</p>
        </div>
        <Link 
          href="/dashboard/distributors/new"
          className="bg-[#6063ee] hover:bg-[#c0c1ff] text-white hover:text-[#0b0664] text-sm font-semibold py-2.5 px-4 rounded-xl shadow-lg shadow-[#6063ee]/20 transition-colors flex items-center justify-center gap-2"
        >
          <IconPlus className="w-4 h-4" />
          <span>Añadir Distribuidor</span>
        </Link>
      </div>

      <div className="bg-surface-container-lowest border border-outline-variant/10 rounded-3xl p-12 shadow-sm flex flex-col items-center justify-center text-center mt-8">
        <div className="w-16 h-16 rounded-full bg-surface-container flex items-center justify-center text-on-surface-variant mb-4">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="1" y="3" width="15" height="13" rx="2" />
            <polygon points="16 8 20 8 23 11 23 16 16 16 16 8" />
            <circle cx="5.5" cy="18.5" r="2.5" />
            <circle cx="18.5" cy="18.5" r="2.5" />
          </svg>
        </div>
        <h2 className="text-lg font-bold text-on-surface mb-2">Aún no hay distribuidores</h2>
        <p className="text-sm text-on-surface-variant max-w-sm mb-6">
          Registra a tus distribuidores para gestionar pedidos, pagos y stock de forma centralizada.
        </p>
        <Link 
          href="/dashboard/distributors/new"
          className="px-6 py-2.5 bg-surface-container border border-outline-variant/20 text-on-surface text-sm font-semibold rounded-xl hover:bg-surface-container-high transition-colors"
        >
          Añadir tu primer distribuidor
        </Link>
      </div>
    </div>
  );
}
