import React from "react";
import Link from "next/link";
import { IconUsers, IconPlus } from "@/app/assets/icons/DashboardIcons";

export default function CustomersPage() {
  return (
    <div className="flex flex-col gap-6 w-full animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-on-surface">Clientes</h1>
          <p className="text-sm text-on-surface-variant mt-1">Gestiona el directorio de tus clientes y su historial.</p>
        </div>
        <Link 
          href="/dashboard/customers/new"
          className="bg-[#6063ee] hover:bg-[#c0c1ff] text-white hover:text-[#0b0664] text-sm font-semibold py-2.5 px-4 rounded-xl shadow-lg shadow-[#6063ee]/20 transition-colors flex items-center justify-center gap-2"
        >
          <IconPlus className="w-4 h-4" />
          <span>Añadir Cliente</span>
        </Link>
      </div>

      <div className="bg-surface-container-lowest border border-outline-variant/10 rounded-3xl p-12 shadow-sm flex flex-col items-center justify-center text-center mt-8">
        <div className="w-16 h-16 rounded-full bg-surface-container flex items-center justify-center text-on-surface-variant mb-4">
          <IconUsers className="w-8 h-8" />
        </div>
        <h2 className="text-lg font-bold text-on-surface mb-2">Aún no hay clientes</h2>
        <p className="text-sm text-on-surface-variant max-w-sm mb-6">
          Comienza añadiendo a tu primer cliente para hacer seguimiento de sus compras y ofrecer un mejor servicio.
        </p>
        <Link 
          href="/dashboard/customers/new"
          className="px-6 py-2.5 bg-surface-container border border-outline-variant/20 text-on-surface text-sm font-semibold rounded-xl hover:bg-surface-container-high transition-colors"
        >
          Añadir tu primer cliente
        </Link>
      </div>
    </div>
  );
}
